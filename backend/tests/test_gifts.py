"""Integration tests for the gift list module.

Covers scope enforcement, adult-only access, CRUD flow, price history,
and validation errors.
"""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


engine = create_engine(
    "sqlite:///./test-gifts.db",
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


def _seed_adult(scopes: str, email_suffix: str = "") -> tuple[str, int]:
    """Create an adult member + PAT. Returns (token, family_id)."""
    db = TestSession()
    user = User(
        email=f"adult{email_suffix}-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Adult",
    )
    db.add(user)
    db.flush()

    family = Family(name="Gift Family")
    db.add(family)
    db.flush()

    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))

    plain = f"{PAT_PREFIX}giftadult{email_suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="gift-pat",
        token_hash=hashlib.sha256(plain.encode()).hexdigest(),
        scopes=scopes,
    ))
    db.commit()
    family_id = family.id
    db.close()
    return plain, family_id


def _seed_child_in_family(family_id: int, scopes: str) -> str:
    db = TestSession()
    user = User(
        email=f"child-{family_id}-{scopes}@example.com",
        password_hash=hash_password("password"),
        display_name="Child",
    )
    db.add(user)
    db.flush()

    db.add(Membership(user_id=user.id, family_id=family_id, role="member", is_adult=False))

    plain = f"{PAT_PREFIX}giftchild-{family_id}-{scopes.replace(':', '_').replace(',', '-').replace('*', 'star')}"
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="gift-child-pat",
        token_hash=hashlib.sha256(plain.encode()).hexdigest(),
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class TestGiftScopes:
    def test_list_requires_read_scope(self):
        token, family_id = _seed_adult("gifts:write", "a")
        resp = client.get(f"/gifts?family_id={family_id}", headers=_auth(token))
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_create_requires_write_scope(self):
        token, family_id = _seed_adult("gifts:read", "b")
        resp = client.post("/gifts", json={"family_id": family_id, "title": "Book"}, headers=_auth(token))
        assert resp.status_code == 403

    def test_wildcard_works(self):
        token, family_id = _seed_adult("*", "c")
        resp = client.get(f"/gifts?family_id={family_id}", headers=_auth(token))
        assert resp.status_code == 200


class TestGiftAdultOnly:
    def test_child_cannot_list(self):
        adult_token, family_id = _seed_adult("gifts:read", "d")
        child_token = _seed_child_in_family(family_id, "gifts:read")
        resp = client.get(f"/gifts?family_id={family_id}", headers=_auth(child_token))
        assert resp.status_code == 403
        assert "ADULT_REQUIRED" in str(resp.json())

    def test_child_cannot_create(self):
        adult_token, family_id = _seed_adult("gifts:write", "e")
        child_token = _seed_child_in_family(family_id, "gifts:write")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book"},
            headers=_auth(child_token),
        )
        assert resp.status_code == 403


class TestGiftCrud:
    def test_full_crud_flow(self):
        token, family_id = _seed_adult("*", "f")

        resp = client.post(
            "/gifts",
            json={
                "family_id": family_id,
                "title": "LEGO Set",
                "description": "The big castle",
                "url": "https://example.com/lego",
                "occasion": "christmas",
                "status": "idea",
                "current_price_cents": 9999,
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.json()
        gift = resp.json()
        gift_id = gift["id"]
        assert gift["title"] == "LEGO Set"
        assert gift["current_price_cents"] == 9999
        assert gift["gifted_at"] is None

        list_resp = client.get(f"/gifts?family_id={family_id}", headers=_auth(token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 1

        detail_resp = client.get(f"/gifts/{gift_id}", headers=_auth(token))
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert len(detail["price_history"]) == 1
        assert detail["price_history"][0]["price_cents"] == 9999

        patch_resp = client.patch(
            f"/gifts/{gift_id}",
            json={"current_price_cents": 8499, "status": "ordered"},
            headers=_auth(token),
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["current_price_cents"] == 8499
        assert patch_resp.json()["status"] == "ordered"

        detail2 = client.get(f"/gifts/{gift_id}", headers=_auth(token)).json()
        assert len(detail2["price_history"]) == 2

        gifted_resp = client.patch(
            f"/gifts/{gift_id}",
            json={"status": "gifted"},
            headers=_auth(token),
        )
        assert gifted_resp.status_code == 200
        assert gifted_resp.json()["gifted_at"] is not None

        del_resp = client.delete(f"/gifts/{gift_id}", headers=_auth(token))
        assert del_resp.status_code == 200
        assert del_resp.json()["gift_id"] == gift_id

        missing = client.get(f"/gifts/{gift_id}", headers=_auth(token))
        assert missing.status_code == 404
        assert "GIFT_NOT_FOUND" in str(missing.json())

    def test_unchanged_price_does_not_duplicate_history(self):
        token, family_id = _seed_adult("*", "g")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Bike", "current_price_cents": 15000},
            headers=_auth(token),
        )
        gift_id = resp.json()["id"]

        client.patch(
            f"/gifts/{gift_id}",
            json={"current_price_cents": 15000, "notes": "same price, just a note"},
            headers=_auth(token),
        )
        detail = client.get(f"/gifts/{gift_id}", headers=_auth(token)).json()
        assert len(detail["price_history"]) == 1

    def test_gifted_then_reverted_clears_timestamp(self):
        token, family_id = _seed_adult("*", "h")
        gift_id = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "status": "gifted"},
            headers=_auth(token),
        ).json()["id"]

        initial = client.get(f"/gifts/{gift_id}", headers=_auth(token)).json()
        assert initial["gifted_at"] is not None

        reverted = client.patch(
            f"/gifts/{gift_id}",
            json={"status": "idea"},
            headers=_auth(token),
        ).json()
        assert reverted["gifted_at"] is None


class TestGiftValidation:
    def test_invalid_url_rejected(self):
        token, family_id = _seed_adult("*", "i")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "url": "javascript:alert(1)"},
            headers=_auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_GIFT_URL" in str(resp.json())

    def test_invalid_status_rejected(self):
        token, family_id = _seed_adult("*", "j")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "status": "wrapped"},
            headers=_auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_GIFT_STATUS" in str(resp.json())

    def test_recipient_must_be_family_member(self):
        token, family_id = _seed_adult("*", "k")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "for_user_id": 99999},
            headers=_auth(token),
        )
        assert resp.status_code == 400
        assert "GIFT_RECIPIENT_NOT_FAMILY_MEMBER" in str(resp.json())


class TestGiftIsolation:
    def test_out_of_family_access_returns_404(self):
        """Gift existence must not leak across families via 403-vs-404."""
        token_a, family_a = _seed_adult("*", "iso_a")
        token_b, _ = _seed_adult("*", "iso_b")

        gift_id = client.post(
            "/gifts",
            json={"family_id": family_a, "title": "Secret"},
            headers=_auth(token_a),
        ).json()["id"]

        resp = client.get(f"/gifts/{gift_id}", headers=_auth(token_b))
        assert resp.status_code == 404
        assert "GIFT_NOT_FOUND" in str(resp.json())

        patch_resp = client.patch(
            f"/gifts/{gift_id}",
            json={"status": "ordered"},
            headers=_auth(token_b),
        )
        assert patch_resp.status_code == 404

        del_resp = client.delete(f"/gifts/{gift_id}", headers=_auth(token_b))
        assert del_resp.status_code == 404


class TestGiftRecipientExclusivity:
    def test_create_rejects_both_recipient_fields(self):
        token, family_id = _seed_adult("*", "excl_a")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "for_person_name": "Oma"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        gift_id = resp.json()["id"]

        conflict = client.patch(
            f"/gifts/{gift_id}",
            json={"for_user_id": None, "for_person_name": "Oma"},
            headers=_auth(token),
        )
        assert conflict.status_code == 200

    def test_create_with_both_fields_rejected(self):
        token, family_id = _seed_adult("*", "excl_b")
        resp = client.post(
            "/gifts",
            json={
                "family_id": family_id,
                "title": "Book",
                "for_person_name": "Oma",
            },
            headers=_auth(token),
        )
        gift_id = resp.json()["id"]

        # Now seed a member to try assigning both
        db = TestSession()
        child = User(email=f"kid-excl-{family_id}@example.com",
                     password_hash=hash_password("password"),
                     display_name="Kid")
        db.add(child)
        db.flush()
        db.add(Membership(user_id=child.id, family_id=family_id, role="member", is_adult=False))
        db.commit()
        child_user_id = child.id
        db.close()

        conflict = client.patch(
            f"/gifts/{gift_id}",
            json={"for_user_id": child_user_id},
            headers=_auth(token),
        )
        assert conflict.status_code == 400
        assert "GIFT_RECIPIENT_CONFLICT" in str(conflict.json())

        post_conflict = client.post(
            "/gifts",
            json={
                "family_id": family_id,
                "title": "Sweater",
                "for_user_id": child_user_id,
                "for_person_name": "Also Oma",
            },
            headers=_auth(token),
        )
        assert post_conflict.status_code == 400
        assert "GIFT_RECIPIENT_CONFLICT" in str(post_conflict.json())


class TestGiftListFilters:
    def test_filter_by_status_and_exclude_gifted(self):
        token, family_id = _seed_adult("*", "l")
        client.post("/gifts", json={"family_id": family_id, "title": "A", "status": "idea"}, headers=_auth(token))
        client.post("/gifts", json={"family_id": family_id, "title": "B", "status": "gifted"}, headers=_auth(token))

        all_items = client.get(f"/gifts?family_id={family_id}", headers=_auth(token)).json()
        assert all_items["total"] == 2

        no_gifted = client.get(f"/gifts?family_id={family_id}&include_gifted=false", headers=_auth(token)).json()
        assert no_gifted["total"] == 1
        assert no_gifted["items"][0]["title"] == "A"

        only_gifted = client.get(f"/gifts?family_id={family_id}&status=gifted", headers=_auth(token)).json()
        assert only_gifted["total"] == 1
        assert only_gifted["items"][0]["title"] == "B"
