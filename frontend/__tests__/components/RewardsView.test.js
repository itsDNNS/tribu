import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const messages = {
  'module.rewards.name': 'Belohnungen',
  'module.rewards.stars': 'Sterne',
  'module.rewards.praise': 'Loben',
  'module.rewards.praise_title': 'Jemanden loben',
  'module.rewards.praise_send': 'Lob senden',
  'module.rewards.praise_for': 'Wofür?',
  'module.rewards.praise_who': 'Wen?',
  'module.rewards.praise_stars': '{currency} dazu (optional)',
  'module.rewards.my_stars': 'Meine {currency}',
  'module.rewards.my_goal': 'Mein Ziel',
  'module.rewards.tab_overview': 'Übersicht',
  'module.rewards.tab_wishes': 'Wünsche',
  'module.rewards.tab_history': 'Verlauf',
  'module.rewards.waiting_title': 'Wartet auf dich',
  'module.rewards.waiting_wish': '{name} möchte: {wish}',
  'module.rewards.waiting_give': 'Noch zu übergeben: {wish} für {name}',
  'module.rewards.approve': 'Freigeben',
  'module.rewards.reject': 'Ablehnen',
  'module.rewards.mark_given': 'Übergeben',
  'module.rewards.family_goal_count': '{progress} von {cost}',
  'module.rewards.give_stars': 'Beisteuern',
  'module.rewards.give': 'Dazulegen',
  'module.rewards.give_title': 'Für „{goal}“ beisteuern',
  'module.rewards.set_goal': 'Darauf sparen',
  'module.rewards.is_goal': 'Mein Ziel',
  'module.rewards.redeem': 'Einlösen',
  'module.rewards.add_wish': 'Wunsch hinzufügen',
  'module.rewards.wish_name': 'Wunsch',
  'module.rewards.save': 'Speichern',
  'module.rewards.txn_give': 'Fürs Familienziel',
  'module.rewards.txn_pending': 'Ausstehend',
  'cancel': 'Abbrechen',
};

const members = [
  { user_id: 1, display_name: 'Dennis', is_adult: true },
  { user_id: 2, display_name: 'Anna', is_adult: true },
  { user_id: 3, display_name: 'Mia', is_adult: false },
];

function baseApp(overrides = {}) {
  return { messages, members, me: members[0], isChild: false, tasks: [], lang: 'de', ...overrides };
}

const catalog = [
  { id: 1, name: 'Filmabend', cost: 6, kind: 'personal', is_active: true, icon: 'film' },
  { id: 2, name: 'Eis essen', cost: 20, kind: 'personal', is_active: true, icon: 'icecream' },
  { id: 9, name: 'Zoo', cost: 40, kind: 'family', is_active: true, icon: 'ferris', progress: 20, contributions: [{ user_id: 1, amount: 12 }, { user_id: 3, amount: 8 }] },
];

function baseRewards(overrides = {}) {
  return {
    loading: false,
    currency: { id: 1, name: '', icon: 'star' },
    balances: [
      { user_id: 1, display_name: 'Dennis', balance: 7, pending: 0, goal_reward_id: 1 },
      { user_id: 3, display_name: 'Mia', balance: 3, pending: 0, goal_reward_id: 2 },
    ],
    catalog,
    rules: [{ id: 5, name: 'Tisch gedeckt', amount: 1 }],
    praise: [],
    transactions: [
      { id: 11, user_id: 3, kind: 'redeem', amount: 6, note: 'Filmabend', status: 'pending', source_reward_id: 1, created_at: '2026-09-30T10:00:00' },
      { id: 12, user_id: 3, kind: 'redeem', amount: 5, note: 'Eis essen', status: 'confirmed', fulfilled_at: null, created_at: '2026-09-29T10:00:00' },
      { id: 13, user_id: 1, kind: 'give', amount: 12, note: 'Zoo', status: 'confirmed', source_reward_id: 9, created_at: '2026-09-28T10:00:00' },
    ],
    myBalance: { user_id: 1, balance: 7, pending: 0, goal_reward_id: 1 },
    sendPraise: jest.fn(() => Promise.resolve(true)),
    deletePraise: jest.fn(),
    setGoal: jest.fn(() => Promise.resolve(true)),
    giveToGoal: jest.fn(() => Promise.resolve(true)),
    achieveGoal: jest.fn(),
    redeem: jest.fn(),
    confirmTxn: jest.fn(),
    rejectTxn: jest.fn(),
    fulfillTxn: jest.fn(),
    createRule: jest.fn(),
    deleteRule: jest.fn(),
    saveReward: jest.fn(() => Promise.resolve(true)),
    deleteReward: jest.fn(),
    updateCurrency: jest.fn(),
    ...overrides,
  };
}

describe('RewardsView', () => {
  beforeEach(() => {
    mockAppState = baseApp();
    mockRewards = baseRewards();
  });

  test('shows my stars and goal, with the stars named in the reader\'s language', () => {
    const { container } = render(<RewardsView />);
    const hero = container.querySelector('.rewards-hero');
    expect(within(hero).getByText('Meine Sterne')).toBeInTheDocument();
    expect(within(hero).getByText('Filmabend')).toBeInTheDocument();
    expect(within(hero).getByText('6 / 6')).toBeInTheDocument();
    // Reached: the wish can be redeemed from here.
    fireEvent.click(within(hero).getByRole('button', { name: /Einlösen/ }));
    expect(mockRewards.redeem).toHaveBeenCalledWith(catalog[0]);
  });

  test('grown-ups approve wishes and mark approved ones as given', () => {
    render(<RewardsView />);
    const waiting = screen.getByRole('region', { name: 'Wartet auf dich' });
    expect(within(waiting).getByText('Mia möchte: Filmabend')).toBeInTheDocument();
    fireEvent.click(within(waiting).getByRole('button', { name: 'Freigeben' }));
    expect(mockRewards.confirmTxn).toHaveBeenCalledWith(11);
    fireEvent.click(within(waiting).getByRole('button', { name: /Übergeben/ }));
    expect(mockRewards.fulfillTxn).toHaveBeenCalledWith(12);
  });

  test('everyone puts stars into the family goal', async () => {
    render(<RewardsView />);
    const goal = screen.getByRole('region', { name: 'Zoo' });
    expect(within(goal).getByText(/20 von 40/)).toBeInTheDocument();
    expect(within(goal).getByRole('progressbar', { name: 'Zoo' })).toHaveAttribute('aria-valuenow', '20');
    fireEvent.click(within(goal).getByRole('button', { name: /Beisteuern/ }));
    const dialog = screen.getByRole('dialog', { name: 'Für „Zoo“ beisteuern' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dazulegen' }));
    await waitFor(() => expect(mockRewards.giveToGoal).toHaveBeenCalledWith(catalog[2], 1));
  });

  test('praise needs no stars, and grown-ups can add some', async () => {
    render(<RewardsView />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Loben' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Jemanden loben' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Mia/ }));
    fireEvent.change(within(dialog).getByLabelText('Wofür?'), { target: { value: 'Danke fürs Helfen' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lob senden' }));
    await waitFor(() => expect(mockRewards.sendPraise).toHaveBeenCalledWith({ toUserId: 3, message: 'Danke fürs Helfen', amount: 0 }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Loben' })[0]);
    const again = screen.getByRole('dialog', { name: 'Jemanden loben' });
    fireEvent.click(within(again).getByRole('radio', { name: /Anna/ }));
    fireEvent.click(within(again).getByRole('button', { name: /Tisch gedeckt/ }));
    fireEvent.click(within(again).getByRole('button', { name: 'Lob senden' }));
    await waitFor(() => expect(mockRewards.sendPraise).toHaveBeenLastCalledWith({ toUserId: 2, message: 'Tisch gedeckt', amount: 1 }));
  });

  test('children praise without stars and do not see the grown-ups\' queue', () => {
    mockAppState = baseApp({ me: members[2], isChild: true });
    mockRewards = baseRewards({ myBalance: { user_id: 3, balance: 3, pending: 0, goal_reward_id: 2 }, balances: [{ user_id: 3, display_name: 'Mia', balance: 3, pending: 0, goal_reward_id: 2 }] });
    render(<RewardsView />);
    expect(screen.queryByRole('region', { name: 'Wartet auf dich' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Loben' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Jemanden loben' });
    expect(within(dialog).queryByText('Sterne dazu (optional)')).not.toBeInTheDocument();
  });

  test('wishes can become my goal, and grown-ups add new ones', async () => {
    render(<RewardsView />);
    fireEvent.click(screen.getByRole('tab', { name: 'Wünsche' }));
    const toggles = screen.getAllByRole('button', { name: /Darauf sparen|Mein Ziel/ });
    fireEvent.click(toggles[1]);
    expect(mockRewards.setGoal).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: /Wunsch hinzufügen/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Wunsch'), { target: { value: 'Neues Buch' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(mockRewards.saveReward).toHaveBeenCalledWith(undefined, { name: 'Neues Buch', cost: 10, icon: 'gift', kind: 'personal' }));
  });

  test('the history tells stars for the family goal apart', () => {
    render(<RewardsView />);
    fireEvent.click(screen.getByRole('tab', { name: 'Verlauf' }));
    expect(screen.getByText('Dennis · Fürs Familienziel')).toBeInTheDocument();
    expect(screen.getByText('Ausstehend')).toBeInTheDocument();
  });
});
