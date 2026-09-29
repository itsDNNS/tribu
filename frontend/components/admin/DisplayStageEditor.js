import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Cake,
  CalendarDays,
  CloudSun,
  GraduationCap,
  Hourglass,
  Plus,
  ShoppingCart,
  Soup,
  Star,
  Table2,
  Users,
  X,
} from 'lucide-react';
import { t, listLanguages } from '../../lib/i18n';
import { activeZones, ARRANGEMENTS, LARGE_CARDS, normalizeStageConfig, ZONE_CARDS } from '../display/stageModel';

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
      arrangement: config.arrangement,
      timetable_id: config.timetableId,
      timetable_pin: config.timetablePin,
    },
  };
}

const THEME_MODES = ['auto', 'light', 'dark'];

// The same icons the wall display puts on its cards.
export const CARD_ICONS = {
  dinner: Soup,
  shopping: ShoppingCart,
  weather: CloudSun,
  reminders: Bell,
  school: GraduationCap,
  soon: Hourglass,
  stars: Star,
  birthdays: Cake,
  people: Users,
  week: CalendarDays,
  timetable: Table2,
};

function CardIcon({ card, size = 14 }) {
  const Icon = CARD_ICONS[card];
  return Icon ? <Icon size={size} aria-hidden="true" /> : null;
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

// What the merged zones are called in each arrangement.
export function zoneLabelKey(zone, arrangement) {
  if (zone === 'd' && arrangement === 'bottom_large') return 'display_zone_d_large';
  if (zone === 'a' && arrangement === 'right_tall') return 'display_zone_a_tall';
  return `display_zone_${zone}`;
}

// Switching the arrangement keeps the zones valid: the week timetable only
// fits the large zone, so it moves in with "bottom large" and out again.
export function withArrangement(layout, arrangement, { hasTimetables = false } = {}) {
  const d = layout.zones.d.cards;
  let cards = d;
  if (arrangement === 'bottom_large') {
    if (hasTimetables && !d.includes('timetable')) cards = ['timetable', ...d];
  } else {
    cards = d.filter((card) => !LARGE_CARDS.includes(card));
    if (!cards.length) cards = ['people', 'week'];
  }
  return { ...layout, arrangement, zones: { ...layout.zones, d: { ...layout.zones.d, cards } } };
}

export function StageSchematic({ layout, messages }) {
  const arrangement = layout.arrangement || 'standard';
  if (arrangement === 'timetable') {
    return (
      <div className="fam-stage-schematic fam-stage-schematic--timetable" aria-hidden="true" data-arrangement={arrangement}>
        <span className="fam-stage-zone fam-stage-zone--full">
          <small>{t(messages, 'display_arrangement_timetable')}</small>
        </span>
      </div>
    );
  }
  return (
    <div className={`fam-stage-schematic fam-stage-schematic--${arrangement}`} aria-hidden="true" data-arrangement={arrangement}>
      <span className="fam-stage-fixed fam-stage-fixed--hero" />
      {arrangement !== 'bottom_large' && <span className="fam-stage-fixed fam-stage-fixed--timeline" />}
      {activeZones(arrangement).map((zone) => (
        <span key={zone} className={`fam-stage-zone fam-stage-zone--${zone}`}>
          <b>{zone.toUpperCase()}</b>
          <small>{t(messages, `display_card_${layout.zones[zone].cards[0]}`)}</small>
        </span>
      ))}
    </div>
  );
}

// The arrangements as little screens to pick from.
function ArrangementPicker({ value, messages, onChange }) {
  return (
    <div className="fam-arrangements" role="radiogroup" aria-label={t(messages, 'display_arrangement_label')}>
      {ARRANGEMENTS.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={`fam-arrangement${value === key ? ' is-active' : ''}`}
          data-testid={`display-arrangement-${key}`}
          onClick={() => onChange(key)}
        >
          <span className={`fam-mini-screen fam-mini-screen--${key}`} aria-hidden="true">
            {key === 'timetable' ? (
              <i className="fam-mini-full" />
            ) : (
              <>
                <i className="fam-mini-fixed fam-mini-hero" />
                {key !== 'bottom_large' && <i className="fam-mini-fixed fam-mini-timeline" />}
                {activeZones(key).map((zone) => (
                  <i key={zone} className={`fam-mini-zone fam-mini-zone--${zone}`} />
                ))}
              </>
            )}
          </span>
          <span className="fam-arrangement-name">{t(messages, `display_arrangement_${key}`)}</span>
        </button>
      ))}
    </div>
  );
}

// The display in the editor: fixed parts in grey, every zone a tile that
// shows its cards and opens them for editing.
function StagePreview({ layout, selected, messages, onSelect }) {
  const arrangement = layout.arrangement || 'standard';
  return (
    <div className={`fam-stage-preview fam-stage-preview--${arrangement}`} data-testid="display-stage-preview">
      <div className="fam-preview-fixed fam-preview-hero">{t(messages, 'display.stage.next')}</div>
      {arrangement !== 'bottom_large' && (
        <div className="fam-preview-fixed fam-preview-timeline">{t(messages, 'display.stage.timeline_today')}</div>
      )}
      {activeZones(arrangement).map((zone) => {
        const cards = layout.zones[zone].cards;
        return (
          <button
            key={zone}
            type="button"
            className={`fam-preview-zone fam-preview-zone--${zone}${selected === zone ? ' is-selected' : ''}`}
            aria-pressed={selected === zone}
            data-testid={`display-zone-tile-${zone}`}
            onClick={() => onSelect(zone)}
          >
            <span className="fam-preview-zone-head">
              <span className="fam-zone-letter">{zone.toUpperCase()}</span>
              <span className="fam-preview-zone-name">{t(messages, zoneLabelKey(zone, arrangement))}</span>
            </span>
            <span className="fam-preview-cards">
              {cards.map((card) => (
                <span key={card} className="fam-preview-card" title={t(messages, `display_card_${card}`)}>
                  <CardIcon card={card} size={13} />
                  <span>{t(messages, `display_card_${card}`)}</span>
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ZonePanel({ zone, value, eink, arrangement, messages, onChange }) {
  const cardLabel = (card) => t(messages, `display_card_${card}`);
  const large = zone === 'd' && arrangement === 'bottom_large';
  const available = ZONE_CARDS[zone].filter((card) => !value.cards.includes(card) && (large || !LARGE_CARDS.includes(card)));
  const move = (index, delta) => {
    const cards = [...value.cards];
    [cards[index], cards[index + delta]] = [cards[index + delta], cards[index]];
    onChange({ cards });
  };
  return (
    <div className="fam-zone-panel" data-testid={`display-zone-editor-${zone}`} role="group" aria-label={`${zone.toUpperCase()} · ${t(messages, zoneLabelKey(zone, arrangement))}`}>
      <div className="fam-zone-panel-head">
        <span className="fam-zone-letter">{zone.toUpperCase()}</span>
        <strong>{t(messages, zoneLabelKey(zone, arrangement))}</strong>
        {!eink && (
          <label className="fam-inline-field fam-zone-interval">
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
      <ol className="fam-zone-cards">
        {value.cards.map((card, index) => (
          <li key={card}>
            <span className="fam-zone-card-index">{index + 1}</span>
            <CardIcon card={card} size={16} />
            <span className="fam-zone-card-name">{cardLabel(card)}</span>
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
      {available.length > 0 && (
        <div className="fam-card-palette" role="group" aria-label={`${t(messages, 'display_add_card')} · ${zone.toUpperCase()}`}>
          <span className="fam-card-palette-title">{t(messages, 'display_add_card')}</span>
          <div className="fam-card-palette-chips">
            {available.map((card) => (
              <button
                key={card}
                type="button"
                className="fam-card-chip"
                data-testid={`display-add-card-${zone}-${card}`}
                onClick={() => onChange({ cards: [...value.cards, card] })}
              >
                <Plus size={13} aria-hidden="true" />
                <CardIcon card={card} size={14} />
                {cardLabel(card)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function usesWeatherCard(layout) {
  return activeZones(layout?.arrangement).some((zone) => (layout?.zones?.[zone]?.cards || []).includes('weather'));
}

export default function DisplayStageEditor({ draft, messages, onChange, weatherPanel = null, timetables = [] }) {
  const eink = draft.display_mode === 'eink';
  // One school timetable in full needs no zones or rotation (Tribu 2.0).
  const arrangement = draft.layout.arrangement || 'standard';
  const timetable = arrangement === 'timetable';
  const pin = draft.layout.timetable_pin || { enabled: false, from: '06:30', until: '08:00' };
  const toggles = TOGGLES.filter((key) => !timetable && (!eink || key === 'skip_empty'));
  const zones = activeZones(arrangement);
  const [picked, setPicked] = useState('a');
  const selected = zones.includes(picked) ? picked : zones[0];
  const chooseArrangement = (key) => {
    onChange({ ...draft, layout: withArrangement(draft.layout, key, { hasTimetables: timetables.length > 0 }) });
    // The merged large area is what "bottom large" is for, so open it right away.
    if (key === 'bottom_large') setPicked('d');
  };
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

      <section className="fam-stage-group">
        <h3>{t(messages, 'display_arrangement_label')}</h3>
        <ArrangementPicker value={arrangement} messages={messages} onChange={chooseArrangement} />
        <p className="fam-stage-hint">{t(messages, `display_arrangement_${arrangement}_hint`)}</p>
        {timetable && (
          <div className="fam-stage-row">
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
          </div>
        )}
      </section>

      {!timetable && (
      <section className="fam-stage-group">
        <h3>{t(messages, 'display_editor_zones')}</h3>
        <p className="fam-stage-hint">{t(messages, eink ? 'display_eink_rotation_hint' : 'display_editor_zones_hint')} {t(messages, 'display_zone_pick_hint')}</p>
        <StagePreview layout={draft.layout} selected={selected} messages={messages} onSelect={setPicked} />
        {selected && (
          <ZonePanel
            key={selected}
            zone={selected}
            value={draft.layout.zones[selected]}
            eink={eink}
            arrangement={arrangement}
            messages={messages}
            onChange={(patch) => setZone(selected, patch)}
          />
        )}
        {arrangement === 'bottom_large' && (
          <div className="fam-stage-pin" data-testid="display-timetable-pin">
            <label className="fam-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={pin.enabled}
                data-testid="display-toggle-timetable_pin"
                onChange={(event) => setLayout({ timetable_pin: { ...pin, enabled: event.target.checked } })}
              />
              <span>
                {t(messages, 'display_pin_label')}
                <small>{t(messages, 'display_pin_hint')}</small>
              </span>
            </label>
            {pin.enabled && (
              <div className="fam-stage-row fam-stage-row--times">
                {['from', 'until'].map((key) => (
                  <label key={key} className="form-field">
                    <span>{t(messages, `display_pin_${key}`)}</span>
                    <input
                      type="time"
                      className="form-input"
                      value={pin[key]}
                      data-testid={`display-pin-${key}`}
                      onChange={(event) => event.target.value && setLayout({ timetable_pin: { ...pin, [key]: event.target.value } })}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {weatherPanel && usesWeatherCard(draft.layout) && (
          <div className="fam-weather-missing" data-testid="display-weather-missing">
            <p>{t(messages, 'display_weather_missing_hint')}</p>
            {weatherPanel}
          </div>
        )}
      </section>
      )}

      {(toggles.length > 0 || !eink) && (
      <section className="fam-stage-group">
        <h3>{t(messages, 'display_editor_behaviour')}</h3>
        <div className="fam-toggle-list">
          {toggles.map((key) => (
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
      )}

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
