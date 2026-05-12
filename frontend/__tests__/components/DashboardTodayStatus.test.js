import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/api', () => ({
  apiGetDashboardLayout: jest.fn(() => new Promise(() => {})),
  apiGetSetupChecklist: jest.fn().mockResolvedValue({ ok: true, data: null }),
  apiListMealPlans: jest.fn(() => Promise.resolve({ ok: true, data: [{ id: 1, plan_date: '2030-01-01', slot: 'evening' }] })),
  apiResetDashboardLayout: jest.fn(() => Promise.resolve({ ok: true, data: { modules: ['quick_capture', 'daily_loop', 'events', 'tasks', 'birthdays', 'rewards'] } })),
  apiUpdateDashboardLayout: jest.fn(() => Promise.resolve({ ok: true, data: { modules: ['quick_capture', 'daily_loop', 'events', 'tasks', 'birthdays', 'rewards'] } })),
}));

jest.mock('../../components/RewardsDashboardWidget', () => function RewardsDashboardWidget() {
  return <div data-testid="rewards-widget" />;
});

const messages = {
  'module.dashboard.greeting_morning': 'Good morning',
  'module.dashboard.greeting_afternoon': 'Good afternoon',
  'module.dashboard.greeting_evening': 'Good evening',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.open_tasks': 'Open tasks',
  'module.dashboard.all': 'All',
  'module.dashboard.empty_events': 'No upcoming events',
  'module.dashboard.empty_tasks': 'All done!',
  'module.dashboard.empty_tasks_action': 'Create task',
  'module.tasks.no_tasks': 'No tasks yet',
  'module.dashboard.empty_birthdays': 'No birthdays',
  'module.dashboard.days': 'days',
  'module.dashboard.activity_title': 'Recent activity',
  'module.dashboard.activity_empty': 'No household activity yet.',
  'module.dashboard.activity_unknown_actor': 'Someone',
  'module.dashboard.today_command_center': 'Today command center',
  'module.dashboard.today_status_label': 'Today status',
  'module.dashboard.today_status_events': 'Events',
  'module.dashboard.today_status_tasks': 'Tasks',
  'module.dashboard.today_status_shopping': 'Shopping',
  'module.dashboard.today_status_birthdays': 'Birthdays',
  'module.dashboard.next_up_title': 'Next up',
  'module.dashboard.next_up_empty': 'Nothing scheduled',
  'module.dashboard.next_up_empty_hint': 'The calendar is clear.',
  'module.dashboard.daily_loop_title': 'Today loop',
  'module.dashboard.daily_loop_meals': 'Meals planned',
  'module.dashboard.daily_loop_shopping': 'Shopping open',
  'module.dashboard.daily_loop_routines': 'Routines due',
  'module.dashboard.daily_loop_open_meals': 'Plan meals',
  'module.dashboard.daily_loop_open_shopping': 'Open shopping',
  'module.dashboard.daily_loop_open_routines': 'Open routines',
  'module.dashboard.daily_loop_empty': 'Nothing pressing today.',
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
    summary: { next_events: [], upcoming_birthdays: [{ person_name: 'Grandma', days_until: 5, occurs_on: 'May 17' }] },
    me: { display_name: 'Dennis' },
    members: [{ user_id: 1, display_name: 'Dennis' }],
    tasks: [{ id: 1, title: 'Take out bins', status: 'open' }],
    events: [{ id: 1, title: 'School', starts_at: `${isoDate()}T08:00:00` }],
    shoppingLists: [{ id: 1, item_count: 5, checked_count: 2 }],
    activity: [],
    familyId: 42,
    families: [],
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

describe('DashboardView today status', () => {
  beforeEach(() => {
    mockAppState = baseApp();
  });

  it('summarizes today status while keeping the daily loop as its own section', () => {
    render(<DashboardView />);

    const status = screen.getByRole('group', { name: 'Today status' });
    expect(within(status).getByTestId('today-status-events')).toHaveTextContent('1');
    expect(within(status).getByTestId('today-status-tasks')).toHaveTextContent('1');
    expect(within(status).getByTestId('today-status-shopping')).toHaveTextContent('3');
    expect(within(status).getByTestId('today-status-birthdays')).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'Today loop' })).toBeInTheDocument();
  });

  it('navigates from today status tiles to their owning modules', () => {
    const setActiveView = jest.fn();
    mockAppState = baseApp({ setActiveView });

    render(<DashboardView />);

    const status = screen.getByRole('group', { name: 'Today status' });
    fireEvent.click(within(status).getByRole('button', { name: /Events/i }));
    fireEvent.click(within(status).getByRole('button', { name: /Tasks/i }));
    fireEvent.click(within(status).getByRole('button', { name: /Shopping/i }));
    fireEvent.click(within(status).getByRole('button', { name: /Birthdays/i }));

    expect(setActiveView).toHaveBeenCalledWith('calendar');
    expect(setActiveView).toHaveBeenCalledWith('tasks');
    expect(setActiveView).toHaveBeenCalledWith('shopping');
    expect(setActiveView).toHaveBeenCalledWith('contacts');
  });

  it('keeps household activity out of the permanent dashboard layout', () => {
    mockAppState = baseApp({
      activity: [{
        id: 1,
        actor_display_name: 'Dennis',
        summary: 'Dennis completed task "Pay school lunch"',
        created_at: '2026-04-29T10:00:00Z',
      }],
    });

    render(<DashboardView />);

    expect(screen.queryByRole('region', { name: 'Recent activity' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dennis completed task "Pay school lunch"')).not.toBeInTheDocument();
  });
});
