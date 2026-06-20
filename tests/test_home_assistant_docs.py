from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "home-assistant.md"
PACKAGE = ROOT / "integrations" / "home-assistant" / "tribu_package.yaml"
DASHBOARD = ROOT / "integrations" / "home-assistant" / "dashboard-card.yaml"

REQUIRED_ENTITIES = [
    "sensor.tribu_next_event",
    "sensor.tribu_open_tasks",
    "sensor.tribu_open_shopping_items",
    "sensor.tribu_upcoming_birthdays",
]


def test_home_assistant_package_and_dashboard_define_required_entities_and_actions():
    package = PACKAGE.read_text()
    dashboard = DASHBOARD.read_text()

    for entity in REQUIRED_ENTITIES:
        assert entity in package
        assert entity in dashboard

    assert "rest_command:" in package
    assert "tribu_add_quick_capture" in package
    assert "/api/quick-capture" in package
    assert "webhook_id: !secret tribu_webhook_id" in package
    assert "event_type" in package


def test_home_assistant_docs_are_wiki_pointer_with_required_sections():
    doc = DOC.read_text()

    assert "https://github.com/itsDNNS/tribu/wiki/Home-Assistant" in doc
    assert "compatibility pointer for existing links" in doc
    for section in (
        "## Tribu scopes used by the package",
        "## Dashboard example",
        "## Privacy boundaries",
        "## Troubleshooting",
    ):
        assert section in doc


def test_home_assistant_examples_use_secret_placeholders_not_real_tokens():
    combined = "\n".join(
        path.read_text()
        for path in (DOC, PACKAGE, DASHBOARD)
    )

    assert "tribu_pat_" not in combined
    assert "Authorization: !secret tribu_authorization_header" in combined
    assert "!secret tribu_dashboard_summary_url" in combined
    assert "!secret tribu_open_tasks_url" in combined
    assert "!secret tribu_shopping_lists_url" in combined
    assert "!secret tribu_quick_capture_url" in combined
    assert "!secret tribu_family_id" in combined
    assert "Keep token values out of this file" in combined
