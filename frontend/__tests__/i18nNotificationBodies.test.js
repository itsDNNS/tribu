import fs from 'fs';
import path from 'path';

const LOCALE_DIR = path.join(process.cwd(), 'i18n');
const REQUIRED_KEYS = {
  notification_body_event_starts_in: ['{count}'],
  notification_body_task_overdue: [],
  notification_body_birthday_tomorrow: ['{date}'],
};

describe('notification body i18n', () => {
  it('keeps localized scheduler notification body keys and placeholders in every locale bundle', () => {
    const localeFiles = fs.readdirSync(LOCALE_DIR).filter((file) => file.endsWith('.json'));
    expect(localeFiles.length).toBeGreaterThan(0);

    for (const file of localeFiles) {
      const messages = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, file), 'utf8'));
      for (const [key, placeholders] of Object.entries(REQUIRED_KEYS)) {
        expect(messages).toHaveProperty(key);
        expect(typeof messages[key]).toBe('string');
        expect(messages[key].trim()).not.toBe('');
        for (const placeholder of placeholders) {
          expect(messages[key]).toContain(placeholder);
        }
      }
    }
  });
});
