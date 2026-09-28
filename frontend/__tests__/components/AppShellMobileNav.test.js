import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppShell from '../../components/AppShell';
import { DEFAULT_NAV_ORDER } from '../../contexts/AppContext';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
  DEFAULT_NAV_ORDER: ['dashboard', 'calendar', 'weekly_plan', 'shopping', 'tasks', 'activity', 'templates', 'meal_plans', 'school_timetables', 'recipes', 'rewards', 'gifts', 'contacts', 'notifications', 'settings', 'admin'],
}));

jest.mock('../../lib/announce', () => ({ announce: jest.fn() }));
const mockListMealPlans = jest.fn(() => Promise.resolve({ ok: true, data: [] }));
const mockCreateQuickCapture = jest.fn(() => Promise.resolve({ ok: true, data: {} }));
const mockCreateTask = jest.fn(() => Promise.resolve({ ok: true, data: {} }));
const mockAddShoppingItem = jest.fn(() => Promise.resolve({ ok: true, data: {} }));
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  apiListMealPlans: (...args) => mockListMealPlans(...args),
  apiCreateQuickCapture: (...args) => mockCreateQuickCapture(...args),
  apiCreateTask: (...args) => mockCreateTask(...args),
  apiAddShoppingItem: (...args) => mockAddShoppingItem(...args),
}));
const mockToastSuccess = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: jest.fn(), info: jest.fn() }),
}));

jest.mock('../../components/today/TodayView', () => function MockToday() { return <div>Today view</div>; });
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
jest.mock('../../components/SearchOverlay', () => function MockSearchOverlay({ open, areas = [] }) {
  return open ? <div role="dialog" aria-label="Search">Search overlay: {areas.map((area) => area.label).join(', ')}</div> : null;
});

const messages = {
  'module.responsive.home':'Home','module.responsive.calendar':'Calendar','module.responsive.new':'New','module.responsive.shopping':'Shopping','module.responsive.more':'More',
  'module.responsive.group_lists': 'Lists & meals',
  'module.responsive.group_family': 'Family',
  'module.responsive.find_area': 'Find an area',
  'module.responsive.no_area': 'No matching area.',
  'module.responsive.search_everything': 'Search Tribu for "{query}"',
  'module.responsive.overdue': '{count} overdue',
  'module.responsive.due_today': '{count} due today',
  'module.responsive.meal_today': 'Today: {meal}',
  'module.responsive.dark_mode': 'Dark',
  close: 'Close',
  'module.responsive.capture_title': 'What would you like to add?',
  'module.responsive.save_as': 'Save as',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.quick_capture_add_task': 'Task',
  'module.dashboard.quick_capture_add_shopping': 'Shopping',
  'module.dashboard.quick_meal': 'Meal',
  'module.dashboard.quick_note': 'Note',
  'module.dashboard.quick_capture_title': 'Quick capture',
  'module.dashboard.quick_capture_placeholder': 'Note something',
  'toast.saved': 'Saved',
  'module.capture.placeholder': 'For example: Tomorrow 3 pm dentist Max',
  'module.capture.create': 'Add',
  'module.capture.create_count': 'Add {count}',
  'module.capture.created': 'Added',
  'module.capture.created_count': '{count} entries added',
  'module.capture.with_form': 'Or use a form',
  'module.capture.kind_for': 'Type of {title}',
  'module.capture.all_day': 'all day',
  'module.capture.partial': '{count} not added. Please try again.',
  'toast.error': 'Something went wrong',
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
  'nav.account_menu': 'Account and settings',
  'nav.sub_navigation': 'Pages in {group}',
  'module.dashboard.greeting_morning': 'Good morning',
  'module.dashboard.greeting_afternoon': 'Good afternoon',
  'module.dashboard.greeting_evening': 'Good evening',
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
  const tabBar = () => screen.getByRole('navigation', { name: 'Bottom navigation' });

  it('shows Today, Plan, New, Lists and Family in the tab bar', () => {
    mockAppState = baseState();
    render(<AppShell />);
    const buttons = within(tabBar()).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Today', 'Plan', 'New', '2Lists', 'Family']);
    expect(buttons[0]).toHaveAttribute('aria-current', 'page');
    expect(buttons[2]).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens a group on its first page, then on the page used last', () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({ setActiveView });
    const { rerender } = render(<AppShell />);
    fireEvent.click(within(tabBar()).getByRole('button', { name: 'Plan' }));
    expect(setActiveView).toHaveBeenLastCalledWith('calendar');

    mockAppState = { ...mockAppState, activeView: 'meal_plans' };
    rerender(<AppShell />);
    expect(within(tabBar()).getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
    mockAppState = { ...mockAppState, activeView: 'dashboard' };
    rerender(<AppShell />);
    fireEvent.click(within(tabBar()).getByRole('button', { name: 'Plan' }));
    expect(setActiveView).toHaveBeenLastCalledWith('meal_plans');
  });

  it('switches the pages of a group with the chips below the header', () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({ activeView: 'tasks', setActiveView });
    render(<AppShell />);
    const pages = screen.getByRole('navigation', { name: 'Pages in Lists' });
    expect(within(pages).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Shopping2', 'Tasks1', 'Templates']);
    expect(within(pages).getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(within(pages).getByRole('button', { name: /Shopping/ }));
    expect(setActiveView).toHaveBeenCalledWith('shopping');
    expect(screen.getByText('Lists', { selector: '.app-header-title' })).toBeInTheDocument();
  });

  it('greets on Today and names the group elsewhere', () => {
    mockAppState = baseState();
    const { rerender } = render(<AppShell />);
    expect(document.querySelector('.app-header-title')).toHaveTextContent(/^Good (morning|afternoon|evening), Dennis$/);
    mockAppState = { ...mockAppState, activeView: 'rewards' };
    rerender(<AppShell />);
    expect(document.querySelector('.app-header-title')).toHaveTextContent('Family');
  });

  it('carries the shopping count on Lists and caps it', () => {
    mockAppState = baseState({ shoppingLists: [{ item_count: 150, checked_count: 1 }] });
    const { rerender, container } = render(<AppShell />);
    const lists = within(tabBar()).getByRole('button', { name: /Lists/ });
    expect(lists).toHaveTextContent('99+');
    expect(lists).toHaveAccessibleDescription('Shopping: 149');
    mockAppState = { ...mockAppState, shoppingLists: [] };
    rerender(<AppShell />);
    expect(container.querySelectorAll('.ui-count-badge')).toHaveLength(0);
    expect(lists).not.toHaveAccessibleDescription();
  });

  it('shows unread alerts on the bell, respects the badge preference and opens the panel', () => {
    mockAppState = baseState({ activeView: 'calendar' });
    const { rerender } = render(<AppShell />);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveTextContent('7');
    expect(bell).toHaveAccessibleDescription('7 unread');
    mockAppState = { ...mockAppState, showNotificationBadge: false };
    rerender(<AppShell />);
    expect(bell).not.toHaveTextContent('7');
    expect(bell).not.toHaveAccessibleDescription();
    fireEvent.click(bell);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent('Notifications view');
  });

  it('keeps settings, admin, dark mode and signing out behind the avatar', () => {
    const setActiveView = jest.fn();
    const setTheme = jest.fn();
    const logout = jest.fn();
    mockAppState = baseState({ setActiveView, setTheme, logout, theme: 'light' });
    render(<AppShell />);
    const avatar = screen.getByRole('button', { name: 'Account and settings' });
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(avatar);
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    const sheet = screen.getByRole('dialog', { name: 'Account and settings' });
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Dark' }));
    expect(setTheme).toHaveBeenCalledWith('dark');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Logout' }));
    expect(logout).toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Admin', exact: true }));
    expect(setActiveView).toHaveBeenCalledWith('admin');
    expect(screen.queryByRole('dialog', { name: 'Account and settings' })).not.toBeInTheDocument();
  });

  it('hides admin from members and switches families from the account menu', () => {
    const switchFamily = jest.fn();
    mockAppState = baseState({
      isAdmin: false,
      familyId: '1',
      families: [{ family_id: 1, family_name: 'Family' }, { family_id: 2, family_name: 'Second Family' }],
      switchFamily,
    });
    render(<AppShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }));
    const sheet = screen.getByRole('dialog', { name: 'Account and settings' });
    expect(within(sheet).queryByRole('button', { name: 'Admin', exact: true })).not.toBeInTheDocument();
    fireEvent.change(within(sheet).getByRole('combobox'), { target: { value: '2' } });
    expect(switchFamily).toHaveBeenCalledWith('2');
  });

  it('opens one search for content and areas from the header and with Cmd+K', () => {
    mockAppState = baseState();
    render(<AppShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Search Tribu' }));
    const search = screen.getByRole('dialog', { name: 'Search' });
    expect(search).toHaveTextContent('Calendar');
    expect(search).toHaveTextContent('Settings');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });

  it('opens create forms from the New sheet tiles', () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({ setActiveView });
    render(<AppShell />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'New', exact: true }));
    const sheet = screen.getByRole('dialog', { name: 'What would you like to add?' });
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus();
    ['Event', 'Task', 'Shopping', 'Meal'].forEach((name) => expect(within(sheet).getAllByRole('button', { name, exact: true })[0]).toBeInTheDocument());
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Event', exact: true })[0]);
    expect(setActiveView).toHaveBeenCalledWith('calendar');
    expect(screen.queryByRole('dialog', { name: 'What would you like to add?' })).not.toBeInTheDocument();
  });

  it('creates what the capture field recognised and closes the sheet', async () => {
    const loadShoppingLists = jest.fn();
    const loadTasks = jest.fn();
    [mockCreateTask, mockAddShoppingItem, mockToastSuccess].forEach((mock) => mock.mockClear());
    mockAppState = baseState({ loadShoppingLists, loadTasks, shoppingLists: [{ id: 5, item_count: 3, checked_count: 1 }] });
    render(<AppShell />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'New', exact: true }));
    const sheet = screen.getByRole('dialog', { name: 'What would you like to add?' });
    expect(within(sheet).getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Quick capture' }), { target: { value: '2 l Milch\nOma anrufen morgen' } });
    expect(within(sheet).getByText('Milch')).toBeInTheDocument();
    expect(within(sheet).getByText('Oma anrufen')).toBeInTheDocument();
    expect(within(within(sheet).getByRole('group', { name: 'Type of Milch' })).getByRole('button', { name: 'Shopping' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 2' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What would you like to add?' })).not.toBeInTheDocument());
    expect(mockAddShoppingItem).toHaveBeenCalledWith(5, { name: 'Milch', spec: '2 l', category: 'Kühlregal' });
    expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({ family_id: 1, title: 'Oma anrufen', due_is_date: true }));
    expect(loadShoppingLists).toHaveBeenCalledWith(1);
    expect(loadTasks).toHaveBeenCalledWith(1);
    expect(mockToastSuccess).toHaveBeenCalledWith('2 entries added');
  });

  it('lets each entry change its type', async () => {
    mockCreateQuickCapture.mockClear();
    mockAppState = baseState({ loadQuickCaptureInbox: jest.fn() });
    render(<AppShell />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'New', exact: true }));
    const sheet = screen.getByRole('dialog', { name: 'What would you like to add?' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Quick capture' }), { target: { value: 'Idee fürs Wochenende' } });
    fireEvent.click(within(within(sheet).getByRole('group', { name: 'Type of Idee fürs Wochenende' })).getByRole('button', { name: 'Note' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockCreateQuickCapture).toHaveBeenCalledWith({ family_id: 1, text: 'Idee fürs Wochenende', destination: 'inbox' }));
  });

  it('keeps what failed and reports it', async () => {
    mockCreateTask.mockResolvedValueOnce({ ok: false });
    mockAppState = baseState();
    render(<AppShell />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'New', exact: true }));
    const sheet = screen.getByRole('dialog', { name: 'What would you like to add?' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Quick capture' }), { target: { value: 'Call grandma' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('1 not added. Please try again.');
    expect(within(sheet).getByRole('textbox', { name: 'Quick capture' })).toHaveValue('Call grandma');
  });

  it('hides quick capture in demo mode', () => {
    mockAppState = baseState({ demoMode: true });
    render(<AppShell />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Bottom navigation' })).getByRole('button', { name: 'New', exact: true }));
    const sheet = screen.getByRole('dialog', { name: 'What would you like to add?' });
    expect(within(sheet).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Meal', exact: true })).toBeInTheDocument();
  });

  it('groups the sidebar into the same four areas with their pages', () => {
    mockAppState = baseState({ isMobile: false });
    render(<AppShell />);
    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(mainNav).getByRole('region', { name: 'Today' })).toHaveTextContent('Today');
    expect(within(mainNav).getByRole('region', { name: 'Plan' })).toHaveTextContent(/Calendar.*Weekly plan|Weekly plan.*Calendar/);
    expect(within(mainNav).getByRole('region', { name: 'Plan' })).toHaveTextContent('Meals');
    expect(within(mainNav).getByRole('region', { name: 'Lists' })).toHaveTextContent('Shopping');
    expect(within(mainNav).getByRole('region', { name: 'Lists' })).toHaveTextContent('Templates');
    expect(within(mainNav).getByRole('region', { name: 'Family' })).toHaveTextContent('Contacts');
    expect(within(mainNav).getByRole('region', { name: 'Family' })).toHaveTextContent('Activity');
    expect(mainNav).not.toHaveTextContent('Settings');
    expect(screen.queryByRole('navigation', { name: /Pages in/ })).not.toBeInTheDocument();
  });
});
