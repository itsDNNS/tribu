import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';
import { apiListMealPlans } from '../../lib/api';
import { buildMockAppState, buildTestMessages, renderWithMockApp } from '../test-utils';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => require('../test-utils').getMockAppState(),
}));

jest.mock('../../lib/api', () => require('../test-utils').createMockApi());

jest.mock('../../components/RewardsDashboardWidget', () => function RewardsDashboardWidget() {
  return <div data-testid="rewards-widget" />;
});

const messages = buildTestMessages({
  'module.dashboard.greeting_morning': 'Good morning',
  'module.dashboard.greeting_afternoon': 'Good afternoon',
  'module.dashboard.greeting_evening': 'Good evening',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.open_tasks': 'Open tasks',
  'module.dashboard.all': 'All',
  'module.dashboard.empty_events': 'No upcoming events',
  'module.dashboard.empty_tasks': 'All done!',
  'module.tasks.no_tasks': 'No tasks yet',
  'module.dashboard.empty_birthdays': 'No birthdays',
  'module.dashboard.days': 'days',
  'module.dashboard.today_command_center': 'Today command center',
  'module.dashboard.today_status_label': 'Today status',
  'module.dashboard.today_status_events': 'Events',
  'module.dashboard.today_status_tasks': 'Tasks',
  'module.dashboard.today_status_shopping': 'Shopping',
  'module.dashboard.today_status_birthdays': 'Birthdays',
  'module.dashboard.next_up_title': 'Next up',
  'module.dashboard.next_up_empty': 'Nothing scheduled',
  'module.dashboard.next_up_empty_hint': 'The calendar is clear.',
  'module.dashboard.quick_capture_title': 'Quick capture',
  'module.dashboard.daily_loop_title': 'Today loop',
  'module.dashboard.daily_loop_meals': 'Meals planned',
  'module.dashboard.daily_loop_shopping': 'Shopping open',
  'module.dashboard.daily_loop_routines': 'Routines due',
  'module.dashboard.daily_loop_open_meals': 'Plan meals',
  'module.dashboard.daily_loop_open_shopping': 'Open shopping',
  'module.dashboard.daily_loop_open_routines': 'Open routines',
  next_events: 'Next events',
  upcoming_birthdays_4w: 'Birthdays',
});

function todayIso() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function baseApp(overrides = {}) {
  return buildMockAppState({
    summary: { next_events: [], upcoming_birthdays: [] },
    me: { display_name: 'Dennis' },
    members: [{ user_id: 1, display_name: 'Dennis' }],
    tasks: [
      { id: 1, title: 'Kitchen reset', status: 'open', recurrence: 'daily', due_date: `${todayIso()}T08:00:00` },
      { id: 2, title: 'Archive paperwork', status: 'open' },
    ],
    events: [],
    shoppingLists: [{ id: 1, item_count: 4, checked_count: 1 }],
    messages,
    ...overrides,
  });
}

function renderDashboard(overrides = {}) {
  return renderWithMockApp(<DashboardView />, baseApp(overrides));
}

describe('DashboardView daily loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiListMealPlans.mockResolvedValue({ ok: true, data: [{ id: 1 }, { id: 2 }] });
  });

  it('renders the Today loop directly after quick capture with visual action tiles', async () => {
    const { container } = renderDashboard();

    const modules = Array.from(container.querySelectorAll('.bento-grid > [data-dashboard-module]')).map((module) => module.getAttribute('data-dashboard-module'));
    expect(modules.slice(0, 3)).toEqual(['quick_capture', 'daily_loop', 'events']);

    const loop = screen.getByRole('region', { name: 'Today loop' });
    expect(loop.querySelector('.daily-loop-subtitle')).toBeNull();
    expect(loop.querySelectorAll('.daily-loop-action-art')).toHaveLength(3);
    await waitFor(() => expect(apiListMealPlans).toHaveBeenCalledWith(42, todayIso(), todayIso()));
    await waitFor(() => expect(within(loop).getByRole('button', { name: /Meals planned: Plan meals/i })).toHaveTextContent('2'));
    expect(within(loop).getByRole('button', { name: /Shopping open: Open shopping/i })).toHaveTextContent('3');
    expect(within(loop).getByRole('button', { name: /Routines due: Open routines/i })).toHaveTextContent('1');
  });

  it('routes daily loop tiles to their owning views', () => {
    const setActiveView = jest.fn();
    renderDashboard({ setActiveView, familyId: null });

    const loop = screen.getByRole('region', { name: 'Today loop' });

    fireEvent.click(within(loop).getByRole('button', { name: /Meals planned/i }));
    fireEvent.click(within(loop).getByRole('button', { name: /Shopping open/i }));
    fireEvent.click(within(loop).getByRole('button', { name: /Routines due/i }));

    expect(setActiveView).toHaveBeenCalledWith('meal_plans');
    expect(setActiveView).toHaveBeenCalledWith('shopping');
    expect(setActiveView).toHaveBeenCalledWith('tasks');
  });

  it('keeps daily loop compact when there are no active inputs', async () => {
    apiListMealPlans.mockResolvedValue({ ok: true, data: [] });
    renderDashboard({
      tasks: [
        { id: 1, title: 'Future routine', status: 'open', recurrence: 'weekly', due_date: '2999-01-01T08:00:00' },
      ],
      shoppingLists: [],
    });

    const loop = screen.getByRole('region', { name: 'Today loop' });
    await waitFor(() => expect(within(loop).getByRole('button', { name: /Meals planned: Plan meals/i })).toHaveTextContent('0'));
    expect(loop.querySelector('.daily-loop-empty')).toBeNull();
  });
});
