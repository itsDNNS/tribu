"""Read a recipe from a web page (discussion #511).

Most recipe sites describe their recipe as schema.org ``Recipe`` data in a
``<script type="application/ld+json">`` block. Tribu fetches the page on the
server (browsers may not read other sites), reads that block and turns it
into a draft the family checks before saving. Nothing is stored here.

The fetch reuses the calendar subscriptions' egress rules: http and https
only, every address checked against the private-network policy, a size cap
and a timeout. Redirects are followed a few times, each hop checked again.
"""

from __future__ import annotations

import html
import http.client
import json
import re
import socket
import ssl
import urllib.parse
from dataclasses import dataclass, field
from html.parser import HTMLParser

from app.core.calendar_subscriptions import (
    IcsSubscriptionError,
    _parse_subscription_url,
    _route_addrinfo,
    subscriptions_allow_private_networks,
)

MAX_PAGE_BYTES = 4 * 1024 * 1024
FETCH_TIMEOUT = 10.0
MAX_REDIRECTS = 4
# The longest text read from one schema.org value.
MAX_TEXT = 20000
USER_AGENT = "Mozilla/5.0 (compatible; Tribu recipe import; +https://github.com/itsDNNS/tribu)"


class RecipeImportError(Exception):
    """A short, user-safe reason the page could not be imported.

    ``code`` is one of ``invalid_url``, ``unreachable``, ``not_allowed``,
    ``too_large`` or ``no_recipe``.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class RecipeDraft:
    title: str
    description: str | None = None
    servings: int | None = None
    tags: list[str] = field(default_factory=list)
    ingredients: list[dict] = field(default_factory=list)
    instructions: str | None = None


# ── Fetching ──────────────────────────────────────────


def _charset_after(text: str) -> str | None:
    """The charset name after the first "charset=", read without a regex."""
    index = text.lower().find("charset=")
    if index == -1:
        return None
    name = []
    for char in text[index + len("charset="):index + 48].lstrip("\"' "):
        if not (char.isalnum() or char in "-_"):
            break
        name.append(char)
    return "".join(name) or None


def _charset(content_type: str | None, body: bytes) -> str:
    return _charset_after(content_type or "") or _charset_after(body[:4096].decode("ascii", "ignore")) or "utf-8"


def _get(url: str, allow_private_networks: bool) -> tuple[int, dict[str, str], bytes]:
    try:
        parsed = _parse_subscription_url(url)
        family, socktype, proto, sockaddr = _route_addrinfo(parsed, allow_private_networks=allow_private_networks)
    except IcsSubscriptionError as error:
        text = str(error)
        code = "not_allowed" if "not allowed" in text else "unreachable" if "resolved" in text else "invalid_url"
        raise RecipeImportError(code, "This address cannot be imported") from None
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = urllib.parse.urlunparse(("", "", parsed.path or "/", parsed.params, parsed.query, ""))
    headers = {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de,en;q=0.8",
        "User-Agent": USER_AGENT,
        "Host": f"{host}:{port}" if parsed.port else host,
    }
    sock = None
    conn = None
    try:
        sock = socket.socket(family, socktype, proto)
        sock.settimeout(FETCH_TIMEOUT)
        sock.connect(sockaddr)
        if parsed.scheme == "https":
            context = ssl.create_default_context()
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            sock = context.wrap_socket(sock, server_hostname=host)
            conn = http.client.HTTPSConnection(host, port=port, timeout=FETCH_TIMEOUT)
        else:
            conn = http.client.HTTPConnection(host, port=port, timeout=FETCH_TIMEOUT)
        conn.sock = sock
        sock = None
        conn.request("GET", path, headers=headers)
        resp = conn.getresponse()
        response_headers = {key.lower(): value for key, value in resp.getheaders()}
        body = b"" if 300 <= resp.status < 400 else resp.read(MAX_PAGE_BYTES + 1)
        if len(body) > MAX_PAGE_BYTES:
            raise RecipeImportError("too_large", "The page is too large to import")
        return resp.status, response_headers, body
    except RecipeImportError:
        raise
    except (TimeoutError, OSError, http.client.HTTPException, ssl.SSLError):
        raise RecipeImportError("unreachable", "The page could not be loaded") from None
    finally:
        if conn is not None:
            conn.close()
        if sock is not None:
            sock.close()


def fetch_page(url: str, *, allow_private_networks: bool | None = None) -> str:
    """The page's HTML, following a few redirects that are each checked again."""
    if allow_private_networks is None:
        allow_private_networks = subscriptions_allow_private_networks()
    current = url.strip()
    for _ in range(MAX_REDIRECTS + 1):
        status, headers, body = _get(current, allow_private_networks)
        if 300 <= status < 400 and headers.get("location"):
            current = urllib.parse.urljoin(current, headers["location"])
            continue
        if status >= 400:
            raise RecipeImportError("unreachable", "The page could not be loaded")
        charset = _charset(headers.get("content-type"), body)
        try:
            return body.decode(charset, errors="replace")
        except LookupError:
            return body.decode("utf-8", errors="replace")
    raise RecipeImportError("unreachable", "The page redirects too often")


# ── Reading schema.org Recipe data ────────────────────


class _JsonLdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._inside = False
        self._parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and (dict(attrs).get("type") or "").strip().lower() == "application/ld+json":
            self._inside = True
            self._parts = []

    def handle_endtag(self, tag):
        if tag == "script" and self._inside:
            self.blocks.append("".join(self._parts))
            self._inside = False

    def handle_data(self, data):
        if self._inside:
            self._parts.append(data)


def _is_recipe(node) -> bool:
    kind = node.get("@type") if isinstance(node, dict) else None
    kinds = kind if isinstance(kind, list) else [kind]
    return any(isinstance(value, str) and value.split("/")[-1].lower() == "recipe" for value in kinds)


def _find_recipe(node):
    if isinstance(node, list):
        for item in node:
            found = _find_recipe(item)
            if found is not None:
                return found
        return None
    if not isinstance(node, dict):
        return None
    if _is_recipe(node):
        return node
    for key in ("@graph", "mainEntity", "itemListElement"):
        if key in node:
            found = _find_recipe(node[key])
            if found is not None:
                return found
    return None


def _text(value) -> str:
    """Plain text from schema.org values, which may carry HTML and entities."""
    if isinstance(value, dict):
        value = value.get("text") or value.get("name") or ""
    if isinstance(value, list):
        value = " ".join(_text(item) for item in value)
    # Block tags separate words; inline tags (<b>, <a>) do not. Values are
    # capped first so a hostile page cannot make the tag patterns crawl.
    text = re.sub(r"</?(?:p|br|div|li|ul|ol|h\d)\b[^>]*>", " ", str(value or "")[:MAX_TEXT], flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _servings(value) -> int | None:
    values = value if isinstance(value, list) else [value]
    for item in values:
        if isinstance(item, (int, float)) and 0 < item < 1000:
            return int(item)
        match = re.search(r"\d+", str(item or ""))
        if match and 0 < int(match.group()) < 1000:
            return int(match.group())
    return None


def _tags(recipe: dict) -> list[str]:
    tags: list[str] = []
    for key in ("recipeCategory", "recipeCuisine", "keywords"):
        value = recipe.get(key)
        items = value if isinstance(value, list) else str(value or "").split(",")
        for item in items:
            tag = _text(item)
            if tag and len(tag) <= 40 and tag.lower() not in {existing.lower() for existing in tags}:
                tags.append(tag)
    # Category and cuisine first; sites add many keywords, a few are enough.
    return tags[:6]


def _steps(value, depth: int = 0) -> list[str]:
    """Instructions as lines: HowToSteps, sections with their name, or text."""
    if depth > 4 or value is None:
        return []
    if isinstance(value, str):
        text = html.unescape(re.sub(r"<br\s*/?>|</p>|</li>", "\n", value[:MAX_TEXT * 5], flags=re.I))
        lines = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", line)).strip() for line in text.splitlines()]
        return [line for line in lines if line]
    if isinstance(value, list):
        return [line for item in value for line in _steps(item, depth + 1)]
    if isinstance(value, dict):
        if "itemListElement" in value:
            name = _text(value.get("name"))
            return ([f"{name}:"] if name else []) + _steps(value["itemListElement"], depth + 1)
        line = _text(value.get("text") or value.get("name"))
        return [line] if line else []
    return []


_FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125}
_UNITS = [
    "kg", "g", "mg", "l", "ml", "cl", "dl", "el", "tl", "msp", "prise", "prisen", "stück", "stk", "stck", "st",
    "dose", "dosen", "bund", "zehe", "zehen", "pck", "päckchen", "packung", "packungen", "becher", "tasse", "tassen",
    "scheibe", "scheiben", "glas", "gläser", "handvoll", "cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons",
    "teaspoon", "teaspoons", "oz", "lb", "lbs", "pinch", "clove", "cloves", "can", "cans", "slice", "slices",
]
_AMOUNT = r"(?:\d+(?:[.,]\d+)?(?:\s*/\s*\d+)?|[½¼¾⅓⅔⅛])(?:\s*[½¼¾⅓⅔⅛])?"
_INGREDIENT_RE = re.compile(
    rf"^\s*(?P<amount>{_AMOUNT})(?:\s*[-–]\s*{_AMOUNT})?\s*(?P<unit>(?:{'|'.join(_UNITS)})\.?(?=\s|$))?\s*(?P<name>.+)$",
    re.I,
)


def _number(raw: str) -> float | None:
    total = 0.0
    for part in re.findall(r"\d+(?:[.,]\d+)?(?:\s*/\s*\d+)?|[½¼¾⅓⅔⅛]", raw):
        if part in _FRACTIONS:
            total += _FRACTIONS[part]
        elif "/" in part:
            top, bottom = (float(piece) for piece in part.replace(" ", "").split("/"))
            total += top / bottom if bottom else 0
        else:
            total += float(part.replace(",", "."))
    return round(total, 3) if total > 0 else None


def parse_ingredient(line: str) -> dict | None:
    """"500 g Mehl" becomes Mehl with 500 and g; a bare name stays a name."""
    text = _text(line)
    if not text:
        return None
    match = _INGREDIENT_RE.match(text)
    if not match:
        return {"name": text[:120], "amount": None, "unit": None}
    name = match.group("name").strip(" ,")
    if not name:
        return {"name": text[:120], "amount": None, "unit": None}
    unit = (match.group("unit") or "").rstrip(".") or None
    return {"name": name[:120], "amount": _number(match.group("amount")), "unit": unit[:20] if unit else None}


def parse_recipe_html(page: str) -> RecipeDraft:
    collector = _JsonLdCollector()
    collector.feed(page)
    for block in collector.blocks:
        try:
            data = json.loads(block.strip())
        except ValueError:
            try:
                data = json.loads(html.unescape(block.strip()))
            except ValueError:
                continue
        recipe = _find_recipe(data)
        if recipe is None:
            continue
        title = _text(recipe.get("name"))[:200]
        if not title:
            continue
        ingredients = [
            parsed
            for parsed in (parse_ingredient(line) for line in (recipe.get("recipeIngredient") or recipe.get("ingredients") or []))
            if parsed
        ][:100]
        steps = _steps(recipe.get("recipeInstructions"))
        description = _text(recipe.get("description"))[:2000] or None
        return RecipeDraft(
            title=title,
            description=description,
            servings=_servings(recipe.get("recipeYield")),
            tags=_tags(recipe),
            ingredients=ingredients,
            instructions="\n".join(steps)[:20000] or None,
        )
    raise RecipeImportError("no_recipe", "No recipe found on this page")


def import_recipe(url: str) -> RecipeDraft:
    return parse_recipe_html(fetch_page(url))
