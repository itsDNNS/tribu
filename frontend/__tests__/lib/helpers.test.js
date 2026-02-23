import { toIsoOrNull, prettyDate, errorText } from '../../lib/helpers';

describe('toIsoOrNull', () => {
  it('returns null for falsy values', () => {
    expect(toIsoOrNull('')).toBeNull();
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
  });

  it('returns ISO string for valid date', () => {
    const result = toIsoOrNull('2026-03-15T10:00');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('prettyDate', () => {
  it('returns dash for falsy values', () => {
    expect(prettyDate('')).toBe('-');
    expect(prettyDate(null)).toBe('-');
  });

  it('formats date in de-DE locale', () => {
    const result = prettyDate('2026-03-15T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(3);
  });
});

describe('errorText', () => {
  it('returns fallback when detail is falsy', () => {
    expect(errorText(null, 'fallback')).toBe('fallback');
    expect(errorText(undefined, 'fallback')).toBe('fallback');
  });

  it('returns string detail directly', () => {
    expect(errorText('some error', 'fallback')).toBe('some error');
  });

  it('extracts msg from array', () => {
    expect(errorText([{ msg: 'field error' }], 'fallback')).toBe('field error');
  });

  it('extracts msg from object', () => {
    expect(errorText({ msg: 'obj error' }, 'fallback')).toBe('obj error');
  });

  it('stringifies unknown objects', () => {
    expect(errorText({ code: 42 }, 'fallback')).toBe('{"code":42}');
  });
});
