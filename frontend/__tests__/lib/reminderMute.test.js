import { EVENT_LINK_HANDOFF, eventReminderTarget, openEventLink, parseEventLink } from '../../lib/reminderMute';
import { peekHandoff, takeHandoff } from '../../lib/viewHandoff';

describe('reminderMute helpers', () => {
  it('reads the event and occurrence from a reminder link', () => {
    expect(eventReminderTarget('/calendar?event=12&at=2026-12-01T09:00:00')).toEqual({
      eventId: 12, familyId: null, at: '2026-12-01T09:00:00', repeats: false, choose: false,
    });
    expect(eventReminderTarget('/calendar?event=12&family=3&at=2026-12-01T09:00:00&repeats=1&mute=choose')).toEqual({
      eventId: 12, familyId: 3, at: '2026-12-01T09:00:00', repeats: true, choose: true,
    });
    // The query a newly opened window gets from the service worker.
    expect(eventReminderTarget('?view=calendar&event=3&at=2026-12-01T09:00:00&repeats=1&mute=choose')?.choose).toBe(true);
    expect(eventReminderTarget('/calendar?event=12')).toBeNull();
    expect(eventReminderTarget('/calendar?event=abc&at=x')).toBeNull();
    expect(eventReminderTarget('')).toBeNull();
  });

  it('switches to the event\'s family before handing the event to the calendar', async () => {
    const order = [];
    const target = { eventId: 3, familyId: 2, at: '2026-12-01T09:00:00', repeats: true, choose: true };
    await openEventLink(target, {
      familyId: '1',
      families: [{ family_id: 1 }, { family_id: 2 }],
      switchFamily: async (fid) => { order.push(`switch ${fid}`); expect(peekHandoff(EVENT_LINK_HANDOFF)).toBeNull(); },
      setActiveView: (view) => order.push(`view ${view}`),
    });
    expect(order).toEqual(['switch 2', 'view calendar']);
    expect(parseEventLink(takeHandoff(EVENT_LINK_HANDOFF))).toEqual(target);
  });

  it('stays in the family when the link is for it, and ignores a family one has left', async () => {
    const switchFamily = jest.fn();
    const setActiveView = jest.fn();
    await openEventLink({ eventId: 3, familyId: 1, at: 'x', choose: true }, { familyId: 1, families: [{ family_id: 1 }], switchFamily, setActiveView });
    expect(switchFamily).not.toHaveBeenCalled();
    expect(takeHandoff(EVENT_LINK_HANDOFF)).not.toBeNull();

    await openEventLink({ eventId: 3, familyId: 9, at: 'x', choose: true }, { familyId: 1, families: [{ family_id: 1 }], switchFamily, setActiveView });
    expect(switchFamily).not.toHaveBeenCalled();
    expect(takeHandoff(EVENT_LINK_HANDOFF)).toBeNull();
    expect(setActiveView).toHaveBeenLastCalledWith('calendar');
  });
});
