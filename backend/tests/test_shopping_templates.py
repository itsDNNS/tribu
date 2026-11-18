"""Integration tests for shopping list templates."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.support import auth, seed_member, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_member(scopes: str = "*", suffix: str = "owner", is_adult: bool = True, family_id: int | None = None) -> tuple[str, int]:
    member = seed_member(
        f"shopping-template-{suffix}@example.com", scopes=scopes, family_id=family_id, is_adult=is_adult, display_name="Template User",
    )
    return member.token, member.family_id


def test_template_create_edit_list_delete_and_apply_to_shopping_list():
    token, family_id = _seed_member(suffix="flow")
    list_id = seed_shopping_list(family_id)

    created = client.post(
        "/shopping/templates",
        json={
            "family_id": family_id,
            "name": "Weekly groceries",
            "items": [
                {"name": "Milk", "spec": "2 L", "category": "Dairy"},
                {"name": "Bananas", "spec": "6", "category": "Produce"},
            ],
        },
        headers=auth(token),
    )
    assert created.status_code == 200, created.json()
    template = created.json()
    assert template["name"] == "Weekly groceries"
    assert template["item_count"] == 2
    assert [item["name"] for item in template["items"]] == ["Milk", "Bananas"]
    assert template["items"][0]["category"] == "Dairy"

    updated = client.patch(
        f"/shopping/templates/{template['id']}",
        json={
            "name": "Weekly basics",
            "items": [
                {"name": "Oats", "spec": "1 kg", "category": "Cereals"},
                {"name": "Milk", "spec": "2 L", "category": "Dairy"},
            ],
        },
        headers=auth(token),
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["name"] == "Weekly basics"
    assert [item["name"] for item in updated.json()["items"]] == ["Oats", "Milk"]

    listed = client.get(f"/shopping/templates?family_id={family_id}", headers=auth(token))
    assert listed.status_code == 200
    assert [(tpl["name"], tpl["item_count"]) for tpl in listed.json()] == [("Weekly basics", 2)]

    applied = client.post(
        f"/shopping/templates/{template['id']}/apply",
        json={"list_id": list_id},
        headers=auth(token),
    )
    assert applied.status_code == 200, applied.json()
    assert applied.json()["added_count"] == 2
    assert [item["name"] for item in applied.json()["items"]] == ["Oats", "Milk"]
    assert applied.json()["items"][0]["checked"] is False
    assert applied.json()["items"][0]["category"] == "Cereals"

    items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token))
    assert items.status_code == 200
    assert [(item["name"], item["spec"], item["category"], item["checked"]) for item in items.json()] == [
        ("Oats", "1 kg", "Cereals", False),
        ("Milk", "2 L", "Dairy", False),
    ]

    reapplied = client.post(
        f"/shopping/templates/{template['id']}/apply",
        json={"list_id": list_id},
        headers=auth(token),
    )
    assert reapplied.status_code == 200, reapplied.json()
    assert reapplied.json()["added_count"] == 2
    assert reapplied.json()["created_count"] == 0
    assert reapplied.json()["merged_count"] == 2
    merged_items = client.get(f"/shopping/lists/{list_id}/items", headers=auth(token)).json()
    assert [(item["name"], item["spec"]) for item in merged_items] == [("Oats", "2 kg"), ("Milk", "4 L")]

    deleted = client.delete(f"/shopping/templates/{template['id']}", headers=auth(token))
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "deleted", "template_id": template["id"]}


def test_templates_are_family_scoped_and_adult_write_only():
    owner_token, family_id = _seed_member(suffix="owner")
    outsider_token, outsider_family_id = _seed_member(suffix="outsider")
    child_token, _ = _seed_member(suffix="child", is_adult=False, family_id=family_id)
    list_id = seed_shopping_list(family_id, "Owner Groceries")
    outsider_list_id = seed_shopping_list(outsider_family_id, "Other Groceries")

    child_create = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "Child template", "items": [{"name": "Candy"}]},
        headers=auth(child_token),
    )
    assert child_create.status_code == 403

    created = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "Owner template", "items": [{"name": "Bread"}]},
        headers=auth(owner_token),
    )
    assert created.status_code == 200, created.json()
    template_id = created.json()["id"]

    outsider_list = client.get(f"/shopping/templates?family_id={family_id}", headers=auth(outsider_token))
    assert outsider_list.status_code == 403

    outsider_apply = client.post(
        f"/shopping/templates/{template_id}/apply",
        json={"list_id": list_id},
        headers=auth(outsider_token),
    )
    assert outsider_apply.status_code == 403

    cross_family_apply = client.post(
        f"/shopping/templates/{template_id}/apply",
        json={"list_id": outsider_list_id},
        headers=auth(owner_token),
    )
    assert cross_family_apply.status_code == 404


def test_template_endpoints_enforce_shopping_scopes():
    read_token, family_id = _seed_member(scopes="shopping:read", suffix="read")
    write_token, _ = _seed_member(scopes="shopping:write", suffix="write", family_id=family_id)

    denied_create = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "No write", "items": [{"name": "Rice"}]},
        headers=auth(read_token),
    )
    assert denied_create.status_code == 403

    allowed_create = client.post(
        "/shopping/templates",
        json={"family_id": family_id, "name": "Write ok", "items": [{"name": "Rice"}]},
        headers=auth(write_token),
    )
    assert allowed_create.status_code == 200

    denied_list = client.get(f"/shopping/templates?family_id={family_id}", headers=auth(write_token))
    assert denied_list.status_code == 403
