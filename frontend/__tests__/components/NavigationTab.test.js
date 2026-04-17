import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NavigationTab from '../../components/settings/NavigationTab';
import { DEFAULT_NAV_ORDER } from '../../contexts/UIContext';

let mockAppState = {};
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
  DEFAULT_NAV_ORDER: jest.requireActual('../../contexts/UIContext').DEFAULT_NAV_ORDER,
}));

jest.mock('../../lib/api', () => ({
  apiUpdateNavOrder: jest.fn(),
}));

const messages = {
  nav_order_title: 'Navigation',
  nav_order_desc: 'Sort the nav.',
  nav_visible: 'sichtbar',
  nav_overflow: 'mehr',
  nav_save: 'Speichern',
  nav_saved: 'Gespeichert',
  nav_reset: 'Zuruecksetzen',
  dashboard: 'Dashboard',
  calendar: 'Kalender',
  contacts: 'Kontakte',
  notifications: 'Benachrichtigungen',
  'module.shopping.name': 'Einkauf',
  'module.tasks.name': 'Aufgaben',
  'module.meal_plans.name': 'Essensplan',
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
  dashboard: 'Dashboard',
  calendar: 'Kalender',
  shopping: 'Einkauf',
  tasks: 'Aufgaben',
  meal_plans: 'Essensplan',
  rewards: 'Belohnungen',
  gifts: 'Geschenke',
  contacts: 'Kontakte',
  notifications: 'Benachrichtigungen',
};
const PINNED_KEYS = new Set(['settings', 'admin']);
const SORTABLE_KEYS = DEFAULT_NAV_ORDER.filter((k) => !PINNED_KEYS.has(k));

describe('NavigationTab', () => {
  test('renders a row for every sortable key in DEFAULT_NAV_ORDER (drift guard)', () => {
    mockAppState = baseState();
    render(<NavigationTab />);
    // If a new key lands in DEFAULT_NAV_ORDER without a matching NAV_ITEM_META entry,
    // NavigationTab silently drops it, reproducing the issue #149 bug. Iterating the
    // actual default keeps this test load-bearing against that drift.
    for (const key of SORTABLE_KEYS) {
      const label = LABEL_BY_KEY[key];
      expect(label).toBeDefined();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('includes rewards entry (regression for #149)', () => {
    mockAppState = baseState();
    render(<NavigationTab />);
    expect(screen.getByText('Belohnungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move belohnungen up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move belohnungen down/i })).toBeInTheDocument();
  });

  test('hides adult-only items for children but still shows rewards', () => {
    mockAppState = baseState({ isChild: true });
    render(<NavigationTab />);
    expect(screen.queryByText('Geschenke')).not.toBeInTheDocument();
    expect(screen.getByText('Belohnungen')).toBeInTheDocument();
  });

  test('hides demo-blocked items in demo mode but still shows rewards', () => {
    mockAppState = baseState({ demoMode: true });
    render(<NavigationTab />);
    expect(screen.queryByText('Essensplan')).not.toBeInTheDocument();
    expect(screen.queryByText('Geschenke')).not.toBeInTheDocument();
    expect(screen.getByText('Belohnungen')).toBeInTheDocument();
  });
});
