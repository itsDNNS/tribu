"""Reminder and notification texts in the recipient's language.

Reminders are written by the server, so it phrases them in the language
the recipient chose (``UserNavOrder.ui_language``, set by the app and the
web app); English is the fallback. The action labels travel with web push,
where the service worker shows what it receives.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import UserNavOrder

# task_overdue, event_starts_in ({minutes}), event_starts_at ({when}),
# action_done, action_snooze, birthday_tomorrow ({date}),
# capture_suggestion ({name}), meal_missing ({items}), action_shopping,
# praise_from ({name}), wish_request ({name}), gift_nothing_yet ({date})
_TEXTS: dict[str, tuple[str, ...]] = {
    "en": ("Task is overdue", "Starts in {minutes} minutes", "Starts at {when}", "Done", "Remind me in 1 hour", "Birthday tomorrow ({date})", "Suggestion from {name}", "Tomorrow · not on the list yet: {items}", "Add to list", "Praise from {name}", "{name} would like to redeem this", "Birthday in a week ({date}) · no gift yet"),
    "de": ("Aufgabe ist überfällig", "Beginnt in {minutes} Minuten", "Beginnt um {when}", "Erledigt", "In 1 Std. erinnern", "Morgen Geburtstag ({date})", "Vorschlag von {name}", "Morgen · fehlt noch auf der Liste: {items}", "Auf die Liste", "Lob von {name}", "{name} möchte das einlösen", "In einer Woche Geburtstag ({date}) · noch kein Geschenk"),
    "fr": ("Tâche en retard", "Commence dans {minutes} minutes", "Commence à {when}", "Terminé", "Rappeler dans 1 h", "Anniversaire demain ({date})", "Suggestion de {name}", "Demain · pas encore sur la liste : {items}", "Ajouter à la liste", "Bravo de la part de {name}", "{name} aimerait l’échanger", "Anniversaire dans une semaine ({date}) · pas encore de cadeau"),
    "es": ("Tarea atrasada", "Empieza en {minutes} minutos", "Empieza a las {when}", "Hecho", "Recordar en 1 h", "Cumpleaños mañana ({date})", "Sugerencia de {name}", "Mañana · aún no está en la lista: {items}", "Añadir a la lista", "Un elogio de {name}", "{name} quiere canjearlo", "Cumpleaños en una semana ({date}) · aún no hay regalo"),
    "it": ("Compito in ritardo", "Inizia tra {minutes} minuti", "Inizia alle {when}", "Fatto", "Ricorda tra 1 ora", "Compleanno domani ({date})", "Proposta di {name}", "Domani · non ancora nella lista: {items}", "Aggiungi alla lista", "Un complimento da {name}", "{name} vorrebbe riscattarlo", "Compleanno tra una settimana ({date}) · ancora nessun regalo"),
    "nl": ("Taak is te laat", "Begint over {minutes} minuten", "Begint om {when}", "Klaar", "Herinner over 1 uur", "Morgen jarig ({date})", "Voorstel van {name}", "Morgen · nog niet op de lijst: {items}", "Op de lijst", "Een compliment van {name}", "{name} wil dit inwisselen", "Over een week jarig ({date}) · nog geen cadeau"),
    "pt": ("Tarefa em atraso", "Começa dentro de {minutes} minutos", "Começa às {when}", "Feito", "Lembrar em 1 h", "Aniversário amanhã ({date})", "Sugestão de {name}", "Amanhã · ainda não está na lista: {items}", "Adicionar à lista", "Um elogio de {name}", "{name} quer resgatar isto", "Aniversário daqui a uma semana ({date}) · ainda sem presente"),
    "pl": ("Zadanie jest zaległe", "Zaczyna się za {minutes} min", "Zaczyna się o {when}", "Gotowe", "Przypomnij za 1 godz.", "Jutro urodziny ({date})", "Propozycja od {name}", "Jutro · jeszcze nie ma na liście: {items}", "Dodaj do listy", "Pochwała od {name}", "{name} chce to wymienić", "Urodziny za tydzień ({date}) · jeszcze bez prezentu"),
    "sv": ("Uppgiften är försenad", "Börjar om {minutes} minuter", "Börjar {when}", "Klar", "Påminn om 1 timme", "Fyller år i morgon ({date})", "Förslag från {name}", "I morgon · inte på listan än: {items}", "Lägg på listan", "Beröm från {name}", "{name} vill lösa in det här", "Fyller år om en vecka ({date}) · ingen present än"),
    "da": ("Opgaven er forsinket", "Starter om {minutes} minutter", "Starter kl. {when}", "Færdig", "Påmind om 1 time", "Fødselsdag i morgen ({date})", "Forslag fra {name}", "I morgen · ikke på listen endnu: {items}", "Sæt på listen", "Ros fra {name}", "{name} vil gerne indløse det", "Fødselsdag om en uge ({date}) · ingen gave endnu"),
    "nb": ("Oppgaven er forsinket", "Starter om {minutes} minutter", "Starter kl. {when}", "Ferdig", "Påminn om 1 time", "Bursdag i morgen ({date})", "Forslag fra {name}", "I morgen · ikke på listen ennå: {items}", "Legg på listen", "Ros fra {name}", "{name} vil løse inn dette", "Bursdag om en uke ({date}) · ingen gave ennå"),
    "fi": ("Tehtävä on myöhässä", "Alkaa {minutes} minuutin kuluttua", "Alkaa {when}", "Valmis", "Muistuta tunnin päästä", "Syntymäpäivä huomenna ({date})", "Ehdotus: {name}", "Huomenna · ei vielä listalla: {items}", "Lisää listalle", "Kehu: {name}", "{name} haluaa lunastaa tämän", "Syntymäpäivä viikon päästä ({date}) · lahjaa ei vielä ole"),
    "cs": ("Úkol je po termínu", "Začíná za {minutes} min", "Začíná v {when}", "Hotovo", "Připomenout za 1 h", "Zítra narozeniny ({date})", "Návrh od {name}", "Zítra · zatím není na seznamu: {items}", "Přidat na seznam", "Pochvala od {name}", "{name} si to chce vyměnit", "Za týden narozeniny ({date}) · zatím bez dárku"),
    "sk": ("Úloha je po termíne", "Začína o {minutes} min", "Začína o {when}", "Hotovo", "Pripomenúť o 1 h", "Zajtra narodeniny ({date})", "Návrh od {name}", "Zajtra · ešte nie je na zozname: {items}", "Pridať na zoznam", "Pochvala od {name}", "{name} si to chce vymeniť", "O týždeň narodeniny ({date}) · zatiaľ bez darčeka"),
    "hu": ("A feladat lejárt", "{minutes} perc múlva kezdődik", "Kezdés: {when}", "Kész", "Emlékeztess 1 óra múlva", "Holnap születésnap ({date})", "{name} javaslata", "Holnap · még nincs a listán: {items}", "Listára", "{name} megdicsért", "{name} szeretné beváltani", "Egy hét múlva születésnap ({date}) · még nincs ajándék"),
    "ro": ("Sarcina este restantă", "Începe în {minutes} minute", "Începe la {when}", "Gata", "Amintește-mi peste 1 oră", "Zi de naștere mâine ({date})", "Sugestie de la {name}", "Mâine · încă nu e pe listă: {items}", "Adaugă pe listă", "O laudă de la {name}", "{name} ar vrea să îl folosească", "Zi de naștere peste o săptămână ({date}) · încă niciun cadou"),
    "el": ("Η εργασία έχει καθυστερήσει", "Ξεκινά σε {minutes} λεπτά", "Ξεκινά στις {when}", "Έγινε", "Υπενθύμιση σε 1 ώρα", "Γενέθλια αύριο ({date})", "Πρόταση από {name}", "Αύριο · δεν είναι ακόμα στη λίστα: {items}", "Στη λίστα", "Έπαινος από {name}", "{name}: αίτημα εξαργύρωσης", "Γενέθλια σε μία εβδομάδα ({date}) · δεν υπάρχει ακόμα δώρο"),
    "bg": ("Задачата е просрочена", "Започва след {minutes} минути", "Започва в {when}", "Готово", "Напомни след 1 час", "Рожден ден утре ({date})", "Предложение от {name}", "Утре · още не е в списъка: {items}", "Добави в списъка", "Похвала от {name}", "{name} иска да го осребри", "Рожден ден след седмица ({date}) · още няма подарък"),
    "hr": ("Zadatak kasni", "Počinje za {minutes} minuta", "Počinje u {when}", "Gotovo", "Podsjeti za 1 sat", "Sutra rođendan ({date})", "Prijedlog od {name}", "Sutra · još nije na popisu: {items}", "Dodaj na popis", "Pohvala od {name}", "{name} želi ovo zamijeniti", "Rođendan za tjedan dana ({date}) · još nema poklona"),
    "sl": ("Opravilo je zapadlo", "Začne se čez {minutes} minut", "Začne se ob {when}", "Opravljeno", "Opomni čez 1 uro", "Jutri rojstni dan ({date})", "Predlog od {name}", "Jutri · še ni na seznamu: {items}", "Dodaj na seznam", "Pohvala od {name}", "{name} želi to unovčiti", "Rojstni dan čez teden dni ({date}) · darila še ni"),
    "lt": ("Užduotis vėluoja", "Prasideda po {minutes} min.", "Prasideda {when}", "Atlikta", "Priminti po 1 val.", "Rytoj gimtadienis ({date})", "{name} pasiūlymas", "Rytoj · dar nėra sąraše: {items}", "Į sąrašą", "{name} pagyrimas", "{name} nori tai išsikeisti", "Gimtadienis po savaitės ({date}) · dovanos dar nėra"),
    "lv": ("Uzdevums ir nokavēts", "Sākas pēc {minutes} minūtēm", "Sākas {when}", "Gatavs", "Atgādināt pēc 1 stundas", "Rīt dzimšanas diena ({date})", "{name} ieteikums", "Rīt · vēl nav sarakstā: {items}", "Pievienot sarakstam", "{name} uzslava", "{name} vēlas to izmantot", "Dzimšanas diena pēc nedēļas ({date}) · dāvanas vēl nav"),
    "et": ("Ülesanne on hilinenud", "Algab {minutes} minuti pärast", "Algab {when}", "Tehtud", "Tuleta 1 tunni pärast meelde", "Homme sünnipäev ({date})", "{name} ettepanek", "Homme · veel nimekirjas pole: {items}", "Lisa nimekirja", "{name} kiitus", "{name} soovib selle lunastada", "Sünnipäev nädala pärast ({date}) · kinki veel pole"),
    "ga": ("Tá an tasc thar téarma", "Tosaíonn i gceann {minutes} nóiméad", "Tosaíonn ag {when}", "Déanta", "Meabhraigh i gceann uair an chloig", "Breithlá amárach ({date})", "Moladh ó {name}", "Amárach · níl ar an liosta fós: {items}", "Cuir ar an liosta", "Focal molta ó {name}", "Ba mhaith le {name} é seo a fháil", "Breithlá i gceann seachtaine ({date}) · gan bronntanas fós"),
}

_KEYS = (
    "task_overdue", "event_starts_in", "event_starts_at", "action_done", "action_snooze",
    "birthday_tomorrow", "capture_suggestion", "meal_missing", "action_shopping",
    "praise_from", "wish_request", "gift_nothing_yet",
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
