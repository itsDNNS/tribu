"""Whole-number settings from the environment, e.g. ICS_FEED_MAX_BYTES and ICS_MAX_EVENTS (#662)."""
import pytest

from app.core.config import env_int


@pytest.mark.parametrize("raw, expected", [(None, 500), ("", 500), ("5000", 5000), ("0", 500), ("-1", 500), ("lots", 500)])
def test_env_int(monkeypatch, raw, expected):
    if raw is None:
        monkeypatch.delenv("TRIBU_TEST_LIMIT", raising=False)
    else:
        monkeypatch.setenv("TRIBU_TEST_LIMIT", raw)
    assert env_int("TRIBU_TEST_LIMIT", 500) == expected
