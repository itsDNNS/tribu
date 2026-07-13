import { formatDayMonth, formatWeekRange, localeForLang, startOfWeek, weekStartsOn } from '../../lib/dates';
import { formatIsoDate } from '../../hooks/useMealPlans';

function normalizeRange(value) {
  return value.replace(/[\u2009\u202f]/g, ' ');
}

describe('localized date helpers', () => {
  it('maps English meal planning weeks to Sunday and other languages to Monday', () => {
    expect(weekStartsOn('en')).toBe(0);
    expect(weekStartsOn('de')).toBe(1);
    expect(weekStartsOn('fr')).toBe(1);
  });

  it('calculates localized week starts across year boundaries', () => {
    expect(formatIsoDate(startOfWeek(new Date('2026-01-01T12:00:00'), weekStartsOn('en')))).toBe('2025-12-28');
    expect(formatIsoDate(startOfWeek(new Date('2026-01-01T12:00:00'), weekStartsOn('de')))).toBe('2025-12-29');
  });

  it('formats day/month labels with the selected locale ordering', () => {
    const date = new Date(2026, 6, 13);
    expect(formatDayMonth(date, localeForLang('en'))).toBe('7/13');
    expect(formatDayMonth(date, localeForLang('de'))).toBe('13.7.');
  });

  it('keeps both years visible when a localized week crosses New Year', () => {
    const en = normalizeRange(formatWeekRange(new Date(2025, 11, 28), new Date(2026, 0, 3), localeForLang('en')));
    const de = normalizeRange(formatWeekRange(new Date(2025, 11, 29), new Date(2026, 0, 4), localeForLang('de')));

    expect(en).toMatch(/12\/28\/2025\s*–\s*1\/3\/2026/);
    expect(de).toMatch(/29\.12\.2025\s*–\s*0?4\.0?1\.2026/);
  });
});
