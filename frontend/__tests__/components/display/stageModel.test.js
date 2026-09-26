import {
  cardHasContent,
  dayPart,
  normalizeStageConfig,
  resolveLanguage,
  rotatingCards,
  timeline,
  upcomingEvents,
  weatherKind,
} from '../../../components/display/stageModel';
import { rotationSlot, zoneOffset } from '../../../components/display/useStageRotation';
import { buildStagePayload } from '../../test-utils/stageFixture';

describe('normalizeStageConfig', () => {
  test('fills defaults and keeps zone cards within their shape', () => {
    const config = normalizeStageConfig({
      display_mode: 'eink',
      refresh_interval_seconds: 10,
      layout_config: {
        version: 2,
        zones: { a: { cards: ['people', 'weather', 'weather', 'nope'], interval_seconds: 3 }, d: { cards: ['dinner'] } },
        stagger: false,
        day_parts: { evening_start: '19:30', morning_start: 'late' },
        language: 'de',
      },
    });
    expect(config.mode).toBe('eink');
    expect(config.refreshSeconds).toBe(300);
    expect(config.zones.a).toEqual({ cards: ['weather'], interval_seconds: 15 });
    expect(config.zones.d.cards).toEqual(['people', 'week']);
    expect(config.zones.b.cards).toEqual(['reminders', 'school']);
    expect(config.stagger).toBe(false);
    expect(config.dayParts).toMatchObject({ evening_start: '19:30', morning_start: '05:30' });
    expect(config.language).toBe('de');
  });

  test('treats retired grid layouts as the default stage', () => {
    const config = normalizeStageConfig({ layout_config: { columns: 3, rows: 3, widgets: [] } });
    expect(config.mode).toBe('tablet');
    expect(config.refreshSeconds).toBe(60);
    expect(config.zones.c.cards).toEqual(['soon', 'stars']);
  });
});

test('dayPart follows the configured boundaries, including across midnight', () => {
  const parts = { morning_start: '05:30', morning_end: '09:00', evening_start: '18:00', night_start: '22:00' };
  const at = (hh, mm) => new Date(2026, 8, 29, hh, mm);
  expect(dayPart(at(7, 12), parts)).toBe('morning');
  expect(dayPart(at(12, 0), parts)).toBe('day');
  expect(dayPart(at(19, 40), parts)).toBe('evening');
  expect(dayPart(at(23, 30), parts)).toBe('night');
  expect(dayPart(at(3, 0), parts)).toBe('night');
});

test('resolveLanguage prefers the configured language, then the device, then English', () => {
  expect(resolveLanguage('fr', ['de-DE'], ['en', 'de', 'fr'])).toBe('fr');
  expect(resolveLanguage('auto', ['de-DE', 'en-US'], ['en', 'de'])).toBe('de');
  expect(resolveLanguage('auto', ['xx-YY'], ['en', 'de'])).toBe('en');
});

test('upcomingEvents marks the running event as live and skips finished ones', () => {
  const payload = buildStagePayload();
  const events = upcomingEvents(payload, new Date(2026, 8, 29, 9, 0));
  expect(events.map((event) => event.title)).toEqual(['School', 'Work', 'Swimming', 'Zoo trip']);
  expect(events[0].live).toBe(true);
  expect(upcomingEvents(payload, new Date(2026, 8, 29, 17, 0)).map((event) => event.title)).toEqual(['Zoo trip']);
});

test('timeline groups events into member lanes positioned within the visible hours', () => {
  const payload = buildStagePayload();
  const now = new Date(2026, 8, 29, 7, 12);
  const data = timeline(payload.today_events, now);
  expect(data.startHour).toBe(6);
  expect(data.endHour).toBe(22);
  expect(data.lanes.map((lane) => lane.ref)).toEqual([0, 2]);
  const school = data.lanes[1].blocks[0];
  expect(school.left).toBeCloseTo(((7.75 - 6) / 16) * 100);
  expect(school.width).toBeCloseTo(((13.25 - 7.75) / 16) * 100);
  expect(data.nowPct).toBeCloseTo(((7.2 - 6) / 16) * 100);
  expect(timeline(payload.tomorrow_events, now, { day: new Date(2026, 8, 30), showNow: false }).nowPct).toBeNull();
});

test('empty cards are skipped but a zone always keeps one card', () => {
  const payload = buildStagePayload({ shopping: { open_count: 0, lists: [] } });
  const now = new Date(2026, 8, 29, 7, 12);
  expect(cardHasContent('weather', payload, { now })).toBe(false);
  expect(rotatingCards(['dinner', 'shopping', 'weather'], payload, { skipEmpty: true, now })).toEqual(['dinner']);
  expect(rotatingCards(['shopping', 'weather'], payload, { skipEmpty: true, now })).toEqual(['shopping']);
  expect(rotatingCards(['shopping', 'weather'], payload, { skipEmpty: false, now })).toEqual(['shopping', 'weather']);
  // Evening looks at tomorrow's meals.
  expect(cardHasContent('dinner', payload, { ahead: true, now })).toBe(false);
});

test('weatherKind maps WMO codes', () => {
  expect(weatherKind(0)).toBe('clear');
  expect(weatherKind(2)).toBe('partly');
  expect(weatherKind(61)).toBe('rain');
  expect(weatherKind(75)).toBe('snow');
  expect(weatherKind(95)).toBe('storm');
});

test('rotation slots are derived from the clock and staggered per zone', () => {
  const intervalMs = 60000;
  expect(zoneOffset({ stagger: true, zoneIndex: 2, zoneCount: 4, intervalMs })).toBe(30000);
  expect(zoneOffset({ stagger: false, zoneIndex: 2, zoneCount: 4, intervalMs })).toBe(0);
  const slot = rotationSlot(125000, { cardCount: 3, intervalMs, offsetMs: 30000 });
  expect(slot).toEqual({ slot: 1, index: 1, startedAt: 90000, nextAt: 150000 });
});
