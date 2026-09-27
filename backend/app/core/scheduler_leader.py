"""Run the background scheduler in exactly one backend process.

With several uvicorn workers, every process would otherwise send the same
reminders and take the same backups. The processes compete for an exclusive
lock on a file; the holder runs the scheduler. The operating system releases
the lock when the holder dies, and another process takes over within
RETRY_SECONDS (issue #494).
"""

from __future__ import annotations

import fcntl
import logging
import os
import tempfile
import threading
from typing import Callable, Optional

logger = logging.getLogger(__name__)

RETRY_SECONDS = 15


def lock_path() -> str:
    return os.getenv("TRIBU_SCHEDULER_LOCK") or os.path.join(tempfile.gettempdir(), "tribu-scheduler.lock")


class FileLock:
    """Non-blocking exclusive lock on a file, held until release or process exit."""

    def __init__(self, path: str):
        self.path = path
        self._fd: Optional[int] = None

    def acquire(self) -> bool:
        if self._fd is not None:
            return True
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            return False
        self._fd = fd
        return True

    def release(self) -> None:
        if self._fd is None:
            return
        try:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
        finally:
            os.close(self._fd)
            self._fd = None

    @property
    def held(self) -> bool:
        return self._fd is not None


class SchedulerLeader(threading.Thread):
    """Waits for the scheduler lock and starts the scheduler once it holds it."""

    def __init__(self, on_elected: Callable[[], None], on_resign: Callable[[], None], path: Optional[str] = None):
        super().__init__(name="tribu-scheduler-leader", daemon=True)
        self._lock = FileLock(path or lock_path())
        self._on_elected = on_elected
        self._on_resign = on_resign
        self._stop_event = threading.Event()
        self.elected = threading.Event()

    def try_lead(self) -> bool:
        if self.elected.is_set():
            return True
        if not self._lock.acquire():
            return False
        logger.info("This process runs the background scheduler (pid %s)", os.getpid())
        try:
            self._on_elected()
        except Exception:  # noqa: BLE001 - give the lock back so another process can try
            logger.exception("Starting the scheduler failed")
            self._lock.release()
            return False
        self.elected.set()
        return True

    def run(self) -> None:
        while not self.try_lead() and not self._stop_event.wait(RETRY_SECONDS):
            pass

    def stop(self) -> None:
        self._stop_event.set()
        if self.elected.is_set():
            try:
                self._on_resign()
            finally:
                self.elected.clear()
                self._lock.release()


_leader: Optional[SchedulerLeader] = None


def start(on_elected: Callable[[], None], on_resign: Callable[[], None]) -> SchedulerLeader:
    global _leader
    _leader = SchedulerLeader(on_elected, on_resign)
    # Try right away so a single process starts its scheduler during startup.
    _leader.try_lead()
    _leader.start()
    return _leader


def stop() -> None:
    if _leader is not None:
        _leader.stop()


def is_leader() -> bool:
    return bool(_leader and _leader.elected.is_set())
