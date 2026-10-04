"""The GitHub Wiki is the documentation source; the repository keeps only core files."""

from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
WIKI_URL = "https://github.com/itsDNNS/tribu/wiki"

CORE_MARKDOWN = {
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    ".github/pull_request_template.md",
}

# Retired repository docs. Their content lives in the Wiki or was removed as
# internal notes; nothing may link to them again.
RETIRED_DOCS = (
    "DESIGN.md",
    "docs/admin-layout.md",
    "docs/defensive-review-checklist.md",
    "docs/feature-matrix.md",
    "docs/home-assistant.md",
    "docs/native-app-release-readiness.md",
    "docs/native-release-smoke-test-matrix.md",
    "docs/public-copy-review-checklist.md",
    "docs/responsive-ui.md",
    "docs/self-hosting.md",
    "docs/shared-display.md",
    "docs/tribu-2-design.md",
    "docs/assets/shopping/README.md",
    "frontend/public/illustrations/README.md",
)
RETIRED_REFERENCES = sorted(
    {"DESIGN.md", "shopping/README.md", "illustrations/README.md"}
    | {Path(path).name for path in RETIRED_DOCS if path.startswith("docs/") and path.count("/") == 1}
)

PUBLIC_SURFACES = (
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/index.html",
    ".github/pull_request_template.md",
    ".github/ISSUE_TEMPLATE/bug-report.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/feature-request.yml",
)


def repo_files():
    """Tracked and untracked, non-ignored files that exist in the working tree."""
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, "documentation contracts need a git checkout"
    paths = {path for path in result.stdout.decode("utf-8").split("\0") if path}
    return sorted(path for path in paths if (ROOT / path).is_file())


def text_of(path):
    data = (ROOT / path).read_bytes()
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def heading_anchors(markdown):
    anchors = set()
    in_fence = False
    for line in markdown.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        match = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if match and not in_fence:
            text = re.sub(r"[^\w\- ]", "", match.group(1).strip().lower())
            anchors.add(text.replace(" ", "-"))
    return anchors


def local_link_targets(text):
    yield from re.findall(r"\]\(([^)\s]+)\)", text)
    yield from re.findall(r'href="([^"]+)"', text)


def test_repository_markdown_is_limited_to_core_files():
    markdown = {path for path in repo_files() if path.lower().endswith((".md", ".markdown", ".mdx"))}

    assert markdown == CORE_MARKDOWN
    assert (ROOT / "LICENSE").is_file()


def test_retired_docs_stay_removed():
    for path in RETIRED_DOCS:
        assert not (ROOT / path).exists(), f"retired doc is back: {path}"


def test_no_file_references_retired_docs():
    this_file = Path(__file__).resolve().relative_to(ROOT).as_posix()
    offenders = []
    for path in repo_files():
        if path == this_file:
            continue
        text = text_of(path)
        if text is None:
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            offenders.extend(f"{path}:{number}: {needle}" for needle in RETIRED_REFERENCES if needle in line)

    assert offenders == []


def test_public_surfaces_link_only_public_destinations():
    for path in PUBLIC_SURFACES:
        text = (ROOT / path).read_text(encoding="utf-8")
        assert "github.com/itsDNNS/tribu-app" not in text, f"{path} links a non-public repository"
        assert "github.com/itsDNNS/tribu/blob/main/docs/" not in text, f"{path} links repository docs"
        for page in re.findall(re.escape(WIKI_URL) + r"/([^\s\")#>]+)", text):
            assert not page.endswith(".md"), f"{path} links a wiki page with a .md suffix: {page}"


def test_core_docs_route_readers_to_the_wiki():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    contributing = (ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")

    assert f"{WIKI_URL}/Self-Hosting" in readme
    assert f"{WIKI_URL}/Self-Hosting" in contributing
    assert f"{WIKI_URL}/Design-and-Frontend-Guidelines" in contributing
    assert "CONTRIBUTING.md#defensive-review" in security


def test_core_markdown_local_links_and_anchors_resolve():
    for path in sorted(CORE_MARKDOWN):
        source = ROOT / path
        text = source.read_text(encoding="utf-8")
        for target in local_link_targets(text):
            if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.IGNORECASE):
                continue
            file_part, _, anchor = target.partition("#")
            linked = (source.parent / file_part).resolve() if file_part else source
            assert linked.exists(), f"{path} links a missing file: {target}"
            if anchor and linked.suffix == ".md":
                anchors = heading_anchors(linked.read_text(encoding="utf-8"))
                assert anchor in anchors, f"{path} links a missing anchor: {target}"
