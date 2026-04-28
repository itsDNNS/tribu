import re
from pathlib import Path


STABLE_RELEASE_TAG_RE = re.compile(r'^v([0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?|[0-9]+\.[0-9]+\.[0-9]+)$')


def test_stable_release_tag_builds_publish_latest_images():
    workflow = Path('.github/workflows/docker.yml').read_text()
    expected = "type=raw,value=latest,enable=${{ steps.release_tag.outputs.stable == 'true' || github.ref_name == github.event.repository.default_branch }}"

    assert workflow.count('id: release_tag') == 2
    assert workflow.count(expected) == 2
    assert 'type=raw,value=latest,enable={{is_default_branch}}' not in workflow


def test_stable_release_tag_detection_covers_date_patch_tags():
    assert STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27')
    assert STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27.1')
    assert STABLE_RELEASE_TAG_RE.fullmatch('v1.2.3')
    assert not STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27.1-rc1')
    assert not STABLE_RELEASE_TAG_RE.fullmatch('v1.2.3-rc1')


def test_frontend_image_receives_same_build_version_as_backend():
    workflow = Path('.github/workflows/docker.yml').read_text()

    assert 'id: frontend_app_version' in workflow
    assert 'NEXT_PUBLIC_APP_VERSION=${{ steps.frontend_app_version.outputs.value }}' in workflow
    assert 'NEXT_PUBLIC_APP_BUILD_NUMBER=${{ github.run_number }}' in workflow
    assert 'NEXT_PUBLIC_APP_GIT_SHA=${{ github.sha }}' in workflow
