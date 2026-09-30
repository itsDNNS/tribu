"""Database-backed CalDAV storage plugin.

Maps each Tribu family the authenticated user belongs to onto one
Radicale calendar collection at ``/<user_email>/cal-<family_id>/``.
Calendar events live at ``tribu-event-<id>.ics`` inside the collection.

VEVENT items and vCards sync bidirectionally. Tribu-managed collection
changes and unsupported calendar component types are rejected through
Radicale's handled ``ValueError`` path.
"""
from __future__ import annotations

import hashlib
import json
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Iterable, Iterator, Mapping, Optional, Tuple

from radicale import item as radicale_item
from radicale import pathutils, types
from radicale.storage import BaseStorage, BaseCollection
from sqlalchemy.exc import IntegrityError

from app.core import cache
from app.core.contact_birthdays import delete_synced_birthday_for_contact, sync_contact_birthday
from app.core.ics_utils import events_to_ics, ics_to_event_dicts
from app.core.vcard_utils import contact_to_vcard, contacts_to_vcards, vcard_to_contact_dict
from app.database import SessionLocal
from app.models import CalendarEvent, Contact, Family, Membership, User
from .rights_plugin import current_scopes, current_user_id, current_user_login
from .sync_snapshots import sync_changes
from .task_collection import TASK_PREFIX, TaskCollection


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


def _group_resources(rows: Iterable["CalendarEvent"]) -> list[list["CalendarEvent"]]:
    """Group event rows into CalDAV resources.

    A resource is a series row followed by its changed occurrences, which
    share the series UID. Changed occurrences whose series row is missing
    form one resource, served at the href of the first of them.
    """
    groups: dict[tuple, list[CalendarEvent]] = {}
    for ev in rows:
        key = ("uid", ev.ical_uid) if ev.ical_uid else ("id", ev.id)
        groups.setdefault(key, []).append(ev)
    return [
        sorted(members, key=lambda ev: (ev.recurrence_id is not None, ev.id))
        for members in groups.values()
    ]


def _changed_occurrences_query(db, family_id: int, ical_uid: str):
    return db.query(CalendarEvent).filter(
        CalendarEvent.family_id == family_id,
        CalendarEvent.ical_uid == ical_uid,
        CalendarEvent.recurrence_id.isnot(None),
    )


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


def _family_member_names(db, family_id: int) -> dict[int, str]:
    """Preload ``{user_id: display_name}`` for a family in one query.

    Collection operations pass the mapping down to ``events_to_ics`` so
    attendee projection never triggers per-event member lookups.
    """
    rows = (
        db.query(User.id, User.display_name)
        .join(Membership, Membership.user_id == User.id)
        .filter(Membership.family_id == family_id)
        .all()
    )
    return {int(user_id): display_name for user_id, display_name in rows}


def _membership_fingerprint(member_names: Mapping[int, str]) -> str:
    """Stable identity/display-name fingerprint of a family's membership.

    Canonical JSON of the sorted ``(user_id, display_name)`` pairs keeps
    the encoding unambiguous: display names containing separator
    characters cannot collide with a differently-shaped membership, and
    Unicode names serialize deterministically (``ensure_ascii=False``
    with fixed separators).
    """
    pairs = sorted((int(user_id), name) for user_id, name in member_names.items())
    return json.dumps(pairs, separators=(",", ":"), ensure_ascii=False)


CALENDAR_PREFIX = "cal-"
ADDRESSBOOK_PREFIX = "book-"


def _calendar_collection_path(user_email: str, family_id: int) -> str:
    return f"{user_email}/{CALENDAR_PREFIX}{family_id}"


def _addressbook_collection_path(user_email: str, family_id: int) -> str:
    return f"{user_email}/{ADDRESSBOOK_PREFIX}{family_id}"


def _parse_collection_segment(segment: str) -> Tuple[Optional[str], Optional[int]]:
    """Return ``(kind, family_id)`` for a collection segment.

    ``kind`` is ``"calendar"`` or ``"addressbook"``; ``(None, None)``
    indicates the segment is not a Tribu-managed collection.
    """
    for prefix, kind in (
        (CALENDAR_PREFIX, "calendar"),
        (ADDRESSBOOK_PREFIX, "addressbook"),
        (TASK_PREFIX, "tasks"),
    ):
        if segment.startswith(prefix):
            suffix = segment[len(prefix) :]
            if not suffix or not suffix.isascii() or not suffix.isdecimal():
                return None, None
            try:
                return kind, int(suffix)
            except ValueError:
                return None, None
    return None, None


class CalendarCollection(BaseCollection):
    """A single family's shared calendar exposed as one Radicale collection."""

    def __init__(self, storage: "Storage", user_email: str, family_id: int, family_name: str):
        self._storage = storage
        self._user_email = user_email
        self._family_id = family_id
        self._family_name = family_name

    @property
    def path(self) -> str:
        return _calendar_collection_path(self._user_email, self._family_id)

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
            member_names = _family_member_names(db, self._family_id)
        for resource in _group_resources(rows):
            yield self._resource_to_item(resource, member_names)

    def get_multi(self, hrefs: Iterable[str]) -> Iterable[Tuple[str, Optional["radicale_item.Item"]]]:
        results = []
        with _db() as db:
            member_names = _family_member_names(db, self._family_id)
            for href in hrefs:
                resource = self._resource_by_href_scoped(db, href)
                results.append((href, self._resource_to_item(resource, member_names) if resource else None))
        yield from results

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
            member_names = _family_member_names(db, self._family_id)
        return events_to_ics(events, calendar_name=self._family_name, member_names=member_names)

    def sync(self, old_token: str = "") -> Tuple[str, Iterable[str]]:
        # The resources as served now; an older token gets what changed.
        state = {item.href: item.etag for item in self.get_all()}
        return sync_changes(f"cal:{self._family_id}", state, old_token)

    # ── writes ────────────────────────────────────────────

    def upload(self, href: str, item: "radicale_item.Item") -> Tuple["radicale_item.Item", Optional["radicale_item.Item"]]:
        """PUT ``href`` to write ``item``.

        Returns ``(stored_item, replaced_item)``. ``replaced_item`` is the
        prior representation at the same href when the PUT overwrites an
        existing row, or ``None`` for a fresh create.
        """
        component_name = getattr(item, "component_name", "")
        if component_name == "VTODO":
            raise ValueError("VTODO must be stored in the separate Tribu task collection")
        if component_name != "VEVENT":
            raise ValueError("Unsupported calendar component; only VEVENT can be stored")
        ics_text = getattr(item, "text", None) or item.serialize()
        uid = getattr(item, "uid", None) or ""
        valid, errors = ics_to_event_dicts(ics_text, self._family_id, current_user_id(), keep_raw=True)
        if not valid:
            reason = errors[0]["error"] if errors else "no VEVENT"
            raise ValueError(f"VEVENT rejected: {reason}")
        # The resource is one series plus the occurrences it changes. A
        # resource holding only changed occurrences (for example an
        # invitation to a single occurrence) is kept as a plain event.
        fields = next((d for d in valid if d.get("recurrence_id") is None), None)
        changed_occurrences = [d for d in valid if d.get("recurrence_id") is not None]
        if fields is None:
            fields = changed_occurrences[0]
            changed_occurrences = []
        if not uid:
            uid = str(fields.get("title") or href)

        with _db() as db:
            member_names = _family_member_names(db, self._family_id)
            existing_by_href = (
                db.query(CalendarEvent)
                .filter(
                    CalendarEvent.family_id == self._family_id,
                    CalendarEvent.dav_href == href,
                )
                .first()
            )
            # Defensive guard against silent cross-resource hijack on
            # a UID match at a different href. The changed occurrences
            # of the series at this href are part of this resource.
            for other in db.query(CalendarEvent).filter(
                CalendarEvent.family_id == self._family_id,
                CalendarEvent.ical_uid == uid,
            ):
                part_of_this_resource = existing_by_href is not None and (
                    other.id == existing_by_href.id
                    or (other.recurrence_id is not None and existing_by_href.ical_uid == uid)
                )
                if not part_of_this_resource:
                    raise ValueError(
                        "UID already in use on another event; choose a distinct UID or PUT to the existing href"
                    )
            existing = existing_by_href
            replaced_item: Optional["radicale_item.Item"] = None
            if existing is not None:
                previous_uid = existing.ical_uid
                replaced_item = self._resource_to_item(self._resource_rows_scoped(db, existing), member_names)
                _apply_event_fields(existing, fields)
                existing.ical_uid = uid
                existing.dav_href = href
                row = existing
                if previous_uid and previous_uid != uid:
                    _changed_occurrences_query(db, self._family_id, previous_uid).delete(synchronize_session=False)
            else:
                row = CalendarEvent(
                    family_id=self._family_id,
                    created_by_user_id=current_user_id(),
                    ical_uid=uid,
                    dav_href=href,
                )
                _apply_event_fields(row, fields)
                db.add(row)
            self._store_changed_occurrences(db, row, changed_occurrences)
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                # Unique (family_id, ical_uid) / (family_id, dav_href)
                # violation: a concurrent writer won. Surface it as a
                # deterministic 4xx instead of letting the 500 leak.
                raise ValueError(f"concurrent write conflict: {exc.orig}") from exc
            db.refresh(row)
            stored_item = self._resource_to_item(self._resource_rows_scoped(db, row), member_names)
        return stored_item, replaced_item

    def delete(self, href: Optional[str] = None) -> None:
        """DELETE ``href``. Radicale calls with ``href=None`` to drop the
        whole collection, which Tribu manages outside DAV so we refuse."""
        if href is None:
            raise ValueError("Calendar collections are managed by Tribu, not DAV")
        with _db() as db:
            resource = self._resource_by_href_scoped(db, href)
            if not resource:
                # Radicale expects KeyError on missing items.
                raise KeyError(href)
            for ev in resource:
                db.delete(ev)
            db.commit()

    def set_meta(self, props: Mapping[str, str]) -> None:
        # Display metadata is derived from the family row. DAV clients
        # may still send harmless collection property updates during setup.
        return None

    # ── helpers ───────────────────────────────────────────

    def _store_changed_occurrences(self, db, series: CalendarEvent, occurrences: list[dict]) -> None:
        """Make the series' changed-occurrence rows match the PUT body.

        New rows take the series' Tribu-only fields (source, members,
        color) since DAV clients cannot set those.
        """
        existing = {
            ev.recurrence_id: ev
            for ev in _changed_occurrences_query(db, self._family_id, series.ical_uid)
        }
        for fields in occurrences:
            recurrence_id = fields["recurrence_id"]
            ev = existing.pop(recurrence_id, None)
            if ev is None:
                ev = CalendarEvent(
                    family_id=self._family_id,
                    created_by_user_id=current_user_id(),
                    ical_uid=series.ical_uid,
                    recurrence_id=recurrence_id,
                    **{name: getattr(series, name) for name in _INHERITED_OCCURRENCE_FIELDS},
                )
                db.add(ev)
            _apply_event_fields(ev, fields)
        for ev in existing.values():
            db.delete(ev)

    def _resource_rows_scoped(self, db, lead: CalendarEvent) -> Optional[list[CalendarEvent]]:
        """The rows served together with ``lead``, or None if ``lead``
        is a changed occurrence served inside another resource."""
        if not lead.ical_uid:
            return [lead]
        rows = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.family_id == self._family_id,
                CalendarEvent.ical_uid == lead.ical_uid,
            )
            .order_by(CalendarEvent.id.asc())
            .all()
        )
        resource = _group_resources(rows)[0]
        return resource if resource[0].id == lead.id else None

    def _resource_by_href_scoped(self, db, href: str) -> Optional[list[CalendarEvent]]:
        lead = self._find_event_by_href_scoped(db, href)
        if lead is None:
            return None
        return self._resource_rows_scoped(db, lead)

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

    def _resource_to_item(
        self,
        rows: list[CalendarEvent],
        member_names: Mapping[int, str],
    ) -> "radicale_item.Item":
        ics = events_to_ics(rows, calendar_name=self._family_name, member_names=member_names)
        etag = f'"{hashlib.sha256(ics.encode("utf-8")).hexdigest()[:16]}"'
        mtime = max((ev.updated_at or ev.created_at for ev in rows if ev.updated_at or ev.created_at), default=None)
        return radicale_item.Item(
            collection=self,
            text=ics,
            href=_event_href(rows[0]),
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
            latest = (
                db.query(CalendarEvent.updated_at)
                .filter(CalendarEvent.family_id == self._family_id)
                .order_by(CalendarEvent.updated_at.desc())
                .limit(1)
                .scalar()
            )
            # Membership identity/display names feed the emitted ATTENDEE
            # content, so a member add/remove/rename must invalidate
            # collection enumeration even though no event row changed.
            members = _membership_fingerprint(_family_member_names(db, self._family_id))
        return hashlib.sha256(f"{count}:{latest}:{members}".encode("utf-8")).hexdigest()

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

    _write_lock = threading.RLock()

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
            # Surface a real DAV root so clients can ask ``/dav/`` for
            # ``current-user-principal`` and bootstrap from a single base URL.
            yield _RootCollection(self)
            if depth == "1":
                try:
                    user_email = current_user_login()
                except RuntimeError:
                    return
                yield _PrincipalCollection(self, user_email)
            return
        user_email = parts[0]
        user = _load_user(user_email)
        if user is None:
            return
        families = _families_for(user)
        if len(parts) == 1:
            # Principal home: yield a placeholder plus, if depth="1",
            # one calendar and one address book per family.
            yield _PrincipalCollection(self, user_email)
            if depth == "1":
                for family_id, family_name in families:
                    yield CalendarCollection(self, user_email, family_id, family_name)
                    yield AddressBookCollection(self, user_email, family_id, family_name)
                    scopes = current_scopes()
                    if "tasks:read" in scopes or "tasks:write" in scopes:
                        yield TaskCollection(self, user_email, family_id, family_name)
            return
        kind, family_id = _parse_collection_segment(parts[1])
        if kind is None or family_id is None:
            return
        family_name = next((n for (fid, n) in families if fid == family_id), None)
        if family_name is None:
            return
        coll: BaseCollection
        if kind == "tasks" and not ({"tasks:read", "tasks:write"} & current_scopes()):
            return
        if kind == "calendar":
            coll = CalendarCollection(self, user_email, family_id, family_name)
        elif kind == "tasks":
            coll = TaskCollection(self, user_email, family_id, family_name)
        else:
            coll = AddressBookCollection(self, user_email, family_id, family_name)
        if len(parts) == 2:
            yield coll
            if depth == "1":
                yield from coll.get_all()
            return
        if len(parts) == 3:
            for href, item in coll.get_multi([parts[2]]):
                if item is not None:
                    yield item

    @contextmanager
    def acquire_lock(self, mode: str, user: str = "", *args, **kwargs) -> Iterator[None]:
        """Serialize writes across the whole storage.

        Radicale validates ``If-Match`` preconditions inside this lock
        before calling ``upload``/``delete``. If the lock is a no-op,
        two concurrent PUTs can both pass the check with the same old
        ETag and both commit. A process-wide ``RLock`` held for the
        duration of any ``w`` request serializes writes; reads still
        run concurrently.
        """
        if mode == "w":
            with self._write_lock:
                yield
        else:
            yield

    def create_collection(self, href, items=None, props=None):
        raise ValueError(
            "Families and their calendars are managed by Tribu, not DAV"
        )

    def move(self, item, to_collection, to_href) -> None:
        raise ValueError("DAV MOVE is not supported")

    def verify(self) -> bool:
        return True


def _contact_href(c: "Contact") -> str:
    if c.dav_href:
        return c.dav_href
    return f"tribu-contact-{c.id}.vcf"


def _legacy_contact_href_id(href: str) -> Optional[int]:
    if not href.startswith("tribu-contact-") or not href.endswith(".vcf"):
        return None
    try:
        return int(href[len("tribu-contact-") : -len(".vcf")])
    except ValueError:
        return None


_MUTABLE_CONTACT_FIELDS = (
    "full_name",
    "email",
    "phone",
    "birthday_month",
    "birthday_day",
    "birthday_year",
)


def _apply_contact_fields(c: Contact, fields: Mapping[str, object]) -> None:
    for name in _MUTABLE_CONTACT_FIELDS:
        if name in fields:
            setattr(c, name, fields[name])


class AddressBookCollection(BaseCollection):
    """A single family's shared address book exposed as one Radicale collection."""

    def __init__(self, storage: "Storage", user_email: str, family_id: int, family_name: str):
        self._storage = storage
        self._user_email = user_email
        self._family_id = family_id
        self._family_name = family_name

    @property
    def path(self) -> str:
        return _addressbook_collection_path(self._user_email, self._family_id)

    @property
    def last_modified(self) -> str:
        return _http_last_modified(self._latest_change())

    @property
    def etag(self) -> str:
        return f'"{self._ctag()}"'

    def get_meta(self, key: Optional[str] = None):
        meta: dict = {
            "tag": "VADDRESSBOOK",
            # The contacts app says what it is; the name stays free of
            # any one language.
            "D:displayname": f"Tribu · {self._family_name}",
            "CR:addressbook-description": "Tribu shared family address book",
        }
        if key is None:
            return meta
        return meta.get(key)

    def get_all(self) -> Iterable["radicale_item.Item"]:
        with _db() as db:
            rows = (
                db.query(Contact)
                .filter(Contact.family_id == self._family_id)
                .order_by(Contact.id.asc())
                .all()
            )
        for c in rows:
            yield self._contact_to_item(c)

    def get_multi(self, hrefs: Iterable[str]) -> Iterable[Tuple[str, Optional["radicale_item.Item"]]]:
        for href in hrefs:
            c = self._find_contact_by_href(href)
            yield href, (self._contact_to_item(c) if c is not None else None)

    def has_uid(self, uid: str) -> bool:
        with _db() as db:
            if (
                db.query(Contact.id)
                .filter(Contact.family_id == self._family_id, Contact.vcard_uid == uid)
                .first()
                is not None
            ):
                return True
        return False

    def serialize(self, vcf_to_ics: bool = False) -> str:
        with _db() as db:
            rows = (
                db.query(Contact)
                .filter(Contact.family_id == self._family_id)
                .order_by(Contact.id.asc())
                .all()
            )
        return contacts_to_vcards(rows)

    def sync(self, old_token: str = "") -> Tuple[str, Iterable[str]]:
        state = {item.href: item.etag for item in self.get_all()}
        return sync_changes(f"book:{self._family_id}", state, old_token)

    def upload(self, href: str, item: "radicale_item.Item") -> Tuple["radicale_item.Item", Optional["radicale_item.Item"]]:
        vcard_text = getattr(item, "text", None) or item.serialize()
        uid = getattr(item, "uid", None) or ""
        fields, error = vcard_to_contact_dict(vcard_text, self._family_id)
        if fields is None:
            raise ValueError(f"VCARD rejected: {error}")
        if not uid:
            uid = fields.get("full_name") or href

        raw_vcard = fields.pop("raw_vcard", None)

        with _db() as db:
            existing_by_href = (
                db.query(Contact)
                .filter(Contact.family_id == self._family_id, Contact.dav_href == href)
                .first()
            )
            existing_by_uid = (
                db.query(Contact)
                .filter(Contact.family_id == self._family_id, Contact.vcard_uid == uid)
                .first()
            )
            # Defensive guard against silent cross-resource hijack: a
            # PUT whose UID already lives on a different href must be
            # rejected, not accepted by moving the other row.
            if existing_by_uid is not None and (
                existing_by_href is None or existing_by_uid.id != existing_by_href.id
            ):
                raise ValueError(
                    "UID already in use on another card; choose a distinct UID or PUT to the existing href"
                )

            replaced_item: Optional["radicale_item.Item"] = None
            if existing_by_href is not None:
                replaced_item = self._contact_to_item(existing_by_href)
                _apply_contact_fields(existing_by_href, fields)
                existing_by_href.vcard_uid = uid
                existing_by_href.dav_href = href
                existing_by_href.raw_vcard = raw_vcard
                row = existing_by_href
            else:
                row = Contact(
                    family_id=self._family_id,
                    vcard_uid=uid,
                    dav_href=href,
                    raw_vcard=raw_vcard,
                )
                _apply_contact_fields(row, fields)
                db.add(row)
                db.flush()
            sync_contact_birthday(
                db,
                self._family_id,
                row.id,
                row.full_name,
                row.birthday_month,
                row.birthday_day,
                row.birthday_year,
            )
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                raise ValueError(f"concurrent write conflict: {exc.orig}") from exc
            db.refresh(row)
            stored = self._contact_to_item(row)
        cache.invalidate_pattern(f"tribu:dashboard:{self._family_id}:*")
        return stored, replaced_item

    def delete(self, href: Optional[str] = None) -> None:
        if href is None:
            raise ValueError("Address books are managed by Tribu, not DAV")
        with _db() as db:
            c = self._find_contact_by_href_scoped(db, href)
            if c is None:
                raise KeyError(href)
            delete_synced_birthday_for_contact(db, self._family_id, c.id)
            db.delete(c)
            db.commit()
        cache.invalidate_pattern(f"tribu:dashboard:{self._family_id}:*")

    def set_meta(self, props: Mapping[str, str]) -> None:
        # Display metadata is derived from the family row. DAV clients
        # may still send harmless collection property updates during setup.
        return None

    # helpers ---

    def _find_contact_by_href(self, href: str) -> Optional[Contact]:
        with _db() as db:
            return self._find_contact_by_href_scoped(db, href)

    def _find_contact_by_href_scoped(self, db, href: str) -> Optional[Contact]:
        c = (
            db.query(Contact)
            .filter(Contact.family_id == self._family_id, Contact.dav_href == href)
            .first()
        )
        if c is not None:
            return c
        legacy_id = _legacy_contact_href_id(href)
        if legacy_id is None:
            return None
        return (
            db.query(Contact)
            .filter(Contact.family_id == self._family_id, Contact.id == legacy_id)
            .first()
        )

    def _contact_to_item(self, c: Contact) -> "radicale_item.Item":
        vcard = contact_to_vcard(c)
        etag = f'"{hashlib.sha256(vcard.encode("utf-8")).hexdigest()[:16]}"'
        mtime = c.updated_at or c.created_at
        return radicale_item.Item(
            collection=self,
            text=vcard,
            href=_contact_href(c),
            last_modified=_http_last_modified(mtime),
            etag=etag,
        )

    def _latest_change(self) -> Optional[datetime]:
        with _db() as db:
            return (
                db.query(Contact.updated_at)
                .filter(Contact.family_id == self._family_id)
                .order_by(Contact.updated_at.desc())
                .limit(1)
                .scalar()
            )

    def _ctag(self) -> str:
        with _db() as db:
            count = db.query(Contact).filter(Contact.family_id == self._family_id).count()
            latest = self._latest_change()
        return hashlib.sha256(f"{count}:{latest}".encode("utf-8")).hexdigest()


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
        raise ValueError("Principal home is read-only")

    def delete(self, href=None):
        raise ValueError("Principal home is read-only")

    def sync(self, old_token: str = ""):
        return "http://radicale.org/ns/sync/principal", []


class _RootCollection(BaseCollection):
    """Virtual DAV root at ``/`` for principal discovery."""

    def __init__(self, storage: Storage):
        self._storage = storage

    @property
    def path(self) -> str:
        return ""

    @property
    def last_modified(self) -> str:
        return _http_last_modified(None)

    @property
    def etag(self) -> str:
        return '"tribu-root"'

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

    def set_meta(self, props):
        return None

    def upload(self, href, item):
        raise ValueError("DAV root is read-only")

    def delete(self, href=None):
        raise ValueError("DAV root is read-only")

    def sync(self, old_token: str = ""):
        return "http://radicale.org/ns/sync/root", []


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
    "location",
    "starts_at",
    "ends_at",
    "all_day",
    "recurrence",
    "recurrence_end",
    "recurrence_weekdays",
    "excluded_dates",
    "raw_vevent",
)

# Copied from the series onto a changed occurrence created over DAV.
_INHERITED_OCCURRENCE_FIELDS = (
    "assigned_to",
    "color",
    "category",
    "icon",
    "source_type",
    "source_name",
    "source_url",
    "subscription_id",
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
