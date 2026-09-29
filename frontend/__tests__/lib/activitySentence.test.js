import { activitySentence } from '../../lib/activity/activitySentence';
import { buildMessages } from '../../lib/i18n';
import cases from '../../lib/activity/activityCases.json';

describe('activitySentence', () => {
  for (const lang of ['en', 'de']) {
    const messages = buildMessages(lang);
    it.each(cases.cases.map((c) => [c.entry.action, c.entry.object_type, c]))(
      `phrases %s %s in ${lang}`,
      (_action, _type, c) => {
        expect(activitySentence(c.entry, messages)).toBe(c[lang]);
      },
    );
  }

  it('covers every recorded action in all languages', () => {
    const keys = Object.keys(buildMessages('en')).filter((key) => key.startsWith('activity.'));
    expect(keys).toHaveLength(13);
    for (const lang of ['fr', 'pl', 'ga']) {
      const messages = buildMessages(lang);
      for (const key of keys) expect(messages[key]).toContain('{name}');
    }
  });
});
