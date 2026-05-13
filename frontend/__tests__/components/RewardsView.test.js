import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RewardsView from '../../components/RewardsView';

let mockAppState = {};
let mockRewards = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../hooks/useRewards', () => ({
  useRewards: () => mockRewards,
}));

jest.mock('../../lib/i18n', () => ({
  t: (messages, key) => messages?.[key] || key,
}));

jest.mock('../../lib/api', () => ({
  apiUpdateTask: jest.fn(() => Promise.resolve({ ok: true })),
}));

const messages = {
  'module.rewards.name': 'Belohnungen',
  'module.rewards.view_all': 'Alle anzeigen',
  'module.rewards.balance': 'Guthaben',
  'module.rewards.pending': '{count} ausstehend',
  'module.rewards.currency_setup': 'Belohnungs-Währung einrichten',
  'module.rewards.earning_rules': 'Verdienst-Regeln',
  'module.rewards.catalog': 'Belohnungskatalog',
  'module.rewards.redeem': 'Einlösen',
  'module.rewards.confirm': 'Bestätigen',
  'module.rewards.reject': 'Ablehnen',
  'module.rewards.earn_tokens': 'Tokens vergeben',
  'module.rewards.earn_member': 'Mitglied',
  'module.rewards.earn_amount': 'Anzahl',
  'module.rewards.earn_note': 'Notiz (optional)',
  'module.rewards.balances_title': 'Familien-Guthaben',
  'module.rewards.tab_overview': 'Übersicht',
  'module.rewards.tab_catalog': 'Katalog',
  'module.rewards.tab_history': 'Verlauf',
  'module.rewards.no_currency': 'Noch keine Belohnungs-Währung eingerichtet.',
  'module.rewards.from_task': 'Aufgabe: {title}',
  'module.rewards.tasks_with_reward': 'Aufgaben mit Belohnung',
  'module.rewards.history_link': 'Verlauf anzeigen',
  'module.rewards.earn_quick': 'Schnell vergeben',
  'module.rewards.widget_pending': '{count} zur Bestätigung',
  'module.rewards.progress_toward': 'Nächstes Ziel: {name}',
  'module.rewards.progress_remaining': 'noch {count}',
  'module.rewards.no_rules': 'Noch keine Verdienst-Regeln angelegt.',
  'module.rewards.no_rewards': 'Noch keine Belohnungen im Katalog.',
  'module.rewards.rule_name': 'Aktivität',
  'module.rewards.rule_amount': 'Tokens',
  'module.rewards.reward_name': 'Belohnungsname',
  'module.rewards.reward_cost': 'Kosten',
  'module.rewards.reward_icon': 'Symbol',
  'module.rewards.add_rule': 'Regel hinzufügen',
  'module.rewards.add_reward': 'Belohnung hinzufügen',
  'module.rewards.transactions': 'Verlauf',
  'module.rewards.txn_earn': 'Verdient',
  'module.rewards.txn_redeem': 'Eingelöst',
  'module.rewards.txn_pending': 'Ausstehend',
  'module.rewards.txn_confirmed': 'Bestätigt',
  'module.rewards.txn_rejected': 'Abgelehnt',
  'aria.delete_item': 'Delete item: {name}',
};

function baseApp(overrides = {}) {
  return {
    messages,
    members: [
      { user_id: 1, display_name: 'Dennis', is_adult: true },
      { user_id: 2, display_name: 'Mia', is_adult: false },
    ],
    me: { user_id: 1, display_name: 'Dennis' },
    isChild: false,
    tasks: [],
    loadTasks: jest.fn(),
    lang: 'de',
    ...overrides,
  };
}

function baseRewards(overrides = {}) {
  return {
    loading: false,
    currency: { id: 1, name: 'Sterne', icon: 'star' },
    balances: [{ user_id: 2, display_name: 'Mia', balance: 8, pending: 1 }],
    catalog: [{ id: 1, name: 'Filmabend', cost: 6, is_active: true }],
    rules: [{ id: 2, name: 'Tisch decken', amount: 1 }],
    transactions: [{ id: 3, user_id: 2, kind: 'earn', amount: 1, note: 'Zimmer', status: 'pending', created_at: '2026-05-13T10:00:00Z' }],
    pendingTxns: [{ id: 3, user_id: 2, kind: 'earn', amount: 1, note: 'Zimmer', status: 'pending', created_at: '2026-05-13T10:00:00Z' }],
    pendingCount: 1,
    myBalance: null,
    earnTokens: jest.fn(),
    redeem: jest.fn(),
    confirmTxn: jest.fn(),
    rejectTxn: jest.fn(),
    createRule: jest.fn(),
    deleteRule: jest.fn(),
    createReward: jest.fn(),
    deleteReward: jest.fn(),
    createCurrency: jest.fn(),
    ...overrides,
  };
}

describe('RewardsView', () => {
  beforeEach(() => {
    mockAppState = baseApp();
    mockRewards = baseRewards();
  });

  test('renders rewards as paper panels with balances and quick award', () => {
    const { container } = render(<RewardsView />);

    expect(container.querySelector('.rewards-page')).toBeInTheDocument();
    expect(container.querySelectorAll('.rewards-panel').length).toBeGreaterThan(1);
    expect(screen.getByRole('heading', { name: 'Belohnungen' })).toBeInTheDocument();
    expect(screen.getByText('Familien-Guthaben')).toBeInTheDocument();
    expect(screen.getByText('Schnell vergeben')).toBeInTheDocument();
    expect(screen.getAllByText('Mia').length).toBeGreaterThan(0);
  });

  test('quick award keeps the existing earn action', async () => {
    render(<RewardsView />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Anzahl'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('Notiz (optional)'), { target: { value: 'Danke' } });
    fireEvent.click(screen.getByRole('button', { name: /Tokens vergeben/i }));

    await waitFor(() => expect(mockRewards.earnTokens).toHaveBeenCalledWith(2, 3, 'Danke'));
  });

  test('catalog creation preserves reward icon selection', async () => {
    render(<RewardsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Katalog' }));
    fireEvent.change(screen.getByPlaceholderText('Belohnungsname'), { target: { value: 'Extra Geschichte' } });
    fireEvent.change(screen.getByLabelText('Kosten'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'heart' } });
    fireEvent.click(screen.getByRole('button', { name: 'Belohnung hinzufügen' }));

    await waitFor(() => expect(mockRewards.createReward).toHaveBeenCalledWith('Extra Geschichte', 4, 'heart'));
  });

  test('shows the calm currency setup state before rewards are configured', () => {
    mockRewards = baseRewards({ currency: null, balances: [], catalog: [], rules: [], pendingTxns: [], pendingCount: 0 });

    const { container } = render(<RewardsView />);

    expect(screen.getByText('Belohnungs-Währung einrichten')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stars/i })).toBeInTheDocument();
    expect(container.querySelector('.rewards-setup')).toBeInTheDocument();
  });
});
