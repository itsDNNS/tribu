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

from app.core.ics_utils import events_to_ics, ics_to_event_dicts
from app.database import SessionLocal
from app.dav import rights_plugin
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


def _event_href(ev: "CalendarEvent") -> str:
    """Preferred DAV href for an event row.

    Client-provided ``dav_href`` wins so PUT then GET round-trip at the
    same URL. Legacy rows fall back to the synthesized id-based path.
    """
    if ev.dav_href:
        return ev.dav_href
    return f"tribu-event-{ev.id}.ics"


def _legacy_href_event_id(href: str) -> Optional[int]:
    """Extract the event id from the synthesized ``tribu-event-<id>.ics`` href."""
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
            ev = self._find_event_by_href(href)
            yield href, (self._event_to_item(ev) if ev is not None else None)

    def has_uid(self, uid: str) -> bool:
        with _db() as db:
            exists = (
                db.query(CalendarEvent.id)
                .filter(
                    CalendarEvent.family_id == self._family_id,
                    CalendarEvent.ical_uid == uid,
                )
                .first()
                is not None
            )
        if exists:
            return True
        # Legacy rows might have no ical_uid yet.
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
        # Deletion tombstones are not tracked yet, so handing a client
        # an old token and expecting it to ask only for the delta would
        # let a deleted event linger in its cache forever. Phase D adds
        # a tombstone journal; until then we reject non-empty tokens so
        # Radicale returns ``valid-sync-token`` and the client re-runs
        # the full enumeration.
        if old_token:
            raise ValueError("sync-token replay not supported until tombstones land")
        hrefs = []
        with _db() as db:
            rows = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.family_id == self._family_id)
                .all()
            )
        for ev in rows:
            hrefs.append(_event_href(ev))
        token = f"http://radicale.org/ns/sync/{self._ctag()}"
        return token, hrefs

    # ── writes (Phase B2) ─────────────────────────────────

    def upload(self, href: str, item: "radicale_item.Item") -> Tuple["radicale_item.Item", Optional["radicale_item.Item"]]:
        """PUT ``href`` to write ``item``.

        Returns ``(stored_item, replaced_item)``. ``replaced_item`` is the
        prior representation at the same href when the PUT overwrites an
        existing row, or ``None`` for a fresh create.
        """
        ics_text = getattr(item, "text", None) or item.serialize()
        uid = getattr(item, "uid", None) or ""
        valid, errors = ics_to_event_dicts(ics_text, self._family_id, rights_plugin.current_user_id())
        if not valid:
            reason = errors[0]["error"] if errors else "no VEVENT"
            raise ValueError(f"VEVENT rejected: {reason}")
        fields = valid[0]
        if not uid:
            uid = str(fields.get("title") or href)

        with _db() as db:
            existing = (
                db.query(CalendarEvent)
                .filter(CalendarEvent.family_id == self._family_id)
                .filter(
                    (CalendarEvent.dav_href == href) | (CalendarEvent.ical_uid == uid)
                )
                .first()
            )
            replaced_item: Optional["radicale_item.Item"] = None
            if existing is not None:
                replaced_item = self._event_to_item(existing)
                _apply_event_fields(existing, fields)
                existing.ical_uid = uid
                existing.dav_href = href
                row = existing
            else:
                row = CalendarEvent(
                    family_id=self._family_id,
                    created_by_user_id=rights_plugin.current_user_id(),
                    ical_uid=uid,
                    dav_href=href,
                )
                _apply_event_fields(row, fields)
                db.add(row)
            db.commit()
            db.refresh(row)
            stored_item = self._event_to_item(row)
        return stored_item, replaced_item

    def delete(self, href: Optional[str] = None) -> None:
        """DELETE ``href``. Radicale calls with ``href=None`` to drop the
        whole collection, which Tribu manages outside DAV so we refuse."""
        if href is None:
            raise PermissionError("Collections are managed by Tribu, not DAV")
        with _db() as db:
            ev = self._find_event_by_href_scoped(db, href)
            if ev is None:
                # Radicale expects KeyError on missing items.
                raise KeyError(href)
            db.delete(ev)
            db.commit()

    def set_meta(self, props: Mapping[str, str]) -> None:
        # No-op: metadata is derived from the family row.
        return None

    # ── helpers ───────────────────────────────────────────

    def _find_event_by_href(self, href: str) -> Optional[CalendarEvent]:
        with _db() as db:
            return self._find_event_by_href_scoped(db, href)

    def _find_event_by_href_scoped(self, db, href: str) -> Optional[CalendarEvent]:
        ev = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.family_id == self._family_id,
                CalendarEvent.dav_href == href,
            )
            .first()
        )
        if ev is not None:
            return ev
        event_id = _legacy_href_event_id(href)
        if event_id is None:
            return None
        return (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.family_id == self._family_id,
                CalendarEvent.id == event_id,
            )
            .first()
        )

    def _event_to_item(self, ev: CalendarEvent) -> "radicale_item.Item":
        ics = events_to_ics([ev], calendar_name=self._family_name)
        etag = f'"{hashlib.sha256(ics.encode("utf-8")).hexdigest()[:16]}"'
        mtime = ev.updated_at or ev.created_at
        return radicale_item.Item(
            collection=self,
            text=ics,
            href=_event_href(ev),
            last_modified=_http_last_modified(mtime),
            etag=etag,
        )

    def _latest_change(self) -> Optional[datetime]:
        with _db() as db:
            return (
                db.query(CalendarEvent.updated_at)
                .filter(CalendarEvent.family_id == self._family_id)
                .order_by(CalendarEvent.updated_at.desc())
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
            if family_id is None:
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


_MUTABLE_EVENT_FIELDS = (
    "title",
    "description",
    "starts_at",
    "ends_at",
    "all_day",
    "recurrence",
    "recurrence_end",
    "excluded_dates",
)


def _apply_event_fields(ev: CalendarEvent, fields: Mapping[str, object]) -> None:
    """Copy parsed-ICS fields from ``ics_to_event_dicts`` onto a row.

    The helper keeps the set of honored columns narrow on purpose:
    assigned_to, color, category, and created_by_user_id are Tribu-only
    concepts that DAV clients should not be able to change.
    """
    for name in _MUTABLE_EVENT_FIELDS:
        if name in fields:
            setattr(ev, name, fields[name])
