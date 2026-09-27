import logging

from app.dav import app_factory


def test_default_folder_needs_no_configuration(monkeypatch, caplog):
    # DAV data lives in the database; the folder only satisfies Radicale's schema.
    monkeypatch.delenv("DAV_STORAGE_FOLDER", raising=False)
    with caplog.at_level(logging.WARNING, logger=app_factory.__name__):
        assert app_factory._resolve_storage_folder() == app_factory.DEFAULT_STORAGE_FOLDER
    assert not caplog.records


def test_folder_can_be_moved(monkeypatch, tmp_path):
    monkeypatch.setenv("DAV_STORAGE_FOLDER", str(tmp_path / "dav"))
    assert app_factory._resolve_storage_folder() == str(tmp_path / "dav")
