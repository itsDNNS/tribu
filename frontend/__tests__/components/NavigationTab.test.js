import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import NavigationTab from '../../components/settings/NavigationTab';
import { DEFAULT_NAV_ORDER } from '../../contexts/AppContext';

let mockAppState = {};
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
  DEFAULT_NAV_ORDER: jest.requireActual('../../contexts/AppContext').DEFAULT_NAV_ORDER,
}));

jest.mock('../../lib/api', () => ({
  apiUpdateNavOrder: jest.fn(),
}));

const messages = {
  nav_order_title: 'Navigation',
  'settings.navigation_desc': 'Sort the areas.',
  'settings.navigation_up': '{name} nach oben',
  'settings.navigation_down': '{name} nach unten',
  'nav.group.plan': 'Planen',
  'nav.group.lists': 'Listen',
  'module.responsive.group_family': 'Familie',
  nav_save: 'Speichern',
  nav_saved: 'Gespeichert',
  nav_reset: 'Zuruecksetzen',
  'nav.group.today': 'Heute',
  calendar: 'Kalender',
  activity: 'Aktivitäten',
  contacts: 'Kontakte',
  notifications: 'Benachrichtigungen',
  'module.shopping.name': 'Einkauf',
  'module.tasks.name': 'Aufgaben',
  'module.templates.name': 'Vorlagen',
  'module.weekly_plan.title': 'Wochenplan',
  'module.meal_plans.name': 'Essensplan',
  'module.school_timetables.name': 'Stundenpläne',
  'module.recipes.name': 'Rezepte',
  'module.rewards.name': 'Belohnungen',
  'module.gifts.name': 'Geschenke',
};

function baseState(overrides) {
  return {
    messages,
    isAdmin: false,
    isChild: false,
    demoMode: false,
    navOrder: DEFAULT_NAV_ORDER,
    setNavOrder: jest.fn(),
    ...overrides,
  };
}

const LABEL_BY_KEY = {
  dashboard: 'Heute',
  calendar: 'Kalender',
  activity: 'Aktivitäten',
  shopping: 'Einkauf',
  tasks: 'Aufgaben',
  templates: 'Vorlagen',
  weekly_plan: 'Wochenplan',
  meal_plans: 'Essensplan',
  school_timetables: 'Stundenpläne',
  recipes: 'Rezepte',
  rewards: 'Belohnungen',
  gifts: 'Geschenke',
  contacts: 'Kontakte',
  notifications: 'Benachrichtigungen',
};
// Today is a group of one and notifications live behind the bell; every
// other area is sorted within its group.
const UNSORTED_KEYS = new Set(['dashboard', 'notifications', 'settings', 'admin']);
const SORTABLE_KEYS = DEFAULT_NAV_ORDER.filter((k) => !UNSORTED_KEYS.has(k));

describe('NavigationTab', () => {
  test('renders a row for every sortable key in DEFAULT_NAV_ORDER (drift guard)', () => {
    mockAppState = baseState();
    render(<NavigationTab />);
    // If a new key lands in DEFAULT_NAV_ORDER without a navigation group or a
    // NAV_ITEM_META entry, NavigationTab silently drops it (issue #149).
    for (const key of SORTABLE_KEYS) {
      const label = LABEL_BY_KEY[key];
      expect(label).toBeDefined();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('sorts areas within their group (regression for #149)', () => {
    mockAppState = baseState();
    render(<NavigationTab />);
    const family = screen.getByRole('group', { name: 'Familie' });
    expect(within(family).getByText('Belohnungen')).toBeInTheDocument();
    expect(within(family).getByRole('button', { name: 'Belohnungen nach oben' })).toBeInTheDocument();
    expect(within(family).getByRole('button', { name: 'Belohnungen nach unten' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Listen' })).queryByText('Belohnungen')).not.toBeInTheDocument();
  });

  test('saves the full order after moving an area within its group', async () => {
    const api = require('../../lib/api');
    api.apiUpdateNavOrder.mockResolvedValue({ ok: true });
    mockAppState = baseState();
    render(<NavigationTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Aufgaben nach oben' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(mockAppState.setNavOrder).toHaveBeenCalled());
    const saved = api.apiUpdateNavOrder.mock.calls[0][0];
    expect(saved.indexOf('tasks')).toBeLessThan(saved.indexOf('shopping'));
    expect([...saved].sort()).toEqual([...DEFAULT_NAV_ORDER].sort());
  });

  test('hides adult-only items for children but still shows rewards', () => {
    mockAppState = baseState({ isChild: true });
    render(<NavigationTab />);
    expect(screen.queryByText('Wochenplan')).not.toBeInTheDocument();
    expect(screen.queryByText('Geschenke')).not.toBeInTheDocument();
    expect(screen.getByText('Belohnungen')).toBeInTheDocument();
  });

  test('hides demo-blocked items in demo mode but still shows meal plans and rewards', () => {
    mockAppState = baseState({ demoMode: true });
    render(<NavigationTab />);
    expect(screen.getByText('Essensplan')).toBeInTheDocument();
    expect(screen.queryByText('Rezepte')).not.toBeInTheDocument();
    expect(screen.queryByText('Geschenke')).not.toBeInTheDocument();
    expect(screen.getByText('Belohnungen')).toBeInTheDocument();
  });
});
