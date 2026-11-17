import { eventReminderTarget, isSeriesEvent, parseEventLink, setReminderMute, showsReminderControl } from '../../lib/reminderMute';

describe('reminderMute helpers', () => {
  it('reads the event and occurrence from a reminder link', () => {
    expect(eventReminderTarget('/calendar?event=12&at=2026-12-01T09:00:00')).toEqual({
      eventId: 12, at: '2026-12-01T09:00:00', repeats: false, choose: false,
    });
    expect(eventReminderTarget('/calendar?event=12&at=2026-12-01T09:00:00&repeats=1&mute=choose')).toEqual({
      eventId: 12, at: '2026-12-01T09:00:00', repeats: true, choose: true,
    });
    // The query a newly opened window gets from the service worker.
    expect(eventReminderTarget('?view=calendar&event=3&at=2026-12-01T09:00:00&repeats=1&mute=choose')?.choose).toBe(true);
    expect(eventReminderTarget('/calendar?event=12')).toBeNull();
    expect(eventReminderTarget('/calendar?event=abc&at=x')).toBeNull();
    expect(eventReminderTarget('')).toBeNull();
  });

  it('round-trips an event link through the handoff', () => {
    const target = { eventId: 3, at: '2026-12-01T09:00:00', repeats: true, choose: true };
    expect(parseEventLink(JSON.stringify(target))).toEqual(target);
    expect(parseEventLink('nonsense')).toBeNull();
    expect(parseEventLink(null)).toBeNull();
  });

  it('knows series and who sees the control', () => {
    expect(isSeriesEvent({ is_recurring: true })).toBe(true);
    expect(isSeriesEvent({ recurrence_id: '2026-12-01T09:00:00' })).toBe(true);
    expect(isSeriesEvent({ recurrence: null })).toBe(false);
    const event = { reminder_muted: null, remind_only_creator: true, created_by_user_id: 1 };
    expect(showsReminderControl(event, { user_id: 1 })).toBe(true);
    expect(showsReminderControl(event, { user_id: 2 })).toBe(false);
    // The creator left the family: everyone is reminded again.
    expect(showsReminderControl({ ...event, created_by_user_id: null }, { user_id: 2 })).toBe(true);
  });

  it('mutes and unmutes through the API', async () => {
    const api = {
      apiMuteEventReminder: jest.fn().mockResolvedValue({ ok: true, data: { reminder_muted: 'occurrence' } }),
      apiUnmuteEventReminder: jest.fn().mockResolvedValue({ ok: true, data: { reminder_muted: null } }),
    };
    await expect(setReminderMute(api, 4, 'occurrence', '2026-12-01T09:00:00')).resolves.toBe('occurrence');
    expect(api.apiMuteEventReminder).toHaveBeenCalledWith(4, 'occurrence', '2026-12-01T09:00:00');
    await expect(setReminderMute(api, 4, null, '2026-12-01T09:00:00')).resolves.toBeNull();
    expect(api.apiUnmuteEventReminder).toHaveBeenCalledWith(4, '2026-12-01T09:00:00');
    api.apiMuteEventReminder.mockResolvedValue({ ok: false });
    await expect(setReminderMute(api, 4, 'series', null)).rejects.toThrow();
  });
});
