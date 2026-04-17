export const MEAL_SLOTS = ['morning', 'noon', 'evening'];

export function createEmptyMealIngredient() {
  return { name: '', amount: '', unit: '' };
}

export function createEmptyMealForm(overrides = {}) {
  return {
    plan_date: '',
    slot: 'noon',
    meal_name: '',
    ingredients: [],
    notes: '',
    ...overrides,
  };
}
