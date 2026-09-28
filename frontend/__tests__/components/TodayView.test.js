import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import messages from '../../i18n/en.json';
import TodayView from '../../components/today/TodayView';
import { handOff, peekHandOff } from '../../lib/handoff';
import { apiConvertQuickCapture, apiGetEvents, apiGetSetupChecklist, apiListMealPlans } from '../../lib/api';

let mockApp = {};
let mockNow = new Date(2026, 8, 30, 10, 0);
const mockToggleTask = jest.fn();
let mockTasks = [];

jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../hooks/useCurrentMinute', () => ({ useCurrentMinute: () => mockNow }));
jest.mock('../../hooks/useTasks', () => ({
  useTasks: () => ({ visibleTasks: mockTasks, toggleTask: mockToggleTask }),
}));
jest.mock('../../lib/api', () => ({
  apiGetEvents: jest.fn(() => Promise.resolve({ ok: true, data: [] })),
  apiListMealPlans: jest.fn(() => Promise.resolve({ ok: true, data: [] })),
  apiGetSetupChecklist: jest.fn(() => Promise.resolve({ ok: false })),
  apiCompleteSetupChecklistStep: jest.fn(),
  apiDismissSetupChecklist: jest.fn(() => Promise.resolve({ ok: true })),
  apiConvertQuickCapture: jest.fn(() => Promise.resolve({ ok: true })),
  apiDismissQuickCapture: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../components/RewardsDashboardWidget', () => function RewardsDashboardWidget() {
  return <div data-testid="rewards-widget" />;
});

const members = [
  { user_id: 1, display_name: 'Max Müller' },
  { user_id: 2, display_name: 'Anna' },
  { user_id: 3, display_name: 'Lena' },
];

const events = [
  { id: 1, title: 'Dentist', starts_at: '2026-09-30T08:00:00', ends_at: '2026-09-30T09:00:00', all_day: false, assigned_to: [1] },
  { id: 2, title: 'Football', starts_at: '2026-09-30T15:00:00', ends_at: '2026-09-30T16:30:00', all_day: false, assigned_to: [3] },
  { id: 3, title: 'Yoga', starts_at: '2026-10-01T18:00:00', ends_at: '2026-10-01T19:00:00', all_day: false, assigned_to: [2] },
];

function baseApp(overrides = {}) {
  return {
    summary: { next_events: [], upcoming_birthdays: [{ person_name: 'Grandpa', occurs_on: '2026-10-02', days_until: 2 }] },
    me: { user_id: 1, display_name: 'Max Müller' },
    members,
    events: [],
    shoppingLists: [],
    mealPlans: [],
    activity: [],
    quickCaptureInbox: [],
    familyId: 7,
    families: [{ family_id: 7, family_name: 'Müller' }],
    setActiveView: jest.fn(),
    messages,
    lang: 'en',
    timeFormat: '24h',
    isChild: false,
    isAdmin: false,
    demoMode: false,
    loadQuickCaptureInbox: jest.fn(),
    loadTasks: jest.fn(),
    loadShoppingLists: jest.fn(),
    ...overrides,
  };
}

async function renderToday(overrides = {}, props = {}) {
  mockApp = baseApp(overrides);
  const view = render(<TodayView {...props} />);
  await waitFor(() => expect(apiGetEvents).toHaveBeenCalled());
  // Wait for the loaded events to render, not only for the request.
  await act(async () => {
    await apiGetEvents.mock.results.at(-1).value;
    await apiListMealPlans.mock.results.at(-1)?.value;
  });
  return view;
}

function rowTitles(list) {
  return within(list).queryAllByRole('listitem').map((row) => row.textContent);
}

describe('TodayView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNow = new Date(2026, 8, 30, 10, 0);
    mockTasks = [
      { id: 11, title: 'Sign the letter', status: 'open', due_date: '2026-09-30T00:00:00', due_is_date: true, assigned_to_user_id: 1 },
      { id: 12, title: 'Buy a present', status: 'open', due_date: '2026-09-30T18:00:00', due_is_date: false, assigned_to_user_id: 2 },
      { id: 14, title: 'Tax return', status: 'open', due_date: '2026-09-27T00:00:00', due_is_date: true, assigned_to_user_id: 1 },
    ];
    apiGetEvents.mockImplementation(() => Promise.resolve({ ok: true, data: events }));
  });

  it('shows the day in time order with a now marker', async () => {
    await renderToday();
    const day = screen.getByRole('region', { name: 'Today' });
    const rows = rowTitles(within(day).getByRole('list'));
    expect(rows[0]).toContain('Sign the letter');
    expect(rows[1]).toContain('08:00');
    expect(rows[1]).toContain('Dentist');
    expect(rows[2]).toBe('10:00');
    expect(rows[3]).toContain('Football');
    expect(rows[4]).toContain('Buy a present');
    expect(within(day).getByRole('listitem', { name: 'Now 10:00' })).toBeInTheDocument();
    // The week's range is loaded for the timeline.
    const [familyId, start, end] = apiGetEvents.mock.calls[0];
    expect(familyId).toBe(7);
    expect(new Date(start)).toEqual(new Date(2026, 8, 30));
    expect(new Date(end)).toEqual(new Date(2026, 9, 7));
  });

  it('folds overdue tasks away and lists the week ahead', async () => {
    await renderToday();
    const overdue = screen.getByText('Still open').closest('details');
    expect(overdue).not.toHaveAttribute('open');
    expect(within(overdue).getByText('Tax return')).toBeInTheDocument();
    const week = screen.getByRole('region', { name: 'This week' });
    expect(within(week).getByText('Yoga')).toBeInTheDocument();
    expect(within(week).getByText("Grandpa's birthday")).toBeInTheDocument();
  });

  it('filters the whole view by person', async () => {
    await renderToday();
    fireEvent.click(screen.getByRole('button', { name: /Lena/ }));
    const day = screen.getByRole('region', { name: 'Today' });
    expect(within(day).getByText('Football')).toBeInTheDocument();
    expect(within(day).queryByText('Dentist')).not.toBeInTheDocument();
    expect(within(day).queryByText('Sign the letter')).not.toBeInTheDocument();
    expect(screen.queryByText('Still open')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'This week' })).toHaveTextContent("Grandpa's birthday");
  });

  it('opens on the person chosen in the family hub', async () => {
    handOff('today_member', 3);
    await renderToday();
    expect(screen.getByRole('button', { name: /Lena/ })).toHaveAttribute('aria-pressed', 'true');
    const day = screen.getByRole('region', { name: 'Today' });
    expect(within(day).queryByText('Dentist')).not.toBeInTheDocument();
    expect(peekHandOff('today_member')).toBeUndefined();
  });

  it('completes tasks through the undoable task flow', async () => {
    await renderToday();
    fireEvent.click(screen.getByRole('checkbox', { name: /Buy a present/ }));
    expect(mockToggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
  });

  it('lets children tick only their own tasks', async () => {
    await renderToday({ isChild: true, me: { user_id: 2, display_name: 'Anna' } });
    expect(screen.getByRole('checkbox', { name: /Buy a present/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /Sign the letter/ })).toBeDisabled();
  });

  it('offers an empty day one action', async () => {
    mockTasks = [];
    apiGetEvents.mockImplementation(() => Promise.resolve({ ok: true, data: [] }));
    const onOpenCapture = jest.fn();
    await renderToday({}, { onOpenCapture });
    expect(screen.getByText('Nothing planned for today.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add something' }));
    expect(onOpenCapture).toHaveBeenCalled();
  });

  it('suggests shopping in the afternoon and starts shopping mode', async () => {
    const shoppingLists = [{ id: 1, item_count: 5, checked_count: 1 }];
    const { unmount } = await renderToday({ shoppingLists });
    expect(screen.queryByText('4 things on the shopping list')).not.toBeInTheDocument();
    unmount();

    mockNow = new Date(2026, 8, 30, 16, 0);
    await renderToday({ shoppingLists });
    fireEvent.click(screen.getByRole('button', { name: 'Start shopping' }));
    expect(sessionStorage.getItem('tribu_shopping_trip')).toBe('1');
    expect(mockApp.setActiveView).toHaveBeenCalledWith('shopping');
  });

  it('shows the setup checklist as a hint that opens', async () => {
    apiGetSetupChecklist.mockImplementation(() => Promise.resolve({
      ok: true,
      data: {
        dismissed: false,
        show_on_dashboard: true,
        completed_count: 1,
        total_count: 2,
        steps: [
          { key: 'members', completed: true },
          { key: 'calendar', completed: false, target_view: 'calendar' },
        ],
      },
    }));
    await renderToday({ isAdmin: true });
    const hint = await screen.findByText('Setup: 1 of 2 done');
    fireEvent.click(within(hint.closest('section')).getByRole('button', { name: /Continue/ }));
    fireEvent.click(screen.getByRole('button', { name: messages['module.dashboard.setup_step_calendar_cta'] }));
    expect(mockApp.setActiveView).toHaveBeenCalledWith('calendar');
  });

  it('turns open quick notes into tasks', async () => {
    await renderToday({ quickCaptureInbox: [{ id: 5, text: 'Call the plumber', status: 'open' }] });
    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    fireEvent.click(screen.getByRole('button', { name: messages['module.dashboard.quick_capture_to_task'] }));
    await waitFor(() => expect(apiConvertQuickCapture).toHaveBeenCalledWith(5, { destination: 'task' }));
    await waitFor(() => expect(mockApp.loadQuickCaptureInbox).toHaveBeenCalledWith(7));
  });

  it('greets once and gives the date', async () => {
    await renderToday();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Max');
    expect(screen.getByText('Wednesday, September 30')).toBeInTheDocument();
  });
});
