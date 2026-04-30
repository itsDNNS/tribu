import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/i18n', () => ({
  t: (messages, key) => messages?.[key] || key,
}));

const mockApiGetDashboardLayout = jest.fn();
const mockApiUpdateDashboardLayout = jest.fn();
const mockApiResetDashboardLayout = jest.fn();

jest.mock('../../lib/api', () => ({
  apiGetDashboardLayout: (...args) => mockApiGetDashboardLayout(...args),
  apiGetSetupChecklist: jest.fn().mockResolvedValue({ ok: true, data: null }),
  apiListMealPlans: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  apiResetDashboardLayout: (...args) => mockApiResetDashboardLayout(...args),
  apiUpdateDashboardLayout: (...args) => mockApiUpdateDashboardLayout(...args),
}));

jest.mock('../../components/RewardsDashboardWidget', () => function RewardsDashboardWidget() {
  return <div className="bento-card bento-rewards" data-testid="rewards-widget" />;
});

const messages = {
  'module.dashboard.greeting_morning': 'Good morning',
  'module.dashboard.greeting_afternoon': 'Good afternoon',
  'module.dashboard.greeting_evening': 'Good evening',
  'module.dashboard.summary_events': 'Today you have {count} events',
  'module.dashboard.summary_no_events': 'No events today',
  'module.dashboard.summary_tasks': ' and {count} open tasks.',
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
  'module.dashboard.context_chips_label': 'Dashboard summary',
  'module.dashboard.quick_actions_label': 'Quick actions',
  'module.dashboard.members': 'Members',
  'module.dashboard.today': 'Today',
  'module.dashboard.open_tasks_short': 'Open tasks',
  'module.dashboard.daily_loop_title': 'Today in motion',
  'module.dashboard.daily_loop_subtitle': 'Meals, groceries and routines in one daily check-in.',
  'module.dashboard.daily_loop_meals': 'Meals planned',
  'module.dashboard.daily_loop_shopping': 'Shopping open',
  'module.dashboard.daily_loop_routines': 'Routines due',
  'module.dashboard.daily_loop_open_meals': 'Plan meals',
  'module.dashboard.daily_loop_open_shopping': 'Open shopping',
  'module.dashboard.daily_loop_open_routines': 'Open routines',
  'module.dashboard.daily_loop_empty': 'Plan a meal, add groceries or set a recurring task to start the daily loop.',
  'module.dashboard.customize_layout': 'Customize layout',
  'module.dashboard.customize_layout_hint': 'Move dashboard modules into the order that fits your day.',
  'module.dashboard.reset_layout': 'Reset layout',
  'module.dashboard.move_module_up': 'Move {module} up',
  'module.dashboard.move_module_down': 'Move {module} down',
  'module.dashboard.module_quick_capture': 'Quick capture',
  'module.dashboard.module_daily_loop': 'Today in motion',
  'module.dashboard.module_events': 'Next events',
  'module.dashboard.module_tasks': 'Open tasks',
  'module.dashboard.module_birthdays': 'Birthdays',
  'module.dashboard.module_activity': 'Recent activity',
  'module.dashboard.module_rewards': 'Rewards',
  'module.dashboard.quick_capture_title': 'Quick capture',
  next_events: 'Next events',
  upcoming_birthdays_4w: 'Birthdays',
};

function baseApp(overrides = {}) {
  return {
    summary: { next_events: [], upcoming_birthdays: [] },
    me: { display_name: 'Dennis' },
    members: [
      { user_id: 1, display_name: 'Dennis' },
      { user_id: 2, display_name: 'Family member' },
    ],
    tasks: [{ id: 1, title: 'Take bins out', status: 'done' }],
    events: [{ id: 1, title: 'Training', starts_at: '2030-01-01T10:00:00Z' }],
    shoppingLists: [{ id: 1, items: [{ id: 1, name: 'Milk' }] }],
    familyId: 42,
    setActiveView: jest.fn(),
    messages,
    lang: 'en',
    timeFormat: '24h',
    isChild: false,
    isAdmin: true,
    ...overrides,
  };
}

describe('DashboardView desktop bento layout', () => {
  beforeEach(() => {
    mockAppState = baseApp();
    mockApiGetDashboardLayout.mockReset();
    mockApiUpdateDashboardLayout.mockReset();
    mockApiResetDashboardLayout.mockReset();
    mockApiGetDashboardLayout.mockResolvedValue({ ok: true, data: { modules: ['quick_capture', 'daily_loop', 'events', 'tasks', 'birthdays', 'activity', 'rewards'] } });
    mockApiUpdateDashboardLayout.mockResolvedValue({ ok: true, data: { modules: ['daily_loop', 'quick_capture', 'events', 'tasks', 'birthdays', 'activity', 'rewards'] } });
    mockApiResetDashboardLayout.mockResolvedValue({ ok: true, data: { modules: ['quick_capture', 'daily_loop', 'events', 'tasks', 'birthdays', 'activity', 'rewards'] } });
    sessionStorage.clear();
  });

  it('keeps the current desktop module order', async () => {
    const { container } = render(<DashboardView />);

    await waitFor(() => expect(mockApiGetDashboardLayout).toHaveBeenCalledTimes(1));
    const modules = Array.from(container.querySelectorAll('.bento-grid > [data-dashboard-module]'));
    expect(modules.map((module) => module.getAttribute('data-dashboard-module'))).toEqual([
      'quick_capture',
      'daily_loop',
      'events',
      'tasks',
      'birthdays',
      'activity',
      'rewards',
    ]);
    expect(modules[1].querySelector('.bento-card')).toHaveAccessibleName('Today in motion');
    expect(modules[2].querySelector('.bento-card')).toHaveAccessibleName('Next events');
    expect(modules[3].querySelector('.bento-card')).toHaveAccessibleName('Open tasks');
    expect(modules[4].querySelector('.bento-card')).toHaveAccessibleName('Birthdays');
  });

  it('keeps duplicated count summaries out of the dashboard header', async () => {
    mockAppState = baseApp({
      members: [
        { user_id: 1, display_name: 'Dennis' },
        { user_id: 2, display_name: 'Family member' },
      ],
      tasks: [{ id: 1, title: 'Take bins out', status: 'open' }],
      summary: { next_events: [{ id: 1, title: 'Training', starts_at: '2030-01-01T10:00:00Z' }], upcoming_birthdays: [] },
    });

    const { container } = render(<DashboardView />);

    await waitFor(() => expect(mockApiGetDashboardLayout).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('group', { name: 'Dashboard summary' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="hero-chip-members"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="hero-chip-events"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="hero-chip-tasks"]')).not.toBeInTheDocument();
    expect(screen.queryByText(/Today you have 1 events/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 open tasks/i)).not.toBeInTheDocument();
  });

  it('loads a saved dashboard layout and persists keyboard-accessible module moves', async () => {
    mockApiGetDashboardLayout.mockResolvedValue({ ok: true, data: { modules: ['tasks', 'events', 'quick_capture', 'daily_loop', 'birthdays', 'activity', 'rewards'] } });

    const { container } = render(<DashboardView />);

    await waitFor(() => expect(container.querySelector('[data-dashboard-module="tasks"]')).toHaveStyle({ order: '0' }));
    expect(container.querySelector('[data-dashboard-module="events"]')).toHaveStyle({ order: '1' });

    fireEvent.click(screen.getByRole('button', { name: 'Customize layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Open tasks down' }));

    await waitFor(() => expect(mockApiUpdateDashboardLayout).toHaveBeenCalledWith([
      'events',
      'tasks',
      'quick_capture',
      'daily_loop',
      'birthdays',
      'activity',
      'rewards',
    ]));
  });

  it('resets the dashboard layout to the default order', async () => {
    mockApiGetDashboardLayout.mockResolvedValue({ ok: true, data: { modules: ['tasks', 'events', 'quick_capture', 'daily_loop', 'birthdays', 'activity', 'rewards'] } });

    const { container } = render(<DashboardView />);

    await waitFor(() => expect(container.querySelector('[data-dashboard-module="tasks"]')).toHaveStyle({ order: '0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customize layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));

    await waitFor(() => expect(mockApiResetDashboardLayout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector('[data-dashboard-module="quick_capture"]')).toHaveStyle({ order: '0' }));
  });

  it('keeps the loading skeleton in the same card order', () => {
    const appShellPath = path.join(__dirname, '../../components/AppShell.js');
    const appShell = fs.readFileSync(appShellPath, 'utf8');
    const skeletonBlock = appShell.match(/function DashboardSkeleton\(\) \{[\s\S]*?\n\}/)?.[0];

    expect(skeletonBlock).toBeDefined();
    expect(skeletonBlock.indexOf('bento-daily-loop')).toBeLessThan(skeletonBlock.indexOf('bento-events'));
    expect(skeletonBlock.indexOf('bento-events')).toBeLessThan(skeletonBlock.indexOf('bento-tasks'));
    expect(skeletonBlock.indexOf('bento-tasks')).toBeLessThan(skeletonBlock.indexOf('bento-birthdays'));
    expect(skeletonBlock.indexOf('bento-birthdays')).toBeLessThan(skeletonBlock.indexOf('bento-rewards'));
  });

  it('uses equal two-column spans until the mobile breakpoint', () => {
    const cssPath = path.join(__dirname, '../../styles/globals.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(/\.bento-events\s*\{\s*grid-column:\s*span 6;\s*\}/);
    expect(css).toMatch(/\.bento-daily-loop\s*\{\s*grid-column:\s*span 6;\s*\}/);
    expect(css).toMatch(/\.bento-tasks\s*\{\s*grid-column:\s*span 6;\s*\}/);
    expect(css).toMatch(/\.bento-birthdays\s*\{\s*grid-column:\s*span 6;\s*\}/);
    expect(css).toMatch(/\.bento-rewards\s*\{\s*grid-column:\s*span 6;\s*\}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*\.dashboard-module-shell\[data-dashboard-module="daily_loop"\],[\s\S]*\.dashboard-module-shell\[data-dashboard-module="quick_capture"\] \{ grid-column: span 12; \}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*\.dashboard-module-shell\[data-dashboard-module="events"\],[\s\S]*\.dashboard-module-shell\[data-dashboard-module="rewards"\] \{ grid-column: span 6; \}/);
    expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.dashboard-module-shell\[data-dashboard-module="events"\],[\s\S]*\.dashboard-module-shell\[data-dashboard-module="quick_capture"\] \{ grid-column: span 1; \}/);
  });
});
