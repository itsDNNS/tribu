"""Family areas (Tribu 2.0, R4): hiding optional areas per family."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import AuditLog, Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-family-areas.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_member(
    scopes: str,
    suffix: str,
    *,
    display_name: str = "Areas User",
    is_adult: bool = True,
    family_id: int | None = None,
) -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email=f"areas-{suffix}@example.com",
        password_hash=hash_password("Password123"),
        display_name=display_name,
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name=f"Areas Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id

    db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if is_adult else "member", is_adult=is_adult))
    plain = f"{PAT_PREFIX}areas-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="areas-pat",
        token_hash=lookup,
        token_lookup=lookup,
        scopes=scopes,
    ))
    db.commit()
    user_id = user.id
    db.close()
    return plain, family_id, user_id


def test_admins_hide_optional_areas_for_everyone():
    admin_token, family_id, _ = _seed_member("*", "admin")
    child_token, _, _ = _seed_member("*", "child", is_adult=False, family_id=family_id)

    start = client.get("/families/me", headers=_auth(child_token))
    assert start.status_code == 200, start.json()
    assert start.json()[0]["hidden_areas"] == []

    saved = client.put(
        f"/families/{family_id}/areas",
        json={"hidden_areas": ["gifts", "school_timetables", "gifts"]},
        headers=_auth(admin_token),
    )
    assert saved.status_code == 200, saved.json()
    # Once each, in navigation order.
    assert saved.json()["hidden_areas"] == ["school_timetables", "gifts"]
    assert "recipes" in saved.json()["optional_areas"]

    after = client.get("/families/me", headers=_auth(child_token))
    assert after.json()[0]["hidden_areas"] == ["school_timetables", "gifts"]

    db = TestSession()
    entry = db.query(AuditLog).filter(AuditLog.family_id == family_id, AuditLog.action == "areas_changed").one()
    assert entry.details == {"hidden_areas": ["school_timetables", "gifts"]}
    db.close()

    shown = client.put(f"/families/{family_id}/areas", json={"hidden_areas": []}, headers=_auth(admin_token))
    assert shown.json()["hidden_areas"] == []


def test_only_admins_choose_areas_and_core_areas_stay():
    admin_token, family_id, _ = _seed_member("*", "admin2")
    child_token, _, _ = _seed_member("*", "child2", is_adult=False, family_id=family_id)

    denied = client.put(f"/families/{family_id}/areas", json={"hidden_areas": ["gifts"]}, headers=_auth(child_token))
    assert denied.status_code == 403

    core = client.put(
        f"/families/{family_id}/areas",
        json={"hidden_areas": ["calendar", "shopping", "gifts"]},
        headers=_auth(admin_token),
    )
    assert core.status_code == 422
    assert core.json()["detail"]["code"] == "UNKNOWN_AREAS"


def test_areas_need_the_families_write_scope():
    token, family_id, _ = _seed_member("families:read", "scoped")
    response = client.put(f"/families/{family_id}/areas", json={"hidden_areas": []}, headers=_auth(token))
    assert response.status_code == 403
