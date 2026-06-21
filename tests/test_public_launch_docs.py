"""Durable public-surface checks for Tribu docs and launch assets."""

from html.parser import HTMLParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
CONTRIBUTING = ROOT / "CONTRIBUTING.md"
DOCS_INDEX = ROOT / "docs" / "index.html"
OG_IMAGE = ROOT / "docs" / "assets" / "og-image.png"
FEATURE_MATRIX = ROOT / "docs" / "feature-matrix.md"
PUBLIC_COPY_CHECKLIST = ROOT / "docs" / "public-copy-review-checklist.md"
SECURITY = ROOT / "SECURITY.md"
EN_MESSAGES = ROOT / "frontend" / "i18n" / "en.json"
LOCALE_DIR = ROOT / "frontend" / "i18n"
COMPOSE = ROOT / "docker" / "docker-compose.yml"
DEV_COMPOSE = ROOT / "docker" / "docker-compose.dev.yml"
E2E_WORKFLOW = ROOT / ".github" / "workflows" / "e2e.yml"
LEGACY_BACKUP_SCRIPTS = (
    ROOT / "scripts" / "backup.sh",
    ROOT / "scripts" / "restore.sh",
)

REQUIRED_META = {
    ("name", "description"),
    ("property", "og:title"),
    ("property", "og:description"),
    ("property", "og:image"),
    ("property", "og:url"),
    ("name", "twitter:card"),
    ("name", "twitter:image"),
}


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = set()
        self.images = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "meta":
            for kind in ("name", "property"):
                if kind in data:
                    self.meta.add((kind, data[kind]))
        if tag == "img" and data.get("src"):
            self.images.append(data["src"])
        if tag == "a" and data.get("href"):
            self.links.append(data["href"])


def markdown_links(text):
    return re.findall(r'\]\(([^)]+)\)', text)


def local_markdown_links(text):
    for ref in markdown_links(text):
        if ref.startswith(("http://", "https://", "#", "mailto:")):
            continue
        yield ref.split("#", 1)[0]


def test_public_launch_page_has_social_metadata_and_assets():
    html = DOCS_INDEX.read_text(encoding="utf-8")
    parser = MetaParser()
    parser.feed(html)

    assert REQUIRED_META <= parser.meta
    assert "https://itsdnns.github.io/tribu/assets/og-image.png" in html
    assert OG_IMAGE.exists()
    assert OG_IMAGE.stat().st_size > 20_000
    assert parser.images.count("assets/screenshot-shared-display.png") == 1


def test_public_launch_page_local_references_exist():
    html = DOCS_INDEX.read_text(encoding="utf-8")
    parser = MetaParser()
    parser.feed(html)

    local_refs = [
        ref
        for ref in [*parser.images, *parser.links]
        if ref
        and not ref.startswith("#")
        and "://" not in ref
        and not ref.startswith("mailto:")
    ]

    assert local_refs
    for ref in local_refs:
        assert not ref.startswith("/"), f"root-relative paths break project Pages: {ref}"
        assert (ROOT / "docs" / ref).exists(), f"missing docs-local asset/link: {ref}"


def test_readme_local_references_exist():
    readme = README.read_text(encoding="utf-8")
    refs = {
        ref
        for ref in re.findall(r'<img[^>]+src="([^"]+)"', readme)
        if "://" not in ref
    }
    refs.update(local_markdown_links(readme))

    assert refs
    for ref in refs:
        if not ref:
            continue
        assert not ref.startswith("/"), f"root-relative local README reference: {ref}"
        assert "://" not in ref, f"unexpected external asset reference in local asset check: {ref}"
        assert (ROOT / ref).exists(), f"missing README local reference: {ref}"


def test_feature_matrix_keeps_status_sections_and_tables():
    matrix = FEATURE_MATRIX.read_text(encoding="utf-8")
    for heading in (
        "## Shipped",
        "## Planned or under evaluation",
        "## Intentionally out of scope for now",
    ):
        assert heading in matrix
    assert "| Area | Capability | Notes |" in matrix
    assert "| Area | Direction to evaluate | Guardrails |" in matrix


def test_public_copy_review_expectations_are_documented_not_hardcoded_as_copy_tests():
    checklist = PUBLIC_COPY_CHECKLIST.read_text(encoding="utf-8")
    contributing = CONTRIBUTING.read_text(encoding="utf-8")

    assert "docs/public-copy-review-checklist.md" in contributing
    for section in (
        "## Contract tests keep",
        "## Human copy review checks",
        "## Claims that need evidence",
        "## Release checklist",
    ):
        assert section in checklist

    assert "Do not turn normal wording preferences into exact-string tests" in checklist
    assert "Required metadata, file links, and asset paths stay automated" in checklist


def test_public_github_docs_avoid_process_leakage_and_em_dashes():
    public_docs = [README, CONTRIBUTING, SECURITY, DOCS_INDEX, *sorted((ROOT / "docs").glob("*.md"))]
    public_text = "\n".join(path.read_text(encoding="utf-8") for path in public_docs).lower()

    for forbidden in ("review gate", "reviewed the commit", "no discrete regression"):
        assert forbidden not in public_text
    assert "—" not in public_text


def test_landing_page_keeps_objective_security_and_phone_sync_caveats():
    landing = DOCS_INDEX.read_text(encoding="utf-8")

    assert "SECURE_COOKIES=true" in landing
    assert "Android through DAV-compatible clients such as DAVx5" in landing


def test_backup_restore_guidance_uses_supported_public_docs():
    readme = README.read_text(encoding="utf-8")
    security = SECURITY.read_text(encoding="utf-8")
    admin_backup = (ROOT / "frontend" / "components" / "admin" / "BackupSection.js").read_text(encoding="utf-8")

    for script in LEGACY_BACKUP_SCRIPTS:
        assert not script.exists(), f"legacy backup helper remains tracked: {script.relative_to(ROOT)}"

    supported_url = "https://github.com/itsDNNS/tribu/wiki/Backup-&-Restore"
    assert supported_url in readme
    assert supported_url in security
    assert supported_url in admin_backup

    checked_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (README, SECURITY, ROOT / "docs" / "self-hosting.md", ROOT / "frontend" / "components" / "admin" / "BackupSection.js")
    )
    assert "scripts/backup.sh" not in checked_text
    assert "scripts/restore.sh" not in checked_text
    assert "./scripts/backup.sh" not in checked_text
    assert "./scripts/restore.sh" not in checked_text


def test_public_compose_is_image_only_and_uses_shared_database_password():
    compose = COMPOSE.read_text(encoding="utf-8")
    dev_compose = DEV_COMPOSE.read_text(encoding="utf-8")
    workflow = E2E_WORKFLOW.read_text(encoding="utf-8")

    db_url = "postgresql://tribu:" + "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}" + "@postgres:5432/tribu"
    assert "build:" not in compose
    assert "postgresql://tribu:***@postgres" not in compose
    assert db_url in compose
    assert "ghcr.io/itsdnns/tribu-backend:latest" in compose
    assert "ghcr.io/itsdnns/tribu-frontend:latest" in compose
    assert "build:" in dev_compose
    assert "docker-compose.dev.yml" in workflow


def test_security_and_setup_docs_keep_contractual_secret_guidance():
    readme = README.read_text(encoding="utf-8")
    security = SECURITY.read_text(encoding="utf-8")
    en_messages = EN_MESSAGES.read_text(encoding="utf-8")

    db_url = "postgresql://tribu:" + "${" + "POSTGRES_PASSWORD" + "}" + "@postgres:5432/tribu"
    assert "secrets.token_hex(32)" in readme
    assert "secrets.token_hex(16)" in readme
    assert "env.write_text(text)" in readme
    assert db_url in readme


    assert "frontend image runs as the dedicated non-root `tribu` user" in security
    assert "backend image creates the same user and the entrypoint drops privileges" in security
    assert "Household data stays on your server" in en_messages
    assert "Admin-only update checks may contact GitHub for release metadata" in en_messages


def test_locale_privacy_and_phone_sync_claims_are_caveated():
    locale_files = sorted(LOCALE_DIR.glob("*.json"))
    assert locale_files

    for locale_file in locale_files:
        messages = json.loads(locale_file.read_text(encoding="utf-8"))
        combined_privacy = f"{messages.get('auth_footer', '')} {messages.get('privacy_note', '')}".lower()
        phone_intro = messages.get("phone_sync_intro", "")

        assert "davx5" in phone_intro.lower(), f"{locale_file.name} must caveat Android DAV sync"
        assert "github" in combined_privacy, f"{locale_file.name} must disclose admin release checks"

    old_claims = (
        "iOS and Android",
        "iOS und Android",
        "iOS y Android",
        "iOS et Android",
        "iOS e Android",
        "iOS en Android",
        "iOS și Android",
    )
    for locale_file in locale_files:
        phone_intro = json.loads(locale_file.read_text(encoding="utf-8")).get("phone_sync_intro", "")
        for claim in old_claims:
            assert claim not in phone_intro, f"{locale_file.name} keeps old native Android wording"
