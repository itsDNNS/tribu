"""Tests for profile image upload validation."""

import base64

import pytest
from pydantic import ValidationError

from app.schemas import ProfileImageUpdate


def _make_data_url(mime_type: str, data: bytes) -> str:
    b64 = base64.b64encode(data).decode()
    return f"data:{mime_type};base64,{b64}"


# Minimal valid image headers for testing format detection
TINY_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
TINY_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
TINY_WEBP = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"\x00" * 100
TINY_GIF = b"GIF89a" + b"\x00" * 100


class TestProfileImageValidation:
    def test_valid_png_accepted(self):
        url = _make_data_url("image/png", TINY_PNG)
        result = ProfileImageUpdate(profile_image=url)
        assert result.profile_image == url

    def test_valid_jpeg_accepted(self):
        url = _make_data_url("image/jpeg", TINY_JPEG)
        result = ProfileImageUpdate(profile_image=url)
        assert result.profile_image == url

    def test_valid_webp_accepted(self):
        url = _make_data_url("image/webp", TINY_WEBP)
        result = ProfileImageUpdate(profile_image=url)
        assert result.profile_image == url

    def test_valid_gif_accepted(self):
        url = _make_data_url("image/gif", TINY_GIF)
        result = ProfileImageUpdate(profile_image=url)
        assert result.profile_image == url

    def test_invalid_mime_type_rejected(self):
        url = _make_data_url("image/svg+xml", b"<svg></svg>")
        with pytest.raises(ValidationError) as exc_info:
            ProfileImageUpdate(profile_image=url)
        assert "not allowed" in str(exc_info.value)

    def test_non_image_mime_rejected(self):
        url = f"data:application/pdf;base64,{base64.b64encode(b'%PDF').decode()}"
        with pytest.raises(ValidationError) as exc_info:
            ProfileImageUpdate(profile_image=url)
        assert "must be a data URL" in str(exc_info.value)

    def test_raw_base64_without_data_url_rejected(self):
        b64 = base64.b64encode(TINY_PNG).decode()
        with pytest.raises(ValidationError) as exc_info:
            ProfileImageUpdate(profile_image=b64)
        assert "data URL" in str(exc_info.value)

    def test_plain_string_rejected(self):
        with pytest.raises(ValidationError):
            ProfileImageUpdate(profile_image="not-an-image")

    def test_empty_string_rejected(self):
        with pytest.raises(ValidationError):
            ProfileImageUpdate(profile_image="")

    def test_too_large_image_rejected(self):
        # 3 MB of data exceeds the 2 MB limit
        large_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * (3 * 1024 * 1024)
        url = _make_data_url("image/png", large_data)
        with pytest.raises(ValidationError) as exc_info:
            ProfileImageUpdate(profile_image=url)
        assert "too large" in str(exc_info.value)

    def test_just_under_limit_accepted(self):
        # Just under 2 MB should pass
        data = b"\x89PNG\r\n\x1a\n" + b"\x00" * (2 * 1024 * 1024 - 100)
        url = _make_data_url("image/png", data)
        result = ProfileImageUpdate(profile_image=url)
        assert result.profile_image == url

    def test_invalid_base64_rejected(self):
        url = "data:image/png;base64,!!!invalid!!!"
        with pytest.raises(ValidationError) as exc_info:
            ProfileImageUpdate(profile_image=url)
        assert "Invalid base64" in str(exc_info.value)
