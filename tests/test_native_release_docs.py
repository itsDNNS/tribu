"""Static checks for the split native-app release documentation boundary."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
NATIVE_APP_READINESS = ROOT / "docs" / "native-app-release-readiness.md"
LEGACY_NATIVE_MATRIX = ROOT / "docs" / "native-release-smoke-test-matrix.md"


def test_native_release_readiness_points_to_app_repo_source_of_truth():
    readme = README.read_text(encoding="utf-8")
    readiness = NATIVE_APP_READINESS.read_text(encoding="utf-8")

    assert not LEGACY_NATIVE_MATRIX.exists()
    assert "docs/native-release-smoke-test-matrix.md" not in readme
    assert "docs/native-release-smoke-test-matrix.md" not in readiness
    assert "Native release smoke-test matrix" not in readme

    assert "https://github.com/itsDNNS/tribu-app/issues/14" in readme
    assert "docs/native-app-release-readiness.md" in readme
    assert "https://github.com/itsDNNS/tribu-app/issues/14" in readiness
    assert "https://github.com/itsDNNS/tribu-app/issues/10" in readiness
    assert "https://github.com/itsDNNS/tribu-app/blob/main/docs/RELEASE_SMOKE_MATRIX.md" in readiness
    assert "https://github.com/itsDNNS/tribu-app/blob/main/docs/STORE_READINESS.md" in readiness
    assert "https://github.com/itsDNNS/tribu-app/tree/main/docs/release-gates" in readiness

    for backend_owned in ("backend auth", "browser PWA behavior", "Docker images", "backend/web CI"):
        assert backend_owned in readiness

    for mirrored_status in ("Last updated:", "Expected result:", "Current release status", "App smoke ownership snapshot"):
        assert mirrored_status not in readiness
