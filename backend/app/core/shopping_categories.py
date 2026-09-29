"""The built-in shopping categories and their names in every language.

Built-in categories keep their original German label as the stored value, so
older clients still show a sensible name. Every client translates them for
display, and any translation a client sends (the app used to store the label
of its own language) is folded back into the stored value, so a family's
categories do not grow once per language (discussion #512).
"""

from __future__ import annotations

# Stored value of each built-in category, in shop order.
BUILTIN_CATEGORIES: dict[str, str] = {
    "produce": "Obst & Gemüse",
    "chilled": "Kühlregal",
    "bakery": "Bäckerei",
    "pantry": "Vorrat",
    "drinks": "Getränke",
    "meat": "Fleisch & Fisch",
    "frozen": "Tiefkühl",
    "household": "Haushalt",
    "other": "Sonstiges",
}

# The names of the built-in categories in the 24 languages of the web app,
# in the order of BUILTIN_CATEGORIES (frontend/i18n, module.shopping.category.*).
_TRANSLATIONS: dict[str, tuple[str, ...]] = {
    "bg": ("Плодове и зеленчуци", "Охладени", "Пекарна", "Килер", "Напитки", "Месо и риба", "Замразени", "Домакинство", "Други"),
    "cs": ("Ovoce a zelenina", "Chlazené", "Pečivo", "Trvanlivé", "Nápoje", "Maso a ryby", "Mražené", "Domácnost", "Ostatní"),
    "da": ("Frugt & grønt", "Køl", "Bageri", "Kolonial", "Drikkevarer", "Kød & fisk", "Frost", "Husholdning", "Andet"),
    "de": ("Obst & Gemüse", "Kühlregal", "Bäckerei", "Vorrat", "Getränke", "Fleisch & Fisch", "Tiefkühl", "Haushalt", "Sonstiges"),
    "el": ("Φρούτα & λαχανικά", "Ψυγείο", "Φούρνος", "Ντουλάπι", "Ποτά", "Κρέας & ψάρι", "Κατεψυγμένα", "Νοικοκυριό", "Άλλα"),
    "en": ("Fruit & vegetables", "Chilled", "Bakery", "Pantry", "Drinks", "Meat & fish", "Frozen", "Household", "Other"),
    "es": ("Frutas y verduras", "Refrigerados", "Panadería", "Despensa", "Bebidas", "Carne y pescado", "Congelados", "Hogar", "Otros"),
    "et": ("Puu- ja köögivili", "Jahutatud", "Pagar", "Sahver", "Joogid", "Liha ja kala", "Külmutatud", "Majapidamine", "Muu"),
    "fi": ("Hedelmät ja vihannekset", "Kylmätuotteet", "Leipomo", "Kuivatuotteet", "Juomat", "Liha ja kala", "Pakasteet", "Kodintarvikkeet", "Muut"),
    "fr": ("Fruits & légumes", "Frais", "Boulangerie", "Épicerie", "Boissons", "Viande & poisson", "Surgelés", "Maison", "Autre"),
    "ga": ("Torthaí & glasraí", "Fuaraithe", "Bácús", "Cófra", "Deochanna", "Feoil & iasc", "Reoite", "Teaghlach", "Eile"),
    "hr": ("Voće i povrće", "Hlađeno", "Pekara", "Smočnica", "Pića", "Meso i riba", "Smrznuto", "Kućanstvo", "Ostalo"),
    "hu": ("Zöldség és gyümölcs", "Hűtött áru", "Pékáru", "Kamra", "Italok", "Hús és hal", "Fagyasztott", "Háztartás", "Egyéb"),
    "it": ("Frutta e verdura", "Banco frigo", "Panetteria", "Dispensa", "Bevande", "Carne e pesce", "Surgelati", "Casa", "Altro"),
    "lt": ("Vaisiai ir daržovės", "Atšaldyti", "Kepykla", "Sandėliukas", "Gėrimai", "Mėsa ir žuvis", "Šaldyti", "Buitis", "Kita"),
    "lv": ("Augļi un dārzeņi", "Atdzesēti", "Maiznīca", "Pieliekamais", "Dzērieni", "Gaļa un zivis", "Saldēti", "Saimniecība", "Cits"),
    "nb": ("Frukt og grønt", "Kjøl", "Bakeri", "Tørrvarer", "Drikke", "Kjøtt og fisk", "Frys", "Husholdning", "Annet"),
    "nl": ("Groente & fruit", "Koeling", "Bakkerij", "Voorraad", "Dranken", "Vlees & vis", "Diepvries", "Huishouden", "Overig"),
    "pl": ("Owoce i warzywa", "Nabiał i chłodnia", "Piekarnia", "Spiżarnia", "Napoje", "Mięso i ryby", "Mrożonki", "Dom", "Inne"),
    "pt": ("Fruta e legumes", "Refrigerados", "Padaria", "Despensa", "Bebidas", "Carne e peixe", "Congelados", "Casa", "Outros"),
    "ro": ("Fructe și legume", "Refrigerate", "Brutărie", "Cămară", "Băuturi", "Carne și pește", "Congelate", "Casă", "Altele"),
    "sk": ("Ovocie a zelenina", "Chladené", "Pečivo", "Trvanlivé", "Nápoje", "Mäso a ryby", "Mrazené", "Domácnosť", "Ostatné"),
    "sl": ("Sadje in zelenjava", "Hlajeno", "Pekarna", "Shramba", "Pijače", "Meso in ribe", "Zamrznjeno", "Gospodinjstvo", "Drugo"),
    "sv": ("Frukt & grönt", "Kylvaror", "Bageri", "Skafferi", "Drycker", "Kött & fisk", "Frysvaror", "Hushåll", "Övrigt"),
}


def _fold(value: str) -> str:
    return value.strip().casefold()


_ALIASES: dict[str, str] = {}
for _names in _TRANSLATIONS.values():
    for _key, _name in zip(BUILTIN_CATEGORIES, _names):
        _ALIASES.setdefault(_fold(_name), _key)


def builtin_category_key(value: str | None) -> str | None:
    """The built-in category a name stands for in any language, if any."""
    if not value or not value.strip():
        return None
    return _ALIASES.get(_fold(value))


def stored_category(value: str) -> str:
    """The stored value for a category name: built-ins in any language
    become their stored label, everything else stays as typed."""
    key = builtin_category_key(value)
    return BUILTIN_CATEGORIES[key] if key else value
