import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppShell from '../../components/AppShell';
import { DEFAULT_NAV_ORDER } from '../../contexts/AppContext';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
  DEFAULT_NAV_ORDER: ['dashboard', 'calendar', 'weekly_plan', 'shopping', 'tasks', 'activity', 'templates', 'meal_plans', 'school_timetables', 'recipes', 'rewards', 'gifts', 'contacts', 'notifications', 'settings', 'admin'],
}));

jest.mock('../../lib/announce', () => ({ announce: jest.fn() }));

jest.mock('../../components/DashboardView', () => function MockDashboard({ onOpenSearch }) {
  return <button type="button" onClick={onOpenSearch}>Dashboard search trigger</button>;
});
jest.mock('../../components/ActivityView', () => function MockActivity() { return <div>Activity view</div>; });
jest.mock('../../components/calendar', () => function MockCalendar() { return <div>Calendar view</div>; });
jest.mock('../../components/ContactsView', () => function MockContacts() { return <div>Contacts view</div>; });
jest.mock('../../components/TasksView', () => function MockTasks() { return <div>Tasks view</div>; });
jest.mock('../../components/TemplatesView', () => function MockTemplates() { return <div>Templates view</div>; });
jest.mock('../../components/RewardsView', () => function MockRewards() { return <div>Rewards view</div>; });
jest.mock('../../components/GiftsView', () => function MockGifts() { return <div>Gifts view</div>; });
jest.mock('../../components/MealPlansView', () => function MockMealPlans() { return <div>Meal plans view</div>; });
jest.mock('../../components/RecipesView', () => function MockRecipes() { return <div>Recipes view</div>; });
jest.mock('../../components/ShoppingView', () => function MockShopping() { return <div>Shopping view</div>; });
jest.mock('../../components/settings', () => function MockSettings() { return <div>Settings view</div>; });
jest.mock('../../components/admin', () => function MockAdmin() { return <div>Admin view</div>; });
jest.mock('../../components/WeeklyPlanView', () => function MockWeeklyPlan() { return <div>Weekly plan view</div>; });
jest.mock('../../components/NotificationCenter', () => function MockNotifications() { return <div>Notifications view</div>; });
jest.mock('../../components/ForcePasswordChange', () => function MockForcePasswordChange() { return <div>Force password change</div>; });
jest.mock('../../components/OnboardingWizard', () => function MockOnboarding() { return <div>Onboarding</div>; });
jest.mock('../../components/MemberAvatar', () => function MockMemberAvatar() { return <div data-testid="member-avatar" />; });
jest.mock('../../components/SearchOverlay', () => function MockSearchOverlay({ open }) {
  return open ? <div role="dialog" aria-label="Search">Search overlay</div> : null;
});

const messages = {
  'module.responsive.home':'Home','module.responsive.calendar':'Calendar','module.responsive.new':'New','module.responsive.shopping':'Shopping','module.responsive.more':'More',
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  activity: 'Activity',
  contacts: 'Contacts',
  notifications: 'Notifications',
  notifications_unread: 'unread',
  settings: 'Settings',
  admin: 'Admin',
  nav_more: 'More',
  'nav.group.today': 'Today',
  'nav.group.plan': 'Plan',
  'nav.group.lists': 'Lists',
  'nav.group.people': 'People',
  'nav.group.household': 'Household',
  'nav.group.system': 'More / System',
  member: 'Member',
  child: 'Child',
  'aria.open_menu': 'Open menu',
  'aria.logout': 'Logout',
  'aria.bottom_navigation': 'Bottom navigation',
  'aria.main_navigation': 'Main navigation',
  'aria.expand_sidebar': 'Expand sidebar',
  'aria.collapse_sidebar': 'Collapse sidebar',
  'module.shopping.name': 'Shopping',
  'module.tasks.name': 'Tasks',
  'module.templates.name': 'Templates',
  'module.meal_plans.name': 'Meals',
  'module.recipes.name': 'Recipes',
  'module.rewards.name': 'Rewards',
  'module.gifts.name': 'Gifts',
  'module.school_timetables.name': 'School',
  'module.weekly_plan.title': 'Weekly plan',
  'search.title': 'Search',
  'search.placeholder': 'Search Tribu',
};

function baseState(overrides = {}) {
  return {
    activeView: 'dashboard',
    setActiveView: jest.fn(),
    isMobile: true,
    isAdmin: true,
    isChild: false,
    messages,
    me: { user_id: 1, display_name: 'Dennis', has_completed_onboarding: true },
    members: [{ user_id: 1, display_name: 'Dennis' }],
    families: [{ family_id: 1, family_name: 'Family' }],
    familyId: 1,
    tasks: [{ status: 'open' }, { status: 'done' }],
    shoppingLists: [{ item_count: 3, checked_count: 1 }],
    unreadCount: 7,
    logout: jest.fn(),
    demoMode: false,
    loading: false,
    navOrder: DEFAULT_NAV_ORDER,
    profileImage: null,
    ...overrides,
  };
}

describe('AppShell mobile bottom navigation', () => {
  beforeEach(()=>{
    HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  });
  it('shows the mockup navigation and opens all areas in a sheet',()=>{
    mockAppState=baseState();render(<AppShell/>);
    const nav=screen.getByRole('navigation',{name:'Bottom navigation'});
    const buttons=within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    ['Home','Calendar','New','Shopping','More'].forEach((name, index) => expect(buttons[index]).toHaveAccessibleName(name));
    expect(buttons[0]).toHaveAttribute('aria-current','page');
    fireEvent.click(buttons[4]);
    const dialog=screen.getByRole('dialog');
    expect(within(dialog).getByRole('button',{name:'Settings',exact:true})).toBeVisible();
    expect(within(dialog).getByRole('button',{name:'Admin',exact:true})).toBeVisible();
  });
  it('exposes the active area and closes the sheet when navigating',()=>{
    const setActiveView=jest.fn();mockAppState=baseState({activeView:'settings',setActiveView});render(<AppShell/>);
    fireEvent.click(within(screen.getByRole('navigation',{name:'Bottom navigation'})).getByRole('button',{name:'More'}));
    const dialog=screen.getByRole('dialog');
    expect(within(dialog).getByRole('button',{name:'Settings',exact:true})).toHaveAttribute('aria-current','page');
    fireEvent.click(within(dialog).getByRole('button',{name:'Admin',exact:true}));
    expect(setActiveView).toHaveBeenCalledWith('admin');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores shopping and task counts without changing exact control names', () => {
    mockAppState = baseState({ activeView: 'calendar' });
    render(<AppShell />);
    const nav = screen.getByRole('navigation', { name: 'Bottom navigation' });
    const shopping = within(nav).getByRole('button', { name: 'Shopping', exact: true });
    expect(shopping).toHaveTextContent('2');
    expect(shopping).toHaveAccessibleDescription('Shopping: 2');
    fireEvent.click(within(nav).getByRole('button', { name: 'More', exact: true }));
    const menu = screen.getByRole('dialog');
    expect(within(menu).getByRole('button', { name: 'Tasks', exact: true })).toHaveAccessibleDescription('Tasks: 1');
    expect(within(menu).getByRole('button', { name: 'Shopping', exact: true })).toHaveAccessibleDescription('Shopping: 2');
  });

  it('shows unread activity outside the dashboard and respects the badge preference at runtime', () => {
    mockAppState = baseState({ activeView: 'calendar' });
    const { rerender } = render(<AppShell />);
    const menuTrigger = screen.getByRole('button', { name: 'Open menu', exact: true });
    expect(menuTrigger).toHaveTextContent('7');
    expect(menuTrigger).toHaveAccessibleDescription('7 unread');
    const more = within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'More', exact: true });
    expect(more).toHaveAccessibleDescription('7 unread');
    fireEvent.click(more);
    const notifications = [within(screen.getByRole('dialog')).getByRole('button', { name: 'Notifications', exact: true })];
    for (const button of notifications) expect(button).toHaveAccessibleDescription('7 unread');
    mockAppState = { ...mockAppState, showNotificationBadge: false };
    rerender(<AppShell />);
    expect(menuTrigger).not.toHaveTextContent('7');
    expect(menuTrigger).not.toHaveAccessibleDescription();
    expect(more).not.toHaveAccessibleDescription();
    for (const button of notifications) {
      expect(button).not.toHaveTextContent('7');
      expect(button).not.toHaveAccessibleDescription();
    }
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tasks', exact: true })).toHaveTextContent('1');
    mockAppState = { ...mockAppState, showNotificationBadge: true, unreadCount: 3 };
    rerender(<AppShell />);
    expect(menuTrigger).toHaveAccessibleDescription('3 unread');
    expect(more).toHaveAccessibleDescription('3 unread');
  });

  it('caps large visible counters and removes badges when counts become zero', () => {
    mockAppState = baseState({ unreadCount: 120, shoppingLists: [{ item_count: 150, checked_count: 1 }] });
    const { rerender, container } = render(<AppShell />);
    const shopping = within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'Shopping', exact: true });
    expect(shopping).toHaveTextContent('99+');
    expect(shopping).toHaveAccessibleDescription('Shopping: 149');
    expect(screen.getByRole('button', { name: 'Open menu', exact: true })).toHaveAccessibleDescription('120 unread');
    mockAppState = { ...mockAppState, unreadCount: 0, shoppingLists: [], tasks: [] };
    rerender(<AppShell />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'More', exact: true }));
    expect(container.querySelectorAll('.ui-count-badge')).toHaveLength(0);
    expect(shopping).not.toHaveAccessibleDescription();
  });

  it('marks More active for overflow views and announces both menu triggers as expandable dialogs', () => {
    mockAppState = baseState({ activeView: 'settings' });
    render(<AppShell />);
    const more = within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'More', exact: true });
    const header = screen.getByRole('button', { name: 'Open menu', exact: true });
    expect(more).toHaveClass('active');
    expect(more).toHaveAttribute('aria-current', 'page');
    for (const trigger of [more, header]) {
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
    fireEvent.click(header);
    for (const trigger of [more, header]) expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Admin', exact: true }));
    for (const trigger of [more, header]) expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveClass('active');
  });

  it('keeps the opened mobile sidebar on an opaque theme surface', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8');

    expect(css).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.sidebar\.mobile-open \{ transform: translateX\(0\); background: var\(--void-surface\); \}/);
  });

  it('keeps bottom navigation touch targets at least 44px in both dimensions', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8');

    expect(css).toMatch(/\.bottom-nav-item \{[^}]*min-height: 44px;[^}]*min-width: 44px;/);
  });

  it('moves desktop dashboard search out of the sidebar and wires the dashboard trigger to global search', () => {
    mockAppState = baseState({ isMobile: false, activeView: 'dashboard' });
    const { container } = render(<AppShell />);

    expect(container.querySelector('.sidebar-search-btn')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard search trigger' }));
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });

  it('keeps desktop sidebar search available outside the dashboard and calendar', () => {
    mockAppState = baseState({ isMobile: false, activeView: 'tasks' });
    const { container } = render(<AppShell />);

    expect(container.querySelector('.sidebar-search-btn')).toBeInTheDocument();
  });

  it('keeps desktop sidebar navigation scrollable with a fixed footer block', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8');

    expect(css).toMatch(/\.sidebar-content \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.sidebar-footer \{[^}]*flex: 0 0 auto;[^}]*padding: 0 var\(--space-md\) var\(--space-md\);/);
    expect(css).toMatch(/\.sidebar\.collapsed \.sidebar-footer \{[^}]*padding: 0 var\(--space-sm\) var\(--space-sm\);/);
  });

  it('switches families from the sidebar family selector', () => {
    const switchFamily = jest.fn();
    mockAppState = baseState({
      isMobile: false,
      familyId: '1',
      families: [
        { family_id: 1, family_name: 'Family' },
        { family_id: 2, family_name: 'Second Family' },
      ],
      switchFamily,
    });

    render(<AppShell />);

    fireEvent.click(screen.getByRole('button', { name: 'Family' }));
    fireEvent.click(screen.getByRole('option', { name: 'Second Family' }));

    expect(switchFamily).toHaveBeenCalledWith('2');
  });

  it('groups desktop navigation around household jobs and keeps system items separate', () => {
    mockAppState = baseState({ isMobile: false });
    render(<AppShell />);

    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(mainNav).toBeInTheDocument();
    expect(within(mainNav).getByRole('region', { name: 'Today' })).toHaveTextContent('Dashboard');
    expect(within(mainNav).getByRole('region', { name: 'Plan' })).toHaveTextContent('Calendar');
    expect(within(mainNav).getByRole('region', { name: 'Plan' })).toHaveTextContent('Weekly plan');
    expect(within(mainNav).getByRole('region', { name: 'Lists' })).toHaveTextContent('Tasks');
    expect(within(mainNav).getByRole('region', { name: 'Lists' })).toHaveTextContent('Shopping');
    expect(within(mainNav).getByRole('region', { name: 'People' })).toHaveTextContent('Contacts');
    expect(within(mainNav).getByRole('region', { name: 'Household' })).toHaveTextContent('Rewards');

    const systemNav = within(mainNav).getByRole('region', { name: 'More / System' });
    expect(systemNav).toHaveTextContent('Settings');
    expect(systemNav).toHaveTextContent('Admin');
  });
});
