"""Derived profile image sizes (app.core.avatars) and how the API serves them."""

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.avatars import LARGE_PX, SMALL_PX, AvatarError, build_avatar_variants, normalize_photo, try_build_avatar_variants
from app.main import app
from app.models import User
from tests.support import TestSession, add_member, auth


def _data_url(image: Image.Image, fmt: str = "PNG", **save) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **save)
    mime = {"PNG": "png", "JPEG": "jpeg", "GIF": "gif", "WEBP": "webp"}[fmt]
    return f"data:image/{mime};base64," + base64.b64encode(buffer.getvalue()).decode()


def _decode(data_url: str) -> Image.Image:
    assert data_url.startswith("data:image/webp;base64,")
    return Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1])))


class TestVariants:
    def test_builds_square_webp_sizes(self):
        variants = build_avatar_variants(_data_url(Image.new("RGB", (1200, 800), "#7c3aed")))
        small, large = _decode(variants.small), _decode(variants.large)
        assert small.format == "WEBP" and small.size == (SMALL_PX, SMALL_PX)
        assert large.size == (LARGE_PX, LARGE_PX)
        assert len(variants.small) < 20_000

    def test_crops_to_the_centre(self):
        image = Image.new("RGB", (300, 100), "black")
        image.paste(Image.new("RGB", (100, 100), "white"), (100, 0))
        small = _decode(build_avatar_variants(_data_url(image)).small).convert("RGB")
        assert small.getpixel((SMALL_PX // 2, SMALL_PX // 2))[0] > 200
        assert small.getpixel((2, SMALL_PX // 2))[0] > 200

    def test_follows_exif_orientation_and_drops_metadata(self):
        exif = Image.Exif()
        exif[0x0112] = 6  # rotate 90° clockwise on display
        exif[0x010F] = "Camera"
        image = Image.new("RGB", (400, 200), "black")
        image.paste(Image.new("RGB", (200, 200), "white"), (0, 0))  # left half white
        large = _decode(build_avatar_variants(_data_url(image, "JPEG", exif=exif.tobytes())).large)
        assert "exif" not in large.info
        # After rotating, the white left half is on top.
        rgb = large.convert("RGB")
        assert rgb.getpixel((LARGE_PX // 2, 10))[0] > 200
        assert rgb.getpixel((LARGE_PX // 2, LARGE_PX - 10))[0] < 60

    def test_keeps_transparency(self):
        variants = build_avatar_variants(_data_url(Image.new("RGBA", (64, 64), (255, 0, 0, 0))))
        assert _decode(variants.small).mode == "RGBA"

    def test_uses_the_first_frame_of_animations(self):
        frames = [Image.new("RGB", (50, 50), color) for color in ("red", "blue")]
        buffer = io.BytesIO()
        frames[0].save(buffer, format="GIF", save_all=True, append_images=frames[1:])
        url = "data:image/gif;base64," + base64.b64encode(buffer.getvalue()).decode()
        small = _decode(build_avatar_variants(url).small).convert("RGB")
        assert small.getpixel((10, 10))[0] > 200

    @pytest.mark.parametrize("url", [
        "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100).decode(),
        "data:image/png;base64,not base64!",
        "not a data url",
    ])
    def test_rejects_unreadable_images(self, url):
        with pytest.raises(AvatarError):
            build_avatar_variants(url)
        assert try_build_avatar_variants(url) is None

    def test_stored_source_is_bounded_upright_and_without_metadata(self):
        exif = Image.Exif()
        exif[0x0112] = 6  # rotate 90° clockwise on display
        exif[0x8825] = {2: (52.0, 31.0, 0.0)}  # GPS latitude
        source = _decode(build_avatar_variants(_data_url(Image.new("RGB", (3000, 2000), "red"), "JPEG", exif=exif.tobytes())).source)
        assert source.size == (683, 1024)
        assert "exif" not in source.info

    def test_small_images_are_not_enlarged(self):
        assert _decode(normalize_photo(_data_url(Image.new("RGB", (300, 120))))).size == (300, 120)

    def test_rejects_huge_dimensions(self):
        with pytest.raises(AvatarError):
            build_avatar_variants(_data_url(Image.new("1", (8000, 8000))))


client = TestClient(app)


@pytest.fixture()
def api(app_db):
    with TestSession() as db:
        admin = add_member(db, "admin@example.com", family_name="Avatar family", display_name="Admin")
        kid = add_member(db, "kid@example.com", family_id=admin.family_id, is_adult=False, display_name="Kid")
        db.commit()
    return admin.family_id, {"admin": (admin.token, admin.user_id), "kid": (kid.token, kid.user_id)}


def test_own_upload_serves_large_and_member_lists_serve_small(api):
    family_id, tokens = api
    admin_token, _ = tokens["admin"]
    upload = _data_url(Image.new("RGB", (900, 900), "#10b981"), "JPEG")

    resp = client.patch("/auth/me/profile-image", json={"profile_image": upload}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    me = client.get("/auth/me", headers=auth(admin_token)).json()
    assert _decode(me["profile_image"]).size == (LARGE_PX, LARGE_PX)
    members = client.get(f"/families/{family_id}/members", headers=auth(admin_token)).json()
    served = next(m["profile_image"] for m in members if m["display_name"] == "Admin")
    assert _decode(served).size == (SMALL_PX, SMALL_PX)
    # Only a bounded, metadata-free source is kept, and it is never served.
    db = TestSession()
    source = db.query(User).filter(User.email == "admin@example.com").one().profile_image
    db.close()
    assert source != upload and _decode(source).size == (900, 900)


def test_admin_sets_member_avatar_in_sizes(api):
    family_id, tokens = api
    admin_token, _ = tokens["admin"]
    _, kid_id = tokens["kid"]
    upload = _data_url(Image.new("RGB", (300, 300), "#f43f5e"))

    resp = client.patch(f"/families/{family_id}/members/{kid_id}/avatar", json={"profile_image": upload}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    members = client.get(f"/families/{family_id}/members", headers=auth(admin_token)).json()
    served = next(m["profile_image"] for m in members if m["display_name"] == "Kid")
    assert _decode(served).size == (SMALL_PX, SMALL_PX)


def test_unreadable_upload_is_rejected(api):
    _, tokens = api
    admin_token, _ = tokens["admin"]
    fake = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100).decode()

    resp = client.patch("/auth/me/profile-image", json={"profile_image": fake}, headers=auth(admin_token))

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "PROFILE_IMAGE_UNREADABLE"
