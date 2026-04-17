jest.mock('../../contexts/AppContext', () => ({
  useApp: jest.fn(),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../lib/api', () => ({}));

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => key,
}));

jest.mock('../../lib/announce', () => ({
  announce: jest.fn(),
}));

describe('buildBirthdayEvents', () => {
  it('includes family birthdays alongside member birthdays', () => {
    const { buildBirthdayEvents } = require('../../hooks/useCalendar');
    const events = buildBirthdayEvents({
      viewYear: 2026,
      birthdays: [{ person_name: 'Oma Schmidt', month: 4, day: 14 }],
      members: [{ user_id: 7, display_name: 'Max', date_of_birth: '2015-09-03' }],
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.title)).toEqual(expect.arrayContaining(['Oma Schmidt', 'Max (11)']));
    expect(events.every((event) => event._isBirthday)).toBe(true);
  });

  it('deduplicates same-name same-date birthdays', () => {
    const { buildBirthdayEvents } = require('../../hooks/useCalendar');
    const events = buildBirthdayEvents({
      viewYear: 2026,
      birthdays: [{ person_name: 'Max', month: 9, day: 3 }],
      members: [{ user_id: 7, display_name: 'Max', date_of_birth: '2015-09-03' }],
    });

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Max (11)');
  });
});
