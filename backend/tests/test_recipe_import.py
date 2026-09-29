"""Reading recipes from web pages (discussion #511)."""

import json

import pytest

from app.core import recipe_import
from app.core.recipe_import import RecipeImportError, fetch_page, parse_ingredient, parse_recipe_html


def _page(data) -> str:
    return f'<html><head><script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script></head><body>Hi</body></html>'


def test_reads_a_recipe_from_graph_data_with_sections_and_html():
    page = _page({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebSite", "name": "Kochseite"},
            {
                "@type": ["Recipe"],
                "name": "Käsespätzle &amp; Zwiebeln",
                "description": "<p>Schnell und <b>lecker</b>.</p>",
                "recipeYield": ["4", "4 Portionen"],
                "recipeCategory": "Hauptspeise",
                "keywords": "vegetarisch, schnell, Hauptspeise",
                "recipeIngredient": ["500 g Mehl", "1/2 TL Salz", "2-3 Zehen Knoblauch", "1 ½ Tassen Milch", "Pfeffer", "4 Eier"],
                "recipeInstructions": [
                    {"@type": "HowToSection", "name": "Teig", "itemListElement": [
                        {"@type": "HowToStep", "text": "Mehl, Eier und Salz verrühren."},
                        {"@type": "HowToStep", "text": "Teig 10 Minuten ruhen lassen."},
                    ]},
                    {"@type": "HowToStep", "text": "Spätzle ins kochende Wasser schaben."},
                ],
            },
        ],
    })
    draft = parse_recipe_html(page)
    assert draft.title == "Käsespätzle & Zwiebeln"
    assert draft.description == "Schnell und lecker."
    assert draft.servings == 4
    assert draft.tags == ["Hauptspeise", "vegetarisch", "schnell"]
    assert draft.ingredients == [
        {"name": "Mehl", "amount": 500.0, "unit": "g"},
        {"name": "Salz", "amount": 0.5, "unit": "TL"},
        {"name": "Knoblauch", "amount": 2.0, "unit": "Zehen"},
        {"name": "Milch", "amount": 1.5, "unit": "Tassen"},
        {"name": "Pfeffer", "amount": None, "unit": None},
        {"name": "Eier", "amount": 4.0, "unit": None},
    ]
    assert draft.instructions == "Teig:\nMehl, Eier und Salz verrühren.\nTeig 10 Minuten ruhen lassen.\nSpätzle ins kochende Wasser schaben."


def test_reads_plain_text_instructions_and_a_single_recipe_object():
    draft = parse_recipe_html(_page({
        "@type": "Recipe",
        "name": "Pancakes",
        "recipeYield": 2,
        "recipeIngredient": ["2 cups flour", "1 tbsp. sugar"],
        "recipeInstructions": "Mix everything.<br>Fry in a pan.",
    }))
    assert draft.servings == 2
    assert draft.ingredients == [
        {"name": "flour", "amount": 2.0, "unit": "cups"},
        {"name": "sugar", "amount": 1.0, "unit": "tbsp"},
    ]
    assert draft.instructions == "Mix everything.\nFry in a pan."


def test_a_page_without_recipe_data_says_so():
    with pytest.raises(RecipeImportError) as error:
        parse_recipe_html(_page({"@type": "Article", "name": "News"}) + '<script type="application/ld+json">{broken</script>')
    assert error.value.code == "no_recipe"


def test_ingredient_lines_keep_names_that_start_like_units():
    assert parse_ingredient("Gurke") == {"name": "Gurke", "amount": None, "unit": None}
    assert parse_ingredient("250g Glasnudeln") == {"name": "Glasnudeln", "amount": 250.0, "unit": "g"}
    assert parse_ingredient("1 Glas Gurken") == {"name": "Gurken", "amount": 1.0, "unit": "Glas"}


def test_private_addresses_are_not_fetched(monkeypatch):
    monkeypatch.delenv("SUBSCRIPTIONS_ALLOW_PRIVATE_NETWORKS", raising=False)
    with pytest.raises(RecipeImportError) as error:
        fetch_page("http://127.0.0.1:8100/recipes")
    assert error.value.code == "not_allowed"
    with pytest.raises(RecipeImportError) as error:
        fetch_page("ftp://example.com/recipe")
    assert error.value.code == "invalid_url"


def test_redirects_are_followed_and_checked_again(monkeypatch):
    calls = []

    def fake_get(url, allow_private_networks):
        calls.append(url)
        if url == "https://example.com/r":
            return 301, {"location": "/recipe/1"}, b""
        return 200, {"content-type": "text/html; charset=iso-8859-1"}, _page({"@type": "Recipe", "name": "Knödel"}).encode("latin-1")

    monkeypatch.setattr(recipe_import, "_get", fake_get)
    assert "Knödel" in fetch_page("https://example.com/r")
    assert calls == ["https://example.com/r", "https://example.com/recipe/1"]

    def loop(url, allow_private_networks):
        return 302, {"location": url + "x"}, b""

    monkeypatch.setattr(recipe_import, "_get", loop)
    with pytest.raises(RecipeImportError):
        fetch_page("https://example.com/r")


def test_the_charset_comes_from_the_header_or_the_page():
    from app.core.recipe_import import _charset

    assert _charset("text/html; charset=ISO-8859-1", b"") == "ISO-8859-1"
    assert _charset("text/html", b'<html><meta charset="windows-1252">') == "windows-1252"
    assert _charset(None, b"<meta " * 2000) == "utf-8"
