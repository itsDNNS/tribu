import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import FamilyHub from '../../components/family/FamilyHub';
import { buildMessages } from '../../lib/i18n';

let mockApp = {};
let mockRewards = {};
const mockNow = new Date(2026, 8, 28, 14, 30);
const mockEvents = [
  { id: 1, title: 'Schwimmen', starts_at: '2026-09-28T16:00:00', ends_at: '2026-09-28T17:00:00', all_day: false, assigned_to: [3] },
];
const mockGifts = [{ id: 5, status: 'idea', for_user_id: null, for_person_name: 'Opa Karl' }];

jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../hooks/useCurrentMinute', () => ({ useCurrentMinute: () => mockNow }));
jest.mock('../../hooks/useRewards', () => ({ useRewards: () => mockRewards }));
jest.mock('../../lib/api', () => ({
  apiGetEvents: jest.fn(() => Promise.resolve({ ok: true, data: mockEvents })),
  apiGetGifts: jest.fn(() => Promise.resolve({ ok: true, data: { items: mockGifts } })),
}));

const members = [
  { user_id: 1, display_name: 'Dennis', is_adult: true, color: '#7c5cc4' },
  { user_id: 3, display_name: 'Lena', is_adult: false, color: '#d24d7c' },
];

async function renderHub(overrides = {}) {
  const setActiveView = jest.fn();
  mockApp = {
    members,
    tasks: [{ id: 9, title: 'Zimmer', status: 'open', assigned_to_user_id: 3 }],
    birthdays: [{ person_name: 'Opa Karl', month: 10, day: 6 }, { person_name: 'Tante Eva', month: 10, day: 1 }],
    activity: [],
    familyId: 7,
    messages: buildMessages('de'),
    lang: 'de',
    timeFormat: '24h',
    isChild: false,
    demoMode: false,
    events: [],
    setActiveView,
    ...overrides,
  };
  mockRewards = {
    currency: { name: 'Sterne', icon: 'star' },
    balances: [{ user_id: 3, balance: 6 }, { user_id: 1, balance: 2 }],
    catalog: [{ name: 'Kinoabend', cost: 10, is_active: true }],
  };
  render(<FamilyHub />);
  await act(async () => {});
  return setActiveView;
}

beforeEach(() => sessionStorage.clear());

describe('FamilyHub', () => {
  it('shows each person\'s day and opens it filtered in Today', async () => {
    const setActiveView = await renderHub();
    const lena = screen.getByRole('button', { name: 'Tag von Lena ansehen' });
    expect(lena).toHaveTextContent('16:00');
    expect(lena).toHaveTextContent('Schwimmen');
    expect(lena).toHaveTextContent('1 Aufgabe offen');
    expect(lena).toHaveTextContent('6 Sterne');
    expect(lena).toHaveTextContent('Noch 4 bis Kinoabend');
    // Points are the children's thing.
    expect(screen.getByRole('button', { name: 'Tag von Dennis ansehen' })).not.toHaveTextContent('Sterne');

    fireEvent.click(lena);
    expect(sessionStorage.getItem('tribu_today_member')).toBe('3');
    expect(setActiveView).toHaveBeenCalledWith('dashboard');
  });

  it('links birthdays to their gift ideas', async () => {
    const setActiveView = await renderHub();
    const birthdays = screen.getByRole('region', { name: 'Geburtstage' });
    fireEvent.click(within(birthdays).getByRole('button', { name: /1 Geschenkidee/ }));
    expect(JSON.parse(sessionStorage.getItem('tribu_gifts_focus'))).toMatchObject({ name: 'Opa Karl', add: false });
    expect(setActiveView).toHaveBeenCalledWith('gifts');

    fireEvent.click(within(birthdays).getByRole('button', { name: /Idee notieren/ }));
    expect(JSON.parse(sessionStorage.getItem('tribu_gifts_focus'))).toMatchObject({ name: 'Tante Eva', date: '2026-10-01', add: true });
  });

  it('keeps gift ideas away from children', async () => {
    await renderHub({ isChild: true });
    const birthdays = screen.getByRole('region', { name: 'Geburtstage' });
    expect(within(birthdays).getByText('Opa Karl')).toBeInTheDocument();
    expect(within(birthdays).queryByRole('button')).not.toBeInTheDocument();
  });
});
