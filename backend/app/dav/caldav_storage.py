"""Database-backed CalDAV storage plugin.

Maps each Tribu family the authenticated user belongs to onto one
Radicale calendar collection at ``/<user_email>/family-<family_id>/``.
Calendar events live at ``tribu-event-<id>.ics`` inside the collection.

Phase B1 is read-only: ``upload``, ``delete``, ``set_meta`` and
``create_collection`` raise ``PermissionError`` (clients see 403).
Phase B2 turns the plugin bidirectional by parsing uploaded VEVENTs
back into ``CalendarEvent`` rows and handling DELETE.
"""
from __future__ import annotations

import hashlib
from contextlib import contextmanager
from datetime import datetime
from typing import Iterable, Iterator, Mapping, Optional, Tuple

from radicale import item as radicale_item
from radicale import pathutils, types
from radicale.storage import BaseStorage, BaseCollection

from app.core.ics_utils import events_to_ics
from app.database import SessionLocal
from app.models import CalendarEvent, Family, Membership, User


def _db():
    """Context manager around ``SessionLocal`` for the storage plugin."""
    class _Ctx:
        def __enter__(self):
            self._db = SessionLocal()
            return self._db

        def __exit__(self, exc_type, exc, tb):
            self._db.close()
            return False

    return _Ctx()


def _event_href(event_id: int) -> str:
    return f"tribu-event-{event_id}.ics"


def _parse_event_href(href: str) -> Optional[int]:
    if not href.startswith("tribu-event-") or not href.endswith(".ics"):
        return None
    try:
        return int(href[len("tribu-event-") : -len(".ics")])
    except ValueError:
        return None


def _http_last_modified(dt: Optional[datetime]) -> str:
    if dt is None:
        dt = datetime(2000, 1, 1)
    return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")


def _collection_path(user_email: str, family_id: int) -> str:
    return f"{user_email}/family-{family_id}"


def _parse_collection_segment(segment: str) -> Optional[int]:
    if not segment.startswith("family-"):
        return None
    try:
        return int(segment[len("family-") :])
    except ValueError:
        return None


class CalendarCollection(BaseCollection):
    """A single family's shared calendar exposed as one Radicale collection."""

    def __init__(self, storage: "Storage", user_email: str, family_id: int, family_name: str):
        self._storage = storage
        self._user_email = user_email
        self._family_id = family_id
        self._family_name = family_name

    @property
    def path(self) -> str:
        return _collection_path(self._user_email, self._family_id)

    @property
    def last_modified(self) -> str:
        return _http_last_modified(self._latest_change())

    @property
    def etag(self) -> str:
        return f'"{self._ctag()}"'

    # ── reads ─────────────────────────────────────────────

    def get_meta(self, key: Optional[str] = None):
        meta: dict = {
            "tag": "VCALENDAR",
            "D:displayname": f"Tribu · {self._family_name}",
            "C:calendar-description": "Tribu shared family calendar",
            "C:supported-calendar-component-set": "VEVENT",
        }
        if key is None:
            return meta
        return meta.get(key)

    def get_all(self) -> Iterable["radicale_item.Item"]:
        with _db() as db:
            rows = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.family_id == self._family_id)
                .order_by(CalendarEvent.id.asc())
                .all()
            )
        for ev in rows:
            yield self._event_to_item(ev)

    def get_multi(self, hrefs: Iterable[str]) -> Iterable[Tuple[str, Optional["radicale_item.Item"]]]:
        for href in hrefs:
            event_id = _parse_event_href(href)
            if event_id is None:
                yield href, None
                continue
            with _db() as db:
                ev = (
                    db.query(CalendarEvent)
                    .filter(
                        CalendarEvent.family_id == self._family_id,
                        CalendarEvent.id == event_id,
                    )
                    .first()
                )
            yield href, (self._event_to_item(ev) if ev is not None else None)

    def has_uid(self, uid: str) -> bool:
        event_id = self._uid_to_event_id(uid)
        if event_id is None:
            return False
        with _db() as db:
            return (
                db.query(CalendarEvent.id)
                .filter(
                    CalendarEvent.family_id == self._family_id,
                    CalendarEvent.id == event_id,
                )
                .first()
                is not None
            )

    def serialize(self, vcf_to_ics: bool = False) -> str:
        with _db() as db:
            events = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.family_id == self._family_id)
                .order_by(CalendarEvent.id.asc())
                .all()
            )
        return events_to_ics(events, calendar_name=self._family_name)

    def sync(self, old_token: str = "") -> Tuple[str, Iterable[str]]:
        # Minimal sync support: always return the current ctag and the
        # full item list so clients fall back to a full refresh. A
        # real incremental sync token lands with the rest of write
        # support in Phase B2 / D.
        token = f"http://radicale.org/ns/sync/{self._ctag()}"
        hrefs = []
        with _db() as db:
            ids = (
                db.query(CalendarEvent.id)
                .filter(CalendarEvent.family_id == self._family_id)
                .all()
            )
        for (event_id,) in ids:
            hrefs.append(_event_href(event_id))
        return token, hrefs

    # ── writes (Phase B2) ─────────────────────────────────

    def upload(self, href: str, item: "radicale_item.Item"):
        raise PermissionError("Calendar writes land in Phase B2")

    def delete(self, href: Optional[str] = None) -> None:
        raise PermissionError("Calendar writes land in Phase B2")

    def set_meta(self, props: Mapping[str, str]) -> None:
        # No-op: metadata is derived from the family row.
        return None

    # ── helpers ───────────────────────────────────────────

    def _event_to_item(self, ev: CalendarEvent) -> "radicale_item.Item":
        ics = events_to_ics([ev], calendar_name=self._family_name)
        etag = f'"{hashlib.sha256(ics.encode("utf-8")).hexdigest()[:16]}"'
        return radicale_item.Item(
            collection=self,
            text=ics,
            href=_event_href(ev.id),
            last_modified=_http_last_modified(ev.created_at),
            etag=etag,
        )

    def _latest_change(self) -> Optional[datetime]:
        with _db() as db:
            return (
                db.query(CalendarEvent.created_at)
                .filter(CalendarEvent.family_id == self._family_id)
                .order_by(CalendarEvent.created_at.desc())
                .limit(1)
                .scalar()
            )

    def _ctag(self) -> str:
        with _db() as db:
            count = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.family_id == self._family_id)
                .count()
            )
            latest = self._latest_change()
        return hashlib.sha256(f"{count}:{latest}".encode("utf-8")).hexdigest()

    @staticmethod
    def _uid_to_event_id(uid: str) -> Optional[int]:
        # UIDs we emit look like ``tribu-event-<id>@tribu.local``.
        if not uid.startswith("tribu-event-"):
            return None
        body = uid[len("tribu-event-") :]
        if "@" in body:
            body = body.split("@", 1)[0]
        try:
            return int(body)
        except ValueError:
            return None


class Storage(BaseStorage):
    """DB-backed Radicale storage that surfaces one calendar per family."""

    def discover(
        self,
        path: str,
        depth: str = "0",
        child_context_manager=None,
        user_groups=None,
    ) -> Iterable["types.CollectionOrItem"]:
        sane = pathutils.strip_path(path)
        parts = sane.split("/") if sane else []
        if not parts:
            # Root is virtual; Radicale consults rights separately.
            return
        user_email = parts[0]
        user = _load_user(user_email)
        if user is None:
            return
        families = _families_for(user)
        if len(parts) == 1:
            # Principal home: yield a placeholder collection and, if
            # depth == "1", also list the family calendars.
            yield _PrincipalCollection(self, user_email)
            if depth == "1":
                for family_id, family_name in families:
                    yield CalendarCollection(self, user_email, family_id, family_name)
            return
        if len(parts) == 2:
            family_id = _parse_collection_segment(parts[1])
            if family_id is None:
                return
            family_name = next((n for (fid, n) in families if fid == family_id), None)
            if family_name is None:
                return
            coll = CalendarCollection(self, user_email, family_id, family_name)
            yield coll
            if depth == "1":
                yield from coll.get_all()
            return
        if len(parts) == 3:
            family_id = _parse_collection_segment(parts[1])
            event_id = _parse_event_href(parts[2])
            if family_id is None or event_id is None:
                return
            family_name = next((n for (fid, n) in families if fid == family_id), None)
            if family_name is None:
                return
            coll = CalendarCollection(self, user_email, family_id, family_name)
            for href, item in coll.get_multi([parts[2]]):
                if item is not None:
                    yield item

    @contextmanager
    def acquire_lock(self, mode: str, user: str = "", *args, **kwargs) -> Iterator[None]:
        # Row-level locking lives in the ORM; Radicale's cross-request
        # lock is a no-op here.
        yield

    def create_collection(self, href, items=None, props=None):
        raise PermissionError(
            "Families and their calendars are managed by Tribu, not DAV"
        )

    def move(self, item, to_collection, to_href) -> None:
        raise PermissionError("DAV MOVE is not supported in Phase B1")

    def verify(self) -> bool:
        return True


class _PrincipalCollection(BaseCollection):
    """Empty placeholder at ``/<user>/`` so Radicale's discovery works."""

    def __init__(self, storage: Storage, user_email: str):
        self._storage = storage
        self._user_email = user_email

    @property
    def path(self) -> str:
        return self._user_email

    @property
    def last_modified(self) -> str:
        return _http_last_modified(None)

    @property
    def etag(self) -> str:
        return '"tribu-principal"'

    def get_meta(self, key: Optional[str] = None):
        meta = {"tag": ""}
        return meta if key is None else meta.get(key)

    def get_all(self) -> Iterable["radicale_item.Item"]:
        return iter(())

    def get_multi(self, hrefs):
        for href in hrefs:
            yield href, None

    def serialize(self, vcf_to_ics: bool = False) -> str:
        return ""

    def set_meta(self, props): return None

    def upload(self, href, item):
        raise PermissionError("Principal home is read-only")

    def delete(self, href=None):
        raise PermissionError("Principal home is read-only")

    def sync(self, old_token: str = ""):
        return "http://radicale.org/ns/sync/principal", []


def _load_user(email: str) -> Optional[User]:
    with _db() as db:
        return db.query(User).filter(User.email == email).first()


def _families_for(user: User) -> list[tuple[int, str]]:
    with _db() as db:
        rows = (
            db.query(Family.id, Family.name)
            .join(Membership, Membership.family_id == Family.id)
            .filter(Membership.user_id == user.id)
            .order_by(Family.id.asc())
            .all()
        )
    return [(fid, name) for fid, name in rows]
