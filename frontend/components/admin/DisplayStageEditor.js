import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { t, listLanguages } from '../../lib/i18n';
import { normalizeStageConfig, ZONE_CARDS, ZONES } from '../display/stageModel';

const REFRESH_OPTIONS = { tablet: [30, 60, 120, 300, 600], eink: [300, 600, 900, 1800, 3600] };
const INTERVAL_OPTIONS = [15, 30, 60, 120, 300, 600];
const TOGGLES = ['stagger', 'skip_empty', 'pause_on_touch', 'night_dim'];
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
      night_dim: config.nightDim,
      day_parts: config.dayParts,
      eink_format: config.einkFormat,
      language: config.language,
    },
  };
}

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
    <div className="ad-stage-schematic" aria-hidden="true">
      <span className="ad-stage-fixed ad-stage-fixed--hero" />
      <span className="ad-stage-fixed ad-stage-fixed--timeline" />
      {ZONES.map((zone) => (
        <span key={zone} className={`ad-stage-zone ad-stage-zone--${zone}`}>
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
    <fieldset className="ad-zone" data-testid={`display-zone-editor-${zone}`}>
      <legend>
        <span className="ad-zone-letter">{zone.toUpperCase()}</span>
        {t(messages, `display_zone_${zone}`)}
      </legend>
      <ol className="ad-zone-cards">
        {value.cards.map((card, index) => (
          <li key={card}>
            <span>{cardLabel(card)}</span>
            <button type="button" className="ad-icon-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t(messages, 'display_card_move_up').replace('{card}', cardLabel(card))}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="ad-icon-button" disabled={index === value.cards.length - 1} onClick={() => move(index, 1)} aria-label={t(messages, 'display_card_move_down').replace('{card}', cardLabel(card))}>
              <ArrowDown size={14} />
            </button>
            <button type="button" className="ad-icon-button" disabled={value.cards.length === 1} onClick={() => onChange({ cards: value.cards.filter((item) => item !== card) })} aria-label={t(messages, 'display_card_remove').replace('{card}', cardLabel(card))}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="ad-zone-actions">
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
          <label className="ad-inline-field">
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

export default function DisplayStageEditor({ draft, messages, onChange }) {
  const eink = draft.display_mode === 'eink';
  const refreshOptions = [...new Set([...REFRESH_OPTIONS[draft.display_mode], Number(draft.refresh_interval_seconds)])].sort((a, b) => a - b);
  const setLayout = (patch) => onChange({ ...draft, layout: { ...draft.layout, ...patch } });
  const setZone = (zone, patch) => setLayout({ zones: { ...draft.layout.zones, [zone]: { ...draft.layout.zones[zone], ...patch } } });

  return (
    <div className="ad-stage-editor" data-no-autofocus>
      <section className="ad-stage-group">
        <h3>{t(messages, 'display_editor_device')}</h3>
        <div className="ad-stage-row">
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

      <section className="ad-stage-group">
        <h3>{t(messages, 'display_editor_zones')}</h3>
        <p className="ad-stage-hint">{t(messages, eink ? 'display_eink_rotation_hint' : 'display_editor_zones_hint')}</p>
        <StageSchematic layout={draft.layout} messages={messages} />
        <div className="ad-zone-grid">
          {ZONES.map((zone) => (
            <ZoneEditor key={zone} zone={zone} value={draft.layout.zones[zone]} eink={eink} messages={messages} onChange={(patch) => setZone(zone, patch)} />
          ))}
        </div>
      </section>

      <section className="ad-stage-group">
        <h3>{t(messages, 'display_editor_behaviour')}</h3>
        <div className="ad-toggle-list">
          {TOGGLES.filter((key) => !eink || key === 'skip_empty').map((key) => (
            <label key={key} className="ad-toggle">
              <input type="checkbox" role="switch" checked={Boolean(draft.layout[key])} onChange={(event) => setLayout({ [key]: event.target.checked })} data-testid={`display-toggle-${key}`} />
              <span>
                {t(messages, `display_${key}`)}
                <small>{t(messages, `display_${key}_hint`)}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="ad-stage-group">
        <h3>{t(messages, 'display_editor_day_parts')}</h3>
        <div className="ad-stage-row ad-stage-row--times">
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
