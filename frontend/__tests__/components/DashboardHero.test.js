import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/i18n', () => ({
  t: (messages, key) => messages?.[key] || key,
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
  'module.dashboard.family': 'Family',
  'module.dashboard.members': 'Members',
  'module.dashboard.events_count': 'Events',
  'module.dashboard.tasks_done': 'Done',
  'module.dashboard.open_tasks': 'Open tasks',
  'module.dashboard.all': 'All',
  'module.dashboard.empty_events': 'No upcoming events',
  'module.dashboard.empty_events_action': 'Open calendar',
  'module.dashboard.empty_tasks': 'All done!',
  'module.dashboard.empty_tasks_action': 'Create task',
  'module.tasks.no_tasks': 'No tasks yet',
  'module.dashboard.empty_birthdays': 'No birthdays',
  'module.dashboard.days': 'days',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.quick_task': 'Task',
  'module.dashboard.quick_shopping': 'Shopping',
  'module.dashboard.quick_invite': 'Invite',
  'module.dashboard.quick_actions_label': 'Quick actions',
  'module.dashboard.quick_my_tasks': 'My tasks',
  'module.dashboard.quick_rewards': 'Rewards',
  'module.dashboard.context_chips_label': 'Family at a glance',
  'module.dashboard.chip_members': 'Members',
  'module.dashboard.chip_today_events': 'Today',
  'module.dashboard.chip_open_tasks': 'Open tasks',
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
  next_events: 'Next events',
  upcoming_birthdays_4w: 'Birthdays',
};

function baseApp(overrides = {}) {
  return {
    summary: { next_events: [], upcoming_birthdays: [] },
    me: { display_name: 'Dennis' },
    members: [
      { user_id: 1, display_name: 'Dennis' },
      { user_id: 2, display_name: 'Mira' },
      { user_id: 3, display_name: 'Leo' },
    ],
    tasks: [],
    events: [],
    shoppingLists: [],
    setActiveView: jest.fn(),
    messages,
    lang: 'en',
    timeFormat: '24h',
    isChild: false,
    isAdmin: true,
    ...overrides,
  };
}

function todayAt(hour = 10, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  // Use local naive ISO without "Z" so parseDate keeps it local.
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}:00`;
}

describe('DashboardView hero', () => {
  beforeEach(() => {
    mockAppState = baseApp();
  });

  it('keeps the greeting with the user display name', () => {
    render(<DashboardView />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Dennis');
  });

  it('renders a labeled quick action pill row for adult users', () => {
    render(<DashboardView />);
    const region = screen.getByRole('group', { name: 'Quick actions' });
    expect(within(region).getByRole('button', { name: 'Event' })).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Task' })).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Shopping' })).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Invite' })).toBeVisible();
  });

  it('navigates from the labeled quick action pills to the correct views', () => {
    const setActiveView = jest.fn();
    mockAppState = baseApp({ setActiveView });
    render(<DashboardView />);
    const region = screen.getByRole('group', { name: 'Quick actions' });
    fireEvent.click(within(region).getByRole('button', { name: 'Event' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Task' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Shopping' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Invite' }));
    expect(setActiveView).toHaveBeenCalledWith('calendar');
    expect(setActiveView).toHaveBeenCalledWith('tasks');
    expect(setActiveView).toHaveBeenCalledWith('shopping');
    expect(setActiveView).toHaveBeenCalledWith('admin');
  });

  it('does not render the icon-only header quick action buttons anymore', () => {
    const { container } = render(<DashboardView />);
    expect(container.querySelectorAll('.dashboard-header-actions .btn-icon')).toHaveLength(0);
  });

  it('renders child-safe quick action pills and hides admin members chip for child members', () => {
    mockAppState = baseApp({ isChild: true, isAdmin: false });
    render(<DashboardView />);
    const region = screen.getByRole('group', { name: 'Quick actions' });
    expect(within(region).getByRole('button', { name: 'My tasks' })).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Rewards' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();

    const chipGroup = screen.getByRole('group', { name: 'Family at a glance' });
    expect(within(chipGroup).queryByTestId('hero-chip-members')).not.toBeInTheDocument();
    expect(within(chipGroup).getByTestId('hero-chip-events')).toBeVisible();
    expect(within(chipGroup).getByTestId('hero-chip-tasks')).toBeVisible();
  });



  it('does not expose invite actions or the members chip to non-admin adults', () => {
    mockAppState = baseApp({ isAdmin: false });
    render(<DashboardView />);
    const region = screen.getByRole('group', { name: 'Quick actions' });
    expect(within(region).getByRole('button', { name: 'Event' })).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Task' })).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Shopping' })).toBeVisible();
    expect(within(region).queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-chip-members')).not.toBeInTheDocument();
  });

  it('renders hero context chips for admin members, today events and open tasks using existing data', () => {
    mockAppState = baseApp({
      members: [
        { user_id: 1, display_name: 'Dennis' },
        { user_id: 2, display_name: 'Mira' },
        { user_id: 3, display_name: 'Leo' },
      ],
      tasks: [
        { id: 1, title: 'Pack bags', status: 'open' },
        { id: 2, title: 'Buy milk', status: 'open' },
        { id: 3, title: 'Clean kitchen', status: 'done' },
      ],
      events: [{ id: 1, title: 'School run', starts_at: todayAt(8, 0) }],
      summary: {
        next_events: [
          { id: 1, title: 'School run', starts_at: todayAt(8, 0) },
          { id: 2, title: 'Soccer practice', starts_at: todayAt(17, 30) },
        ],
        upcoming_birthdays: [],
      },
    });
    render(<DashboardView />);

    const chipGroup = screen.getByRole('group', { name: 'Family at a glance' });
    const membersChip = within(chipGroup).getByTestId('hero-chip-members');
    expect(membersChip).toHaveTextContent('3');
    expect(membersChip).toHaveTextContent('Members');

    const eventsChip = within(chipGroup).getByTestId('hero-chip-events');
    expect(eventsChip).toHaveTextContent('2');
    expect(eventsChip).toHaveTextContent('Today');

    const tasksChip = within(chipGroup).getByTestId('hero-chip-tasks');
    expect(tasksChip).toHaveTextContent('2');
    expect(tasksChip).toHaveTextContent('Open tasks');
  });

  it('removes the standalone Family Stats bento card from the grid', () => {
    render(<DashboardView />);
    expect(screen.queryByRole('region', { name: 'Family' })).not.toBeInTheDocument();
  });

  it('still renders Events, Tasks and Birthdays modules', () => {
    render(<DashboardView />);
    expect(screen.getByRole('region', { name: 'Next events' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Open tasks' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Birthdays' })).toBeInTheDocument();
  });
});
