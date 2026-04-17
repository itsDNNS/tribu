import { toIsoOrNull, prettyDate, errorText, copyTextToClipboard } from '../../lib/helpers';

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

  it('returns localized message for structured error with matching code', () => {
    const messages = { 'error.MEMBER_NOT_FOUND': 'Member not found' };
    const detail = { code: 'MEMBER_NOT_FOUND', message: 'Mitglied nicht gefunden' };
    expect(errorText(detail, 'fallback', messages)).toBe('Member not found');
  });

  it('interpolates params in localized message', () => {
    const messages = { 'error.INVALID_STATUS': 'Invalid status: {status}' };
    const detail = { code: 'INVALID_STATUS', message: 'Invalid status: foo', params: { status: 'foo' } };
    expect(errorText(detail, 'fallback', messages)).toBe('Invalid status: foo');
  });

  it('falls back to detail.message when code not in messages', () => {
    const messages = {};
    const detail = { code: 'UNKNOWN_CODE', message: 'Some error' };
    expect(errorText(detail, 'fallback', messages)).toBe('Some error');
  });

  it('falls back to detail.message when no messages dict provided', () => {
    const detail = { code: 'MEMBER_NOT_FOUND', message: 'Member not found' };
    expect(errorText(detail, 'fallback')).toBe('Member not found');
  });

  it('returns message from object without code', () => {
    expect(errorText({ message: 'plain error' }, 'fallback')).toBe('plain error');
  });

  it('backward compat: 2-arg call still works', () => {
    expect(errorText('direct string', 'fallback')).toBe('direct string');
    expect(errorText(null, 'fallback')).toBe('fallback');
  });
});

describe('copyTextToClipboard', () => {
  afterEach(() => {
    delete global.navigator;
    jest.restoreAllMocks();
  });

  it('returns false when clipboard API is unavailable', async () => {
    await expect(copyTextToClipboard('abc')).resolves.toBe(false);
  });

  it('writes text through navigator.clipboard when available', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    global.navigator = { clipboard: { writeText } };
    await expect(copyTextToClipboard('abc')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('returns false when clipboard write rejects', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('nope'));
    global.navigator = { clipboard: { writeText } };
    await expect(copyTextToClipboard('abc')).resolves.toBe(false);
  });
});
