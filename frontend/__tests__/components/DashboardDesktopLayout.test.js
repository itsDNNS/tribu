import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/i18n', () => ({
  t: (messages, key) => messages?.[key] || key,
}));

jest.mock('../../lib/api', () => ({
  apiGetSetupChecklist: jest.fn().mockResolvedValue({ ok: true, data: null }),
  apiListMealPlans: jest.fn().mockResolvedValue({ ok: true, data: [] }),
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
  });

  it('keeps the current desktop module order', () => {
    const { container } = render(<DashboardView />);

    const modules = Array.from(container.querySelectorAll('.bento-grid > .bento-card'));
    expect(modules[0]).toHaveClass('bento-quick-capture');
    expect(modules[1]).toHaveClass('bento-daily-loop');
    expect(modules[1]).toHaveAccessibleName('Today in motion');
    expect(modules[2]).toHaveClass('bento-events');
    expect(modules[2]).toHaveAccessibleName('Next events');
    expect(modules[3]).toHaveClass('bento-tasks');
    expect(modules[3]).toHaveAccessibleName('Open tasks');
    expect(modules[4]).toHaveClass('bento-birthdays');
    expect(modules[4]).toHaveAccessibleName('Birthdays');
    expect(modules[5]).toHaveClass('bento-activity');
    expect(modules[6]).toHaveClass('bento-rewards');
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
    expect(css).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*\.bento-daily-loop, \.bento-quick-capture \{ grid-column: span 12; \}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*\.bento-events, \.bento-tasks, \.bento-birthdays, \.bento-activity, \.bento-rewards \{ grid-column: span 6; \}/);
    expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.bento-events, \.bento-tasks, \.bento-birthdays, \.bento-activity, \.bento-rewards, \.bento-daily-loop, \.bento-quick-capture \{ grid-column: span 1; \}/);
  });
});
