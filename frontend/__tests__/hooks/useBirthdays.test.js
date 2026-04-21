jest.mock('../../contexts/AppContext', () => ({
  useApp: jest.fn(),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../lib/api', () => ({
  apiAddBirthday: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  apiUpdateBirthday: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  apiDeleteBirthday: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
}));

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => key,
}));

jest.mock('../../lib/announce', () => ({
  announce: jest.fn(),
}));

jest.mock('../../lib/helpers', () => ({
  errorText: (_detail, fallback) => fallback,
}));

describe('buildBirthdayList', () => {
  const { buildBirthdayList } = require('../../hooks/useBirthdays');

  it('returns an empty list when both sources are empty', () => {
    expect(buildBirthdayList()).toEqual([]);
    expect(buildBirthdayList({ birthdays: [], members: [] })).toEqual([]);
  });

  it('sorts entries by month then day', () => {
    const list = buildBirthdayList({
      birthdays: [
        { id: 1, person_name: 'Late', month: 12, day: 31 },
        { id: 2, person_name: 'Middle', month: 6, day: 15 },
        { id: 3, person_name: 'Early', month: 6, day: 1 },
      ],
      members: [],
    });
    expect(list.map((b) => b.person_name)).toEqual(['Early', 'Middle', 'Late']);
  });

  it('includes family members with a stored date_of_birth and marks them', () => {
    const list = buildBirthdayList({
      birthdays: [{ id: 1, person_name: 'Oma Schmidt', month: 4, day: 14 }],
      members: [{ user_id: 7, display_name: 'Max', date_of_birth: '2015-09-03', color: '#7c3aed' }],
    });
    const max = list.find((b) => b.person_name === 'Max');
    expect(max).toEqual(expect.objectContaining({
      person_name: 'Max',
      month: 9,
      day: 3,
      year: 2015,
      _isMember: true,
      _memberId: 7,
      _memberColor: '#7c3aed',
    }));
    expect(max.id).toBe('member-7');
    expect(max).not.toHaveProperty('_member');
  });

  it('keeps a standalone and a member with the same name and date as two entries', () => {
    // Collapsing would hide a legitimate duplicate namesake. The list
    // does not deduplicate across sources; admins can delete a stale
    // standalone entry if it shadows a member.
    const list = buildBirthdayList({
      birthdays: [{ id: 99, person_name: 'Max', month: 9, day: 3, year: 2015 }],
      members: [{ user_id: 7, display_name: 'Max', date_of_birth: '2015-09-03' }],
    });
    expect(list).toHaveLength(2);
    expect(list.some((b) => b._isMember)).toBe(true);
    expect(list.some((b) => !b._isMember)).toBe(true);
  });

  it('skips members without date_of_birth and malformed date strings', () => {
    const list = buildBirthdayList({
      birthdays: [],
      members: [
        { user_id: 1, display_name: 'NoDob' },
        { user_id: 2, display_name: 'BadDob', date_of_birth: 'not-a-date' },
        { user_id: 3, display_name: 'Good', date_of_birth: '1990-01-15' },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0].person_name).toBe('Good');
  });
});

describe('birthdayAge', () => {
  const { birthdayAge } = require('../../hooks/useBirthdays');

  it('returns null when the year is missing', () => {
    expect(birthdayAge({ month: 4, day: 14 })).toBeNull();
    expect(birthdayAge({ year: null, month: 4, day: 14 })).toBeNull();
  });

  it('computes age when the birthday has already happened this year', () => {
    expect(birthdayAge({ year: 1985, month: 1, day: 1 }, new Date(2026, 3, 21))).toBe(41);
  });

  it('subtracts one when the birthday has not happened yet this year', () => {
    expect(birthdayAge({ year: 1985, month: 12, day: 31 }, new Date(2026, 3, 21))).toBe(40);
  });

  it('counts the birthday itself as the new age (same day)', () => {
    expect(birthdayAge({ year: 2015, month: 4, day: 21 }, new Date(2026, 3, 21))).toBe(11);
  });

  it('returns null when the person has not yet been born', () => {
    expect(birthdayAge({ year: 2030, month: 6, day: 1 }, new Date(2026, 3, 21))).toBeNull();
  });

  it('rejects clearly invalid years before 1900', () => {
    expect(birthdayAge({ year: 1800, month: 4, day: 14 })).toBeNull();
  });
});

describe('useBirthdays year handling', () => {
  const { renderHook, act } = require('@testing-library/react');

  function setupAppContext(overrides = {}) {
    const { useApp } = require('../../contexts/AppContext');
    const ctx = {
      birthdays: [],
      setBirthdays: jest.fn(),
      familyId: '1',
      messages: {},
      loadBirthdays: jest.fn(() => Promise.resolve()),
      loadDashboard: jest.fn(() => Promise.resolve()),
      demoMode: false,
      ...overrides,
    };
    useApp.mockReturnValue(ctx);
    return ctx;
  }

  beforeEach(() => jest.clearAllMocks());

  it('createBirthday posts year as a number when the user filled it in', async () => {
    setupAppContext();
    const { useBirthdays } = require('../../hooks/useBirthdays');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useBirthdays());

    act(() => {
      result.current.setPersonName('Oma Schmidt');
      result.current.setBirthdayMonth('4');
      result.current.setBirthdayDay('14');
      result.current.setBirthdayYear('1948');
    });

    await act(async () => {
      await result.current.createBirthday({ preventDefault: () => {} });
    });

    expect(api.apiAddBirthday).toHaveBeenCalledWith(expect.objectContaining({
      person_name: 'Oma Schmidt', month: 4, day: 14, year: 1948,
    }));
  });

  it('createBirthday posts year as null when the user left it empty', async () => {
    setupAppContext();
    const { useBirthdays } = require('../../hooks/useBirthdays');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useBirthdays());

    act(() => {
      result.current.setPersonName('Unknown Aunt');
      result.current.setBirthdayMonth('7');
      result.current.setBirthdayDay('3');
    });

    await act(async () => {
      await result.current.createBirthday({ preventDefault: () => {} });
    });

    expect(api.apiAddBirthday).toHaveBeenCalledWith(expect.objectContaining({ year: null }));
  });

  it('openEdit prefills an empty year field when the stored year is null', () => {
    setupAppContext();
    const { useBirthdays } = require('../../hooks/useBirthdays');
    const { result } = renderHook(() => useBirthdays());

    act(() => result.current.openEdit({ id: 1, person_name: 'Opa', month: 2, day: 9, year: null }));

    expect(result.current.birthdayYear).toBe('');
  });

  it('updateBirthday always sends year (null to clear, number to set)', async () => {
    setupAppContext();
    const { useBirthdays } = require('../../hooks/useBirthdays');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useBirthdays());

    act(() => result.current.openEdit({ id: 9, person_name: 'Oma', month: 4, day: 14, year: 1948 }));
    act(() => result.current.setBirthdayYear(''));

    await act(async () => {
      await result.current.updateBirthday({ preventDefault: () => {} });
    });

    expect(api.apiUpdateBirthday).toHaveBeenCalledWith(9, expect.objectContaining({ year: null }));
  });

  it('createBirthday blocks submit with a toast when the year field is not a valid integer', async () => {
    setupAppContext();
    const { useBirthdays } = require('../../hooks/useBirthdays');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useBirthdays());

    act(() => {
      result.current.setPersonName('X');
      result.current.setBirthdayMonth('1');
      result.current.setBirthdayDay('1');
      result.current.setBirthdayYear('1e3');
    });

    await act(async () => {
      await result.current.createBirthday({ preventDefault: () => {} });
    });

    expect(api.apiAddBirthday).not.toHaveBeenCalled();
  });

  it('updateBirthday blocks submit on invalid year input rather than silently sending null', async () => {
    setupAppContext();
    const { useBirthdays } = require('../../hooks/useBirthdays');
    const api = require('../../lib/api');
    const { result } = renderHook(() => useBirthdays());

    act(() => result.current.openEdit({ id: 9, person_name: 'Oma', month: 4, day: 14, year: 1948 }));
    act(() => result.current.setBirthdayYear('abc'));

    await act(async () => {
      await result.current.updateBirthday({ preventDefault: () => {} });
    });

    expect(api.apiUpdateBirthday).not.toHaveBeenCalled();
  });
});
