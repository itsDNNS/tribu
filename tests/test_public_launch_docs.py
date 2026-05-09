"""Static checks for Tribu public launch docs."""

from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
DOCS_INDEX = ROOT / "docs" / "index.html"
OG_IMAGE = ROOT / "docs" / "assets" / "og-image.png"
FEATURE_MATRIX = ROOT / "docs" / "feature-matrix.md"
DIRECTORY_DRAFT = ROOT / "docs" / "self-hosted-directory-submission.md"
FOLLOW_UPS = ROOT / "docs" / "public-launch-follow-up-issues.md"
POLICY = ROOT / "docs" / "documentation-policy.md"

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
    paths = [README, DOCS_INDEX, FEATURE_MATRIX, DIRECTORY_DRAFT, FOLLOW_UPS, POLICY]
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
