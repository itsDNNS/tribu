import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';
import { apiGetSetupChecklist, apiListMealPlans } from '../../lib/api';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/api', () => ({
  apiGetSetupChecklist: jest.fn(),
  apiListMealPlans: jest.fn(),
}));

jest.mock('../../components/RewardsDashboardWidget', () => function RewardsDashboardWidget() {
  return <div data-testid="rewards-widget" />;
});

const messages = {
  'module.dashboard.greeting_morning': 'Good morning',
  'module.dashboard.greeting_afternoon': 'Good afternoon',
  'module.dashboard.greeting_evening': 'Good evening',
  'module.dashboard.summary_events': 'Today you have {count} events',
  'module.dashboard.summary_no_events': 'No events today',
  'module.dashboard.summary_tasks': ' and {count} open tasks.',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.quick_task': 'Task',
  'module.dashboard.quick_shopping': 'Shopping',
  'module.dashboard.quick_invite': 'Invite',
  'module.dashboard.quick_actions_label': 'Quick actions',
  'module.dashboard.context_chips_label': 'Family at a glance',
  'module.dashboard.chip_members': 'Members',
  'module.dashboard.chip_today_events': 'Today',
  'module.dashboard.chip_open_tasks': 'Open tasks',
  'module.dashboard.open_tasks': 'Open tasks',
  'module.dashboard.all': 'All',
  'module.dashboard.empty_events': 'No upcoming events',
  'module.dashboard.empty_events_action': 'Open calendar',
  'module.dashboard.empty_tasks': 'All done!',
  'module.dashboard.empty_tasks_action': 'Create task',
  'module.tasks.no_tasks': 'No tasks yet',
  'module.dashboard.empty_birthdays': 'No birthdays',
  'module.dashboard.days': 'days',
  'module.dashboard.activation_title': 'Get your household started',
  'module.dashboard.activation_subtitle': 'A few quick steps so the whole family can use Tribu together.',
  'module.dashboard.activation_step_invite_title': 'Invite your family',
  'module.dashboard.activation_step_invite_desc': 'Send an invitation link.',
  'module.dashboard.activation_step_invite_cta': 'Open invitations',
  'module.dashboard.activation_step_invite_done': 'Family members joined',
  'module.dashboard.activation_step_event_title': 'Add your first event',
  'module.dashboard.activation_step_event_desc': 'Put a shared appointment on the calendar.',
  'module.dashboard.activation_step_event_cta': 'Open calendar',
  'module.dashboard.activation_step_event_done': 'Calendar in use',
  'module.dashboard.activation_step_task_title': 'Add your first task',
  'module.dashboard.activation_step_task_desc': 'Capture something that needs doing.',
  'module.dashboard.activation_step_task_cta': 'Open tasks',
  'module.dashboard.activation_step_task_done': 'Tasks in use',
  'module.dashboard.activation_step_shopping_title': 'Start a shopping list',
  'module.dashboard.activation_step_shopping_desc': 'Create a shared list.',
  'module.dashboard.activation_step_shopping_cta': 'Open shopping',
  'module.dashboard.activation_step_shopping_done': 'Shopping list ready',
  'module.dashboard.activation_step_done_aria': 'Step completed',
  'module.dashboard.activation_step_pending_aria': 'Step pending',
  'module.dashboard.daily_loop_title': 'Today in motion',
  'module.dashboard.daily_loop_subtitle': 'Meals, groceries and routines in one daily check-in.',
  'module.dashboard.daily_loop_meals': 'Meals planned',
  'module.dashboard.daily_loop_shopping': 'Shopping open',
  'module.dashboard.daily_loop_routines': 'Routines due',
  'module.dashboard.daily_loop_open_meals': 'Plan meals',
  'module.dashboard.daily_loop_open_shopping': 'Open shopping',
  'module.dashboard.daily_loop_open_routines': 'Open routines',
  'module.dashboard.daily_loop_empty': 'Plan a meal, add groceries or set a recurring task to start the daily loop.',
  'module.dashboard.activity_title': 'Recent activity',
  'module.dashboard.activity_empty': 'No household activity yet.',
  'module.dashboard.activity_unknown_actor': 'Someone',
  next_events: 'Next events',
  upcoming_birthdays_4w: 'Birthdays',
};

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function baseApp(overrides = {}) {
  return {
    summary: { next_events: [], upcoming_birthdays: [] },
    me: { display_name: 'Dennis' },
    members: [{ user_id: 1, display_name: 'Dennis' }],
    tasks: [],
    events: [{ id: 1, title: 'School', starts_at: `${isoDate()}T08:00:00` }],
    shoppingLists: [],
    activity: [],
    familyId: 42,
    setActiveView: jest.fn(),
    messages,
    lang: 'en',
    timeFormat: '24h',
    isChild: false,
    isAdmin: false,
    demoMode: false,
    ...overrides,
  };
}

describe('DashboardView daily loop', () => {
  beforeEach(() => {
    apiGetSetupChecklist.mockResolvedValue({ ok: true, data: null });
    apiListMealPlans.mockResolvedValue({ ok: true, data: [] });
    mockAppState = baseApp();
  });

  it('fetches today meal plans and summarizes meals, open shopping and due routines', async () => {
    apiListMealPlans.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, plan_date: isoDate(), slot: 'evening' },
        { id: 2, plan_date: isoDate(), slot: 'noon' },
      ],
    });
    mockAppState = baseApp({
      shoppingLists: [
        { id: 1, item_count: 5, checked_count: 2 },
        { id: 2, items: [{ checked: false }, { checked: true }, { checked: false }] },
      ],
      tasks: [
        { id: 1, title: 'Take out bins', status: 'open', recurrence: 'weekly', due_date: isoDate(-1) },
        { id: 2, title: 'Water plants', status: 'open', recurrence: 'weekly', due_date: isoDate() },
        { id: 3, title: 'Future routine', status: 'open', recurrence: 'weekly', due_date: isoDate(2) },
        { id: 4, title: 'Undated routine', status: 'open', recurrence: 'weekly' },
        { id: 5, title: 'Done routine', status: 'done', recurrence: 'daily', due_date: isoDate() },
      ],
    });

    render(<DashboardView />);

    await waitFor(() => {
      expect(apiListMealPlans).toHaveBeenCalledWith(42, isoDate(), isoDate());
    });

    const card = screen.getByRole('region', { name: 'Today in motion' });
    await waitFor(() => expect(within(card).getByTestId('daily-loop-meals')).toHaveTextContent('2'));
    expect(within(card).getByTestId('daily-loop-shopping')).toHaveTextContent('5');
    expect(within(card).getByTestId('daily-loop-routines')).toHaveTextContent('2');
  });

  it('navigates from daily loop actions to meals, shopping and routines', async () => {
    const setActiveView = jest.fn();
    mockAppState = baseApp({ setActiveView });

    render(<DashboardView />);

    const card = screen.getByRole('region', { name: 'Today in motion' });
    fireEvent.click(within(card).getByRole('button', { name: 'Plan meals' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Open shopping' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Open routines' }));

    expect(setActiveView).toHaveBeenCalledWith('meal_plans');
    expect(setActiveView).toHaveBeenCalledWith('shopping');
    expect(setActiveView).toHaveBeenCalledWith('tasks');
  });

  it('shows an empty prompt when no daily loop inputs exist', async () => {
    render(<DashboardView />);

    const card = screen.getByRole('region', { name: 'Today in motion' });
    expect(await within(card).findByText('Plan a meal, add groceries or set a recurring task to start the daily loop.')).toBeVisible();
  });

  it('shows household activity on the dashboard', async () => {
    mockAppState = baseApp({
      activity: [{
        id: 1,
        actor_display_name: 'Dennis',
        summary: 'Dennis completed task "Pay school lunch"',
        created_at: '2026-04-29T10:00:00Z',
      }],
    });

    render(<DashboardView />);

    const card = screen.getByRole('region', { name: 'Recent activity' });
    expect(within(card).getByText('Dennis completed task "Pay school lunch"')).toBeVisible();
  });
});
