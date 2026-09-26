"""Profile image sizes.

Uploads are kept as sent, but only derived sizes leave the server: square,
EXIF-free WebP images small enough to embed in member lists, timetables and
the shared display, and a larger one for the person's own profile.
"""

import base64
import io
import re
from typing import NamedTuple, Optional

from PIL import Image, ImageOps, UnidentifiedImageError

SMALL_PX = 192  # lists, header, timetables, shared display (2x for ~96 CSS px)
LARGE_PX = 512  # own profile and editing previews
WEBP_QUALITY = 82
# Avatars never need more; this also bounds decompression bombs well below
# Pillow's default limit.
MAX_SOURCE_PIXELS = 40_000_000

_DATA_URL_RE = re.compile(r"^data:image/[a-z0-9.+-]+;base64,(.+)$", re.IGNORECASE | re.DOTALL)


class AvatarError(ValueError):
    """The upload is not an image Tribu can read."""


class AvatarVariants(NamedTuple):
    small: str
    large: str


def _open(data_url: str) -> Image.Image:
    match = _DATA_URL_RE.match(data_url or "")
    if not match:
        raise AvatarError("not an image data URL")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > MAX_SOURCE_PIXELS:
            raise AvatarError("image dimensions too large")
        image.seek(0)  # first frame of animated images
        image.load()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        if isinstance(exc, AvatarError):
            raise
        raise AvatarError("image could not be read") from exc
    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    return image.convert("RGBA" if has_alpha else "RGB")


def _encode(image: Image.Image, size: int) -> str:
    square = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    # No EXIF or other metadata is written, so camera location data is dropped.
    square.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=6)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def build_avatar_variants(data_url: str) -> AvatarVariants:
    """Small and large WebP avatars for an uploaded image data URL."""
    image = _open(data_url)
    return AvatarVariants(small=_encode(image, SMALL_PX), large=_encode(image, LARGE_PX))


def set_profile_image(user, data_url: str) -> None:
    """Store an upload on a user together with its derived sizes."""
    variants = build_avatar_variants(data_url)
    user.profile_image = data_url
    user.profile_image_small = variants.small
    user.profile_image_large = variants.large


def try_build_avatar_variants(data_url: Optional[str]) -> Optional[AvatarVariants]:
    """Like build_avatar_variants, but None for missing or unreadable images."""
    if not data_url:
        return None
    try:
        return build_avatar_variants(data_url)
    except AvatarError:
        return None
