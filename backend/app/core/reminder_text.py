"""Reminder texts in the recipient's language.

Reminders are written by the server, so it phrases them in the language
the recipient chose (``UserNavOrder.ui_language``, set by the app and the
web app); English is the fallback. The action labels travel with web push,
where the service worker shows what it receives.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import UserNavOrder

# task_overdue, event_starts_in ({minutes}), event_starts_at ({when}),
# action_done, action_snooze, birthday_tomorrow ({date})
_TEXTS: dict[str, tuple[str, str, str, str, str, str]] = {
    "en": ("Task is overdue", "Starts in {minutes} minutes", "Starts at {when}", "Done", "Remind me in 1 hour", "Birthday tomorrow ({date})"),
    "de": ("Aufgabe ist überfällig", "Beginnt in {minutes} Minuten", "Beginnt um {when}", "Erledigt", "In 1 Std. erinnern", "Morgen Geburtstag ({date})"),
    "fr": ("Tâche en retard", "Commence dans {minutes} minutes", "Commence à {when}", "Terminé", "Rappeler dans 1 h", "Anniversaire demain ({date})"),
    "es": ("Tarea atrasada", "Empieza en {minutes} minutos", "Empieza a las {when}", "Hecho", "Recordar en 1 h", "Cumpleaños mañana ({date})"),
    "it": ("Compito in ritardo", "Inizia tra {minutes} minuti", "Inizia alle {when}", "Fatto", "Ricorda tra 1 ora", "Compleanno domani ({date})"),
    "nl": ("Taak is te laat", "Begint over {minutes} minuten", "Begint om {when}", "Klaar", "Herinner over 1 uur", "Morgen jarig ({date})"),
    "pt": ("Tarefa em atraso", "Começa dentro de {minutes} minutos", "Começa às {when}", "Feito", "Lembrar em 1 h", "Aniversário amanhã ({date})"),
    "pl": ("Zadanie jest zaległe", "Zaczyna się za {minutes} min", "Zaczyna się o {when}", "Gotowe", "Przypomnij za 1 godz.", "Jutro urodziny ({date})"),
    "sv": ("Uppgiften är försenad", "Börjar om {minutes} minuter", "Börjar {when}", "Klar", "Påminn om 1 timme", "Fyller år i morgon ({date})"),
    "da": ("Opgaven er forsinket", "Starter om {minutes} minutter", "Starter kl. {when}", "Færdig", "Påmind om 1 time", "Fødselsdag i morgen ({date})"),
    "nb": ("Oppgaven er forsinket", "Starter om {minutes} minutter", "Starter kl. {when}", "Ferdig", "Påminn om 1 time", "Bursdag i morgen ({date})"),
    "fi": ("Tehtävä on myöhässä", "Alkaa {minutes} minuutin kuluttua", "Alkaa {when}", "Valmis", "Muistuta tunnin päästä", "Syntymäpäivä huomenna ({date})"),
    "cs": ("Úkol je po termínu", "Začíná za {minutes} min", "Začíná v {when}", "Hotovo", "Připomenout za 1 h", "Zítra narozeniny ({date})"),
    "sk": ("Úloha je po termíne", "Začína o {minutes} min", "Začína o {when}", "Hotovo", "Pripomenúť o 1 h", "Zajtra narodeniny ({date})"),
    "hu": ("A feladat lejárt", "{minutes} perc múlva kezdődik", "Kezdés: {when}", "Kész", "Emlékeztess 1 óra múlva", "Holnap születésnap ({date})"),
    "ro": ("Sarcina este restantă", "Începe în {minutes} minute", "Începe la {when}", "Gata", "Amintește-mi peste 1 oră", "Zi de naștere mâine ({date})"),
    "el": ("Η εργασία έχει καθυστερήσει", "Ξεκινά σε {minutes} λεπτά", "Ξεκινά στις {when}", "Έγινε", "Υπενθύμιση σε 1 ώρα", "Γενέθλια αύριο ({date})"),
    "bg": ("Задачата е просрочена", "Започва след {minutes} минути", "Започва в {when}", "Готово", "Напомни след 1 час", "Рожден ден утре ({date})"),
    "hr": ("Zadatak kasni", "Počinje za {minutes} minuta", "Počinje u {when}", "Gotovo", "Podsjeti za 1 sat", "Sutra rođendan ({date})"),
    "sl": ("Opravilo je zapadlo", "Začne se čez {minutes} minut", "Začne se ob {when}", "Opravljeno", "Opomni čez 1 uro", "Jutri rojstni dan ({date})"),
    "lt": ("Užduotis vėluoja", "Prasideda po {minutes} min.", "Prasideda {when}", "Atlikta", "Priminti po 1 val.", "Rytoj gimtadienis ({date})"),
    "lv": ("Uzdevums ir nokavēts", "Sākas pēc {minutes} minūtēm", "Sākas {when}", "Gatavs", "Atgādināt pēc 1 stundas", "Rīt dzimšanas diena ({date})"),
    "et": ("Ülesanne on hilinenud", "Algab {minutes} minuti pärast", "Algab {when}", "Tehtud", "Tuleta 1 tunni pärast meelde", "Homme sünnipäev ({date})"),
    "ga": ("Tá an tasc thar téarma", "Tosaíonn i gceann {minutes} nóiméad", "Tosaíonn ag {when}", "Déanta", "Meabhraigh i gceann uair an chloig", "Breithlá amárach ({date})"),
}

_KEYS = ("task_overdue", "event_starts_in", "event_starts_at", "action_done", "action_snooze", "birthday_tomorrow")


def user_language(db: Session, user_id: int) -> str:
    """The language the user chose in Tribu, or English."""
    row = db.query(UserNavOrder.ui_language).filter(UserNavOrder.user_id == user_id).first()
    language = row[0] if row else None
    return language if language in _TEXTS else "en"


def reminder_text(language: str, key: str, **values: object) -> str:
    """One reminder text in ``language`` (English when unknown)."""
    texts = _TEXTS.get(language, _TEXTS["en"])
    text = texts[_KEYS.index(key)]
    return text.format(**values) if values else text


def short_date(language: str, value) -> str:
    """"Oct 06" in English, "06.10." elsewhere."""
    return value.strftime("%b %d") if language == "en" else value.strftime("%d.%m.")
