"""Reminder and notification texts in the recipient's language.

Reminders are written by the server, so it phrases them in the language
the recipient chose (``UserNavOrder.ui_language``, set by the app and the
web app); English is the fallback. The action labels travel with web push,
where the service worker shows what it receives.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import UserNavOrder

# task_overdue, event_starts_at ({time}),
# action_done, action_snooze, birthday_tomorrow ({date}),
# capture_suggestion ({name}), meal_missing ({items}), action_shopping,
# praise_from ({name}), wish_request ({name}), gift_nothing_yet ({date}),
# duty_week_title, duty_week_body ({mine}, {total}), event_starts_on ({date}, {time})
_TEXTS: dict[str, tuple[str, ...]] = {
    "en": ("Task is overdue", "Starts at {time}", "Done", "Remind me in 1 hour", "Birthday tomorrow ({date})", "Suggestion from {name}", "Tomorrow · not on the list yet: {items}", "Add to list", "Praise from {name}", "{name} would like to redeem this", "Birthday in a week ({date}) · no gift yet", "Next week's duties", "For you: {mine} of {total}", "Starts {date} at {time}"),
    "de": ("Aufgabe ist überfällig", "Beginnt um {time}", "Erledigt", "In 1 Std. erinnern", "Morgen Geburtstag ({date})", "Vorschlag von {name}", "Morgen · fehlt noch auf der Liste: {items}", "Auf die Liste", "Lob von {name}", "{name} möchte das einlösen", "In einer Woche Geburtstag ({date}) · noch kein Geschenk", "Dienste nächste Woche", "Für dich: {mine} von {total}", "Beginnt am {date} um {time}"),
    "fr": ("Tâche en retard", "Commence à {time}", "Terminé", "Rappeler dans 1 h", "Anniversaire demain ({date})", "Suggestion de {name}", "Demain · pas encore sur la liste : {items}", "Ajouter à la liste", "Bravo de la part de {name}", "{name} aimerait l’échanger", "Anniversaire dans une semaine ({date}) · pas encore de cadeau", "Tâches de la semaine prochaine", "Pour toi : {mine} sur {total}", "Commence le {date} à {time}"),
    "es": ("Tarea atrasada", "Empieza a las {time}", "Hecho", "Recordar en 1 h", "Cumpleaños mañana ({date})", "Sugerencia de {name}", "Mañana · aún no está en la lista: {items}", "Añadir a la lista", "Un elogio de {name}", "{name} quiere canjearlo", "Cumpleaños en una semana ({date}) · aún no hay regalo", "Turnos de la próxima semana", "Para ti: {mine} de {total}", "Empieza el {date} a las {time}"),
    "it": ("Compito in ritardo", "Inizia alle {time}", "Fatto", "Ricorda tra 1 ora", "Compleanno domani ({date})", "Proposta di {name}", "Domani · non ancora nella lista: {items}", "Aggiungi alla lista", "Un complimento da {name}", "{name} vorrebbe riscattarlo", "Compleanno tra una settimana ({date}) · ancora nessun regalo", "Turni della prossima settimana", "Per te: {mine} su {total}", "Inizia il {date} alle {time}"),
    "nl": ("Taak is te laat", "Begint om {time}", "Klaar", "Herinner over 1 uur", "Morgen jarig ({date})", "Voorstel van {name}", "Morgen · nog niet op de lijst: {items}", "Op de lijst", "Een compliment van {name}", "{name} wil dit inwisselen", "Over een week jarig ({date}) · nog geen cadeau", "Weektaken volgende week", "Voor jou: {mine} van {total}", "Begint op {date} om {time}"),
    "pt": ("Tarefa em atraso", "Começa às {time}", "Feito", "Lembrar em 1 h", "Aniversário amanhã ({date})", "Sugestão de {name}", "Amanhã · ainda não está na lista: {items}", "Adicionar à lista", "Um elogio de {name}", "{name} quer resgatar isto", "Aniversário daqui a uma semana ({date}) · ainda sem presente", "Tarefas semanais da próxima semana", "Para si: {mine} de {total}", "Começa a {date} às {time}"),
    "pl": ("Zadanie jest zaległe", "Zaczyna się o {time}", "Gotowe", "Przypomnij za 1 godz.", "Jutro urodziny ({date})", "Propozycja od {name}", "Jutro · jeszcze nie ma na liście: {items}", "Dodaj do listy", "Pochwała od {name}", "{name} chce to wymienić", "Urodziny za tydzień ({date}) · jeszcze bez prezentu", "Dyżury w przyszłym tygodniu", "Dla ciebie: {mine} z {total}", "Zaczyna się {date} o {time}"),
    "sv": ("Uppgiften är försenad", "Börjar kl. {time}", "Klar", "Påminn om 1 timme", "Fyller år i morgon ({date})", "Förslag från {name}", "I morgon · inte på listan än: {items}", "Lägg på listan", "Beröm från {name}", "{name} vill lösa in det här", "Fyller år om en vecka ({date}) · ingen present än", "Nästa veckas sysslor", "För dig: {mine} av {total}", "Börjar {date} kl. {time}"),
    "da": ("Opgaven er forsinket", "Starter kl. {time}", "Færdig", "Påmind om 1 time", "Fødselsdag i morgen ({date})", "Forslag fra {name}", "I morgen · ikke på listen endnu: {items}", "Sæt på listen", "Ros fra {name}", "{name} vil gerne indløse det", "Fødselsdag om en uge ({date}) · ingen gave endnu", "Næste uges pligter", "Til dig: {mine} af {total}", "Starter {date} kl. {time}"),
    "nb": ("Oppgaven er forsinket", "Starter kl. {time}", "Ferdig", "Påminn om 1 time", "Bursdag i morgen ({date})", "Forslag fra {name}", "I morgen · ikke på listen ennå: {items}", "Legg på listen", "Ros fra {name}", "{name} vil løse inn dette", "Bursdag om en uke ({date}) · ingen gave ennå", "Neste ukes plikter", "Til deg: {mine} av {total}", "Starter {date} kl. {time}"),
    "fi": ("Tehtävä on myöhässä", "Alkaa klo {time}", "Valmis", "Muistuta tunnin päästä", "Syntymäpäivä huomenna ({date})", "Ehdotus: {name}", "Huomenna · ei vielä listalla: {items}", "Lisää listalle", "Kehu: {name}", "{name} haluaa lunastaa tämän", "Syntymäpäivä viikon päästä ({date}) · lahjaa ei vielä ole", "Ensi viikon viikkotehtävät", "Sinulle: {mine}/{total}", "Alkaa {date} klo {time}"),
    "cs": ("Úkol je po termínu", "Začíná v {time}", "Hotovo", "Připomenout za 1 h", "Zítra narozeniny ({date})", "Návrh od {name}", "Zítra · zatím není na seznamu: {items}", "Přidat na seznam", "Pochvala od {name}", "{name} si to chce vyměnit", "Za týden narozeniny ({date}) · zatím bez dárku", "Povinnosti na příští týden", "Pro tebe: {mine} z {total}", "Začíná {date} v {time}"),
    "sk": ("Úloha je po termíne", "Začína o {time}", "Hotovo", "Pripomenúť o 1 h", "Zajtra narodeniny ({date})", "Návrh od {name}", "Zajtra · ešte nie je na zozname: {items}", "Pridať na zoznam", "Pochvala od {name}", "{name} si to chce vymeniť", "O týždeň narodeniny ({date}) · zatiaľ bez darčeka", "Povinnosti na budúci týždeň", "Pre teba: {mine} z {total}", "Začína {date} o {time}"),
    "hu": ("A feladat lejárt", "Kezdés: {time}", "Kész", "Emlékeztess 1 óra múlva", "Holnap születésnap ({date})", "{name} javaslata", "Holnap · még nincs a listán: {items}", "Listára", "{name} megdicsért", "{name} szeretné beváltani", "Egy hét múlva születésnap ({date}) · még nincs ajándék", "Jövő heti teendők", "Neked: {mine} / {total}", "Kezdés: {date} {time}"),
    "ro": ("Sarcina este restantă", "Începe la {time}", "Gata", "Amintește-mi peste 1 oră", "Zi de naștere mâine ({date})", "Sugestie de la {name}", "Mâine · încă nu e pe listă: {items}", "Adaugă pe listă", "O laudă de la {name}", "{name} ar vrea să îl folosească", "Zi de naștere peste o săptămână ({date}) · încă niciun cadou", "Sarcinile de săptămâna viitoare", "Pentru tine: {mine} din {total}", "Începe pe {date} la {time}"),
    "el": ("Η εργασία έχει καθυστερήσει", "Ξεκινά στις {time}", "Έγινε", "Υπενθύμιση σε 1 ώρα", "Γενέθλια αύριο ({date})", "Πρόταση από {name}", "Αύριο · δεν είναι ακόμα στη λίστα: {items}", "Στη λίστα", "Έπαινος από {name}", "{name}: αίτημα εξαργύρωσης", "Γενέθλια σε μία εβδομάδα ({date}) · δεν υπάρχει ακόμα δώρο", "Υποχρεώσεις της επόμενης εβδομάδας", "Για εσάς: {mine} από {total}", "Ξεκινά {date} στις {time}"),
    "bg": ("Задачата е просрочена", "Започва в {time}", "Готово", "Напомни след 1 час", "Рожден ден утре ({date})", "Предложение от {name}", "Утре · още не е в списъка: {items}", "Добави в списъка", "Похвала от {name}", "{name} иска да го осребри", "Рожден ден след седмица ({date}) · още няма подарък", "Задължения за следващата седмица", "За вас: {mine} от {total}", "Започва на {date} в {time}"),
    "hr": ("Zadatak kasni", "Počinje u {time}", "Gotovo", "Podsjeti za 1 sat", "Sutra rođendan ({date})", "Prijedlog od {name}", "Sutra · još nije na popisu: {items}", "Dodaj na popis", "Pohvala od {name}", "{name} želi ovo zamijeniti", "Rođendan za tjedan dana ({date}) · još nema poklona", "Obveze idući tjedan", "Za vas: {mine} od {total}", "Počinje {date} u {time}"),
    "sl": ("Opravilo je zapadlo", "Začne se ob {time}", "Opravljeno", "Opomni čez 1 uro", "Jutri rojstni dan ({date})", "Predlog od {name}", "Jutri · še ni na seznamu: {items}", "Dodaj na seznam", "Pohvala od {name}", "{name} želi to unovčiti", "Rojstni dan čez teden dni ({date}) · darila še ni", "Obveznosti naslednji teden", "Za vas: {mine} od {total}", "Začne se {date} ob {time}"),
    "lt": ("Užduotis vėluoja", "Prasideda {time}", "Atlikta", "Priminti po 1 val.", "Rytoj gimtadienis ({date})", "{name} pasiūlymas", "Rytoj · dar nėra sąraše: {items}", "Į sąrašą", "{name} pagyrimas", "{name} nori tai išsikeisti", "Gimtadienis po savaitės ({date}) · dovanos dar nėra", "Kitos savaitės pareigos", "Jums: {mine} iš {total}", "Prasideda {date} {time}"),
    "lv": ("Uzdevums ir nokavēts", "Sākas plkst. {time}", "Gatavs", "Atgādināt pēc 1 stundas", "Rīt dzimšanas diena ({date})", "{name} ieteikums", "Rīt · vēl nav sarakstā: {items}", "Pievienot sarakstam", "{name} uzslava", "{name} vēlas to izmantot", "Dzimšanas diena pēc nedēļas ({date}) · dāvanas vēl nav", "Nākamās nedēļas pienākumi", "Jums: {mine} no {total}", "Sākas {date} plkst. {time}"),
    "et": ("Ülesanne on hilinenud", "Algab kell {time}", "Tehtud", "Tuleta 1 tunni pärast meelde", "Homme sünnipäev ({date})", "{name} ettepanek", "Homme · veel nimekirjas pole: {items}", "Lisa nimekirja", "{name} kiitus", "{name} soovib selle lunastada", "Sünnipäev nädala pärast ({date}) · kinki veel pole", "Järgmise nädala kohustused", "Sulle: {mine}/{total}", "Algab {date} kell {time}"),
    "ga": ("Tá an tasc thar téarma", "Tosaíonn ag {time}", "Déanta", "Meabhraigh i gceann uair an chloig", "Breithlá amárach ({date})", "Moladh ó {name}", "Amárach · níl ar an liosta fós: {items}", "Cuir ar an liosta", "Focal molta ó {name}", "Ba mhaith le {name} é seo a fháil", "Breithlá i gceann seachtaine ({date}) · gan bronntanas fós", "Dualgais na seachtaine seo chugainn", "Duitse: {mine} as {total}", "Tosaíonn ar {date} ag {time}"),
}

_KEYS = (
    "task_overdue", "event_starts_at", "action_done", "action_snooze",
    "birthday_tomorrow", "capture_suggestion", "meal_missing", "action_shopping",
    "praise_from", "wish_request", "gift_nothing_yet", "duty_week_title", "duty_week_body",
    "event_starts_on",
)


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


def clock_time(value, time_format: str = "24h") -> str:
    """"17:05" or, with the 12-hour setting, "5:05 PM"."""
    if time_format == "12h":
        hour = value.hour % 12 or 12
        return f"{hour}:{value.minute:02d} {'AM' if value.hour < 12 else 'PM'}"
    return f"{value.hour:02d}:{value.minute:02d}"


def event_start_text(language: str, starts_at, today, time_format: str = "24h") -> str:
    """When an event starts, as a wall-clock time that stays true.

    A countdown ("Starts in 30 minutes") is wrong as soon as the reminder
    is read later, so reminders name the time, and the date when the event
    is not today.
    """
    time = clock_time(starts_at, time_format)
    if starts_at.date() == today:
        return reminder_text(language, "event_starts_at", time=time)
    return reminder_text(language, "event_starts_on", date=short_date(language, starts_at), time=time)
