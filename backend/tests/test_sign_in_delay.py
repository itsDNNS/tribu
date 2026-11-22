"""The growing delay after wrong passwords, counted per email whether or not an account uses it."""
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.core import sign_ins
from tests.support import ADMIN_EMAIL, PASSWORD, new_client, seed_family


pytestmark = pytest.mark.usefixtures("app_db", "reset_rate_limits")


def _end_wait(email: str) -> None:
    sign_ins.password_attempts.clear(sign_ins._attempt_keys(email)[1])


@pytest.mark.parametrize("path", ["/auth/login", "/auth/mobile-login"])
@pytest.mark.parametrize("email", [ADMIN_EMAIL, "nobody@example.com"])
def test_past_three_wrong_passwords_attempts_must_be_further_apart(path, email):
    seed_family()
    client = new_client()

    def attempt(password):
        return client.post(path, json={"email": email, "password": password})

    assert [attempt("Wrong1Pass").status_code for _ in range(4)] == [401] * 4  # the fourth claims a 1 s wait
    delayed = attempt(PASSWORD)  # even the right password waits, and an unknown email looks the same
    assert delayed.status_code == 429
    assert (delayed.json()["detail"]["params"], delayed.headers["retry-after"]) == ({"seconds": "1"}, "1")

    _end_wait(email)
    assert attempt("Wrong1Pass").status_code == 401  # claims a 2 s wait
    assert attempt(PASSWORD).json()["detail"]["params"] == {"seconds": "2"}


def test_parallel_guesses_get_one_try_per_wait():
    for _ in range(3):
        sign_ins.count_password_attempt(ADMIN_EMAIL, ok=False)
    with ThreadPoolExecutor(8) as pool:
        waits = list(pool.map(lambda _: sign_ins.password_wait(ADMIN_EMAIL), range(8)))
    assert sorted(waits) == [0] + [1] * 7


def test_right_password_clears_the_count():
    seed_family()
    client = new_client()
    for _ in range(4):
        client.post("/auth/login", json={"email": ADMIN_EMAIL.upper(), "password": "Wrong1Pass"})
    _end_wait(ADMIN_EMAIL)

    assert client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": PASSWORD}).status_code == 200
    assert [client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "Wrong1Pass"}).status_code
            for _ in range(4)] == [401] * 4


def test_wait_is_capped_and_an_unreachable_store_waits_for_nothing(monkeypatch):
    for _ in range(40):
        sign_ins.count_password_attempt("someone@example.com", ok=False)
    assert sign_ins.password_wait("someone@example.com") == 0
    assert sign_ins.password_wait("someone@example.com") == sign_ins.MAX_PASSWORD_DELAY_SECONDS

    def unreachable(*args):
        raise ConnectionError

    monkeypatch.setattr(sign_ins.password_attempts, "get", unreachable)
    monkeypatch.setattr(sign_ins.password_attempts, "incr", unreachable)
    sign_ins.count_password_attempt("someone@example.com", ok=False)
    assert sign_ins.password_wait("someone@example.com") == 0
