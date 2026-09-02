"""Tests for family-configured shopping store search links."""

import hashlib
import unicodedata

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingStoreLink, User
from app.security import PAT_PREFIX, hash_password
from app.core.shopping_domain import (
    InvalidStoreUrlTemplate,
    MAX_STORE_NAME_KEY_LENGTH,
    normalize_store_name,
    store_name_key,
    validate_store_url_template,
)


class TestUrlTemplateValidation:
    @pytest.mark.parametrize("value", [
        "https://www.example.com/search?q={query}",
        "https://example.com/s?searchTerm={query}",
        "https://example.com/search/{query}",
        "https://example.com/search?searchtype=standardSearch&q={query}",
        "http://intranet.example:8080/search?q={query}",
        "https://example.com/#/search/{query}",
        "HTTPS://EXAMPLE.COM/?q={query}",
        "https://bücher.example/suche?q={query}",
    ])
    def test_accepts_supported_templates_verbatim(self, value):
        assert validate_store_url_template(value) == value

    def test_trims_surrounding_whitespace(self):
        assert validate_store_url_template("  https://example.com/?q={query}\n") == "https://example.com/?q={query}"

    @pytest.mark.parametrize(("value", "reason"), [
        ("", "empty"),
        ("https://example.com/?q={query}" + "x" * 471, "too_long"),
        ("https://example.com/search here?q={query}", "whitespace_or_control"),
        ("https://example.com/?q=\t{query}", "whitespace_or_control"),
        ("https://example.com/\u200b?q={query}", "whitespace_or_control"),
        ("https://example.com/search", "placeholder_missing"),
        ("https://example.com/{query}?q={query}", "placeholder_repeated"),
        ("https://example.com/{q}?x={query}", "stray_brace"),
        ("javascript:alert(1)?{query}", "scheme"),
        ("ftp://example.com/{query}", "scheme"),
        ("mailto:a@b?{query}", "scheme"),
        ("https://user:pw@example.com/?q={query}", "credentials"),
        ("https://{query}.example.com/", "placeholder_in_authority"),
        ("https://example.com:abc/search?q={query}", "unparseable"),
        ("https:///search?q={query}", "host_missing"),
        ("https://[::1x/search?q={query}", "unparseable"),
    ])
    def test_rejects_invalid_templates(self, value, reason):
        with pytest.raises(InvalidStoreUrlTemplate) as exc:
            validate_store_url_template(value)
        assert exc.value.reason == reason


class TestStoreName:
    def test_normalization_and_duplicate_equivalence(self):
        assert normalize_store_name("  Corner   Market ") == "Corner Market"
        assert store_name_key("Corner   MARKET") == store_name_key("corner market")
        assert store_name_key("Straße") == store_name_key("STRASSE")
        assert store_name_key("\u0390x") == store_name_key("\u03b9\u0308\u0301x")

    def test_maximum_casefold_expansion(self):
        assert len(store_name_key("\u0390" * 80)) == MAX_STORE_NAME_KEY_LENGTH == 240
        assert store_name_key("\u0390" * 80) == "\u03b9\u0308\u0301" * 80
        assert store_name_key("\ufb03" * 80) == "ffi" * 80

    def test_casefold_bound_guard(self):
        # MAX_STORE_NAME_KEY_LENGTH depends on Unicode casefold expanding at most 3x.
        assert max(len(chr(cp).casefold()) for cp in range(0x110000)) <= 3
        assert unicodedata.category("\u0390") == "Ll"


engine = create_engine(
    "sqlite:///./test-shopping-store-links.db",
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
    *,
    scopes: str = "*",
    suffix: str = "owner",
    is_adult: bool = True,
    role: str | None = None,
    family_id: int | None = None,
) -> tuple[str, int]:
    db = TestSession()
    user = User(
        email=f"shopping-store-link-{suffix}@example.com",
        password_hash=hash_password("Password1"),
        display_name="Store Link User",
    )
    db.add(user)
    db.flush()
    if family_id is None:
        family = Family(name=f"Store Link Family {suffix}")
        db.add(family)
        db.flush()
        family_id = family.id
    db.add(Membership(
        user_id=user.id,
        family_id=family_id,
        role=role or ("admin" if is_adult else "member"),
        is_adult=is_adult,
    ))
    plain = f"{PAT_PREFIX}shopping-store-link-{suffix}-{scopes.replace(',', '-').replace(':', '_').replace('*', 'star')}"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="shopping-store-link-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain, family_id


def _create(token: str, family_id: int, name: str = "Corner Market", template: str = "https://example.com/?q={query}"):
    return client.post(
        "/shopping/store-links",
        json={"family_id": family_id, "name": name, "url_template": template},
        headers=_auth(token),
    )


def test_model_unique_key_and_maximum_expansion_persist():
    _, family_id = _seed_member(suffix="model")
    db = TestSession()
    db.add_all([
        ShoppingStoreLink(
            family_id=family_id,
            name="Amazon",
            normalized_name=store_name_key("Amazon"),
            url_template="https://example.com/?q={query}",
        ),
        ShoppingStoreLink(
            family_id=family_id,
            name="amazon",
            normalized_name=store_name_key("amazon"),
            url_template="https://example.com/?q={query}",
        ),
    ])
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()

    expanded = "\u03b9\u0308\u0301" * 80
    first = ShoppingStoreLink(
        family_id=family_id,
        name="\u0390" * 80,
        normalized_name=store_name_key("\u0390" * 80),
        url_template="https://example.com/?q={query}",
    )
    db.add(first)
    db.flush()
    assert len(first.normalized_name) == 240
    assert first.normalized_name == expanded
    db.add(ShoppingStoreLink(
        family_id=family_id,
        name="Direct",
        normalized_name=expanded,
        url_template="https://example.com/?q={query}",
    ))
    with pytest.raises(IntegrityError):
        db.flush()
    db.close()


def test_adult_create_list_patch_delete_round_trip_and_ordering():
    token, family_id = _seed_member(suffix="flow")
    first = _create(token, family_id, "  Corner   Market  ", " HTTPS://EXAMPLE.COM/?q={query} ")
    second = _create(token, family_id, "Bakery", "https://example.com/search/{query}")
    assert first.status_code == second.status_code == 200
    assert first.json()["name"] == "Corner Market"
    assert first.json()["url_template"] == "HTTPS://EXAMPLE.COM/?q={query}"
    assert "normalized_name" not in first.json()

    listed = client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(token))
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [first.json()["id"], second.json()["id"]]
    assert all("normalized_name" not in row for row in listed.json())

    updated = client.patch(
        f"/shopping/store-links/{first.json()['id']}",
        json={"name": "CORNER market", "url_template": "https://example.com/#/find/{query}"},
        headers=_auth(token),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "CORNER market"
    deleted = client.delete(f"/shopping/store-links/{first.json()['id']}", headers=_auth(token))
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "deleted", "store_link_id": first.json()["id"]}


def test_non_admin_adult_can_create_list_update_and_delete():
    token, family_id = _seed_member(suffix="adult-member", role="member")
    created = _create(token, family_id, "Member Store")
    assert created.status_code == 200
    store_link_id = created.json()["id"]

    listed = client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(token))
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [store_link_id]

    updated = client.patch(
        f"/shopping/store-links/{store_link_id}",
        json={"name": "Adult Member Store"},
        headers=_auth(token),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Adult Member Store"

    deleted = client.delete(f"/shopping/store-links/{store_link_id}", headers=_auth(token))
    assert deleted.status_code == 200


@pytest.mark.parametrize(("first", "duplicate"), [
    ("Amazon", "amazon"),
    ("Straße", "STRASSE"),
    ("\u0390x", "\u03b9\u0308\u0301x"),
])
def test_api_rejects_duplicate_equivalent_names(first, duplicate):
    token, family_id = _seed_member(suffix=f"duplicate-{ord(first[0])}")
    assert _create(token, family_id, first).status_code == 200
    response = _create(token, family_id, duplicate)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SHOPPING_STORE_LINK_NAME_TAKEN"


def test_database_constraint_race_is_reported_as_name_taken(monkeypatch):
    token, family_id = _seed_member(suffix="race")
    assert _create(token, family_id, "Amazon").status_code == 200
    monkeypatch.setattr("app.modules.shopping_router._store_name_is_taken", lambda *args, **kwargs: False)
    response = _create(token, family_id, "amazon")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SHOPPING_STORE_LINK_NAME_TAKEN"


def test_api_persists_full_casefold_key_and_returns_display_name():
    token, family_id = _seed_member(suffix="expansion")
    display_name = "\u0390" * 80
    response = _create(token, family_id, display_name)
    assert response.status_code == 200, response.json()
    assert response.json()["name"] == display_name
    db = TestSession()
    row = db.query(ShoppingStoreLink).filter(ShoppingStoreLink.id == response.json()["id"]).one()
    assert len(row.normalized_name) == 240
    assert row.normalized_name == "\u03b9\u0308\u0301" * 80
    db.close()
    listed = client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(token))
    assert listed.json()[0]["name"] == display_name


def test_same_name_is_allowed_in_another_family_and_own_case_rename_succeeds():
    first_token, first_family = _seed_member(suffix="family-one")
    second_token, second_family = _seed_member(suffix="family-two")
    first = _create(first_token, first_family, "Amazon")
    assert first.status_code == 200
    assert _create(second_token, second_family, "amazon").status_code == 200
    renamed = client.patch(
        f"/shopping/store-links/{first.json()['id']}",
        json={"name": "AMAZON"},
        headers=_auth(first_token),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "AMAZON"


def test_patch_rejects_another_store_name():
    token, family_id = _seed_member(suffix="rename-taken")
    first = _create(token, family_id, "First").json()
    second = _create(token, family_id, "Second").json()
    response = client.patch(
        f"/shopping/store-links/{second['id']}", json={"name": " FIRST "}, headers=_auth(token)
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SHOPPING_STORE_LINK_NAME_TAKEN"
    assert first["id"] != second["id"]


@pytest.mark.parametrize("method", ["post", "patch"])
@pytest.mark.parametrize(("template", "reason"), [
    ("https://example.com/search", "placeholder_missing"),
    ("https://example.com/?q={query}" + "x" * 471, "too_long"),
])
def test_invalid_template_is_structured_on_create_and_update(method, template, reason):
    token, family_id = _seed_member(suffix=f"invalid-{method}-{reason}")
    if method == "post":
        response = _create(token, family_id, template=template)
    else:
        link = _create(token, family_id).json()
        response = client.patch(
            f"/shopping/store-links/{link['id']}",
            json={"url_template": template},
            headers=_auth(token),
        )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "SHOPPING_STORE_LINK_INVALID_TEMPLATE"
    assert detail["params"]["reason"] == reason


def test_name_validation_and_limit():
    token, family_id = _seed_member(suffix="validation")
    blank = _create(token, family_id, "   ")
    assert blank.status_code == 422
    assert blank.json()["detail"] == "Store name cannot be blank"
    assert _create(token, family_id, "x" * 81).status_code == 422
    for index in range(20):
        assert _create(token, family_id, f"Store {index}").status_code == 200
    over_limit = _create(token, family_id, "Store 21")
    assert over_limit.status_code == 422
    assert over_limit.json()["detail"]["code"] == "SHOPPING_STORE_LINK_LIMIT_REACHED"
    assert over_limit.json()["detail"]["params"]["limit"] == "20"


def test_children_are_denied_all_four_endpoints():
    adult_token, family_id = _seed_member(suffix="adult-for-child")
    link = _create(adult_token, family_id).json()
    child_token, _ = _seed_member(suffix="child", is_adult=False, family_id=family_id)
    responses = [
        client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(child_token)),
        _create(child_token, family_id, "Child Store"),
        client.patch(f"/shopping/store-links/{link['id']}", json={"name": "Child Edit"}, headers=_auth(child_token)),
        client.delete(f"/shopping/store-links/{link['id']}", headers=_auth(child_token)),
    ]
    assert [response.status_code for response in responses] == [403, 403, 403, 403]
    assert all(response.json()["detail"]["code"] == "ADULT_REQUIRED" for response in responses)


def test_family_isolation_and_unknown_ids():
    owner_token, owner_family = _seed_member(suffix="isolation-owner")
    outsider_token, outsider_family = _seed_member(suffix="isolation-outsider")
    link = _create(owner_token, owner_family).json()
    no_access = client.get(f"/shopping/store-links?family_id={owner_family}", headers=_auth(outsider_token))
    assert no_access.status_code == 403
    assert no_access.json()["detail"]["code"] == "NO_FAMILY_ACCESS"
    for method in ("patch", "delete"):
        call = getattr(client, method)
        kwargs = {"json": {"name": "Nope"}} if method == "patch" else {}
        response = call(f"/shopping/store-links/{link['id']}", headers=_auth(outsider_token), **kwargs)
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "NO_FAMILY_ACCESS"
    unknown = client.patch("/shopping/store-links/999999", json={"name": "Nope"}, headers=_auth(outsider_token))
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "SHOPPING_STORE_LINK_NOT_FOUND"
    assert outsider_family != owner_family


def test_store_link_endpoints_enforce_shopping_scopes():
    read_token, family_id = _seed_member(scopes="shopping:read", suffix="scope-read")
    write_token, _ = _seed_member(scopes="shopping:write", suffix="scope-write", family_id=family_id)
    assert client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(read_token)).status_code == 200
    assert _create(read_token, family_id).status_code == 403
    assert _create(write_token, family_id).status_code == 200
    assert client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(write_token)).status_code == 403


def test_deleting_family_cascades_store_links():
    token, family_id = _seed_member(suffix="cascade")
    assert _create(token, family_id).status_code == 200
    db = TestSession()
    db.delete(db.query(Family).filter(Family.id == family_id).one())
    db.commit()
    assert db.query(ShoppingStoreLink).count() == 0
    db.close()


def test_store_link_crud_emits_no_events(monkeypatch):
    calls = []

    def counted(*args, **kwargs):
        calls.append((args, kwargs))

    for name in (
        "broadcast_shopping_event",
        "dispatch_webhook_event",
        "dispatch_shopping_destination_event",
        "record_activity",
    ):
        monkeypatch.setattr(f"app.modules.shopping_router.{name}", counted)
    token, family_id = _seed_member(suffix="no-events")
    created = _create(token, family_id)
    link_id = created.json()["id"]
    assert client.get(f"/shopping/store-links?family_id={family_id}", headers=_auth(token)).status_code == 200
    assert client.patch(
        f"/shopping/store-links/{link_id}", json={"name": "Updated"}, headers=_auth(token)
    ).status_code == 200
    assert client.delete(f"/shopping/store-links/{link_id}", headers=_auth(token)).status_code == 200
    assert calls == []
