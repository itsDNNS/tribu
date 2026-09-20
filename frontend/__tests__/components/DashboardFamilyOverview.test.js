import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardView from '../../components/DashboardView';
import { buildMessages } from '../../lib/i18n';
import { apiListMealPlans, apiUpdateTask } from '../../lib/api';

let mockApp;
jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../components/RewardsDashboardWidget', () => () => <div />);
jest.mock('../../lib/api', () => ({
  apiGetDashboardLayout: jest.fn().mockResolvedValue({ ok: true, data: { modules: [] } }),
  apiGetSetupChecklist: jest.fn().mockResolvedValue({ ok: true, data: { show_on_dashboard: false } }),
  apiListMealPlans: jest.fn(),
  apiUpdateTask: jest.fn(),
}));

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  apiListMealPlans.mockResolvedValue({ ok: true, data: [] });
  mockApp = {
    summary: { next_events: [], upcoming_birthdays: [] },
    me: { display_name: 'Alex' }, members: [], families: [], events: [], tasks: [], shoppingLists: [],
    familyId: 1, messages: buildMessages('en'), lang: 'en', timeFormat: '24h',
    setActiveView: jest.fn(), setTasks: jest.fn(), loadTasks: jest.fn(), loadDashboard: jest.fn(), loadActivity: jest.fn(),
  };
});

it('shows only today’s demo meals and opens the real meal planner', async () => {
  mockApp.demoMode = true;
  mockApp.mealPlans = [
    { id: 1, slot: 'morning', plan_date: today(), meal_name: 'Porridge' },
    { id: 2, slot: 'evening', plan_date: '2999-01-01', meal_name: 'Future dinner' },
  ];
  render(<DashboardView />);
  expect(screen.getByText('Porridge')).toBeInTheDocument();
  expect(screen.queryByText('Future dinner')).not.toBeInTheDocument();
  expect(screen.getByTestId('today-status-meals')).toHaveTextContent('1');
  fireEvent.click(screen.getByRole('button', { name: /Porridge/ }));
  expect(mockApp.setActiveView).toHaveBeenCalledWith('meal_plans');
  expect(apiListMealPlans).not.toHaveBeenCalled();
});

it('keeps load failures distinct from an empty meal plan', async () => {
  apiListMealPlans.mockResolvedValue({ ok: false });
  render(<DashboardView />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByTestId('today-status-meals')).toHaveTextContent('–');
});

it('ignores an old household’s meal response after a family switch', async () => {
  let resolveOld;
  apiListMealPlans.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const { rerender } = render(<DashboardView />);
  mockApp = { ...mockApp, familyId: 2 };
  apiListMealPlans.mockResolvedValue({ ok: true, data: [{ id: 2, slot: 'noon', meal_name: 'New family lunch' }] });
  rerender(<DashboardView />);
  expect(await screen.findByText('New family lunch')).toBeInTheDocument();
  resolveOld({ ok: true, data: [{ id: 1, slot: 'noon', meal_name: 'Old family lunch' }] });
  await waitFor(() => expect(screen.queryByText('Old family lunch')).not.toBeInTheDocument());
});

it('completes a task once and refreshes the shared household data', async () => {
  let finish;
  mockApp.tasks = [{ id: 12, title: 'Pack school bag', status: 'open' }];
  apiUpdateTask.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<DashboardView />);
  const checkbox = screen.getByRole('checkbox', { name: /Pack school bag/ });
  fireEvent.click(checkbox);
  expect(checkbox).toBeDisabled();
  fireEvent.click(checkbox);
  expect(apiUpdateTask).toHaveBeenCalledTimes(1);
  expect(apiUpdateTask).toHaveBeenCalledWith(12, { status: 'done' });
  finish({ ok: true });
  await waitFor(() => expect(mockApp.loadTasks).toHaveBeenCalledWith(1));
  expect(mockApp.loadDashboard).toHaveBeenCalledWith(1);
  expect(mockApp.loadActivity).toHaveBeenCalledWith(1);
});

it('leaves a failed task open and allows retrying', async () => {
  mockApp.tasks = [{ id: 12, title: 'Pack school bag', status: 'open' }];
  apiUpdateTask.mockResolvedValue({ ok: false });
  render(<DashboardView />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Pack school bag/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /Pack school bag/ })).toBeEnabled();
  expect(mockApp.loadTasks).not.toHaveBeenCalled();
});

it('uses the mockup order by default and includes meals and activity in customization', async () => {
  const { container } = render(<DashboardView />);
  await waitFor(() => expect(apiListMealPlans).toHaveBeenCalled());
  const modules = [...container.querySelectorAll('[data-dashboard-module]')]
    .filter((node) => node.dataset.dashboardModule !== 'setup_checklist');
  expect(modules.map((node) => node.dataset.dashboardModule)).toEqual([
    'quick_capture', 'events', 'tasks', 'meals', 'daily_loop', 'birthdays', 'rewards', 'activity',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Customize layout' }));
  const panel = screen.getByRole('region', { name: 'Customize layout' });
  expect(within(panel).getByText(mockApp.messages['module.meal_plans.name'])).toBeInTheDocument();
  expect(within(panel).getByText(mockApp.messages['module.dashboard.module_activity'])).toBeInTheDocument();
});

it('only lets children complete their own assigned tasks and routines', async () => {
  mockApp.isChild = true;
  mockApp.me.user_id = 7;
  mockApp.tasks = [
    { id: 1, title: 'My task', status: 'open', assigned_to_user_id: 7 },
    { id: 2, title: 'Other task', status: 'open', assigned_to_user_id: 8 },
    { id: 3, title: 'Unassigned routine', status: 'open', recurrence: 'daily', due_date: today() },
  ];
  render(<DashboardView />);
  await waitFor(() => expect(apiListMealPlans).toHaveBeenCalled());
  expect(screen.getByRole('checkbox', { name: /My task/ })).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: /Other task/ })).toBeDisabled();
  for (const checkbox of screen.getAllByRole('checkbox', { name: /Unassigned routine/ })) {
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
  }
  expect(apiUpdateTask).not.toHaveBeenCalled();
});

it('does not refresh the old household after completing a task across a family switch', async () => {
  let finish;
  apiUpdateTask.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  mockApp.tasks = [{ id: 12, title: 'Old task', status: 'open' }];
  const { rerender } = render(<DashboardView />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Old task/ }));
  mockApp = { ...mockApp, familyId: 2, tasks: [] };
  rerender(<DashboardView />);
  await waitFor(() => expect(apiListMealPlans).toHaveBeenCalledWith(2, today(), today()));
  await act(async () => finish({ ok: true }));
  expect(mockApp.loadTasks).not.toHaveBeenCalled();
  expect(mockApp.loadDashboard).not.toHaveBeenCalled();
  expect(mockApp.loadActivity).not.toHaveBeenCalled();
});

it('uses the selected language for the next event’s date and relative day', async () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  mockApp.lang = 'fr';
  mockApp.messages = buildMessages('fr');
  mockApp.summary.next_events = [{ id: 1, title: 'Sortie', starts_at: date.toISOString() }];
  render(<DashboardView />);
  await waitFor(() => expect(apiListMealPlans).toHaveBeenCalled());
  expect(screen.getByText('après-demain')).toBeVisible();
});
