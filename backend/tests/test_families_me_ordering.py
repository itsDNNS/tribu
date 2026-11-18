"""Regression test: /families/me must return a stable, ordered list.

Without an explicit ORDER BY the membership query returned families in
non-deterministic order, so mobile/web clients that pick the "first" family
flipped between families on every request. The handler now orders by
family_id; this locks that in.
"""

import pytest

from app.models import Family, Membership, User
from app.modules.families_router import my_families
from tests.support import TestSession, add_member


pytestmark = pytest.mark.usefixtures("app_db")


def test_my_families_is_ordered_by_family_id():
    with TestSession() as db:
        # Two real families; add the memberships in reverse-id order so the
        # result only comes out sorted because of the explicit ORDER BY.
        first = Family(name="Braun")
        second = Family(name="Tribu")
        db.add_all([first, second])
        db.flush()
        member = add_member(db, "order@example.com", scopes=None, family_id=second.id, role="member", display_name="Order User")
        db.add(Membership(user_id=member.user_id, family_id=first.id, role="admin", is_adult=True))
        db.commit()

        result = my_families(user=db.get(User, member.user_id), db=db, _scope=None)
        ids = [row["family_id"] for row in result]

        assert ids == sorted(ids)
        assert ids == [first.id, second.id]
