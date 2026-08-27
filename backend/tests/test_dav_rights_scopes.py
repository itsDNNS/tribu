from app.dav.rights_plugin import Rights, forget_scopes, remember_scopes

USER = "dav@example.com"


def teardown_function():
    forget_scopes()


def _auth(scopes, path, family_ids=(1,)):
    remember_scopes(USER, 1, set(scopes), set(family_ids))
    return Rights({}).authorization(USER, path)


def test_calendar_scope_only_authorizes_calendar_collection():
    assert _auth({"calendar:read"}, f"/{USER}/cal-1/") == "rR"
    assert _auth({"calendar:read"}, f"/{USER}/book-1/") == ""

    forget_scopes()
    assert _auth({"calendar:write"}, f"/{USER}/cal-1/") == "rRwW"
    assert _auth({"calendar:write"}, f"/{USER}/book-1/") == ""


def test_contacts_scope_only_authorizes_address_book_collection():
    assert _auth({"contacts:read"}, f"/{USER}/book-1/") == "rR"
    assert _auth({"contacts:read"}, f"/{USER}/cal-1/") == ""

    forget_scopes()
    assert _auth({"contacts:write"}, f"/{USER}/book-1/") == "rRwW"
    assert _auth({"contacts:write"}, f"/{USER}/cal-1/") == ""


def test_wildcard_scope_keeps_full_collection_access():
    assert _auth({"*"}, f"/{USER}/cal-1/") == "rRwW"
    assert _auth({"*"}, f"/{USER}/book-1/") == "rRwW"


def test_collection_rights_require_authenticated_family_membership():
    assert _auth({"calendar:write"}, f"/{USER}/cal-1/", family_ids={1, 2}) == "rRwW"
    assert _auth({"contacts:read"}, f"/{USER}/book-2/", family_ids={1, 2}) == "rR"
    assert _auth({"calendar:write"}, f"/{USER}/cal-3/", family_ids={1, 2}) == ""
    assert _auth({"contacts:read"}, f"/{USER}/book-3/", family_ids={1, 2}) == ""


def test_wildcard_cannot_cross_family_boundaries():
    assert _auth({"*"}, f"/{USER}/cal-2/event.ics", family_ids={1}) == ""
    assert _auth({"*"}, f"/{USER}/book-2/contact.vcf", family_ids={1}) == ""


def test_invalid_family_collection_segments_are_denied():
    invalid = (
        "cal-",
        "cal-fake",
        "cal--1",
        "cal-1-extra",
        "book-",
        "book-fake",
        "cal-" + "9" * 5000,
    )
    for collection in invalid:
        assert _auth({"*"}, f"/{USER}/{collection}/", family_ids={1}) == ""


def test_root_and_principal_discovery_remain_available():
    assert _auth({"calendar:read"}, "/", family_ids=set()) == "R"
    assert _auth({"contacts:read"}, f"/{USER}/", family_ids=set()) == "RW"
