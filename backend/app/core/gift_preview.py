"""What a product link shows: its name, a picture and the price.

Paste a link to a gift, and Tribu reads the shop's page on the server with
the recipe import's egress rules (http/https only, private networks
checked, size and time limits). Shops describe products for link previews
(Open Graph ``og:title``/``og:image``, ``product:price:amount``) and for
search engines (schema.org ``Product`` with ``offers``). The picture is
fetched once and kept as a small WebP data URL, so viewing the gift list
never calls the shop.
"""

from __future__ import annotations

import base64
import html
import json
import re
import urllib.parse
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser

from app.core.avatars import normalize_photo
from app.core.recipe_import import RecipeImportError, _JsonLdCollector, fetch_bytes, fetch_page

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_PX = 320
MAX_TITLE = 200


@dataclass
class GiftPreview:
    title: str | None = None
    image: str | None = None
    price_cents: int | None = None
    currency: str | None = None
    site: str | None = None


class _MetaCollector(HTMLParser):
    """``<meta>`` tags by property/name/itemprop, and the ``<title>``."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta":
            key = (values.get("property") or values.get("name") or values.get("itemprop") or "").strip().lower()
            content = values.get("content")
            if key and content and key not in self.meta:
                self.meta[key] = content.strip()
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def parse_price(raw) -> int | None:
    """Cents from "29,99", "29.99", "1.299,00 €" or 29.99."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        value = Decimal(str(raw))
    else:
        text = re.sub(r"[^\d,.\-]", "", str(raw))
        if not re.search(r"\d", text):
            return None
        if "," in text and "." in text:
            # The later separator is the decimal one.
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            head, _, tail = text.rpartition(",")
            text = f"{head.replace(',', '')}.{tail}" if len(tail) in (1, 2) else text.replace(",", "")
        elif re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
            text = text.replace(".", "")  # "1.299" is a thousand, not one euro
        try:
            value = Decimal(text)
        except InvalidOperation:
            return None
    if value < 0:
        return None
    return int((value * 100).quantize(Decimal("1")))


def _is_product(node) -> bool:
    kind = node.get("@type") if isinstance(node, dict) else None
    kinds = kind if isinstance(kind, list) else [kind]
    return any(isinstance(value, str) and value.split("/")[-1].lower() in ("product", "productgroup") for value in kinds)


def _find_product(node, depth: int = 0):
    if depth > 6:
        return None
    if isinstance(node, list):
        for item in node:
            found = _find_product(item, depth + 1)
            if found is not None:
                return found
        return None
    if not isinstance(node, dict):
        return None
    if _is_product(node):
        return node
    # Not into item lists: a shop's front page lists many products.
    for key in ("@graph", "mainEntity", "hasVariant"):
        if key in node:
            found = _find_product(node[key], depth + 1)
            if found is not None:
                return found
    return None


def _offer_price(offers) -> tuple[int | None, str | None]:
    if isinstance(offers, list):
        for offer in offers:
            price, currency = _offer_price(offer)
            if price is not None:
                return price, currency
        return None, None
    if not isinstance(offers, dict):
        return None, None
    for key in ("price", "lowPrice"):
        price = parse_price(offers.get(key))
        if price is not None:
            return price, (offers.get("priceCurrency") or None)
    spec = offers.get("priceSpecification")
    if spec is not None:
        return _offer_price(spec)
    return None, None


def _image_url(value) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for item in value:
            found = _image_url(item)
            if found:
                return found
    if isinstance(value, dict):
        return _image_url(value.get("url") or value.get("contentUrl"))
    return None


def parse_product_html(page: str, url: str) -> GiftPreview:
    """Name, picture link, price and shop from a product page (no fetching)."""
    meta = _MetaCollector()
    blocks = _JsonLdCollector()
    try:
        meta.feed(page)
        blocks.feed(page)
    except Exception:  # noqa: BLE001 - broken markup still yields what was read
        pass
    product = None
    for block in blocks.blocks:
        try:
            product = _find_product(json.loads(block))
        except (ValueError, TypeError):
            continue
        if product is not None:
            break
    m = meta.meta
    title = m.get("og:title") or m.get("twitter:title") or (product or {}).get("name") or meta.title
    image = m.get("og:image") or m.get("og:image:url") or m.get("twitter:image") or _image_url((product or {}).get("image"))
    price, currency = _offer_price((product or {}).get("offers")) if product else (None, None)
    if price is None:
        # A page's first itemprop price is only the product's on a product page.
        keys = ["product:price:amount", "og:price:amount"]
        if "product" in (m.get("og:type") or "").lower():
            keys.append("price")
        for key in keys:
            price = parse_price(m.get(key))
            if price is not None:
                currency = m.get("product:price:currency") or m.get("og:price:currency") or m.get("pricecurrency")
                break
    site = m.get("og:site_name") or urllib.parse.urlparse(url).hostname
    clean = re.sub(r"\s+", " ", html.unescape(title or "")).strip()[:MAX_TITLE] or None
    return GiftPreview(
        title=clean,
        image=urllib.parse.urljoin(url, image) if image else None,
        price_cents=price,
        currency=(currency or "").strip().upper()[:3] or None,
        site=site,
    )


def fetch_image(url: str) -> str | None:
    """A product picture as a small WebP data URL, or None."""
    try:
        content_type, body = fetch_bytes(url, accept="image/*", max_bytes=MAX_IMAGE_BYTES)
    except RecipeImportError:
        return None
    kind = (content_type.split(";")[0].strip().lower() or "image/jpeg")
    if not kind.startswith("image/") or kind == "image/svg+xml":
        return None
    try:
        return normalize_photo(f"data:{kind};base64,{base64.b64encode(body).decode()}", max_px=IMAGE_PX)
    except Exception:  # noqa: BLE001 - an unreadable picture just means no picture
        return None


def preview_link(url: str) -> GiftPreview:
    """Read a product link. Raises ``RecipeImportError`` when the page cannot
    be loaded; a page without product data still gives its title."""
    page = fetch_page(url)
    preview = parse_product_html(page, url)
    if preview.image:
        preview.image = fetch_image(preview.image)
    return preview
