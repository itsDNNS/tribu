import cases from '../../lib/capture/captureCases.json';
import { parseCapture } from '../../lib/capture/parseCapture';

const [date, time] = cases.now.split('T');
const [year, month, day] = date.split('-').map(Number);
const [hour, minute] = time.split(':').map(Number);
const now = new Date(year, month - 1, day, hour, minute);
const products = new Set(cases.products.map((name) => name.toLowerCase()));
const isProduct = (name) => products.has(String(name).toLowerCase());

describe('parseCapture', () => {
  it.each(cases.cases.map((entry) => [entry.text.replaceAll('\n', ' ⏎ '), entry]))('reads "%s"', (_, entry) => {
    const result = parseCapture(entry.text, { now, lang: entry.lang, members: cases.members, isProduct });
    expect(result.map(({ text, ...rest }) => rest)).toEqual(entry.expect);
  });

  it('keeps empty input empty', () => {
    expect(parseCapture('   \n  ', { now })).toEqual([]);
  });

  it('uses the default kind when nothing is recognised', () => {
    const [entry] = parseCapture('Laternenumzug planen', { now, defaultKind: 'shopping' });
    expect(entry.kind).toBe('shopping');
  });
});
