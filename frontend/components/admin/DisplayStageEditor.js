import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { t, listLanguages } from '../../lib/i18n';
import { normalizeStageConfig, ZONE_CARDS, ZONES } from '../display/stageModel';

const REFRESH_OPTIONS = { tablet: [30, 60, 120, 300, 600], eink: [300, 600, 900, 1800, 3600] };
const INTERVAL_OPTIONS = [15, 30, 60, 120, 300, 600];
const TOGGLES = ['stagger', 'skip_empty', 'pause_on_touch'];
const DAY_PARTS = ['morning_start', 'morning_end', 'evening_start', 'night_start'];

// Editable draft built from the same normalization the wall display uses.
export function draftFromDevice(device) {
  const config = normalizeStageConfig(device || {});
  return {
    display_mode: config.mode,
    refresh_interval_seconds: config.refreshSeconds,
    layout: {
      version: 2,
      zones: config.zones,
      stagger: config.stagger,
      skip_empty: config.skipEmpty,
      pause_on_touch: config.pauseOnTouch,
      day_parts: config.dayParts,
      eink_format: config.einkFormat,
      language: config.language,
      theme_mode: config.themeMode,
      content: config.content,
      timetable_id: config.timetableId,
    },
  };
}

const THEME_MODES = ['auto', 'light', 'dark'];

export function draftToPayload(draft) {
  return {
    display_mode: draft.display_mode,
    refresh_interval_seconds: Number(draft.refresh_interval_seconds),
    layout_config: draft.layout,
  };
}

export function everyLabel(seconds, messages) {
  return seconds < 60
    ? t(messages, 'display_every_seconds').replace('{count}', seconds)
    : t(messages, 'display_every_minutes').replace('{count}', Math.round(seconds / 60));
}

export function StageSchematic({ layout, messages }) {
  return (
    <div className="fam-stage-schematic" aria-hidden="true">
      <span className="fam-stage-fixed fam-stage-fixed--hero" />
      <span className="fam-stage-fixed fam-stage-fixed--timeline" />
      {ZONES.map((zone) => (
        <span key={zone} className={`fam-stage-zone fam-stage-zone--${zone}`}>
          <b>{zone.toUpperCase()}</b>
          <small>{t(messages, `display_card_${layout.zones[zone].cards[0]}`)}</small>
        </span>
      ))}
    </div>
  );
}

function ZoneEditor({ zone, value, eink, messages, onChange }) {
  const cardLabel = (card) => t(messages, `display_card_${card}`);
  const available = ZONE_CARDS[zone].filter((card) => !value.cards.includes(card));
  const move = (index, delta) => {
    const cards = [...value.cards];
    [cards[index], cards[index + delta]] = [cards[index + delta], cards[index]];
    onChange({ cards });
  };
  return (
    <fieldset className="fam-zone" data-testid={`display-zone-editor-${zone}`}>
      <legend>
        <span className="fam-zone-letter">{zone.toUpperCase()}</span>
        {t(messages, `display_zone_${zone}`)}
      </legend>
      <ol className="fam-zone-cards">
        {value.cards.map((card, index) => (
          <li key={card}>
            <span>{cardLabel(card)}</span>
            <button type="button" className="fam-icon-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t(messages, 'display_card_move_up').replace('{card}', cardLabel(card))}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="fam-icon-button" disabled={index === value.cards.length - 1} onClick={() => move(index, 1)} aria-label={t(messages, 'display_card_move_down').replace('{card}', cardLabel(card))}>
              <ArrowDown size={14} />
            </button>
            <button type="button" className="fam-icon-button" disabled={value.cards.length === 1} onClick={() => onChange({ cards: value.cards.filter((item) => item !== card) })} aria-label={t(messages, 'display_card_remove').replace('{card}', cardLabel(card))}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="fam-zone-actions">
        {available.length > 0 && (
          <select
            className="form-input"
            value=""
            aria-label={`${t(messages, 'display_add_card')} · ${zone.toUpperCase()}`}
            onChange={(event) => event.target.value && onChange({ cards: [...value.cards, event.target.value] })}
          >
            <option value="">{t(messages, 'display_add_card')}</option>
            {available.map((card) => (
              <option key={card} value={card}>{cardLabel(card)}</option>
            ))}
          </select>
        )}
        {!eink && (
          <label className="fam-inline-field">
            <span>{t(messages, 'display_zone_interval')}</span>
            <select
              className="form-input"
              value={value.interval_seconds}
              data-testid={`display-zone-interval-${zone}`}
              onChange={(event) => onChange({ interval_seconds: Number(event.target.value) })}
            >
              {[...new Set([...INTERVAL_OPTIONS, value.interval_seconds])].sort((a, b) => a - b).map((seconds) => (
                <option key={seconds} value={seconds}>{everyLabel(seconds, messages)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </fieldset>
  );
}

export function usesWeatherCard(layout) {
  return Object.values(layout?.zones || {}).some((zone) => (zone?.cards || []).includes('weather'));
}

export default function DisplayStageEditor({ draft, messages, onChange, weatherPanel = null, timetables = [] }) {
  const eink = draft.display_mode === 'eink';
  // One school timetable in full needs no zones or rotation (Tribu 2.0).
  const timetable = draft.layout.content === 'timetable';
  const refreshOptions = [...new Set([...REFRESH_OPTIONS[draft.display_mode], Number(draft.refresh_interval_seconds)])].sort((a, b) => a - b);
  const setLayout = (patch) => onChange({ ...draft, layout: { ...draft.layout, ...patch } });
  const setZone = (zone, patch) => setLayout({ zones: { ...draft.layout.zones, [zone]: { ...draft.layout.zones[zone], ...patch } } });

  return (
    <div className="fam-stage-editor" data-no-autofocus>
      <section className="fam-stage-group">
        <h3>{t(messages, 'display_editor_device')}</h3>
        <div className="fam-stage-row">
          <label className="form-field">
            <span>{t(messages, 'display_mode_label')}</span>
            <select
              className="form-input"
              value={draft.display_mode}
              data-testid="display-mode-select"
              onChange={(event) => {
                const mode = event.target.value;
                const refresh = REFRESH_OPTIONS[mode].includes(Number(draft.refresh_interval_seconds)) ? draft.refresh_interval_seconds : mode === 'eink' ? 600 : 60;
                onChange({ ...draft, display_mode: mode, refresh_interval_seconds: refresh });
              }}
            >
              <option value="tablet">{t(messages, 'display_mode_tablet')}</option>
              <option value="eink">{t(messages, 'display_mode_eink')}</option>
            </select>
          </label>
          <label className="form-field">
            <span>{t(messages, eink ? 'display_refresh_eink_label' : 'display_refresh_label')}</span>
            <select
              className="form-input"
              value={draft.refresh_interval_seconds}
              data-testid="display-refresh-select"
              onChange={(event) => onChange({ ...draft, refresh_interval_seconds: Number(event.target.value) })}
            >
              {refreshOptions.map((seconds) => (
                <option key={seconds} value={seconds}>{everyLabel(seconds, messages)}</option>
              ))}
            </select>
          </label>
          {eink && (
            <label className="form-field">
              <span>{t(messages, 'display_eink_format_label')}</span>
              <select
                className="form-input"
                value={draft.layout.eink_format}
                data-testid="display-eink-format-select"
                onChange={(event) => setLayout({ eink_format: event.target.value })}
              >
                <option value="compact">{t(messages, 'display_eink_format_compact')}</option>
                <option value="large">{t(messages, 'display_eink_format_large')}</option>
              </select>
            </label>
          )}
          <label className="form-field">
            <span>{t(messages, 'display_content_label')}</span>
            <select
              className="form-input"
              value={draft.layout.content}
              data-testid="display-content-select"
              onChange={(event) => setLayout({ content: event.target.value })}
            >
              <option value="stage">{t(messages, 'display_content_stage')}</option>
              <option value="timetable">{t(messages, 'display_content_timetable')}</option>
            </select>
            <small>{t(messages, 'display_content_hint')}</small>
          </label>
          {timetable && (
            <label className="form-field">
              <span>{t(messages, 'display_timetable_label')}</span>
              <select
                className="form-input"
                value={draft.layout.timetable_id ?? ''}
                data-testid="display-timetable-select"
                onChange={(event) => setLayout({ timetable_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">{t(messages, 'display_timetable_first')}</option>
                {timetables.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="form-field">
            <span>{t(messages, 'display_language_label')}</span>
            <select
              className="form-input"
              value={draft.layout.language}
              data-testid="display-language-select"
              onChange={(event) => setLayout({ language: event.target.value })}
            >
              <option value="auto">{t(messages, 'display_language_auto')}</option>
              {listLanguages().map((language) => (
                <option key={language.key} value={language.key}>{language.nativeName || language.name || language.key}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {!timetable && (
      <section className="fam-stage-group">
        <h3>{t(messages, 'display_editor_zones')}</h3>
        <p className="fam-stage-hint">{t(messages, eink ? 'display_eink_rotation_hint' : 'display_editor_zones_hint')}</p>
        <StageSchematic layout={draft.layout} messages={messages} />
        <div className="fam-zone-grid">
          {ZONES.map((zone) => (
            <ZoneEditor key={zone} zone={zone} value={draft.layout.zones[zone]} eink={eink} messages={messages} onChange={(patch) => setZone(zone, patch)} />
          ))}
        </div>
        {weatherPanel && usesWeatherCard(draft.layout) && (
          <div className="fam-weather-missing" data-testid="display-weather-missing">
            <p>{t(messages, 'display_weather_missing_hint')}</p>
            {weatherPanel}
          </div>
        )}
      </section>
      )}

      <section className="fam-stage-group">
        <h3>{t(messages, 'display_editor_behaviour')}</h3>
        <div className="fam-toggle-list">
          {TOGGLES.filter((key) => !timetable && (!eink || key === 'skip_empty')).map((key) => (
            <label key={key} className="fam-toggle">
              <input type="checkbox" role="switch" checked={Boolean(draft.layout[key])} onChange={(event) => setLayout({ [key]: event.target.checked })} data-testid={`display-toggle-${key}`} />
              <span>
                {t(messages, `display_${key}`)}
                <small>{t(messages, `display_${key}_hint`)}</small>
              </span>
            </label>
          ))}
        </div>
        {!eink && (
          <label className="form-field">
            <span>{t(messages, 'display_theme_mode_label')}</span>
            <select
              className="form-input"
              value={draft.layout.theme_mode}
              data-testid="display-theme-mode-select"
              onChange={(event) => setLayout({ theme_mode: event.target.value })}
            >
              {THEME_MODES.map((mode) => (
                <option key={mode} value={mode}>{t(messages, `display_theme_mode_${mode}`)}</option>
              ))}
            </select>
            <small>{t(messages, 'display_theme_mode_hint')}</small>
          </label>
        )}
      </section>

      <section className="fam-stage-group">
        <h3>{t(messages, 'display_editor_day_parts')}</h3>
        <div className="fam-stage-row fam-stage-row--times">
          {DAY_PARTS.map((key) => (
            <label key={key} className="form-field">
              <span>{t(messages, `display_${key}`)}</span>
              <input
                type="time"
                className="form-input"
                value={draft.layout.day_parts[key]}
                data-testid={`display-daypart-${key}`}
                onChange={(event) => event.target.value && setLayout({ day_parts: { ...draft.layout.day_parts, [key]: event.target.value } })}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
