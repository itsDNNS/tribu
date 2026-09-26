# Shared Home Display

The shared display turns a kitchen tablet, hallway monitor or e-ink frame into a calm family screen. It is paired with a read-only display token, is bound to one family and never uses a person's login.

## Layout: the stage

Every display uses the same "stage":

- **Fixed anchors** stay in place so the screen can be read in passing: clock and date, a greeting that follows the time of day, today's weather, **Next up** (the next or current event with who, when and where, plus what follows) and a **timeline** with one lane per person.
- **Four rotating zones** show one card at a time:

| Zone | Position | Cards it accepts |
| --- | --- | --- |
| A | right, top | Meals, Shopping list, Weather today, Don't forget, School timetable, Coming up, Stars, Birthdays |
| B | right, middle | same as A |
| C | right, bottom | same as A |
| D | bottom, wide | People, This week |

Card contents:

- **Meals** – today's planned meals (tomorrow's in the evening).
- **Shopping list** – unchecked items across lists.
- **Weather today** – the next hours and the first likely rain.
- **Don't forget** – one-off tasks that are overdue or due today or tomorrow; in the evening also routines that are still open.
- **School timetable** – today's lessons with the current one highlighted (tomorrow's in the evening).
- **Coming up** – countdowns to birthdays and all-day events (holidays, trips) in the next 60 days.
- **Stars** – reward balances and the next reward for each child.
- **Birthdays** – birthdays in the next four weeks.
- **People** – per person: what is next and routine progress (or due tasks).
- **This week** – Monday to Sunday at a glance.

## Rhythm and behaviour

Each zone has its own list of cards and interval (15 seconds to 10 minutes, default 60 seconds). Which card is shown is derived from the clock, so several displays in one home change together and a reload does not reset the rhythm.

- **Staggered changes** (default on): the zones are offset so only one zone changes at a time. With four zones on 60 seconds, one small area changes every 15 seconds.
- **Skip empty cards** (default on): cards without content are left out; a zone always keeps at least one card.
- **Hold on touch** (default on): tapping a zone holds its card for 60 seconds; swiping left or right moves to the next or previous card.
- A progress line and dots show which card is on and when the next one follows.

## Times of day

| Part | Default | What changes |
| --- | --- | --- |
| Morning | 05:30–09:00 | Greeting and "heading out" focus |
| Day | 09:00–18:00 | Today's plan |
| Evening | 18:00–22:00 | Dark palette; Next up, timeline, meals and school look at tomorrow |
| Night | 22:00–05:30 | Like the evening, dimmed when night dimming is on |

## E-ink

In e-ink mode the display is black and white, without animation or photos. Instead of rotating on a timer, every zone turns one card per data refresh (default every 10 minutes, at least 5). Small panels (up to 900 px wide, e.g. 7.5″ 800×480) show the clock, Next up, the timeline and zones A and B; larger panels (e.g. 10″ 1200×825) show the full stage. The "Updated" time in the corner shows how fresh the data is.

This mode runs in any browser on the device (Kindle, Boox and similar). Frames without a browser (TRMNL, ESPHome devices, Inkplate) need a server-rendered image, which is not available yet.

## Devices

1. In Tribu, go to **Admin → Displays**, create a display and open its pairing link on the device.
2. The link stores the token on the device and removes it from the address bar.
3. Install the page as an app (browser menu → *Install app* / *Add to home screen*). It opens full screen straight into `/display`.

Tips:

- **Android tablets** (for example the OnePlus Pad 3 with its 7:5 screen): install the app from Chrome and keep the tablet on its charger. The display asks the browser to keep the screen on while it is visible (Screen Wake Lock). For unattended wall mounting, a kiosk browser such as Fully Kiosk Browser can additionally lock the device to the display.
- **Portrait screens** stack the stage vertically.
- **Language** follows the device unless a display language is set.
- The clock format follows the instance setting (24 h or 12 h).

## Offline behaviour

The last successful data is kept on the device. If the network or the server is unavailable, the display keeps showing it with an "Offline · last update" note and a server error never unpairs the device. Only a revoked or unknown token clears the display.

## Weather and privacy

Weather is optional and off until a family admin chooses a place. Tribu then asks [Open-Meteo](https://open-meteo.com/) for the forecast of that place's coordinates (the place search sends the typed text to Open-Meteo's geocoder). Forecasts are cached for 15 minutes; failures simply hide the weather.

The display payload contains no e-mail addresses, user IDs or account metadata. People are referenced by their position in the member list.

## Configuration reference

`PATCH /families/{family_id}/display-devices/{device_id}` accepts `display_mode` (`tablet` or `eink`), `refresh_interval_seconds` and `layout_config`:

```json
{
  "version": 2,
  "zones": {
    "a": { "cards": ["dinner", "shopping", "weather"], "interval_seconds": 60 },
    "b": { "cards": ["reminders", "school"], "interval_seconds": 60 },
    "c": { "cards": ["soon", "stars"], "interval_seconds": 60 },
    "d": { "cards": ["people", "week"], "interval_seconds": 60 }
  },
  "stagger": true,
  "skip_empty": true,
  "pause_on_touch": true,
  "night_dim": true,
  "day_parts": { "morning_start": "05:30", "morning_end": "09:00", "evening_start": "18:00", "night_start": "22:00" },
  "eink_format": "compact",
  "language": "auto"
}
```

Card keys: `dinner`, `shopping`, `weather`, `reminders`, `school`, `soon`, `stars`, `birthdays` (zones a–c) and `people`, `week` (zone d). The server normalizes every value: unknown or misplaced cards are dropped, intervals are clamped and missing fields fall back to the defaults above.

The family weather place is managed with `GET`, `PUT` and `DELETE /families/{family_id}/weather-location` and searched with `GET /families/{family_id}/weather-location/search?q=…`.
