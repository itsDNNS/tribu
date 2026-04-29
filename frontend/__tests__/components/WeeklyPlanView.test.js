import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import WeeklyPlanView, { buildWeeklyPlanSections, getWeekRange } from '../../components/WeeklyPlanView';
import { apiGetEvents } from '../../lib/api';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/i18n', () => ({
  t: (messages, key) => messages?.[key] || key,
}));

jest.mock('../../lib/api', () => ({
  apiGetEvents: jest.fn().mockResolvedValue({ data: [] }),
  apiListMealPlans: jest.fn().mockResolvedValue({ data: { items: [] } }),
}));

const messages = {
  'module.weekly_plan.title': 'Weekly plan',
  'module.weekly_plan.subtitle': 'Print-ready household overview',
  'module.weekly_plan.this_week': 'This week',
  'module.weekly_plan.next_week': 'Next week',
  'module.weekly_plan.previous_week': 'Previous week',
  'module.weekly_plan.print': 'Print',
  'module.weekly_plan.back_dashboard': 'Back to dashboard',
  'module.weekly_plan.events': 'Events',
  'module.weekly_plan.tasks': 'Tasks and routines',
  'module.weekly_plan.meals': 'Meals',
  'module.weekly_plan.shopping': 'Shopping reminders',
  'module.weekly_plan.birthdays': 'Birthdays',
  'module.weekly_plan.empty_section': 'Nothing planned',
  'module.weekly_plan.no_due_date': 'No due date',
  'module.weekly_plan.filters': 'Filters',
  'module.weekly_plan.filter_member': 'Member',
  'module.weekly_plan.filter_all_members': 'All members',
  'module.weekly_plan.filter_sections': 'Sections',
};

function baseApp(overrides = {}) {
  return {
    summary: { next_events: [], upcoming_birthdays: [] },
    events: [],
    tasks: [],
    shoppingLists: [],
    birthdays: [],
    members: [],
    familyId: 7,
    messages,
    lang: 'en',
    timeFormat: '24h',
    setActiveView: jest.fn(),
    ...overrides,
  };
}

describe('weekly plan helpers', () => {
  it('composes only events, tasks, meals, birthdays, and shopping reminders inside the selected week', () => {
    const week = getWeekRange(new Date('2026-05-06T12:00:00'));
    const sections = buildWeeklyPlanSections({
      weekStart: week.start,
      events: [
        { id: 1, title: 'Football', starts_at: '2026-05-08T17:00:00' },
        { id: 2, title: 'Later', starts_at: '2026-05-18T17:00:00' },
      ],
      tasks: [
        { id: 3, title: 'Pack bags', status: 'open', due_date: '2026-05-07' },
        { id: 4, title: 'Done task', status: 'done', due_date: '2026-05-07' },
      ],
      meals: [
        { id: 5, meal_name: 'Pasta', plan_date: '2026-05-09', slot: 'dinner' },
      ],
      birthdays: [
        { id: 6, person_name: 'Martin', month: 5, day: 7 },
        { id: 7, person_name: 'June', month: 6, day: 1 },
      ],
      shoppingLists: [
        { id: 8, name: 'Groceries', item_count: 5, checked_count: 2 },
      ],
    });

    expect(sections.events).toHaveLength(1);
    expect(sections.tasks).toHaveLength(1);
    expect(sections.meals).toHaveLength(1);
    expect(sections.birthdays).toHaveLength(1);
    expect(sections.shopping).toEqual([{ id: 8, title: 'Groceries', detail: '3 open', count: 3 }]);
  });

  it('includes birthdays when the selected week crosses into a new year', () => {
    const week = getWeekRange(new Date('2026-12-30T12:00:00'));
    const sections = buildWeeklyPlanSections({
      weekStart: week.start,
      birthdays: [
        { id: 1, person_name: 'New Year Child', month: 1, day: 2 },
        { id: 2, person_name: 'Spring Child', month: 4, day: 2 },
      ],
    });

    expect(sections.birthdays).toEqual([{ id: 1, person_name: 'New Year Child', month: 1, day: 2 }]);
  });
});

describe('WeeklyPlanView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = baseApp();
    window.print = jest.fn();
  });

  it('renders a print-ready weekly plan and hides app navigation controls behind print classes', () => {
    mockAppState = baseApp({
      events: [{ id: 1, title: 'Football', starts_at: '2026-05-08T17:00:00' }],
      tasks: [{ id: 2, title: 'Pack bags', status: 'open', due_date: '2026-05-08' }],
      birthdays: [{ id: 3, person_name: 'Martin', month: 5, day: 9 }],
      shoppingLists: [{ id: 4, name: 'Groceries', item_count: 3, checked_count: 1 }],
    });

    const { container } = render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialEvents={mockAppState.events} initialMeals={[{ id: 5, meal_name: 'Pasta', plan_date: '2026-05-08', slot: 'dinner' }]} />);

    expect(screen.getByRole('heading', { name: 'Weekly plan' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Print' })).toHaveClass('no-print');
    expect(container.querySelector('.weekly-plan-page')).toHaveClass('print-surface');
    expect(within(screen.getByRole('region', { name: 'Events' })).getByText('Football')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Tasks and routines' })).getByText('Pack bags')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Meals' })).getByText('Pasta')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Birthdays' })).getByText('Martin')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Shopping reminders' })).getByText('Groceries')).toBeVisible();
  });

  it('filters printable sections and member-specific assignments without exposing controls in print', () => {
    mockAppState = baseApp({
      members: [
        { user_id: 10, display_name: 'Mia' },
        { user_id: 11, display_name: 'Leo' },
      ],
      events: [
        { id: 1, title: 'Mia training', starts_at: '2026-05-08T17:00:00', assigned_to: [10] },
        { id: 2, title: 'Leo training', starts_at: '2026-05-08T18:00:00', assigned_to: [11] },
      ],
      tasks: [
        { id: 3, title: 'Mia bag', status: 'open', due_date: '2026-05-08', assigned_to_user_id: 10 },
        { id: 4, title: 'Leo bag', status: 'open', due_date: '2026-05-08', assigned_to_user_id: 11 },
      ],
    });

    render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialEvents={mockAppState.events} initialMeals={[]} />);

    const filters = screen.getByRole('group', { name: 'Filters' });
    expect(filters).toHaveClass('no-print');
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: '10' } });
    expect(screen.getByText('Mia training')).toBeVisible();
    expect(screen.queryByText('Leo training')).not.toBeInTheDocument();
    expect(screen.getByText('Mia bag')).toBeVisible();
    expect(screen.queryByText('Leo bag')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText('Sections')).getByLabelText('Tasks and routines'));
    expect(screen.queryByRole('region', { name: 'Tasks and routines' })).not.toBeInTheDocument();
  });

  it('fetches ranged calendar events for the selected printable week', async () => {
    apiGetEvents.mockResolvedValueOnce({ data: [{ id: 9, title: 'Recurring training', starts_at: '2026-05-08T17:00:00' }] });
    mockAppState = baseApp({ events: [{ id: 1, title: 'Cached later event', starts_at: '2026-06-08T17:00:00' }] });

    render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialMeals={[]} />);

    await waitFor(() => expect(apiGetEvents).toHaveBeenCalledWith(7, expect.stringContaining('2026-05-04'), expect.stringContaining('2026-05-10')));
    expect(await screen.findByText('Recurring training')).toBeVisible();
    expect(screen.queryByText('Cached later event')).not.toBeInTheDocument();
  });

  it('prints and navigates back without creating a public share link', () => {
    const setActiveView = jest.fn();
    mockAppState = baseApp({ setActiveView });
    render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialEvents={mockAppState.events} initialMeals={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));
    expect(setActiveView).toHaveBeenCalledWith('dashboard');
    expect(screen.queryByRole('link', { name: /share/i })).not.toBeInTheDocument();
  });
});
