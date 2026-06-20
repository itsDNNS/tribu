import re
from pathlib import Path


STABLE_RELEASE_TAG_RE = re.compile(r'^v([0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?|[0-9]+\.[0-9]+\.[0-9]+)$')


def read_workflow() -> str:
    return Path('.github/workflows/docker.yml').read_text()


def test_docker_workflow_uses_component_matrix_without_repeated_shared_steps():
    workflow = read_workflow()

    assert 'build-backend:' not in workflow
    assert 'build-frontend:' not in workflow
    assert 'component: backend' in workflow
    assert 'component: frontend' in workflow
    assert 'image: ghcr.io/${{ github.repository_owner }}/tribu-backend' in workflow
    assert 'image: ghcr.io/${{ github.repository_owner }}/tribu-frontend' in workflow
    assert 'context: ./backend' in workflow
    assert 'context: ./frontend' in workflow
    assert 'dockerfile: ./backend/Dockerfile' in workflow
    assert 'dockerfile: ./frontend/Dockerfile' in workflow
    assert workflow.count('docker/setup-qemu-action@v4') == 1
    assert workflow.count('docker/setup-buildx-action@v4') == 1
    assert workflow.count('docker/login-action@v4') == 1
    assert workflow.count('docker/metadata-action@v6') == 1
    assert workflow.count('docker/build-push-action@v7') == 1
    assert len(workflow.splitlines()) < 140


def test_stable_release_tag_builds_publish_latest_images():
    workflow = read_workflow()
    expected = "type=raw,value=latest,enable=${{ steps.release_tag.outputs.stable == 'true' || github.ref_name == github.event.repository.default_branch }}"

    assert workflow.count('id: release_tag') == 1
    assert workflow.count(expected) == 1
    assert 'type=raw,value=latest,enable={{is_default_branch}}' not in workflow


def test_stable_release_tag_detection_covers_date_patch_tags():
    assert STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27')
    assert STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27.1')
    assert STABLE_RELEASE_TAG_RE.fullmatch('v1.2.3')
    assert not STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27.1-rc1')
    assert not STABLE_RELEASE_TAG_RE.fullmatch('v1.2.3-rc1')


def test_backend_image_receives_app_version_build_arg_only():
    dockerfile = Path('backend/Dockerfile').read_text()
    workflow = read_workflow()

    assert 'ARG APP_VERSION=dev' in dockerfile
    assert 'ENV APP_VERSION=${APP_VERSION}' in dockerfile
    assert 'RUN python -m app.core.versioning --write-build-info' not in dockerfile
    assert "case \"${{ matrix.component }}\" in" in workflow
    assert 'backend)' in workflow
    assert "echo 'APP_VERSION=${{ steps.app_version.outputs.value }}'" in workflow


def test_frontend_image_receives_same_build_version_as_backend():
    workflow = read_workflow()

    assert 'id: app_version' in workflow
    assert 'id: frontend_app_version' not in workflow
    assert 'frontend)' in workflow
    assert "echo 'NEXT_PUBLIC_APP_VERSION=${{ steps.app_version.outputs.value }}'" in workflow
    assert "echo 'NEXT_PUBLIC_APP_BUILD_NUMBER=${{ github.run_number }}'" in workflow
    assert "echo 'NEXT_PUBLIC_APP_GIT_SHA=${{ github.sha }}'" in workflow
    assert "echo 'NEXT_PUBLIC_APP_BUILD_DATE=${{ steps.app_version.outputs.date }}'" in workflow


def test_docker_workflow_keeps_required_package_write_permissions():
    workflow = read_workflow()

    assert 'permissions:' in workflow
    assert 'contents: read' in workflow
    assert 'packages: write' in workflow
