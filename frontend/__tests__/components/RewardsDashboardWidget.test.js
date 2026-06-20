import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RewardsDashboardWidget from '../../components/RewardsDashboardWidget';
import { buildMockAppState, renderWithMockApp } from '../test-utils';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => require('../test-utils').getMockAppState(),
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
  return buildMockAppState({
    messages,
    isChild: false,
    members: [{ user_id: 2, display_name: 'Mia', is_adult: false }],
    ...overrides,
  });
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

function renderWidget(overrides = {}) {
  return renderWithMockApp(<RewardsDashboardWidget />, baseApp(overrides));
}

describe('RewardsDashboardWidget', () => {
  beforeEach(() => {
    mockRewards = baseRewards();
  });

  test('renders translated view-all action instead of the raw key', () => {
    renderWidget();

    expect(screen.getByRole('button', { name: 'Alle anzeigen' })).toBeInTheDocument();
    expect(screen.queryByText('view_all')).not.toBeInTheDocument();
  });

  test('view-all action opens the rewards view', () => {
    const setActiveView = jest.fn();
    renderWidget({ setActiveView });

    fireEvent.click(screen.getByRole('button', { name: 'Alle anzeigen' }));

    expect(setActiveView).toHaveBeenCalledWith('rewards');
  });

  test('keeps the dashboard card visible before a reward currency is configured', () => {
    mockRewards = baseRewards({ currency: null, balances: [] });

    renderWidget();

    expect(screen.getByRole('heading', { name: 'Belohnungen' })).toBeInTheDocument();
    expect(screen.getByText('Noch keine Belohnungs-Währung eingerichtet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle anzeigen' })).toBeInTheDocument();
  });
});
