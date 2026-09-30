"""Gifts around people: who sees what, wishes, "I'll take care of it",
occasions with budgets, the link preview and the week-before reminder."""

import hashlib
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core import gift_preview
from app.core.clock import local_today
from app.core.recipe_import import RecipeImportError
from app.core.scheduler import deliver_gift_reminders
from app.database import Base, get_db
from app.main import app
from app.models import Contact, Family, FamilyBirthday, GiftIdea, Membership, PersonalAccessToken, User
from app.modules.gifts_router import easter_sunday
from app.security import PAT_PREFIX, hash_password

engine = create_engine("sqlite:///./test-gifts-people.db", connect_args={"check_same_thread": False})
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


client = TestClient(app)


class Family_:
    """Dennis and Anna (adults), Lena and Max (children)."""

    def __init__(self) -> None:
        db = TestSession()
        family = Family(name="Gift People")
        db.add(family)
        db.flush()
        self.family_id = family.id
        self.ids: dict[str, int] = {}
        self.tokens: dict[str, str] = {}
        for name, adult in (("dennis", True), ("anna", True), ("lena", False), ("max", False)):
            user = User(email=f"{name}@example.com", password_hash=hash_password("pw"), display_name=name.title())
            db.add(user)
            db.flush()
            db.add(Membership(user_id=user.id, family_id=family.id, role="admin" if name == "dennis" else "member",
                              is_adult=adult))
            plain = f"{PAT_PREFIX}giftpeople-{name}"
            digest = hashlib.sha256(plain.encode()).hexdigest()
            db.add(PersonalAccessToken(user_id=user.id, name="pat", token_hash=digest, token_lookup=digest, scopes="*"))
            self.ids[name] = user.id
            self.tokens[name] = plain
        db.commit()
        db.close()

    def h(self, name: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.tokens[name]}"}

    def add(self, who: str, **fields):
        resp = client.post("/gifts", json={"family_id": self.family_id, **fields}, headers=self.h(who))
        assert resp.status_code == 200, resp.text
        return resp.json()

    def titles(self, who: str) -> set[str]:
        resp = client.get(f"/gifts?family_id={self.family_id}", headers=self.h(who))
        assert resp.status_code == 200, resp.text
        return {item["title"] for item in resp.json()["items"]}


@pytest.fixture
def fam() -> Family_:
    return Family_()


class TestVisibility:
    def test_ideas_stay_hidden_from_the_recipient(self, fam):
        idea = fam.add("dennis", title="Necklace", for_user_id=fam.ids["anna"])
        assert "Necklace" not in fam.titles("anna")
        assert "Necklace" in fam.titles("dennis")
        assert client.get(f"/gifts/{idea['id']}", headers=fam.h("anna")).status_code == 404
        assert client.patch(f"/gifts/{idea['id']}", json={"title": "x"}, headers=fam.h("anna")).status_code == 404

    def test_ideas_for_a_contact_that_is_the_member_stay_hidden(self, fam):
        db = TestSession()
        contact = Contact(family_id=fam.family_id, full_name="Anna Braun", member_user_id=fam.ids["anna"])
        db.add(contact)
        db.commit()
        contact_id = contact.id
        db.close()
        idea = fam.add("dennis", title="Scarf", for_contact_id=contact_id)
        # Stored as the member.
        assert idea["for_user_id"] == fam.ids["anna"] and idea["for_contact_id"] is None
        assert "Scarf" not in fam.titles("anna")

    def test_own_wish_hides_who_takes_care_until_given(self, fam):
        wish = fam.add("anna", title="Kindle", kind="wish", for_user_id=fam.ids["anna"])
        assert wish["for_me"] is True
        claimed = client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("dennis"))
        assert claimed.status_code == 200
        assert claimed.json()["claimed_by_user_id"] == fam.ids["dennis"]
        client.patch(f"/gifts/{wish['id']}", json={"status": "purchased", "notes": "hidden in the car"},
                     headers=fam.h("dennis"))

        mine = client.get(f"/gifts/{wish['id']}", headers=fam.h("anna")).json()
        assert mine["status"] == "idea"
        assert mine["claimed_by_user_id"] is None and mine["notes"] is None and mine["price_history"] == []

        client.patch(f"/gifts/{wish['id']}", json={"status": "gifted"}, headers=fam.h("dennis"))
        given = client.get(f"/gifts/{wish['id']}", headers=fam.h("anna")).json()
        assert given["status"] == "gifted" and given["claimed_by_user_id"] == fam.ids["dennis"]
        assert given["notes"] is None

    def test_children_see_wishes_and_their_own_ideas(self, fam):
        fam.add("dennis", title="Adult idea", for_user_id=fam.ids["anna"])
        fam.add("anna", title="Anna's wish", kind="wish", for_user_id=fam.ids["anna"])
        fam.add("lena", title="Lena's idea for Mama", for_user_id=fam.ids["anna"])
        assert fam.titles("lena") == {"Anna's wish", "Lena's idea for Mama"}
        assert fam.titles("max") == {"Anna's wish"}
        # Adults see the child's idea too, but never the one meant for them.
        assert "Lena's idea for Mama" in fam.titles("dennis")
        assert "Lena's idea for Mama" not in fam.titles("anna")

    def test_children_do_not_see_buyers_notes(self, fam):
        wish = fam.add("anna", title="Puzzle", kind="wish", for_user_id=fam.ids["anna"])
        client.patch(f"/gifts/{wish['id']}", json={"notes": "Shop in town"}, headers=fam.h("dennis"))
        lena = client.get(f"/gifts/{wish['id']}", headers=fam.h("lena")).json()
        assert lena["notes"] is None
        assert client.get(f"/gifts/{wish['id']}", headers=fam.h("dennis")).json()["notes"] == "Shop in town"


class TestWishes:
    def test_child_adds_own_wish(self, fam):
        wish = fam.add("lena", title="Roller skates", kind="wish", for_user_id=fam.ids["lena"])
        assert wish["kind"] == "wish" and wish["for_me"] is True
        # The wisher edits the wish but not its progress.
        assert client.patch(f"/gifts/{wish['id']}", json={"title": "Pink roller skates"},
                            headers=fam.h("lena")).status_code == 200
        assert client.patch(f"/gifts/{wish['id']}", json={"status": "purchased"},
                            headers=fam.h("lena")).status_code == 403
        assert client.patch(f"/gifts/{wish['id']}", json={"for_user_id": fam.ids["max"]},
                            headers=fam.h("lena")).status_code == 403

    def test_idea_for_oneself_is_refused(self, fam):
        resp = client.post("/gifts", json={"family_id": fam.family_id, "title": "x", "for_user_id": fam.ids["anna"]},
                           headers=fam.h("anna"))
        assert resp.status_code == 400
        assert "INVALID_GIFT_KIND" in resp.text

    def test_adult_adds_wish_for_grandma(self, fam):
        wish = fam.add("dennis", title="Garden gloves", kind="wish", for_person_name="Oma")
        assert wish["for_person_name"] == "Oma"
        assert "Garden gloves" in fam.titles("max")

    def test_wisher_can_delete_own_wish_but_not_others(self, fam):
        wish = fam.add("lena", title="Kite", kind="wish", for_user_id=fam.ids["lena"])
        other = fam.add("anna", title="Tea", kind="wish", for_user_id=fam.ids["anna"])
        assert client.delete(f"/gifts/{other['id']}", headers=fam.h("lena")).status_code == 403
        assert client.delete(f"/gifts/{wish['id']}", headers=fam.h("lena")).status_code == 200


class TestClaim:
    def test_claim_is_exclusive(self, fam):
        wish = fam.add("anna", title="Vase", kind="wish", for_user_id=fam.ids["anna"])
        assert client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("lena")).status_code == 200
        taken = client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("dennis"))
        assert taken.status_code == 409 and "GIFT_ALREADY_CLAIMED" in taken.text
        # The same person again is fine.
        assert client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("lena")).status_code == 200

    def test_recipient_cannot_claim(self, fam):
        wish = fam.add("anna", title="Vase", kind="wish", for_user_id=fam.ids["anna"])
        assert client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("anna")).status_code == 403

    def test_unclaim_by_claimer_or_adult(self, fam):
        wish = fam.add("anna", title="Vase", kind="wish", for_user_id=fam.ids["anna"])
        client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("lena"))
        assert client.delete(f"/gifts/{wish['id']}/claim", headers=fam.h("max")).status_code == 403
        freed = client.delete(f"/gifts/{wish['id']}/claim", headers=fam.h("dennis"))
        assert freed.status_code == 200 and freed.json()["claimed_by_user_id"] is None

    def test_claimer_child_sets_status(self, fam):
        wish = fam.add("anna", title="Vase", kind="wish", for_user_id=fam.ids["anna"])
        assert client.patch(f"/gifts/{wish['id']}", json={"status": "purchased"},
                            headers=fam.h("lena")).status_code == 403
        client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("lena"))
        assert client.patch(f"/gifts/{wish['id']}", json={"status": "purchased"},
                            headers=fam.h("lena")).status_code == 200

    def test_buying_claims(self, fam):
        idea = fam.add("dennis", title="Book", for_user_id=fam.ids["max"])
        bought = client.patch(f"/gifts/{idea['id']}", json={"status": "ordered"}, headers=fam.h("anna")).json()
        assert bought["claimed_by_user_id"] == fam.ids["anna"] and bought["claimed_at"]
        freed = client.delete(f"/gifts/{idea['id']}/claim", headers=fam.h("anna")).json()
        assert freed["status"] == "idea"


def _birthday(fam: Family_, name: str, on: date, member: str | None = None, year: int | None = None) -> int:
    db = TestSession()
    row = FamilyBirthday(family_id=fam.family_id, person_name=name, month=on.month, day=on.day, year=year,
                         member_user_id=fam.ids[member] if member else None)
    db.add(row)
    db.commit()
    birthday_id = row.id
    db.close()
    return birthday_id


class TestOccasions:
    def _occasions(self, fam, who, days=120):
        resp = client.get(f"/gifts/occasions?family_id={fam.family_id}&days={days}", headers=fam.h(who))
        assert resp.status_code == 200, resp.text
        return resp.json()["items"]

    def test_birthday_gathers_gifts_wishes_and_budget(self, fam):
        on = local_today() + timedelta(days=10)
        _birthday(fam, "Anna", on, member="anna", year=on.year - 39)
        idea = fam.add("dennis", title="Necklace", for_user_id=fam.ids["anna"], occasion="birthday",
                       current_price_cents=4000)
        fam.add("anna", title="Kindle", kind="wish", for_user_id=fam.ids["anna"])
        client.post(f"/gifts/{idea['id']}/claim", headers=fam.h("dennis"))
        key = f"u:{fam.ids['anna']}"
        budget = client.put("/gifts/budgets", json={
            "family_id": fam.family_id, "occasion": "birthday", "occasion_date": on.isoformat(),
            "recipient_key": key, "amount_cents": 8000,
        }, headers=fam.h("dennis"))
        assert budget.status_code == 200

        dennis = next(item for item in self._occasions(fam, "dennis") if item["occasion"] == "birthday")
        assert dennis["recipient_key"] == key and dennis["days_until"] == 10 and dennis["turns"] == 39
        assert dennis["gift_ids"] == [idea["id"]] and dennis["claimed_count"] == 1
        assert dennis["wish_count"] == 1 and dennis["budget_cents"] == 8000 and dennis["spent_cents"] == 4000

        anna = next(item for item in self._occasions(fam, "anna") if item["occasion"] == "birthday")
        assert anna["for_me"] is True and anna["gift_ids"] == [] and anna["budget_cents"] is None
        assert anna["spent_cents"] is None and anna["wish_count"] == 1

        lena = next(item for item in self._occasions(fam, "lena") if item["occasion"] == "birthday")
        assert lena["gift_ids"] == [] and lena["budget_cents"] is None and lena["wish_count"] == 1

    def test_claimed_wishes_are_not_open(self, fam):
        on = local_today() + timedelta(days=5)
        _birthday(fam, "Max", on, member="max")
        wish = fam.add("max", title="Ball", kind="wish", for_user_id=fam.ids["max"], occasion="birthday")
        client.post(f"/gifts/{wish['id']}/claim", headers=fam.h("anna"))
        item = next(item for item in self._occasions(fam, "anna") if item["occasion"] == "birthday")
        assert item["wish_count"] == 0 and item["claimed_count"] == 1 and item["gift_ids"] == [wish["id"]]
        # Max still sees his wish as open.
        mine = next(item for item in self._occasions(fam, "max") if item["occasion"] == "birthday")
        assert mine["wish_count"] == 1 and mine["claimed_count"] == 0

    def test_far_birthdays_are_left_out(self, fam):
        _birthday(fam, "Oma", local_today() + timedelta(days=200))
        assert not [item for item in self._occasions(fam, "dennis") if item["occasion"] == "birthday"]

    def test_dated_other_occasion(self, fam):
        on = local_today() + timedelta(days=20)
        fam.add("dennis", title="Flowers", for_person_name="Oma", occasion="Wedding anniversary",
                occasion_date=on.isoformat())
        item = next(item for item in self._occasions(fam, "anna") if item["occasion"] == "Wedding anniversary")
        assert item["recipient_key"] == "n:oma" and item["person_name"] == "Oma" and item["gift_count"] == 1

    def test_christmas_within_the_window(self, fam):
        today = local_today()
        christmas = date(today.year, 12, 24) if date(today.year, 12, 24) >= today else date(today.year + 1, 12, 24)
        items = self._occasions(fam, "dennis", days=400)
        assert any(item["occasion"] == "christmas" and item["date"] == christmas.isoformat() for item in items)

    def test_easter(self):
        assert easter_sunday(2026) == date(2026, 4, 5)
        assert easter_sunday(2027) == date(2027, 3, 28)


class TestBudgets:
    def test_children_and_own_budget_refused(self, fam):
        payload = {"family_id": fam.family_id, "occasion": "birthday", "occasion_date": "2026-12-01",
                   "recipient_key": f"u:{fam.ids['anna']}", "amount_cents": 1000}
        assert client.put("/gifts/budgets", json=payload, headers=fam.h("lena")).status_code == 403
        assert client.put("/gifts/budgets", json=payload, headers=fam.h("anna")).status_code == 403

    def test_clear(self, fam):
        payload = {"family_id": fam.family_id, "occasion": "christmas", "occasion_date": "2026-12-24",
                   "recipient_key": "family", "amount_cents": 30000}
        assert client.put("/gifts/budgets", json=payload, headers=fam.h("anna")).json()["amount_cents"] == 30000
        cleared = client.put("/gifts/budgets", json={**payload, "amount_cents": None}, headers=fam.h("anna"))
        assert cleared.status_code == 200 and cleared.json()["amount_cents"] is None


class TestPreview:
    def test_preview_reads_the_link(self, fam, monkeypatch):
        monkeypatch.setattr(
            "app.modules.gifts_router.preview_link",
            lambda url: gift_preview.GiftPreview(title="Lamp", image=None, price_cents=2999, currency="EUR",
                                                 site="shop.example"),
        )
        resp = client.post("/gifts/preview", json={"family_id": fam.family_id, "url": "https://shop.example/lamp"},
                           headers=fam.h("lena"))
        assert resp.status_code == 200
        assert resp.json() == {"title": "Lamp", "image": None, "price_cents": 2999, "currency": "EUR",
                               "site": "shop.example"}

    def test_preview_errors(self, fam, monkeypatch):
        def refuse(url):
            raise RecipeImportError("not_allowed", "private")

        monkeypatch.setattr("app.modules.gifts_router.preview_link", refuse)
        resp = client.post("/gifts/preview", json={"family_id": fam.family_id, "url": "https://10.0.0.1/"},
                           headers=fam.h("dennis"))
        assert resp.status_code == 422 and "GIFT_PREVIEW_NOT_ALLOWED" in resp.text

        def unreachable(url):
            raise RecipeImportError("unreachable", "down")

        monkeypatch.setattr("app.modules.gifts_router.preview_link", unreachable)
        resp = client.post("/gifts/preview", json={"family_id": fam.family_id, "url": "https://shop.example/"},
                           headers=fam.h("dennis"))
        assert resp.status_code == 502 and "GIFT_PREVIEW_UNREACHABLE" in resp.text

    def test_preview_rejects_non_http(self, fam):
        resp = client.post("/gifts/preview", json={"family_id": fam.family_id, "url": "ftp://x"},
                           headers=fam.h("dennis"))
        assert resp.status_code == 400


class TestProductParsing:
    @pytest.mark.parametrize("raw,cents", [
        ("29,99", 2999), ("29.99", 2999), ("1.299,00 €", 129900), ("1,299.00", 129900),
        ("€ 5", 500), (19.9, 1990), ("1.299", 129900), ("abc", None), (None, None),
    ])
    def test_parse_price(self, raw, cents):
        assert gift_preview.parse_price(raw) == cents

    def test_open_graph(self):
        page = """<html><head><title>Fallback</title>
        <meta property="og:title" content="Wooden train &amp; tracks">
        <meta property="og:image" content="/img/train.jpg">
        <meta property="og:site_name" content="Toy Shop">
        <meta property="product:price:amount" content="49,90">
        <meta property="product:price:currency" content="eur">
        </head></html>"""
        preview = gift_preview.parse_product_html(page, "https://toys.example/p/1")
        assert preview.title == "Wooden train & tracks"
        assert preview.image == "https://toys.example/img/train.jpg"
        assert preview.price_cents == 4990 and preview.currency == "EUR" and preview.site == "Toy Shop"

    def test_json_ld_product(self):
        page = """<html><head><title>Shop | Lamp</title>
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
          {"@type":"WebPage"},
          {"@type":"Product","name":"Desk lamp","image":["https://cdn.example/lamp.png"],
           "offers":{"@type":"Offer","price":"34.95","priceCurrency":"EUR"}}]}</script>
        </head></html>"""
        preview = gift_preview.parse_product_html(page, "https://shop.example/lamp")
        assert preview.title == "Desk lamp"
        assert preview.image == "https://cdn.example/lamp.png"
        assert preview.price_cents == 3495 and preview.currency == "EUR" and preview.site == "shop.example"

    def test_plain_page_gives_its_title(self):
        preview = gift_preview.parse_product_html("<title> Just a page </title>", "https://x.example/")
        assert preview.title == "Just a page" and preview.image is None and preview.price_cents is None


class TestReminder:
    def _run(self, fam, on):
        sent = []
        db = TestSession()
        try:
            families = {uid: [fam.family_id] for uid in fam.ids.values()}
            deliver_gift_reminders(db, on=on, user_families=families,
                                   deliver=lambda uid, fid, ntype, title, body, link, *rest: sent.append(
                                       (uid, ntype, title, body("de"), link)))
        finally:
            db.close()
        return sent

    def test_week_before_without_gift(self, fam):
        on = local_today() + timedelta(days=7)
        _birthday(fam, "Anna", on, member="anna")
        sent = self._run(fam, on)
        assert {uid for uid, *_ in sent} == {fam.ids["dennis"]}
        uid, ntype, title, body, link = sent[0]
        assert ntype == "gift_reminder" and title == "Anna" and "noch kein Geschenk" in body
        assert link == f"/gifts?occasion=birthday:{on.isoformat()}:u:{fam.ids['anna']}"

    def test_quiet_once_someone_takes_care(self, fam):
        on = local_today() + timedelta(days=7)
        _birthday(fam, "Max", on, member="max")
        idea = fam.add("anna", title="Ball", for_user_id=fam.ids["max"], occasion="birthday")
        assert len(self._run(fam, on)) == 2
        client.post(f"/gifts/{idea['id']}/claim", headers=fam.h("anna"))
        assert self._run(fam, on) == []

    def test_contact_birthday(self, fam):
        on = local_today() + timedelta(days=7)
        db = TestSession()
        contact = Contact(family_id=fam.family_id, full_name="Hannelore Müller")
        db.add(contact)
        db.flush()
        db.add(FamilyBirthday(family_id=fam.family_id, person_name="Hannelore Müller", month=on.month, day=on.day,
                              contact_id=contact.id))
        db.add(GiftIdea(family_id=fam.family_id, for_contact_id=contact.id, title="Tea", occasion="birthday",
                        status="purchased"))
        db.commit()
        db.close()
        assert self._run(fam, on) == []


class TestProductParsingPages:
    def test_front_page_prices_are_not_the_product(self):
        page = """<meta property="og:type" content="website"><meta property="og:title" content="Shop">
        <span itemprop="price" content="19.95"></span><meta itemprop="price" content="19.95">
        <script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"Product","name":"Sock","offers":{"price":"3"}}]}</script>"""
        preview = gift_preview.parse_product_html(page, "https://shop.example/")
        assert preview.title == "Shop" and preview.price_cents is None

    def test_product_page_itemprop_price(self):
        page = '<meta property="og:type" content="product"><meta property="og:title" content="Kite"><meta itemprop="price" content="12.50">'
        assert gift_preview.parse_product_html(page, "https://shop.example/kite").price_cents == 1250


class TestNames:
    def test_a_typed_name_is_the_contact_or_member(self, fam):
        on = local_today() + timedelta(days=9)
        db = TestSession()
        contact = Contact(family_id=fam.family_id, full_name="Opa Karl")
        papa = Contact(family_id=fam.family_id, full_name="Papa", member_user_id=fam.ids["dennis"])
        db.add_all([contact, papa])
        db.flush()
        db.add(FamilyBirthday(family_id=fam.family_id, person_name="Opa Karl", month=on.month, day=on.day,
                              contact_id=contact.id))
        db.commit()
        contact_id = contact.id
        db.close()
        fam.add("anna", title="Shears", for_person_name="opa  karl", occasion="birthday")
        items = [item for item in client.get(f"/gifts/occasions?family_id={fam.family_id}", headers=fam.h("anna")).json()["items"]
                 if item["occasion"] == "birthday"]
        assert [item["recipient_key"] for item in items] == [f"c:{contact_id}"]
        assert items[0]["gift_count"] == 1
        # "Papa" typed by hand is Dennis: the idea stays hidden from him.
        fam.add("anna", title="Watch", for_person_name="Papa")
        assert "Watch" not in fam.titles("dennis")
