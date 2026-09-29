import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import WeeklyPlanView, { buildWeeklyPlanSections, getWeekRange } from '../../components/WeeklyPlanView';
import { apiGetEvents, apiListRecipes } from '../../lib/api';
import { peekHandoff } from '../../lib/viewHandoff';

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
  apiListRecipes: jest.fn().mockResolvedValue({ data: [] }),
}));

const messages = {
  'module.weekly_plan.title': 'Weekly plan',
  'module.weekly_plan.subtitle': 'Print-ready household overview',
  'module.weekly_plan.this_week': 'This week',
  'module.weekly_plan.next_week': 'Next week',
  'module.weekly_plan.previous_week': 'Previous week',
  'module.weekly_plan.print': 'Print',
  'module.weekly_plan.back_dashboard': 'Back to Today',
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
    expect(sections.shopping).toEqual([{ id: 8, title: 'Groceries', count: 3 }]);
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

const board = () => within(document.querySelector('.week-board'));
const day = (name) => within(board().getByRole('region', { name }));
const glanceMessages = {
  ...messages,
  'module.weekly_plan.day_free': 'Free',
  'module.weekly_plan.add_to_day': 'Add to {day}',
  'module.weekly_plan.shopping_open': '{count} open',
  'module.weekly_plan.recipe': 'Recipe',
  'module.meal_plans.slot.morning': 'Morning',
  'module.meal_plans.slot.evening': 'Evening',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.quick_capture_add_task': 'Task',
  'module.dashboard.quick_meal': 'Meal',
};

describe('Week at a glance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = baseApp({ messages: glanceMessages });
    window.print = jest.fn();
  });

  it('shows the week by day and keeps the sections for printing', () => {
    mockAppState = baseApp({
      messages: glanceMessages,
      events: [{ id: 1, title: 'Football', starts_at: '2026-05-08T17:00:00' }],
      tasks: [{ id: 2, title: 'Pack bags', status: 'open', due_date: '2026-05-08' }],
      birthdays: [{ id: 3, person_name: 'Martin', month: 5, day: 9 }],
      shoppingLists: [{ id: 4, name: 'Groceries', item_count: 3, checked_count: 1 }],
    });

    const { container } = render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialEvents={mockAppState.events} initialMeals={[{ id: 5, meal_name: 'Pasta', plan_date: '2026-05-08', slot: 'evening' }]} />);

    expect(screen.getByRole('heading', { name: 'Weekly plan', level: 1 })).toBeVisible();
    const friday = day(/Friday, May 8/);
    expect(friday.getByRole('button', { name: /17:00\s*Football/ })).toBeVisible();
    expect(friday.getByRole('button', { name: /Evening\s*Pasta/ })).toBeVisible();
    expect(friday.getByRole('button', { name: /Pack bags/ })).toBeVisible();
    expect(day(/Saturday, May 9/).getByRole('button', { name: /Martin/ })).toBeVisible();
    expect(day(/Monday, May 4/).getByText('Free')).toBeVisible();
    expect(within(document.querySelector('.week-glance-shopping')).getByRole('button', { name: /Groceries\s*2 open/ })).toBeVisible();

    // Printing is still there, quietly: the icon button and the sections.
    expect(screen.getByRole('button', { name: 'Print' })).toHaveClass('no-print');
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.weekly-plan-page')).toHaveClass('print-surface');
    const printed = container.querySelector('.weekly-plan-grid');
    expect(printed).toHaveClass('ui-print-only');
    expect(within(printed).getByRole('region', { name: 'Events' })).toHaveTextContent('Football');
    expect(container.querySelector('.week-board')).toHaveClass('no-print');
    expect(screen.queryByRole('link', { name: /share/i })).not.toBeInTheDocument();
  });

  it('filters by person and kind with chips', () => {
    mockAppState = baseApp({
      messages: glanceMessages,
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

    const mia = screen.getByRole('button', { name: /Mia$/ });
    fireEvent.click(mia);
    expect(mia).toHaveAttribute('aria-pressed', 'true');
    expect(board().getByText('Mia training')).toBeVisible();
    expect(board().queryByText('Leo training')).not.toBeInTheDocument();
    expect(board().getByText('Mia bag')).toBeVisible();
    expect(board().queryByText('Leo bag')).not.toBeInTheDocument();

    const tasksChip = screen.getByRole('button', { name: /Tasks and routines\s*1/ });
    fireEvent.click(tasksChip);
    expect(tasksChip).toHaveAttribute('aria-pressed', 'false');
    expect(board().queryByText('Mia bag')).not.toBeInTheDocument();
    fireEvent.click(tasksChip);
    expect(board().getByText('Mia bag')).toBeVisible();
  });

  it('fetches ranged calendar events for the selected week', async () => {
    apiGetEvents.mockResolvedValueOnce({ data: [{ id: 9, title: 'Recurring training', starts_at: '2026-05-08T17:00:00' }] });
    mockAppState = baseApp({ messages: glanceMessages, events: [{ id: 1, title: 'Cached later event', starts_at: '2026-06-08T17:00:00' }] });

    render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialMeals={[]} />);

    await waitFor(() => expect(apiGetEvents).toHaveBeenCalledWith(7, new Date(2026,4,4).toISOString(), new Date(2026,4,11).toISOString()));
    expect(await board().findByText('Recurring training')).toBeVisible();
    expect(screen.queryByText('Cached later event')).not.toBeInTheDocument();
  });

  it('opens each entry where it comes from and orders meals through the day', async () => {
    const setActiveView = jest.fn();
    apiListRecipes.mockResolvedValueOnce({ data: [{ id: 31, title: 'pasta' }] });
    mockAppState = baseApp({
      setActiveView,
      messages: glanceMessages,
      events: [{ id: 1, title: 'Football', starts_at: '2026-05-08T17:00:00' }],
      shoppingLists: [{ id: 4, name: 'Groceries', item_count: 3, checked_count: 1 }],
      birthdays: [{ id: 3, person_name: 'Martin', month: 5, day: 9 }],
    });
    render(<WeeklyPlanView
      initialDate={new Date('2026-05-06T12:00:00')}
      initialEvents={mockAppState.events}
      initialMeals={[
        { id: 5, meal_name: 'Pasta', plan_date: '2026-05-08', slot: 'evening' },
        { id: 6, meal_name: 'Porridge', plan_date: '2026-05-08', slot: 'morning' },
      ]}
    />);
    const friday = day(/Friday, May 8/);
    // Pasta is also a family recipe (matched by name) and links to it.
    await friday.findByRole('button', { name: 'Recipe' });
    expect(friday.getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('Football'),
      expect.stringContaining('Porridge'),
      expect.stringContaining('Pasta'),
      'Recipe',
    ]);

    fireEvent.click(friday.getByRole('button', { name: /Football/ }));
    expect(setActiveView).toHaveBeenLastCalledWith('calendar');
    expect(peekHandoff('tribu_calendar_focus')).toBe(new Date('2026-05-08T17:00:00').toISOString());

    fireEvent.click(friday.getByRole('button', { name: /Pasta/ }));
    expect(setActiveView).toHaveBeenLastCalledWith('meal_plans');
    expect(peekHandoff('tribu_meal_focus')).toBe('2026-05-08');

    fireEvent.click(friday.getByRole('button', { name: 'Recipe' }));
    expect(setActiveView).toHaveBeenLastCalledWith('recipes');
    expect(peekHandoff('tribu_recipe_open')).toBe('31');

    fireEvent.click(within(document.querySelector('.week-glance-shopping')).getByRole('button', { name: /Groceries/ }));
    expect(setActiveView).toHaveBeenLastCalledWith('shopping');
    expect(peekHandoff('tribu_shopping_list')).toBe('4');

    fireEvent.click(day(/Saturday, May 9/).getByRole('button', { name: /Martin/ }));
    expect(setActiveView).toHaveBeenLastCalledWith('contacts');
    expect(peekHandoff('tribu_contacts_tab')).toBe('birthdays');
  });

  it('"+" on a day opens a form for that day, not for children', () => {
    const onCreateForm = jest.fn();
    const { unmount } = render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialEvents={[]} initialMeals={[]} onCreateForm={onCreateForm} />);
    const wednesday = day(/Wednesday, May 6/);
    expect(wednesday.getByText('', { selector: 'summary[aria-label="Add to Wednesday, May 6"]' })).toBeInTheDocument();
    fireEvent.click(wednesday.getByRole('button', { name: 'Event' }));
    expect(onCreateForm).toHaveBeenLastCalledWith('event');
    expect(peekHandoff('tribu_calendar_focus')).toBe(new Date('2026-05-06T14:00').toISOString());
    fireEvent.click(day(/Thursday, May 7/).getByRole('button', { name: 'Meal' }));
    expect(onCreateForm).toHaveBeenLastCalledWith('meal');
    expect(peekHandoff('tribu_meal_focus')).toBe('2026-05-07');
    unmount();

    mockAppState = baseApp({ isChild: true, messages: glanceMessages });
    render(<WeeklyPlanView initialDate={new Date('2026-05-06T12:00:00')} initialEvents={[]} initialMeals={[]} onCreateForm={onCreateForm} />);
    expect(document.querySelector('.week-day-add')).toBeNull();
  });
});

describe('weekly plan theme CSS contract', () => {
  it('keeps print-card surfaces paired with readable foreground tokens in every app theme', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8');
    const weeklyPlanStart = css.indexOf('/* ─── Weekly plan print view ─── */');
    const weeklyPlanEnd = css.indexOf('/* ─── Dashboard activation panel ─── */');

    expect(weeklyPlanStart).toBeGreaterThanOrEqual(0);
    expect(weeklyPlanEnd).toBeGreaterThan(weeklyPlanStart);

    const weeklyCss = css.slice(weeklyPlanStart, weeklyPlanEnd);

    expect(weeklyCss).toContain('--weekly-plan-surface: rgb(255, 253, 248)');
    expect(weeklyCss).toContain('--weekly-plan-text-primary: var(--text-primary)');
    expect(weeklyCss).toContain('--weekly-plan-text-secondary: var(--text-secondary)');
    expect(weeklyCss).toContain('background: var(--weekly-plan-surface)');
    expect(weeklyCss).toContain('color: var(--weekly-plan-text-primary)');
    expect(weeklyCss).toContain('color: var(--weekly-plan-text-secondary)');
    expect(weeklyCss).toContain(':root .weekly-plan-page { --weekly-plan-surface: #ffffff;');
    expect(weeklyCss).not.toContain('.weekly-plan-section li strong { color: var(--text-primary);');
    expect(weeklyCss).not.toContain('.weekly-plan-section li span { color: var(--text-secondary);');
  });
});
