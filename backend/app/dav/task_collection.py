"""Database-backed VTODO collection for one Tribu family."""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Iterable, Mapping, Optional, Tuple

from icalendar import Calendar
from radicale import item as radicale_item
from radicale.storage import BaseCollection
from sqlalchemy.orm import Session

from app.core.task_service import (
    TaskDomainError,
    create_task,
    delete_task,
    update_task,
)
from app.core.vtodo_utils import VTodoError, parse_vtodo, task_to_vtodo
from app.database import SessionLocal
from app.models import Membership, Task, User
from .rights_plugin import current_user_id


TASK_PREFIX = "task-"


def task_collection_path(user_email: str, family_id: int) -> str:
    return f"{user_email}/{TASK_PREFIX}{family_id}"


def task_href(task: Task) -> str:
    return task.dav_href or f"tribu-task-{task.id}.ics"


def legacy_task_href_id(href: str) -> Optional[int]:
    if not href.startswith("tribu-task-") or not href.endswith(".ics"):
        return None
    suffix = href[len("tribu-task-") : -len(".ics")]
    if not suffix.isascii() or not suffix.isdecimal():
        return None
    try:
        return int(suffix)
    except ValueError:
        return None


def synthesized_task_uid(task_id: int) -> str:
    return f"tribu-task-{task_id}@tribu.local"


def _http_last_modified(value: Optional[datetime]) -> str:
    return (value or datetime(2000, 1, 1)).strftime("%a, %d %b %Y %H:%M:%S GMT")


class TaskCollection(BaseCollection):
    """A separate VTODO-only collection; never shares VEVENT storage."""

    def __init__(self, storage, user_email: str, family_id: int, family_name: str):
        self._storage = storage
        self._user_email = user_email
        self._family_id = family_id
        self._family_name = family_name

    @property
    def path(self) -> str:
        return task_collection_path(self._user_email, self._family_id)

    @property
    def last_modified(self) -> str:
        return _http_last_modified(self._latest_change())

    @property
    def etag(self) -> str:
        return f'"{self._ctag()}"'

    def get_meta(self, key: Optional[str] = None):
        meta = {
            "tag": "VCALENDAR",
            "D:displayname": f"Tribu · {self._family_name} tasks",
            "C:calendar-description": "Tribu shared family tasks",
            "C:supported-calendar-component-set": "VTODO",
        }
        return meta if key is None else meta.get(key)

    def _visible_query(self, db: Session):
        user_id = current_user_id()
        membership = (
            db.query(Membership)
            .filter(Membership.user_id == user_id, Membership.family_id == self._family_id)
            .first()
        )
        query = db.query(Task).filter(Task.family_id == self._family_id)
        if membership is None:
            return query.filter(False)
        if not membership.is_adult:
            query = query.filter(Task.assigned_to_user_id == user_id)
        return query

    def get_all(self) -> Iterable["radicale_item.Item"]:
        with SessionLocal() as db:
            rows = self._visible_query(db).order_by(Task.id.asc()).all()
            rendered = [self._task_to_item(row) for row in rows]
        yield from rendered

    def get_multi(self, hrefs: Iterable[str]) -> Iterable[Tuple[str, Optional["radicale_item.Item"]]]:
        with SessionLocal() as db:
            for href in hrefs:
                row = self._find_by_href(db, href, visible=True)
                yield href, self._task_to_item(row) if row is not None else None

    def has_uid(self, uid: str) -> bool:
        with SessionLocal() as db:
            row = (
                self._visible_query(db)
                .with_entities(Task.id)
                .filter(Task.vtodo_uid == uid)
                .first()
            )
            if row is not None:
                return True
            if uid.startswith("tribu-task-") and uid.endswith("@tribu.local"):
                raw_id = uid[len("tribu-task-") : -len("@tribu.local")]
                if raw_id.isascii() and raw_id.isdecimal():
                    return self._visible_query(db).with_entities(Task.id).filter(
                        Task.id == int(raw_id),
                        Task.vtodo_uid.is_(None),
                    ).first() is not None
        return False

    def serialize(self, vcf_to_ics: bool = False) -> str:
        calendar = Calendar()
        calendar.add("PRODID", "-//Tribu//Tasks//EN")
        calendar.add("VERSION", "2.0")
        with SessionLocal() as db:
            rows = self._visible_query(db).order_by(Task.id.asc()).all()
            for row in rows:
                one = Calendar.from_ical(task_to_vtodo(row))
                todo = next(c for c in one.subcomponents if c.name == "VTODO")
                calendar.add_component(todo)
        return calendar.to_ical().decode("utf-8")

    def sync(self, old_token: str = ""):
        if old_token:
            raise ValueError("sync-token replay not supported until tombstones land")
        with SessionLocal() as db:
            hrefs = [task_href(row) for row in self._visible_query(db).all()]
        return f"http://radicale.org/ns/sync/{self._ctag()}", hrefs

    def upload(self, href: str, item: "radicale_item.Item"):
        if not href or len(href) > 250:
            raise ValueError("Task resource name is invalid")
        component_name = getattr(item, "component_name", "")
        if component_name and component_name != "VTODO":
            raise ValueError("Only VTODO can be stored in a task collection")
        wire = getattr(item, "text", None) or item.serialize()
        try:
            parsed = parse_vtodo(wire)
        except VTodoError as exc:
            raise ValueError(str(exc)) from exc

        with SessionLocal() as db:
            actor = db.query(User).filter(User.id == current_user_id()).first()
            if actor is None:
                raise ValueError("Task request has no authenticated user")
            existing_by_href = self._find_by_href(db, href, visible=False)
            membership = db.query(Membership).filter(
                Membership.user_id == actor.id,
                Membership.family_id == self._family_id,
            ).first()
            if membership is None:
                raise ValueError("Task family access denied")
            if not membership.is_adult and (
                existing_by_href is None or existing_by_href.assigned_to_user_id != actor.id
            ):
                raise ValueError("Task write access denied")
            if existing_by_href is not None:
                expected_uid = existing_by_href.vtodo_uid or synthesized_task_uid(existing_by_href.id)
                if parsed.uid != expected_uid:
                    raise ValueError("Task UID cannot be changed")
            existing_by_uid = self._find_by_uid(db, parsed.uid)
            if existing_by_href is None and existing_by_uid is None:
                if legacy_task_href_id(href) is not None:
                    raise ValueError("Tribu task resource names are reserved")
                if parsed.uid.startswith("tribu-task-") and parsed.uid.endswith("@tribu.local"):
                    raise ValueError("Tribu task UIDs are reserved")
            if existing_by_uid is not None and (
                existing_by_href is None or existing_by_uid.id != existing_by_href.id
            ):
                raise ValueError("Task UID is already in use")

            try:
                if existing_by_href is None:
                    def attach_created(row: Task) -> None:
                        row.vtodo_uid = parsed.uid
                        row.dav_href = href
                        row.raw_vtodo = parsed.raw_vtodo

                    row = create_task(
                        db,
                        actor,
                        {"family_id": self._family_id, **parsed.fields},
                        before_commit=attach_created,
                    )
                    replaced = None
                else:
                    replaced = self._task_to_item(existing_by_href)

                    def attach_updated(row: Task) -> None:
                        row.vtodo_uid = expected_uid
                        row.dav_href = href
                        row.raw_vtodo = parsed.raw_vtodo

                    row = update_task(
                        db,
                        actor,
                        existing_by_href.id,
                        parsed.fields,
                        before_commit=attach_updated,
                    )
            except TaskDomainError as exc:
                raise ValueError(exc.safe_reason) from exc
            stored = self._task_to_item(row)
        return stored, replaced

    def delete(self, href: Optional[str] = None) -> None:
        if href is None:
            raise ValueError("Task collections are managed by Tribu, not DAV")
        with SessionLocal() as db:
            actor = db.query(User).filter(User.id == current_user_id()).first()
            if actor is None:
                raise ValueError("Task request has no authenticated user")
            membership = db.query(Membership).filter(
                Membership.user_id == actor.id,
                Membership.family_id == self._family_id,
            ).first()
            if membership is None:
                raise ValueError("Task family access denied")
            if not membership.is_adult:
                raise ValueError("Task write access denied")
            row = self._find_by_href(db, href, visible=False)
            if row is None:
                raise KeyError(href)
            try:
                delete_task(db, actor, row.id)
            except TaskDomainError as exc:
                raise ValueError(exc.safe_reason) from exc

    def set_meta(self, props: Mapping[str, str]) -> None:
        return None

    def _find_by_uid(self, db: Session, uid: str) -> Optional[Task]:
        row = db.query(Task).filter(
            Task.family_id == self._family_id,
            Task.vtodo_uid == uid,
        ).first()
        if row is not None:
            return row
        if uid.startswith("tribu-task-") and uid.endswith("@tribu.local"):
            raw_id = uid[len("tribu-task-") : -len("@tribu.local")]
            if raw_id.isascii() and raw_id.isdecimal():
                return db.query(Task).filter(
                    Task.family_id == self._family_id,
                    Task.id == int(raw_id),
                    Task.vtodo_uid.is_(None),
                ).first()
        return None

    def _find_by_href(self, db: Session, href: str, *, visible: bool) -> Optional[Task]:
        query = self._visible_query(db) if visible else db.query(Task).filter(Task.family_id == self._family_id)
        row = query.filter(Task.dav_href == href).first()
        if row is not None:
            return row
        legacy_id = legacy_task_href_id(href)
        if legacy_id is None:
            return None
        return query.filter(Task.id == legacy_id, Task.dav_href.is_(None)).first()

    def _task_to_item(self, task: Task) -> "radicale_item.Item":
        wire = task_to_vtodo(task)
        etag = f'"{hashlib.sha256(wire.encode("utf-8")).hexdigest()[:16]}"'
        return radicale_item.Item(
            collection=self,
            text=wire,
            href=task_href(task),
            last_modified=_http_last_modified(task.updated_at or task.created_at),
            etag=etag,
        )

    def _latest_change(self) -> Optional[datetime]:
        with SessionLocal() as db:
            return self._visible_query(db).order_by(Task.updated_at.desc()).with_entities(Task.updated_at).limit(1).scalar()

    def _ctag(self) -> str:
        with SessionLocal() as db:
            query = self._visible_query(db)
            count = query.count()
            latest = query.order_by(Task.updated_at.desc()).with_entities(Task.updated_at).limit(1).scalar()
        return hashlib.sha256(f"{count}:{latest}".encode("utf-8")).hexdigest()
