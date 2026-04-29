from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "home-assistant.md"
PACKAGE = ROOT / "integrations" / "home-assistant" / "tribu_package.yaml"
DASHBOARD = ROOT / "integrations" / "home-assistant" / "dashboard-card.yaml"


def test_home_assistant_package_documents_required_entities_and_actions():
    doc = DOC.read_text()
    package = PACKAGE.read_text()

    required_entities = [
        "sensor.tribu_next_event",
        "sensor.tribu_open_tasks",
        "sensor.tribu_open_shopping_items",
        "sensor.tribu_upcoming_birthdays",
    ]
    for entity in required_entities:
        assert entity in doc
        assert entity in package

    assert "rest_command:" in package
    assert "tribu_add_quick_capture" in package
    assert "/api/quick-capture" in package
    assert "webhook_id: !secret tribu_webhook_id" in package
    assert "event_type" in package


def test_home_assistant_docs_use_secret_placeholders_not_real_tokens():
    combined = "\n".join(
        path.read_text()
        for path in (DOC, PACKAGE, DASHBOARD)
    )

    assert "tribu_pat_" not in combined
    redacted_header = "Authorization: Bearer " + "*" * 3 + " tribu_token"
    assert redacted_header in combined
    assert "!secret tribu_token" in combined
    assert "!secret tribu_url" in combined
    assert "!secret tribu_family_id" in combined
    assert "Do not paste token values" in combined


def test_home_assistant_docs_cover_privacy_troubleshooting_and_dashboard_example():
    doc = DOC.read_text()
    dashboard = DASHBOARD.read_text()

    for section in (
        "## Privacy boundaries",
        "## Troubleshooting",
        "## Tribu scopes used by the package",
        "## Dashboard example",
    ):
        assert section in doc

    assert "type: entities" in dashboard
    assert "sensor.tribu_next_event" in dashboard
    assert "sensor.tribu_open_tasks" in dashboard
    assert "sensor.tribu_open_shopping_items" in dashboard
    assert "sensor.tribu_upcoming_birthdays" in dashboard
