from app.dav.rights_plugin import Rights, forget_scopes, remember_scopes

USER = "dav@example.com"


def teardown_function():
    forget_scopes()


def _auth(scopes, path):
    remember_scopes(USER, 1, set(scopes))
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
