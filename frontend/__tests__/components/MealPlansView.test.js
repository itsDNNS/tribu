import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPlansView from '../../components/MealPlansView';

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

let mockAppState = {};
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const apiListMealPlans = jest.fn();
const apiListMealPlanIngredients = jest.fn();
const apiListRecipes = jest.fn();
const apiCreateMealPlan = jest.fn();
const apiDeleteMealPlan = jest.fn();
jest.mock('../../lib/api', () => ({
  apiListMealPlans: (...args) => apiListMealPlans(...args),
  apiListMealPlanIngredients: (...args) => apiListMealPlanIngredients(...args),
  apiListRecipes: (...args) => apiListRecipes(...args),
  apiCreateMealPlan: (...args) => apiCreateMealPlan(...args),
  apiUpdateMealPlan: jest.fn(),
  apiDeleteMealPlan: (...args) => apiDeleteMealPlan(...args),
  apiAddMealIngredientsToShopping: jest.fn(),
}));

const messages = {
  'module.meal_plans.name': 'Essensplan',
  'module.meal_plans.demo_blocked': 'Im Demo nicht verfügbar',
  'module.meal_plans.slot_taken': 'Slot belegt',
  'toast.error': 'Fehler',
  'module.meal_plans.add': 'Mahlzeit planen',
  'module.meal_plans.add_title': 'Mahlzeit planen',
  'module.meal_plans.edit_title': 'Mahlzeit bearbeiten',
  'module.meal_plans.cancel': 'Abbrechen',
  'module.meal_plans.save': 'Speichern',
  'module.meal_plans.delete': 'Löschen',
  'module.meal_plans.delete_title': 'Mahlzeit löschen',
  'module.meal_plans.delete_confirm': '{name} wirklich löschen?',
  'module.meal_plans.meal_name_placeholder': 'z.B. Spaghetti',
  'module.meal_plans.meal_name': 'Was gibts?',
  'module.meal_plans.recipe_select': 'Rezept',
  'module.meal_plans.recipe_select_placeholder': 'Aus Rezept übernehmen',
  'module.meal_plans.ingredients': 'Zutaten',
  'module.meal_plans.ingredient_add': 'Zutat',
  'module.meal_plans.ingredient_none': 'Keine Zutaten',
  'module.meal_plans.ingredient_name_placeholder': 'Mehl',
  'module.meal_plans.ingredient_name': 'Zutat',
  'module.meal_plans.ingredient_amount': 'Menge',
  'module.meal_plans.ingredient_unit': 'Einheit',
  'module.meal_plans.ingredient_unit_placeholder': 'g',
  'module.meal_plans.notes_placeholder': 'Notizen',
  'module.meal_plans.notes_aria': 'Notizen',
  'module.meal_plans.empty_cell': 'Leer',
  'module.meal_plans.week': 'Woche',
  'module.meal_plans.today': 'Diese Woche',
  'module.meal_plans.prev_week': 'Vorherige Woche',
  'module.meal_plans.next_week': 'Nächste Woche',
  'module.meal_plans.loading': 'Lade',
  'module.meal_plans.slot.morning': 'Morgens',
  'module.meal_plans.slot.noon': 'Mittags',
  'module.meal_plans.slot.evening': 'Abends',
  'module.meal_plans.weekday.monday': 'Mo',
  'module.meal_plans.weekday.tuesday': 'Di',
  'module.meal_plans.weekday.wednesday': 'Mi',
  'module.meal_plans.weekday.thursday': 'Do',
  'module.meal_plans.weekday.friday': 'Fr',
  'module.meal_plans.weekday.saturday': 'Sa',
  'module.meal_plans.weekday.sunday': 'So',
  'module.meal_plans.add_for_slot_aria': 'Slot {slot} am {date}',
  'module.meal_plans.edit_aria': 'Edit {name}',
  'module.meal_plans.ingredients_summary_one': '1 Zutat',
  'module.meal_plans.ingredients_summary': '{count} Zutaten',
  'module.meal_plans.drag_aria': 'Ziehen {name}',
  confirm: 'Bestätigen',
  cancel: 'Abbrechen',
};

function baseState(overrides) {
  return {
    familyId: '1',
    families: [{ family_id: 1, family_name: 'Test' }],
    messages,
    demoMode: false,
    ...overrides,
  };
}

describe('MealPlansView', () => {
  beforeEach(() => {
    apiListMealPlans.mockReset();
    apiListMealPlanIngredients.mockReset();
    apiListRecipes.mockReset();
    apiCreateMealPlan.mockReset();
    apiDeleteMealPlan.mockReset();
    apiListMealPlans.mockResolvedValue({ ok: true, data: [] });
    apiListMealPlanIngredients.mockResolvedValue({ ok: true, data: { items: [] } });
    apiListRecipes.mockResolvedValue({ ok: true, data: [] });
    apiCreateMealPlan.mockResolvedValue({ ok: true, data: {} });
    apiDeleteMealPlan.mockResolvedValue({ ok: true, data: {} });
  });

  test('renders the add button, fetches the week, and the grid has 7 day headers + 3 slots', async () => {
    mockAppState = baseState();
    const { container } = render(<MealPlansView />);
    expect(screen.getByRole('button', { name: 'Mahlzeit planen' })).toBeInTheDocument();
    await waitFor(() => expect(apiListMealPlans).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Morgens')).toBeInTheDocument();
    expect(screen.getByText('Mittags')).toBeInTheDocument();
    expect(screen.getByText('Abends')).toBeInTheDocument();
    // 21 empty cells (7 days × 3 slots)
    const cells = container.querySelectorAll('.meal-grid-cell');
    expect(cells.length).toBe(21);
  });

  test('opens dialog on add button click and shows the meal name field', async () => {
    mockAppState = baseState();
    render(<MealPlansView />);
    await waitFor(() => expect(apiListMealPlans).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Mahlzeit planen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('z.B. Spaghetti')).toBeInTheDocument();
  });

  test('demo mode renders the blocked placeholder instead of fetching', async () => {
    mockAppState = baseState({ demoMode: true });
    render(<MealPlansView />);
    expect(screen.getByText('Im Demo nicht verfügbar')).toBeInTheDocument();
    expect(apiListMealPlans).not.toHaveBeenCalled();
    expect(apiListRecipes).not.toHaveBeenCalled();
  });

  test('copies a recipe into the meal dialog before creating the plan', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 10,
          title: 'Pancakes',
          ingredients: [
            { name: 'Mehl', amount: 200, unit: 'g' },
            { name: 'Milch', amount: 300, unit: 'ml' },
          ],
        },
      ],
    });

    render(<MealPlansView />);
    await waitFor(() => expect(apiListRecipes).toHaveBeenCalledWith('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Mahlzeit planen' }));

    fireEvent.change(screen.getByLabelText('Rezept'), { target: { value: '10' } });
    expect(screen.getByPlaceholderText('z.B. Spaghetti')).toHaveValue('Pancakes');
    expect(screen.getByDisplayValue('Mehl')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
    expect(screen.getByDisplayValue('g')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Milch')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(apiCreateMealPlan).toHaveBeenCalledTimes(1));
    expect(apiCreateMealPlan.mock.calls[0][0]).toMatchObject({
      family_id: 1,
      plan_date: expect.any(String),
      slot: 'noon',
      meal_name: 'Pancakes',
      ingredients: [
        { name: 'Mehl', amount: 200, unit: 'g' },
        { name: 'Milch', amount: 300, unit: 'ml' },
      ],
    });
  });

  test('409 on create surfaces the translated slot-taken toast', async () => {
    mockAppState = baseState();
    const errorSpy = jest.fn();
    const toastCtx = require('../../contexts/ToastContext');
    toastCtx.useToast = () => ({ success: jest.fn(), error: errorSpy });

    apiCreateMealPlan.mockResolvedValueOnce({ ok: false, status: 409, data: { detail: { code: 'MEAL_SLOT_TAKEN' } } });

    render(<MealPlansView />);
    await waitFor(() => expect(apiListMealPlans).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Mahlzeit planen' }));
    const nameInput = screen.getByPlaceholderText('z.B. Spaghetti');
    fireEvent.change(nameInput, { target: { value: 'Pasta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Slot belegt'));
  });

  test('renders an existing meal in the right cell with ingredient count', async () => {
    mockAppState = baseState();
    apiListMealPlans.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 1,
          family_id: 1,
          plan_date: '2099-01-05', // any fixed date; week pivots to match
          slot: 'noon',
          meal_name: 'Test Pasta',
          ingredients: [{ name: 'Mehl', amount: 500, unit: 'g' }, { name: 'Tomate' }],
          notes: null,
          created_by_user_id: null,
          created_at: '2099-01-05T00:00:00',
          updated_at: '2099-01-05T00:00:00',
        },
      ],
    });
    // Point the view at the matching week so the meal ends up inside the rendered range.
    const realDate = global.Date;
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length === 0) {
          super('2099-01-05T12:00:00Z');
        } else {
          super(...args);
        }
      }
      static now() { return new realDate('2099-01-05T12:00:00Z').getTime(); }
    };
    try {
      render(<MealPlansView />);
      await waitFor(() => expect(screen.getByText('Test Pasta')).toBeInTheDocument());
      expect(screen.getByText('2 Zutaten')).toBeInTheDocument();
      // Filled cell exposes a dedicated drag handle with its own aria-label,
      // separate from the click-to-edit button.
      expect(screen.getByRole('button', { name: 'Ziehen Test Pasta' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Test Pasta' })).toBeInTheDocument();
    } finally {
      global.Date = realDate;
    }
  });

  test('closes the edit dialog before showing delete confirmation', async () => {
    mockAppState = baseState();
    apiListMealPlans.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 7,
          family_id: 1,
          plan_date: '2099-01-05',
          slot: 'noon',
          meal_name: 'Delete Pasta',
          ingredients: [],
          notes: null,
          created_by_user_id: null,
          created_at: '2099-01-05T00:00:00',
          updated_at: '2099-01-05T00:00:00',
        },
      ],
    });

    const realDate = global.Date;
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length === 0) {
          super('2099-01-05T12:00:00Z');
        } else {
          super(...args);
        }
      }
      static now() { return new realDate('2099-01-05T12:00:00Z').getTime(); }
    };

    try {
      render(<MealPlansView />);
      await waitFor(() => expect(screen.getByText('Delete Pasta')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Edit Delete Pasta' }));
      expect(screen.getByRole('dialog', { name: 'Mahlzeit bearbeiten' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));

      expect(screen.queryByRole('dialog', { name: 'Mahlzeit bearbeiten' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Mahlzeit löschen' })).toBeInTheDocument();
      expect(screen.getByText('Delete Pasta wirklich löschen?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(apiDeleteMealPlan).toHaveBeenCalledWith(7));
    } finally {
      global.Date = realDate;
    }
  });
});
