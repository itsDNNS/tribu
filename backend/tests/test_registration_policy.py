from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.utils import utcnow
from app.database import Base, get_db
from app.main import app
from app.models import Family, FamilyInvitation, Membership, User
from app.security import hash_password

engine = create_engine(
    "sqlite:///./test-registration-policy.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override


def teardown_function():
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _register(email):
    return client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Secure1Pass",
            "display_name": "User",
            "family_name": "Family",
        },
    )


def test_first_public_registration_is_allowed_but_second_is_blocked_by_default():
    first = _register("first@example.com")
    assert first.status_code == 200

    second = _register("second@example.com")
    assert second.status_code == 403
    assert "OPEN_REGISTRATION_DISABLED" in str(second.json())


def test_public_registration_can_be_explicitly_enabled_after_setup(monkeypatch):
    first = _register("first@example.com")
    assert first.status_code == 200

    monkeypatch.setenv("ALLOW_OPEN_REGISTRATION", "true")
    second = _register("second@example.com")
    assert second.status_code == 200


def test_invite_registration_still_works_after_initial_setup():
    db = TestSession()
    try:
        admin = User(
            email="admin@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Admin",
            has_completed_onboarding=True,
        )
        db.add(admin)
        db.flush()
        family = Family(name="Fam")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=admin.id, family_id=family.id, role="admin", is_adult=True))
        invitation = FamilyInvitation(
            family_id=family.id,
            token="invite-token",
            created_by_user_id=admin.id,
            role_preset="member",
            is_adult_preset=True,
            max_uses=1,
            expires_at=utcnow() + timedelta(days=1),
        )
        db.add(invitation)
        db.commit()
    finally:
        db.close()

    resp = client.post(
        "/auth/register-with-invite",
        json={
            "token": "invite-token",
            "email": "invited@example.com",
            "password": "Secure1Pass",
            "display_name": "Invited",
        },
    )
    assert resp.status_code == 200
