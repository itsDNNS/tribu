import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RewardsDashboardWidget from '../../components/RewardsDashboardWidget';

let mockAppState = {};
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

let mockRewards = {};
jest.mock('../../hooks/useRewards', () => ({
  useRewards: () => mockRewards,
}));

const messages = {
  'module.rewards.name': 'Belohnungen',
  'module.rewards.view_all': 'Alle anzeigen',
  'module.rewards.no_currency': 'Noch keine Belohnungs-Währung eingerichtet.',
  'module.rewards.widget_pending': '{count} zur Bestätigung',
};

function baseApp(overrides = {}) {
  return {
    messages,
    isChild: false,
    members: [{ user_id: 2, display_name: 'Mia', is_adult: false }],
    setActiveView: jest.fn(),
    ...overrides,
  };
}

function baseRewards(overrides = {}) {
  return {
    loading: false,
    currency: { id: 1, name: 'Stars', icon: 'star' },
    balances: [{ user_id: 2, display_name: 'Mia', balance: 7, pending: 0 }],
    catalog: [],
    pendingCount: 0,
    myBalance: null,
    ...overrides,
  };
}

describe('RewardsDashboardWidget', () => {
  beforeEach(() => {
    mockAppState = baseApp();
    mockRewards = baseRewards();
  });

  test('renders translated view-all action instead of the raw key', () => {
    render(<RewardsDashboardWidget />);

    expect(screen.getByRole('button', { name: 'Alle anzeigen' })).toBeInTheDocument();
    expect(screen.queryByText('view_all')).not.toBeInTheDocument();
  });

  test('view-all action opens the rewards view', () => {
    const setActiveView = jest.fn();
    mockAppState = baseApp({ setActiveView });

    render(<RewardsDashboardWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Alle anzeigen' }));

    expect(setActiveView).toHaveBeenCalledWith('rewards');
  });
});
