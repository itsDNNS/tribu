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

const fold = (value) => String(value || '').trim().toLocaleLowerCase();

// What an empty slot suggests (Tribu 2.0, M4): favourite recipes first, then
// what the family cooked lately, the same meal time before others and the
// latest first. Each name appears once.
export function mealSuggestions({ recipes = [], pastMeals = [], slot = 'noon', limit = 6 } = {}) {
  const seen = new Set();
  const out = [];
  for (const recipe of recipes) {
    const key = fold(recipe?.title);
    if (!recipe?.is_favorite || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'recipe', key: `recipe-${recipe.id}`, title: recipe.title, recipeId: recipe.id });
  }
  const recent = [...pastMeals]
    .filter((meal) => fold(meal?.meal_name))
    .sort((a, b) => (Number(b.slot === slot) - Number(a.slot === slot))
      || String(b.plan_date).localeCompare(String(a.plan_date)));
  for (const meal of recent) {
    const key = fold(meal.meal_name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: 'recent',
      key: `recent-${key}`,
      title: meal.meal_name.trim(),
      ingredients: (meal.ingredients || []).map((ingredient) => ({
        name: ingredient.name || '',
        amount: ingredient.amount == null ? '' : String(ingredient.amount),
        unit: ingredient.unit || '',
      })),
    });
  }
  return out.slice(0, limit);
}
