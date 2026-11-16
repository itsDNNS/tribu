import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STABLE_RELEASE_TAG_RE = re.compile(r'^v([0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?|[0-9]+\.[0-9]+\.[0-9]+)$')


def read_workflow() -> str:
    return (ROOT / '.github/workflows/docker.yml').read_text()


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
    assert workflow.count('docker/setup-buildx-action@v4') == 1
    # One login to push the per-platform builds, one to publish the combined image.
    assert workflow.count('docker/login-action@v4') == 2
    assert workflow.count('docker/metadata-action@v6') == 1
    assert workflow.count('docker/build-push-action@v7') == 1
    assert len(workflow.splitlines()) < 250


def test_each_platform_builds_natively_without_emulation():
    workflow = read_workflow()

    assert 'docker/setup-qemu-action' not in workflow
    assert 'arch: [amd64, arm64]' in workflow
    assert 'runs-on: ${{ matrix.runner }}' in workflow
    assert '            runner: ubuntu-24.04-arm' in workflow
    assert 'platforms: linux/${{ matrix.arch }}' in workflow
    assert 'push-by-digest=true' in workflow


def test_images_are_published_only_from_the_default_branch_and_tags():
    workflow = read_workflow()
    push_rule = "push: ${{ github.ref_type == 'tag' || github.ref_name == github.event.repository.default_branch }}"

    assert workflow.count(push_rule) == 1
    assert 'push=${{ needs.version.outputs.push }}' in workflow
    assert 'needs: [version, build]' in workflow
    assert "    if: needs.version.outputs.push == 'true'" in workflow
    assert 'docker buildx imagetools create' in workflow


def test_stable_release_tag_builds_publish_latest_images():
    workflow = read_workflow()
    expected = "type=raw,value=latest,enable=${{ needs.version.outputs.stable == 'true' || github.ref_name == github.event.repository.default_branch }}"

    assert workflow.count('id: release_tag') == 1
    assert 'stable: ${{ steps.release_tag.outputs.stable }}' in workflow
    assert workflow.count(expected) == 1
    assert 'type=raw,value=latest,enable={{is_default_branch}}' not in workflow


def test_stable_release_tag_detection_covers_date_patch_tags():
    assert STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27')
    assert STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27.1')
    assert STABLE_RELEASE_TAG_RE.fullmatch('v1.2.3')
    assert not STABLE_RELEASE_TAG_RE.fullmatch('v2026-04-27.1-rc1')
    assert not STABLE_RELEASE_TAG_RE.fullmatch('v1.2.3-rc1')


def test_backend_image_receives_app_version_build_arg_only():
    dockerfile = (ROOT / 'backend/Dockerfile').read_text()
    workflow = read_workflow()

    assert 'ARG APP_VERSION=dev' in dockerfile
    assert 'ENV APP_VERSION=${APP_VERSION}' in dockerfile
    assert 'RUN python -m app.core.versioning --write-build-info' not in dockerfile
    assert "case \"${{ matrix.component }}\" in" in workflow
    assert 'backend)' in workflow
    assert "echo 'APP_VERSION=${{ needs.version.outputs.value }}'" in workflow


def test_frontend_image_receives_same_build_version_as_backend():
    workflow = read_workflow()

    assert workflow.count('id: app_version') == 1
    assert 'value: ${{ steps.app_version.outputs.value }}' in workflow
    assert 'id: frontend_app_version' not in workflow
    assert 'frontend)' in workflow
    assert "echo 'NEXT_PUBLIC_APP_VERSION=${{ needs.version.outputs.value }}'" in workflow
    assert "echo 'NEXT_PUBLIC_APP_BUILD_NUMBER=${{ github.run_number }}'" in workflow
    assert "echo 'NEXT_PUBLIC_APP_GIT_SHA=${{ github.sha }}'" in workflow
    assert "echo 'NEXT_PUBLIC_APP_BUILD_DATE=${{ needs.version.outputs.date }}'" in workflow


def test_docker_workflow_defaults_to_read_only_contents_permissions():
    workflow = read_workflow()
    workflow_header, jobs_marker, _ = workflow.partition('\njobs:\n')

    assert jobs_marker == '\njobs:\n'
    assert workflow_header.endswith('\npermissions:\n  contents: read\n')


def test_docker_workflow_build_job_keeps_package_write_permission():
    lines = read_workflow().splitlines()
    build_start = lines.index('  build:')
    build_lines = []

    for line in lines[build_start + 1:]:
        if line.startswith('  ') and not line.startswith('    ') and line.strip():
            break
        build_lines.append(line)

    build_job = '\n'.join(build_lines)
    assert '    permissions:\n      contents: read\n      packages: write' in build_job


def test_docker_publish_waits_for_backend_and_frontend_tests():
    workflow = read_workflow()

    assert 'backend-tests:' in workflow
    assert 'uses: ./.github/workflows/backend-tests.yml' in workflow
    assert 'frontend-tests:' in workflow
    assert 'npm test -- --runInBand' in workflow
    assert 'needs: [backend-tests, frontend-tests, version]' in workflow


def test_reused_backend_test_workflow_runs_repository_contract_tests():
    backend_tests = (ROOT / '.github/workflows/backend-tests.yml').read_text()

    assert 'workflow_call:' in backend_tests
    assert '        run: python -m pytest tests -q\n' in backend_tests


def test_image_references_are_lowercased_for_the_registry():
    workflow = read_workflow()

    # github.repository_owner is itsDNNS; registry references must be lowercase.
    assert 'run: echo "name=${IMAGE,,}" >> "$GITHUB_OUTPUT"' in workflow
    assert 'name=${{ steps.image.outputs.name }},push-by-digest=true' in workflow
    assert 'image="${IMAGE,,}"' in workflow
    assert 'args+=("${image}@$(cat "${digest_file}")")' in workflow
    assert 'name=${{ matrix.image }}' not in workflow
    assert '"${{ matrix.image }}@' not in workflow
