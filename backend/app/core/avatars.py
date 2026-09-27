"""Stored user images: profile image sizes and bounded, metadata-free sources.

Uploads are not kept as sent. Tribu stores a source of at most SOURCE_PX with
the EXIF orientation applied and no metadata (so no camera location), and
serves square WebP sizes derived from it: a small one for member lists,
timetables and the shared display, a larger one for the person's own profile.
Shopping product photos get the same bounded, metadata-free treatment.
"""

import base64
import io
import re
from typing import NamedTuple, Optional

from PIL import Image, ImageOps, UnidentifiedImageError

SMALL_PX = 192  # lists, header, timetables, shared display (2x for ~96 CSS px)
LARGE_PX = 512  # own profile and editing previews
SOURCE_PX = 1024  # longest side of stored sources and product photos
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
    source: str


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


def _webp(image: Image.Image) -> str:
    buffer = io.BytesIO()
    # No EXIF or other metadata is written, so camera location data is dropped.
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=6)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _encode(image: Image.Image, size: int) -> str:
    return _webp(ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS))


def _bounded(image: Image.Image, max_px: int) -> str:
    bounded = image.copy()
    bounded.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
    return _webp(bounded)


def normalize_photo(data_url: str, max_px: int = SOURCE_PX) -> str:
    """A photo as WebP of at most max_px on its longest side, upright and without metadata."""
    return _bounded(_open(data_url), max_px)


def build_avatar_variants(data_url: str) -> AvatarVariants:
    """Small and large WebP avatars for an uploaded image data URL."""
    image = _open(data_url)
    return AvatarVariants(small=_encode(image, SMALL_PX), large=_encode(image, LARGE_PX), source=_bounded(image, SOURCE_PX))


def set_profile_image(user, data_url: str) -> None:
    """Store an upload's bounded source on a user together with its sizes."""
    variants = build_avatar_variants(data_url)
    user.profile_image = variants.source
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
