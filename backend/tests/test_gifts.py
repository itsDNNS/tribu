"""Integration tests for the gift list module.

Covers scope enforcement, adult-only access, CRUD flow, price history,
and validation errors.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.support import auth, seed_member


pytestmark = pytest.mark.usefixtures("app_db")


def _seed_adult(scopes: str, email_suffix: str = "") -> tuple[str, int]:
    """Create an adult member + PAT. Returns (token, family_id)."""
    member = seed_member(
        f"adult{email_suffix}-{scopes}@example.com", scopes=scopes, family_name="Gift Family", display_name="Adult",
    )
    return member.token, member.family_id


def _seed_child_in_family(family_id: int, scopes: str) -> str:
    return seed_member(
        f"child-{family_id}-{scopes}@example.com", scopes=scopes, family_id=family_id, is_adult=False, display_name="Child",
    ).token


client = TestClient(app)


class TestGiftScopes:
    def test_list_requires_read_scope(self):
        token, family_id = _seed_adult("gifts:write", "a")
        resp = client.get(f"/gifts?family_id={family_id}", headers=auth(token))
        assert resp.status_code == 403
        assert "INSUFFICIENT_SCOPE" in str(resp.json())

    def test_create_requires_write_scope(self):
        token, family_id = _seed_adult("gifts:read", "b")
        resp = client.post("/gifts", json={"family_id": family_id, "title": "Book"}, headers=auth(token))
        assert resp.status_code == 403

    def test_wildcard_works(self):
        token, family_id = _seed_adult("*", "c")
        resp = client.get(f"/gifts?family_id={family_id}", headers=auth(token))
        assert resp.status_code == 200


class TestGiftChildren:
    def test_child_can_list(self):
        adult_token, family_id = _seed_adult("gifts:read", "d")
        child_token = _seed_child_in_family(family_id, "gifts:read")
        resp = client.get(f"/gifts?family_id={family_id}", headers=auth(child_token))
        assert resp.status_code == 200

    def test_child_cannot_wish_for_someone_else(self):
        adult_token, family_id = _seed_adult("gifts:write", "e")
        child_token = _seed_child_in_family(family_id, "gifts:write")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "kind": "wish", "for_person_name": "Oma"},
            headers=auth(child_token),
        )
        assert resp.status_code == 403
        assert "ADULT_REQUIRED" in str(resp.json())


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
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.json()
        gift = resp.json()
        gift_id = gift["id"]
        assert gift["title"] == "LEGO Set"
        assert gift["current_price_cents"] == 9999
        assert gift["gifted_at"] is None

        list_resp = client.get(f"/gifts?family_id={family_id}", headers=auth(token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 1

        detail_resp = client.get(f"/gifts/{gift_id}", headers=auth(token))
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert len(detail["price_history"]) == 1
        assert detail["price_history"][0]["price_cents"] == 9999

        patch_resp = client.patch(
            f"/gifts/{gift_id}",
            json={"current_price_cents": 8499, "status": "ordered"},
            headers=auth(token),
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["current_price_cents"] == 8499
        assert patch_resp.json()["status"] == "ordered"

        detail2 = client.get(f"/gifts/{gift_id}", headers=auth(token)).json()
        assert len(detail2["price_history"]) == 2

        gifted_resp = client.patch(
            f"/gifts/{gift_id}",
            json={"status": "gifted"},
            headers=auth(token),
        )
        assert gifted_resp.status_code == 200
        assert gifted_resp.json()["gifted_at"] is not None

        del_resp = client.delete(f"/gifts/{gift_id}", headers=auth(token))
        assert del_resp.status_code == 200
        assert del_resp.json()["gift_id"] == gift_id

        missing = client.get(f"/gifts/{gift_id}", headers=auth(token))
        assert missing.status_code == 404
        assert "GIFT_NOT_FOUND" in str(missing.json())

    def test_unchanged_price_does_not_duplicate_history(self):
        token, family_id = _seed_adult("*", "g")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Bike", "current_price_cents": 15000},
            headers=auth(token),
        )
        gift_id = resp.json()["id"]

        client.patch(
            f"/gifts/{gift_id}",
            json={"current_price_cents": 15000, "notes": "same price, just a note"},
            headers=auth(token),
        )
        detail = client.get(f"/gifts/{gift_id}", headers=auth(token)).json()
        assert len(detail["price_history"]) == 1

    def test_gifted_then_reverted_clears_timestamp(self):
        token, family_id = _seed_adult("*", "h")
        gift_id = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "status": "gifted"},
            headers=auth(token),
        ).json()["id"]

        initial = client.get(f"/gifts/{gift_id}", headers=auth(token)).json()
        assert initial["gifted_at"] is not None

        reverted = client.patch(
            f"/gifts/{gift_id}",
            json={"status": "idea"},
            headers=auth(token),
        ).json()
        assert reverted["gifted_at"] is None


class TestGiftValidation:
    def test_invalid_url_rejected(self):
        token, family_id = _seed_adult("*", "i")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "url": "javascript:alert(1)"},
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_GIFT_URL" in str(resp.json())

    def test_invalid_status_rejected(self):
        token, family_id = _seed_adult("*", "j")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "status": "wrapped"},
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_GIFT_STATUS" in str(resp.json())

    def test_recipient_must_be_family_member(self):
        token, family_id = _seed_adult("*", "k")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "for_user_id": 99999},
            headers=auth(token),
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
            headers=auth(token_a),
        ).json()["id"]

        resp = client.get(f"/gifts/{gift_id}", headers=auth(token_b))
        assert resp.status_code == 404
        assert "GIFT_NOT_FOUND" in str(resp.json())

        patch_resp = client.patch(
            f"/gifts/{gift_id}",
            json={"status": "ordered"},
            headers=auth(token_b),
        )
        assert patch_resp.status_code == 404

        del_resp = client.delete(f"/gifts/{gift_id}", headers=auth(token_b))
        assert del_resp.status_code == 404


class TestGiftRecipientExclusivity:
    def test_create_rejects_both_recipient_fields(self):
        token, family_id = _seed_adult("*", "excl_a")
        resp = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Book", "for_person_name": "Oma"},
            headers=auth(token),
        )
        assert resp.status_code == 200
        gift_id = resp.json()["id"]

        conflict = client.patch(
            f"/gifts/{gift_id}",
            json={"for_user_id": None, "for_person_name": "Oma"},
            headers=auth(token),
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
            headers=auth(token),
        )
        gift_id = resp.json()["id"]

        # Now seed a member to try assigning both
        child_user_id = seed_member(
            f"kid-excl-{family_id}@example.com", scopes=None, family_id=family_id, is_adult=False, display_name="Kid",
        ).user_id

        # Naming a member replaces the name.
        replaced = client.patch(
            f"/gifts/{gift_id}",
            json={"for_user_id": child_user_id},
            headers=auth(token),
        )
        assert replaced.status_code == 200
        assert replaced.json()["for_user_id"] == child_user_id
        assert replaced.json()["for_person_name"] is None

        conflict = client.patch(
            f"/gifts/{gift_id}",
            json={"for_user_id": child_user_id, "for_person_name": "Oma"},
            headers=auth(token),
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
            headers=auth(token),
        )
        assert post_conflict.status_code == 400
        assert "GIFT_RECIPIENT_CONFLICT" in str(post_conflict.json())


class TestGiftListFilters:
    def test_filter_by_status_and_exclude_gifted(self):
        token, family_id = _seed_adult("*", "l")
        client.post("/gifts", json={"family_id": family_id, "title": "A", "status": "idea"}, headers=auth(token))
        client.post("/gifts", json={"family_id": family_id, "title": "B", "status": "gifted"}, headers=auth(token))

        all_items = client.get(f"/gifts?family_id={family_id}", headers=auth(token)).json()
        assert all_items["total"] == 2

        no_gifted = client.get(f"/gifts?family_id={family_id}&include_gifted=false", headers=auth(token)).json()
        assert no_gifted["total"] == 1
        assert no_gifted["items"][0]["title"] == "A"

        only_gifted = client.get(f"/gifts?family_id={family_id}&status=gifted", headers=auth(token)).json()
        assert only_gifted["total"] == 1
        assert only_gifted["items"][0]["title"] == "B"


class TestGiftListSort:
    def test_default_sort_is_created_desc(self):
        token, family_id = _seed_adult("*", "sort-default")
        first = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Alpha"},
            headers=auth(token),
        ).json()
        second = client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Beta"},
            headers=auth(token),
        ).json()
        resp = client.get(f"/gifts?family_id={family_id}", headers=auth(token)).json()
        ids = [item["id"] for item in resp["items"]]
        assert ids == [second["id"], first["id"]]

    def test_sort_title_asc_is_case_insensitive(self):
        token, family_id = _seed_adult("*", "sort-title")
        for title in ("banana", "Apple", "cherry"):
            client.post(
                "/gifts",
                json={"family_id": family_id, "title": title},
                headers=auth(token),
            )
        resp = client.get(
            f"/gifts?family_id={family_id}&sort=title_asc",
            headers=auth(token),
        ).json()
        titles = [item["title"] for item in resp["items"]]
        assert titles == ["Apple", "banana", "cherry"]

    def test_sort_price_desc_places_nulls_last(self):
        token, family_id = _seed_adult("*", "sort-price")
        client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Cheap", "current_price_cents": 500},
            headers=auth(token),
        )
        client.post(
            "/gifts",
            json={"family_id": family_id, "title": "Expensive", "current_price_cents": 9999},
            headers=auth(token),
        )
        client.post(
            "/gifts",
            json={"family_id": family_id, "title": "NoPrice"},
            headers=auth(token),
        )
        resp = client.get(
            f"/gifts?family_id={family_id}&sort=price_desc",
            headers=auth(token),
        ).json()
        titles = [item["title"] for item in resp["items"]]
        assert titles == ["Expensive", "Cheap", "NoPrice"]

    def test_sort_occasion_date_asc_places_nulls_last(self):
        token, family_id = _seed_adult("*", "sort-occdate")
        client.post(
            "/gifts",
            json={
                "family_id": family_id,
                "title": "Christmas gift",
                "occasion_date": "2026-12-24",
            },
            headers=auth(token),
        )
        client.post(
            "/gifts",
            json={
                "family_id": family_id,
                "title": "Summer birthday",
                "occasion_date": "2026-06-15",
            },
            headers=auth(token),
        )
        client.post(
            "/gifts",
            json={"family_id": family_id, "title": "No date"},
            headers=auth(token),
        )
        resp = client.get(
            f"/gifts?family_id={family_id}&sort=occasion_date_asc",
            headers=auth(token),
        ).json()
        titles = [item["title"] for item in resp["items"]]
        assert titles == ["Summer birthday", "Christmas gift", "No date"]

    def test_invalid_sort_returns_400(self):
        token, family_id = _seed_adult("*", "sort-invalid")
        resp = client.get(
            f"/gifts?family_id={family_id}&sort=bogus",
            headers=auth(token),
        )
        assert resp.status_code == 400
        assert "INVALID_GIFT_SORT" in str(resp.json())
