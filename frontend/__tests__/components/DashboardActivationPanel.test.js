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
  'module.dashboard.quick_contact': 'Contact',
  'module.dashboard.activation_title': 'Get your household started',
  'module.dashboard.activation_subtitle': 'A few quick steps so the whole family can use Tribu together.',
  'module.dashboard.activation_step_invite_title': 'Invite your family',
  'module.dashboard.activation_step_invite_desc': 'Send an invitation link so everyone has their own account.',
  'module.dashboard.activation_step_invite_cta': 'Open invitations',
  'module.dashboard.activation_step_invite_done': 'Family members joined',
  'module.dashboard.activation_step_event_title': 'Add your first event',
  'module.dashboard.activation_step_event_desc': 'Put a shared appointment or activity on the family calendar.',
  'module.dashboard.activation_step_event_cta': 'Open calendar',
  'module.dashboard.activation_step_event_done': 'Calendar in use',
  'module.dashboard.activation_step_task_title': 'Add your first task',
  'module.dashboard.activation_step_task_desc': 'Capture something that needs doing and assign it to a family member.',
  'module.dashboard.activation_step_task_cta': 'Open tasks',
  'module.dashboard.activation_step_task_done': 'Tasks in use',
  'module.dashboard.activation_step_shopping_title': 'Start a shopping list',
  'module.dashboard.activation_step_shopping_desc': 'Create a shared list so everyone can add and check off items.',
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
    members: [{ user_id: 1, display_name: 'Dennis' }],
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

describe('DashboardView activation panel', () => {
  beforeEach(() => {
    mockAppState = baseApp();
  });

  it('renders day-one activation steps for an admin household that is not set up yet', () => {
    render(<DashboardView />);

    expect(screen.getByRole('region', { name: 'Get your household started' })).toBeInTheDocument();
    expect(screen.getByTestId('activation-step-invite')).toHaveTextContent('Invite your family');
    expect(screen.getByTestId('activation-step-event')).toHaveTextContent('Add your first event');
    expect(screen.getByTestId('activation-step-task')).toHaveTextContent('Add your first task');
    expect(screen.getByTestId('activation-step-shopping')).toHaveTextContent('Start a shopping list');
  });

  it('navigates activation actions to the owning modules', () => {
    const setActiveView = jest.fn();
    mockAppState = baseApp({ setActiveView });

    render(<DashboardView />);
    const panel = screen.getByRole('region', { name: 'Get your household started' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Open invitations' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Open calendar' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Open tasks' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Open shopping' }));

    expect(setActiveView).toHaveBeenCalledWith('admin');
    expect(setActiveView).toHaveBeenCalledWith('calendar');
    expect(setActiveView).toHaveBeenCalledWith('tasks');
    expect(setActiveView).toHaveBeenCalledWith('shopping');
  });

  it('does not render the activation panel for child members', () => {
    mockAppState = baseApp({ isChild: true, isAdmin: false });

    render(<DashboardView />);

    expect(screen.queryByRole('region', { name: 'Get your household started' })).not.toBeInTheDocument();
  });

  it('does not render once the household has members and shared data', () => {
    mockAppState = baseApp({
      members: [{ user_id: 1 }, { user_id: 2 }],
      events: [{ id: 1, title: 'School', starts_at: '2030-01-01T10:00:00Z' }],
      tasks: [{ id: 1, title: 'Pack bags', status: 'open' }],
      shoppingLists: [{ id: 1, item_count: 1, checked_count: 0 }],
      summary: { next_events: [], upcoming_birthdays: [] },
    });

    render(<DashboardView />);

    expect(screen.queryByRole('region', { name: 'Get your household started' })).not.toBeInTheDocument();
  });
});
