import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppShell from '../../components/AppShell';
import { DEFAULT_NAV_ORDER } from '../../contexts/UIContext';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/announce', () => ({ announce: jest.fn() }));

jest.mock('../../components/DashboardView', () => function MockDashboard() { return <div>Dashboard view</div>; });
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
jest.mock('../../components/SearchOverlay', () => function MockSearchOverlay() { return null; });

const messages = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  activity: 'Activity',
  contacts: 'Contacts',
  notifications: 'Notifications',
  settings: 'Settings',
  admin: 'Admin',
  nav_more: 'More',
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
  'module.weekly_plan.name': 'Weekly',
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
  it('keeps high-priority mobile items visible and pins settings/admin in overflow', async () => {
    mockAppState = baseState();
    render(<AppShell />);

    const bottomNav = screen.getByRole('navigation', { name: 'Bottom navigation' });
    expect(bottomNav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
    const tasksItem = bottomNav.querySelector('.bottom-nav-item:nth-child(4)');
    const shoppingItem = bottomNav.querySelector('.bottom-nav-item:nth-child(3)');
    expect(tasksItem).toHaveTextContent('Tasks');
    expect(tasksItem).toHaveTextContent('1');
    expect(shoppingItem).toHaveTextContent('Shopping');
    expect(shoppingItem).toHaveTextContent('2');

    const visibleBottomItems = bottomNav.querySelectorAll('.bottom-nav-inner > .bottom-nav-item');
    expect(visibleBottomItems).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getAllByRole('button', { name: /^settings$/i })
      .some((button) => button.classList.contains('bottom-nav-overflow-item'))).toBe(true);
    expect(screen.getAllByRole('button', { name: /^admin$/i })
      .some((button) => button.classList.contains('bottom-nav-overflow-item'))).toBe(true);
  });

  it('exposes active overflow destinations as the current page and closes after navigation', async () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({ activeView: 'settings', setActiveView });
    render(<AppShell />);

    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    const settingsItem = screen.getAllByRole('button', { name: /^settings$/i })
      .find((button) => button.classList.contains('bottom-nav-overflow-item'));
    expect(settingsItem).toHaveAttribute('aria-current', 'page');

    const adminItem = screen.getAllByRole('button', { name: /^admin$/i })
      .find((button) => button.classList.contains('bottom-nav-overflow-item'));
    fireEvent.click(adminItem);
    expect(setActiveView).toHaveBeenCalledWith('admin');
    expect(document.querySelector('.bottom-nav-overflow')).not.toBeInTheDocument();
  });
});
