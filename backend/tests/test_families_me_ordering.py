"""Regression test: /families/me must return a stable, ordered list.

Without an explicit ORDER BY the membership query returned families in
non-deterministic order, so mobile/web clients that pick the "first" family
flipped between families on every request. The handler now orders by
family_id; this locks that in.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Family, Membership, User
from app.modules.families_router import my_families
from app.security import hash_password

engine = create_engine(
    "sqlite:///./test-families-order.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_function():
    Base.metadata.drop_all(bind=engine)


def test_my_families_is_ordered_by_family_id():
    db = TestSession()
    try:
        user = User(
            email="order@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Order User",
        )
        db.add(user)
        db.flush()

        # Two real families; add the memberships in reverse-id order so the
        # result only comes out sorted because of the explicit ORDER BY.
        first = Family(name="Braun")
        second = Family(name="Tribu")
        db.add_all([first, second])
        db.flush()
        db.add(Membership(user_id=user.id, family_id=second.id, role="member", is_adult=True))
        db.add(Membership(user_id=user.id, family_id=first.id, role="admin", is_adult=True))
        db.commit()

        result = my_families(user=user, db=db, _scope=None)
        ids = [row["family_id"] for row in result]

        assert ids == sorted(ids)
        assert ids == [first.id, second.id]
    finally:
        db.close()
