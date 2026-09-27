"""Spot backend processes that die without shutting down.

Every backend process records a run when it starts and refreshes a heartbeat
every minute. A run that stops sending heartbeats without a clean shutdown
was killed (for example for exceeding its memory limit) and counts as a
crash. Repeated crashes notify the instance admin, and the admin area shows
the recent history (issue #494).
"""

from __future__ import annotations

import logging
import os
import socket
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.utils import get_setting, set_setting
from app.core.versioning import resolve_app_version
from app.models import Membership, Notification, NotificationPreference, ProcessRun, User

logger = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 60
# A run without a heartbeat for this long is dead.
STALE_AFTER = timedelta(minutes=3)
ALERT_WINDOW = timedelta(hours=1)
ALERT_THRESHOLD = 3
ALERT_COOLDOWN = timedelta(hours=6)
KEEP_RUNS_FOR = timedelta(days=30)
ALERT_SETTING = "process_health_last_alert_at"

ALERT_TITLE = "Tribu restarted unexpectedly"
ALERT_BODY = "The server stopped unexpectedly {count} times in the last hour."


def record_start(db: Session, now: Optional[datetime] = None) -> int:
    now = now or utcnow()
    run = ProcessRun(
        host=socket.gethostname()[:120],
        pid=os.getpid(),
        version=resolve_app_version()[:60],
        started_at=now,
        last_seen_at=now,
    )
    db.add(run)
    db.commit()
    return run.id


def record_stop(db: Session, run_id: int, now: Optional[datetime] = None) -> None:
    run = db.get(ProcessRun, run_id)
    if run and run.stopped_at is None:
        run.stopped_at = now or utcnow()
        db.commit()


def heartbeat(db: Session, run_id: int, now: Optional[datetime] = None) -> int:
    """Refresh this run, mark dead runs as crashed and alert if needed.

    Returns how many runs were newly found dead.
    """
    now = now or utcnow()
    run = db.get(ProcessRun, run_id)
    if run is not None:
        run.last_seen_at = now
    dead = (
        db.query(ProcessRun)
        .filter(
            ProcessRun.id != run_id,
            ProcessRun.stopped_at.is_(None),
            ProcessRun.last_seen_at < now - STALE_AFTER,
        )
        .all()
    )
    for stale in dead:
        stale.crashed = True
        stale.stopped_at = stale.last_seen_at
    db.query(ProcessRun).filter(ProcessRun.started_at < now - KEEP_RUNS_FOR).delete(synchronize_session=False)
    db.commit()
    if dead:
        logger.warning("%d backend process(es) stopped without shutting down", len(dead))
        alert_if_needed(db, now)
    return len(dead)


def crashes_since(db: Session, since: datetime) -> list[ProcessRun]:
    return (
        db.query(ProcessRun)
        .filter(ProcessRun.crashed.is_(True), ProcessRun.stopped_at >= since)
        .order_by(ProcessRun.stopped_at.desc())
        .all()
    )


def _instance_admin(db: Session) -> Optional[User]:
    # Until Tribu has an explicit system-admin table, the first account is the
    # instance admin (see app.core.utils.is_instance_admin_user).
    return db.query(User).order_by(User.id.asc()).first()


def alert_if_needed(db: Session, now: Optional[datetime] = None) -> bool:
    """Notify the instance admin about repeated crashes, at most every few hours."""
    now = now or utcnow()
    count = len(crashes_since(db, now - ALERT_WINDOW))
    if count < ALERT_THRESHOLD:
        return False
    last = get_setting(db, ALERT_SETTING, "")
    if last:
        try:
            if now - datetime.fromisoformat(last) < ALERT_COOLDOWN:
                return False
        except ValueError:
            pass
    admin = _instance_admin(db)
    membership = (
        db.query(Membership).filter(Membership.user_id == admin.id).order_by(Membership.family_id.asc()).first()
        if admin else None
    )
    if not membership:
        return False
    body = ALERT_BODY.format(count=count)
    db.add(Notification(
        user_id=admin.id,
        family_id=membership.family_id,
        type="system",
        title=ALERT_TITLE,
        body=body,
        link="/admin",
    ))
    set_setting(db, ALERT_SETTING, now.isoformat())
    db.commit()
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == admin.id).first()
    if pref and pref.push_enabled:
        try:
            from app.core.push import send_push_for_user

            send_push_for_user(db, admin.id, ALERT_TITLE, body, "/admin", urgent=True)
        except Exception:  # noqa: BLE001 - an alert must never take the heartbeat down
            logger.exception("Could not push the restart alert")
    return True


def _read_int(path: str) -> Optional[int]:
    try:
        text = Path(path).read_text().strip()
    except OSError:
        return None
    return int(text) if text.isdigit() else None


def memory_usage() -> dict[str, Optional[int]]:
    """Resident memory of this process and the container limit, in bytes, where known."""
    rss = None
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                rss = int(line.split()[1]) * 1024
                break
    except (OSError, ValueError, IndexError):
        rss = None
    limit = _read_int("/sys/fs/cgroup/memory.max") or _read_int("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    # cgroup v1 reports "no limit" as a huge number.
    if limit is not None and limit >= 1 << 60:
        limit = None
    return {"rss_bytes": rss, "limit_bytes": limit}


def build_status(db: Session, run_id: Optional[int], now: Optional[datetime] = None) -> dict:
    now = now or utcnow()
    current = db.get(ProcessRun, run_id) if run_id else None
    week = crashes_since(db, now - timedelta(days=7))
    return {
        "version": resolve_app_version(),
        "started_at": current.started_at if current else None,
        "crashes_last_day": sum(1 for run in week if run.stopped_at >= now - timedelta(days=1)),
        "crashes_last_week": len(week),
        "recent_crashes": [
            {"started_at": run.started_at, "stopped_at": run.stopped_at, "version": run.version}
            for run in week[:10]
        ],
        **memory_usage(),
    }


class HeartbeatThread(threading.Thread):
    """Records this process' run and keeps its heartbeat going."""

    def __init__(self, session_factory):
        super().__init__(name="tribu-heartbeat", daemon=True)
        self._session_factory = session_factory
        self._stop_event = threading.Event()
        self.run_id: Optional[int] = None

    def start(self) -> None:
        db = self._session_factory()
        try:
            self.run_id = record_start(db)
        finally:
            db.close()
        super().start()

    def run(self) -> None:
        while not self._stop_event.wait(HEARTBEAT_SECONDS):
            db = self._session_factory()
            try:
                heartbeat(db, self.run_id)
            except Exception:  # noqa: BLE001 - keep beating after a failed round
                logger.exception("Process heartbeat failed")
                db.rollback()
            finally:
                db.close()

    def stop(self) -> None:
        self._stop_event.set()
        if self.run_id is None:
            return
        db = self._session_factory()
        try:
            record_stop(db, self.run_id)
        finally:
            db.close()


_current: Optional[HeartbeatThread] = None


def start_heartbeat(session_factory) -> Optional[HeartbeatThread]:
    global _current
    try:
        _current = HeartbeatThread(session_factory)
        _current.start()
    except Exception:  # noqa: BLE001 - health tracking must not block startup
        logger.exception("Could not start the process heartbeat")
        _current = None
    return _current


def stop_heartbeat() -> None:
    if _current is not None:
        try:
            _current.stop()
        except Exception:  # noqa: BLE001
            logger.exception("Could not record the clean shutdown")


def current_run_id() -> Optional[int]:
    return _current.run_id if _current else None
