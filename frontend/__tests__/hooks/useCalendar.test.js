jest.mock('../../contexts/AppContext', () => ({
  useApp: jest.fn(),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../lib/api', () => ({
  apiCreateEvent: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  apiUpdateEvent: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  apiGetEvents: jest.fn(() => Promise.resolve({ ok: true, data: [] })),
}));

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => key === 'module.calendar.duplicating_hint'
    ? 'Duplicating "{title}". Adjust the details and save it as a new event.'
    : key,
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

  it('keeps two contact-synced same-name same-date birthdays separate', () => {
    const { buildBirthdayEvents } = require('../../hooks/useCalendar');
    const events = buildBirthdayEvents({
      viewYear: 2026,
      birthdays: [
        { id: 1, contact_id: 11, person_name: 'Max', month: 9, day: 3 },
        { id: 2, contact_id: 12, person_name: 'Max', month: 9, day: 3 },
      ],
      members: [],
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.title)).toEqual(['Max', 'Max']);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
  });
});

describe('useCalendar edit flow', () => {
  const { renderHook, act } = require('@testing-library/react');

  function setupAppContext(overrides = {}) {
    const { useApp } = require('../../contexts/AppContext');
    const ctx = {
      familyId: '1',
      events: [],
      setEvents: jest.fn(),
      setSummary: jest.fn(),
      summary: { next_events: [] },
      messages: {},
      lang: 'en',
      timeFormat: '24h',
      members: [{ user_id: 7, display_name: 'Max' }],
      loadEventsForRange: jest.fn(() => Promise.resolve()),
      loadDashboard: jest.fn(() => Promise.resolve()),
      demoMode: true,
      ...overrides,
    };
    useApp.mockReturnValue(ctx);
    return ctx;
  }

  beforeEach(() => jest.clearAllMocks());

  it('startEdit now accepts recurring events and prefills all new fields', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startEdit({
      id: 10,
      title: 'Weekly standup',
      starts_at: '2026-04-21T09:00:00',
      ends_at: '2026-04-21T09:30:00',
      description: 'sync',
      location: 'Club house, Field 2',
      all_day: false,
      recurrence: 'weekly',
      recurrence_end: '2026-12-31T00:00:00',
      assigned_to: [7],
      color: '#7c3aed',
      category: 'work',
      icon: 'music',
      is_recurring: true,
    }));

    expect(result.current.editingEvent).toEqual(expect.objectContaining({ id: 10 }));
    expect(result.current.editTitle).toBe('Weekly standup');
    expect(result.current.editLocation).toBe('Club house, Field 2');
    expect(result.current.editRecurrence).toBe('weekly');
    expect(result.current.editRecurrenceEnd).toBe('2026-12-31');
    // AssignChips compares against numeric member.user_id via
    // assignedTo.includes(m.user_id), so prefilled IDs must stay numeric.
    expect(result.current.editAssignedTo).toEqual([7]);
    expect(result.current.editColor).toBe('#7c3aed');
    expect(result.current.editCategory).toBe('work');
    expect(result.current.editIcon).toBe('music');
  });

  it('startEdit preserves an "all" assignment instead of coercing it to an array', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startEdit({
      id: 11, title: 'Family dinner', starts_at: '2026-04-21T18:00:00',
      ends_at: null, description: '', all_day: false, recurrence: '',
      recurrence_end: null, assigned_to: 'all', color: null, category: null,
      is_recurring: false,
    }));

    expect(result.current.editAssignedTo).toEqual(['all']);
  });

  it('startEdit still skips birthday pseudo-events', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startEdit({ id: 99, _isBirthday: true, title: 'Oma' }));

    expect(result.current.editingEvent).toBeNull();
  });

  it('saveEdit payload includes recurrence, assigned_to, color, category, icon, and location', async () => {
    const ctx = setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startEdit({
      id: 42, title: 'Dentist', starts_at: '2026-05-01T10:00:00', ends_at: null,
      description: '', location: 'Old clinic', all_day: false, recurrence: '', recurrence_end: null,
      assigned_to: null, color: null, category: null, is_recurring: false,
    }));
    act(() => {
      result.current.setEditRecurrence('monthly');
      result.current.setEditAssignedTo(['7']);
      result.current.setEditColor('#22d3ee');
      result.current.setEditCategory('health');
      result.current.setEditIcon('dentist');
      result.current.setEditLocation('Main Street Clinic');
    });

    await act(async () => {
      await result.current.saveEdit({ preventDefault: () => {} });
    });

    expect(api.apiUpdateEvent).toHaveBeenCalledWith(42, expect.objectContaining({
      recurrence: 'monthly',
      assigned_to: [7],
      color: '#22d3ee',
      icon: 'dentist',
      location: 'Main Street Clinic',
    }));
    // all_day and category are intentionally omitted from the PATCH
    // because no edit UI exposes them; backend no-change semantics
    // preserve the prior values.
    expect(api.apiUpdateEvent.mock.calls[0][1]).not.toHaveProperty('all_day');
    expect(api.apiUpdateEvent.mock.calls[0][1]).not.toHaveProperty('category');
    expect(result.current.editingEvent).toBeNull();
    expect(ctx.loadDashboard).toHaveBeenCalled();
  });

  it('createEvent sends an optional location and resets it after save', async () => {
    setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useCalendar());

    act(() => {
      result.current.setTitle('Football practice');
      result.current.setStartsAt('2026-05-12T16:00');
      result.current.setLocation('Sports Park, Field 2');
      result.current.setIcon('soccer');
    });

    await act(async () => {
      await result.current.createEvent({ preventDefault: () => {} });
    });

    expect(api.apiCreateEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Football practice',
      location: 'Sports Park, Field 2',
      icon: 'soccer',
    }));
    expect(result.current.location).toBe('');
    expect(result.current.icon).toBe('');
  });

  it('saveEdit does not wipe the dialog if the user switched events mid-save', async () => {
    setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    let resolveSave;
    api.apiUpdateEvent.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = () => resolve({ ok: true, data: {} }); }),
    );
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startEdit({
      id: 1, title: 'A', starts_at: '2026-05-01T10:00:00', ends_at: null,
      description: '', all_day: false, recurrence: '', recurrence_end: null,
      assigned_to: null, color: null, category: null, is_recurring: false,
    }));

    let savePromise;
    act(() => {
      savePromise = result.current.saveEdit({ preventDefault: () => {} });
    });

    // User reopens a different event while A's PATCH is still pending.
    act(() => result.current.startEdit({
      id: 2, title: 'B', starts_at: '2026-05-02T10:00:00', ends_at: null,
      description: '', all_day: false, recurrence: '', recurrence_end: null,
      assigned_to: null, color: null, category: null, is_recurring: false,
    }));

    await act(async () => {
      resolveSave();
      await savePromise;
    });

    expect(result.current.editingEvent).toEqual(expect.objectContaining({ id: 2 }));
    expect(result.current.editTitle).toBe('B');
  });
});

describe('useCalendar duplicate flow', () => {
  const { renderHook, act } = require('@testing-library/react');

  function setupAppContext(overrides = {}) {
    const { useApp } = require('../../contexts/AppContext');
    const ctx = {
      familyId: '1',
      events: [],
      setEvents: jest.fn(),
      setSummary: jest.fn(),
      summary: { next_events: [] },
      messages: {},
      lang: 'en',
      timeFormat: '24h',
      members: [{ user_id: 7, display_name: 'Max' }],
      birthdays: [],
      loadDashboard: jest.fn(() => Promise.resolve()),
      demoMode: true,
      ...overrides,
    };
    useApp.mockReturnValue(ctx);
    return ctx;
  }

  function sourceEvent(overrides = {}) {
    return {
      id: 42,
      family_id: 1,
      title: 'Family dinner',
      description: 'Bring dessert',
      location: 'Club house',
      starts_at: '2026-08-14T18:00:00',
      ends_at: '2026-08-14T20:30:00',
      all_day: true,
      recurrence: 'weekly',
      recurrence_end: '2026-12-31',
      assigned_to: ['7'],
      color: '#7c3aed',
      category: 'family',
      icon: 'meal',
      source_type: 'subscription',
      source_name: 'School calendar',
      ical_uid: 'remote-uid',
      occurrence_date: '2026-08-14',
      is_recurring: true,
      ...overrides,
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('opens a cloned, prefilled one-off draft without creating anything', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    const { announce } = require('../../lib/announce');
    const { result } = renderHook(() => useCalendar());
    const source = sourceEvent();

    act(() => result.current.startEdit(sourceEvent({ id: 7 })));
    act(() => result.current.startDuplicate(source));

    expect(api.apiCreateEvent).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Duplicating "Family dinner". Adjust the details and save it as a new event.');
    expect(result.current.duplicateSource).not.toBe(source);
    expect(result.current.duplicateSource).toEqual({ title: 'Family dinner' });
    expect(result.current.editingEvent).toBeNull();
    expect(result.current.title).toBe('Family dinner');
    expect(result.current.description).toBe('Bring dessert');
    expect(result.current.location).toBe('Club house');
    expect(result.current.startsAt).toBe('2026-08-14T18:00');
    expect(result.current.endsAt).toBe('2026-08-14T20:30');
    expect(result.current.allDay).toBe(true);
    expect(result.current.assignedTo).toEqual([7]);
    expect(result.current.color).toBe('#7c3aed');
    expect(result.current.category).toBe('family');
    expect(result.current.icon).toBe('meal');
    expect(result.current.recurrence).toBe('');
    expect(result.current.recurrenceEnd).toBe('');
  });

  it('preserves an all-members assignment and ignores birthday pseudo-events', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startDuplicate(sourceEvent({ assigned_to: 'all' })));
    expect(result.current.assignedTo).toEqual(['all']);

    act(() => result.current.cancelDuplicate());
    act(() => result.current.startDuplicate(sourceEvent({ _isBirthday: true })));
    expect(result.current.duplicateSource).toBeNull();
  });

  it('routes a week occurrence to its month and selects its source date at midnight', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.setCalendarView('week'));
    act(() => result.current.startDuplicate(sourceEvent({ starts_at: '2027-02-03T10:15:00' })));

    expect(result.current.calendarView).toBe('month');
    expect(result.current.selectedDate).toEqual(new Date(2027, 1, 3));
    expect(result.current.calendarMonth.getFullYear()).toBe(2027);
    expect(result.current.calendarMonth.getMonth()).toBe(1);
  });

  it('keeps the draft when month navigation hides the selected day', () => {
    setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startDuplicate(sourceEvent()));
    act(() => result.current.setSelectedDate(null));

    expect(result.current.selectedDate).toBeNull();
    expect(result.current.duplicateSource).toEqual({ title: 'Family dinner' });
    expect(result.current.title).toBe('Family dinner');
  });

  it('submits only curated create fields once and clears the completed draft', async () => {
    setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startDuplicate(sourceEvent()));
    await act(async () => {
      await result.current.createEvent({ preventDefault: jest.fn() });
    });

    expect(api.apiCreateEvent).toHaveBeenCalledTimes(1);
    const payload = api.apiCreateEvent.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({
      family_id: 1,
      title: 'Family dinner',
      description: 'Bring dessert',
      location: 'Club house',
      all_day: true,
      assigned_to: [7],
      color: '#7c3aed',
      category: 'family',
      icon: 'meal',
      recurrence: null,
      recurrence_end: null,
    }));
    for (const key of ['id', 'source_type', 'source_name', 'ical_uid', 'occurrence_date', 'is_recurring']) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(result.current.duplicateSource).toBeNull();
    expect(result.current.title).toBe('');
  });

  it('retains the draft and its fields when create fails', async () => {
    setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    api.apiCreateEvent.mockResolvedValueOnce({ ok: false, data: { detail: 'failed' } });
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startDuplicate(sourceEvent()));
    await act(async () => {
      await result.current.createEvent({ preventDefault: jest.fn() });
    });

    expect(result.current.duplicateSource).not.toBeNull();
    expect(result.current.title).toBe('Family dinner');
    expect(result.current.creating).toBe(false);
  });

  it('prevents duplicate create calls while the first request is pending', async () => {
    setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    let resolveCreate;
    api.apiCreateEvent.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = () => resolve({ ok: true, data: {} });
    }));
    const { result } = renderHook(() => useCalendar());
    act(() => result.current.startDuplicate(sourceEvent()));

    let first;
    let second;
    act(() => {
      first = result.current.createEvent({ preventDefault: jest.fn() });
      second = result.current.createEvent({ preventDefault: jest.fn() });
    });

    expect(api.apiCreateEvent).toHaveBeenCalledTimes(1);
    expect(result.current.creating).toBe(true);
    await act(async () => {
      resolveCreate();
      await Promise.all([first, second]);
    });
    expect(result.current.creating).toBe(false);
  });

  it('does not clear a newer draft made from the same source object', async () => {
    setupAppContext({ demoMode: false });
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    let resolveCreate;
    api.apiCreateEvent.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = () => resolve({ ok: true, data: {} });
    }));
    const { result } = renderHook(() => useCalendar());
    const source = sourceEvent();

    act(() => result.current.startDuplicate(source));
    const firstSnapshot = result.current.duplicateSource;
    let save;
    act(() => { save = result.current.createEvent({ preventDefault: jest.fn() }); });
    act(() => result.current.startDuplicate(source));
    const newerSnapshot = result.current.duplicateSource;

    expect(newerSnapshot).not.toBe(firstSnapshot);
    await act(async () => {
      resolveCreate();
      await save;
    });
    expect(result.current.duplicateSource).toBe(newerSnapshot);
    expect(result.current.title).toBe('Family dinner');
  });

  it('cancels to pristine fields and demo save never calls the API', async () => {
    const ctx = setupAppContext();
    const { useCalendar } = require('../../hooks/useCalendar');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useCalendar());

    act(() => result.current.startDuplicate(sourceEvent()));
    act(() => result.current.cancelDuplicate());
    expect(result.current.duplicateSource).toBeNull();
    expect(result.current.title).toBe('');
    expect(result.current.description).toBe('');
    expect(result.current.location).toBe('');
    expect(result.current.startsAt).toBe('2026-08-14T09:00');
    expect(result.current.endsAt).toBe('');
    expect(result.current.allDay).toBe(false);
    expect(result.current.assignedTo).toEqual([]);

    act(() => result.current.startDuplicate(sourceEvent()));
    await act(async () => {
      await result.current.createEvent({ preventDefault: jest.fn() });
    });
    expect(api.apiCreateEvent).not.toHaveBeenCalled();
    expect(ctx.setEvents).toHaveBeenCalledTimes(1);
  });

  it('clears an active duplicate draft when the family changes', () => {
    const firstContext = setupAppContext();
    const { useApp } = require('../../contexts/AppContext');
    const { useCalendar } = require('../../hooks/useCalendar');
    const { result, rerender } = renderHook(() => useCalendar());

    act(() => result.current.startDuplicate(sourceEvent()));
    expect(result.current.duplicateSource).not.toBeNull();

    useApp.mockReturnValue({ ...firstContext, familyId: '2' });
    rerender();

    expect(result.current.duplicateSource).toBeNull();
    expect(result.current.title).toBe('');
    expect(result.current.assignedTo).toEqual([]);
  });
});
