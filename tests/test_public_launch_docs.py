"""Static checks for Tribu public launch docs."""

from html.parser import HTMLParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
DOCS_INDEX = ROOT / "docs" / "index.html"
OG_IMAGE = ROOT / "docs" / "assets" / "og-image.png"
FEATURE_MATRIX = ROOT / "docs" / "feature-matrix.md"
DIRECTORY_DRAFT = ROOT / "docs" / "self-hosted-directory-submission.md"
FOLLOW_UPS = ROOT / "docs" / "public-launch-follow-up-issues.md"
POLICY = ROOT / "docs" / "documentation-policy.md"
SECURITY = ROOT / "SECURITY.md"
EN_MESSAGES = ROOT / "frontend" / "i18n" / "en.json"
LOCALE_DIR = ROOT / "frontend" / "i18n"
COMPOSE = ROOT / "docker" / "docker-compose.yml"
DEV_COMPOSE = ROOT / "docker" / "docker-compose.dev.yml"
E2E_WORKFLOW = ROOT / ".github" / "workflows" / "e2e.yml"

FORBIDDEN_PUBLIC_TERMS = (
    "oikos",
    "ulsklyc",
    "competitor",
    "konkurrent",
    "codex",
    "claude",
    "gemini",
    "hermes",
    "review gate",
    "reviewed the commit",
    "no discrete regression",
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


def read_public_text():
    paths = [README, DOCS_INDEX, FEATURE_MATRIX, DIRECTORY_DRAFT, FOLLOW_UPS, POLICY, SECURITY, EN_MESSAGES]
    return "\n".join(path.read_text(encoding="utf-8") for path in paths)


def test_public_launch_page_has_social_metadata_and_assets():
    html = DOCS_INDEX.read_text(encoding="utf-8")
    parser = MetaParser()
    parser.feed(html)

    assert REQUIRED_META <= parser.meta
    assert "https://itsdnns.github.io/tribu/assets/og-image.png" in html
    assert OG_IMAGE.exists()
    assert OG_IMAGE.stat().st_size > 20_000
    assert "assets/screenshot-light.png" in parser.images
    assert "assets/screenshot-mobile.png" in parser.images


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


def test_readme_and_directory_local_asset_references_exist():
    readme = README.read_text(encoding="utf-8")
    directory = DIRECTORY_DRAFT.read_text(encoding="utf-8")
    refs = {
        ref
        for ref in re.findall(r'<img[^>]+src="([^"]+)"', readme)
        if "://" not in ref
    }
    refs.update(re.findall(r'`(docs/assets/[^`]+)`', directory))

    assert refs
    for ref in refs:
        assert not ref.startswith("/"), f"root-relative local asset reference: {ref}"
        assert "://" not in ref, f"unexpected external asset reference in local asset check: {ref}"
        assert (ROOT / ref).exists(), f"missing README/directory asset: {ref}"


def test_readme_above_the_fold_has_launch_ctas_and_trust_signals():
    readme = README.read_text(encoding="utf-8")
    above_fold = readme.split("## Why Tribu?", 1)[0]

    for expected in (
        "Product page",
        "Quick Start",
        "Documentation Wiki",
        "Docker Compose",
        "Demo mode",
        "Shared Home Display",
        "CalDAV/CardDAV",
        "Home Assistant",
        "24 languages",
        "MIT licensed",
    ):
        assert expected in above_fold


def test_feature_matrix_distinguishes_shipped_planned_and_out_of_scope():
    matrix = FEATURE_MATRIX.read_text(encoding="utf-8")
    assert "## Shipped" in matrix
    assert "## Planned or under evaluation" in matrix
    assert "## Intentionally out of scope for now" in matrix
    for shipped in ("Shared Home Display", "Home Assistant", "Meal planning", "Recipes", "School timetables", "Gifts"):
        assert shipped in matrix


def test_public_launch_copy_stays_source_and_process_clean():
    public_text = read_public_text().lower()
    for term in FORBIDDEN_PUBLIC_TERMS:
        assert term not in public_text
    assert "—" not in public_text


def test_documentation_policy_tracks_launch_docs():
    policy = POLICY.read_text(encoding="utf-8")
    for path in (
        "docs/index.html",
        "docs/feature-matrix.md",
        "docs/self-hosted-directory-submission.md",
        "docs/public-launch-follow-up-issues.md",
    ):
        assert path in policy


def test_public_compose_is_image_only_and_uses_shared_database_password():
    compose = COMPOSE.read_text(encoding="utf-8")
    dev_compose = DEV_COMPOSE.read_text(encoding="utf-8")
    workflow = E2E_WORKFLOW.read_text(encoding="utf-8")

    assert "build:" not in compose
    assert "postgresql://tribu:***@postgres" not in compose
    assert "postgresql://tribu:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}@postgres:5432/tribu" in compose
    assert "ghcr.io/itsdnns/tribu-backend:latest" in compose
    assert "ghcr.io/itsdnns/tribu-frontend:latest" in compose
    assert "build:" in dev_compose
    assert "docker-compose.dev.yml" in workflow


def test_public_launch_copy_avoids_validated_overclaims():
    public_text = read_public_text()
    forbidden_phrases = (
        "lazy-loaded locale packs",
        "Explore before you deploy",
        "Try the full UI without a production setup",
        "guessing from source",
        "non-root containers",
        "run all processes under that user",
        "Your data stays on your server. Always.",
        "never shared with third parties",
        "native Calendar and Contacts apps on iOS and Android",
    )
    for phrase in forbidden_phrases:
        assert phrase not in public_text

    landing = DOCS_INDEX.read_text(encoding="utf-8")
    assert "Try the main workflows with sample data after starting the app." in landing
    assert "Android through DAV-compatible clients such as DAVx5" in landing
    assert "SECURE_COOKIES=true" in landing

    readme = README.read_text(encoding="utf-8")
    assert "secrets.token_hex(32)" in readme
    assert "secrets.token_hex(16)" in readme
    assert "env.write_text(text)" in readme
    assert "postgresql://tribu:${POSTGRES_PASSWORD}@postgres:5432/tribu" in readme

    security = SECURITY.read_text(encoding="utf-8")
    assert "frontend image runs as the dedicated non-root `tribu` user" in security
    assert "backend image creates the same user and the entrypoint drops privileges" in security

    en_messages = EN_MESSAGES.read_text(encoding="utf-8")
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
