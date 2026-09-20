import { fireEvent, screen, within } from '@testing-library/react';
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
  'module.dashboard.routines_title': 'Daily routines',
  'module.dashboard.routines_progress': '{completed} of {total} completed',
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

describe('DashboardView daily routines', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiListMealPlans.mockResolvedValue({ ok: true, data: [] });
  });

  it('shows due recurring tasks and progress without unrelated or future tasks', () => {
    renderDashboard({ familyId: null, tasks: [
      { id: 1, title: 'Kitchen reset', status: 'open', recurrence: 'daily', due_date: todayIso() },
      { id: 2, title: 'Finished today', status: 'done', recurrence: 'daily', completed_at: `${todayIso()}T08:00:00` },
      { id: 3, title: 'Future routine', status: 'open', recurrence: 'weekly', due_date: '2999-01-01' },
      { id: 4, title: 'Non-recurring task', status: 'open', due_date: todayIso() },
      { id: 6, title: 'Missing completion time', status: 'done', recurrence: 'daily', updated_at: `${todayIso()}T09:00:00` },
      { id: 5, title: 'Finished yesterday, edited today', status: 'done', recurrence: 'daily', completed_at: '2000-01-01T08:00:00', updated_at: `${todayIso()}T09:00:00` },
    ] });
    const loop = screen.getByRole('region', { name: 'Daily routines' });
    expect(within(loop).getByRole('button', { name: 'Open routines: 50%' })).toBeVisible();
    expect(loop).toHaveTextContent('1 of 2 completed');
    expect(within(loop).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(loop).getByRole('checkbox', { checked: true })).toBeDisabled();
    expect(within(loop).getByRole('checkbox', { checked: false })).toBeEnabled();
    expect(loop).not.toHaveTextContent('Future routine');
    expect(loop).not.toHaveTextContent('Non-recurring task');
    expect(loop).not.toHaveTextContent('Finished yesterday');
    expect(loop).not.toHaveTextContent('Missing completion time');
  });

  it('counts completion instants on the local day, including just after midnight', () => {
    const completedAt = new Date(`${todayIso()}T00:30:00`).toISOString();
    renderDashboard({ familyId: null, tasks: [
      { id: 1, title: 'Late routine', status: 'done', recurrence: 'daily', completed_at: completedAt },
    ] });
    expect(screen.getByRole('region', { name: 'Daily routines' })).toHaveTextContent('1 of 1 completed');
  });

  it('opens tasks from the progress ring and routine title', () => {
    const setActiveView = jest.fn();
    renderDashboard({ setActiveView, familyId: null });
    const loop = screen.getByRole('region', { name: 'Daily routines' });
    fireEvent.click(within(loop).getByRole('button', { name: 'Open routines: 0%' }));
    fireEvent.click(within(loop).getByRole('button', { name: 'Kitchen reset' }));
    expect(setActiveView.mock.calls).toEqual([['tasks'], ['tasks']]);
  });

  it('offers an action when no routines are due', () => {
    const setActiveView = jest.fn();
    renderDashboard({ familyId: null, setActiveView, tasks: [] });
    const loop = screen.getByRole('region', { name: 'Daily routines' });
    expect(loop).toHaveTextContent('0 of 0 completed');
    expect(within(loop).queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(within(loop).getByRole('button', { name: 'Open routines' }));
    expect(setActiveView).toHaveBeenCalledWith('tasks');
  });
});
