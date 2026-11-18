"""Shared test database, factories and helpers for the backend tests.

The fixtures built on them (``app_db``, ``scheduler_db``, ``berlin_tz``, ...)
live in ``conftest.py``. Tests use ``TestSession`` to seed and inspect the
same in-memory database the app sees through the ``get_db`` override.
"""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from itertools import count

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.push import PushResult
from app.models import Family, Membership, PersonalAccessToken, ShoppingList, User
from app.security import PAT_PREFIX, hash_password

# One in-memory database for the whole run; ``app_db`` creates the tables
# before each test and drops them afterwards.
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine, autoflush=False)

_serial = count(1)


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_conn, _record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def auth(token: str) -> dict[str, str]:
    """Bearer headers for a personal access token or a JWT."""
    return {"Authorization": f"Bearer {token}"}


def token_digest(plain: str) -> str:
    """The SHA-256 fingerprint stored as a PAT's lookup and hash."""
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def add_pat(db: Session, user_id: int, scopes: str = "*", *, token: str | None = None, name: str = "test-pat", **fields) -> str:
    """Adds a personal access token for ``user_id`` and returns its plain text."""
    plain = token or f"{PAT_PREFIX}test-{next(_serial)}"
    digest = token_digest(plain)
    db.add(PersonalAccessToken(user_id=user_id, name=name, token_hash=digest, token_lookup=digest, scopes=scopes, **fields))
    return plain


def add_user(db: Session, email: str | None = None, *, password: str = "password", display_name: str = "Member", **fields) -> User:
    """Adds a user without any family and flushes it."""
    user = User(email=email or f"user-{next(_serial)}@example.com", password_hash=hash_password(password), display_name=display_name, **fields)
    db.add(user)
    db.flush()
    return user


@dataclass(frozen=True)
class Member:
    """A seeded family member: the PAT (``None`` without scopes) and the ids."""

    token: str | None
    user_id: int
    family_id: int

    @property
    def headers(self) -> dict[str, str]:
        assert self.token is not None, "member was seeded without a token"
        return auth(self.token)


def add_member(
    db: Session,
    email: str | None = None,
    *,
    scopes: str | None = "*",
    family_id: int | None = None,
    family_name: str = "Family",
    role: str | None = None,
    is_adult: bool = True,
    password: str = "password",
    display_name: str = "Member",
    token: str | None = None,
    pat_name: str = "test-pat",
    user_fields: Mapping | None = None,
    **membership_fields,
) -> Member:
    """Adds a user with a membership (in a new family unless ``family_id``
    is given) and, with ``scopes``, a PAT. Flushes but does not commit.

    ``role`` defaults to admin for adults and member for children.
    """
    user = add_user(db, email, password=password, display_name=display_name, **(user_fields or {}))
    if family_id is None:
        family = Family(name=family_name)
        db.add(family)
        db.flush()
        family_id = family.id
    db.add(Membership(
        user_id=user.id,
        family_id=family_id,
        role=role or ("admin" if is_adult else "member"),
        is_adult=is_adult,
        **membership_fields,
    ))
    plain = add_pat(db, user.id, scopes, token=token, name=pat_name) if scopes is not None else None
    db.flush()
    return Member(plain, user.id, family_id)


def seed_member(email: str | None = None, **options) -> Member:
    """``add_member`` in its own committed session."""
    with TestSession() as db:
        member = add_member(db, email, **options)
        db.commit()
        return member


def freeze_scheduler(monkeypatch, utc: datetime, wall: datetime | None = None) -> None:
    """Sets the scheduler's clock: ``utc`` now in UTC, ``wall`` local (the same by default)."""
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "utcnow", lambda: utc)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: wall or utc)


def capture_pushes(monkeypatch) -> list[dict]:
    """Records the scheduler's pushes instead of sending them; each succeeds."""
    from app.core import scheduler as scheduler_module

    calls: list[dict] = []

    def send(db, uid, title, body, link, **options):
        calls.append({"title": title, "body": body, "link": link, **options})
        return PushResult(attempted=1, succeeded=1)

    monkeypatch.setattr(scheduler_module, "send_push_for_user", send)
    return calls


def seed_shopping_list(family_id: int, name: str = "Groceries", *, user_id: int | None = None) -> int:
    """Commits a shopping list for ``family_id`` (created by ``user_id``) and returns its id."""
    with TestSession() as db:
        shopping_list = ShoppingList(family_id=family_id, name=name, created_by_user_id=user_id)
        db.add(shopping_list)
        db.commit()
        return shopping_list.id


def freeze_scheduler_in_utc(monkeypatch, now: datetime) -> None:
    """``freeze_scheduler`` at ``now``, with local wall time read as UTC as well."""
    from app.core import scheduler as scheduler_module

    freeze_scheduler(monkeypatch, now)
    monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", lambda value: value)


def post_contact(client, family_id: int, **fields) -> dict:
    """Creates a contact through the API (the client carries the auth) and returns it."""
    resp = client.post("/contacts", json={"family_id": family_id, **fields})
    assert resp.status_code == 200, resp.text
    return resp.json()


def dav_basic(login: str, token: str) -> str:
    """The ``Authorization`` value a DAV client sends: HTTP Basic with the PAT as password."""
    return "Basic " + base64.b64encode(f"{login}:{token}".encode("utf-8")).decode("ascii")


def delete_production_rows(*models) -> None:
    """Deletes every row of ``models``, in this order, from the production
    database (``DATABASE_URL``) that ``production_db`` and ``dav_app`` use."""
    from app.database import SessionLocal

    with SessionLocal() as db:
        for model in models:
            db.query(model).delete()
        db.commit()
