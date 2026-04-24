export function createEmptyRecipeIngredient() {
  return { name: '', amount: '', unit: '' };
}

export function createEmptyRecipeForm(overrides = {}) {
  return {
    title: '',
    description: '',
    source_url: '',
    servings: '',
    tagsText: '',
    ingredients: [],
    instructions: '',
    ...overrides,
  };
}

export function recipeToForm(recipe) {
  return createEmptyRecipeForm({
    title: recipe?.title || '',
    description: recipe?.description || '',
    source_url: recipe?.source_url || '',
    servings: recipe?.servings == null ? '' : String(recipe.servings),
    tagsText: (recipe?.tags || []).join(', '),
    ingredients: (recipe?.ingredients || []).map((ingredient) => ({
      name: ingredient.name || '',
      amount: ingredient.amount == null ? '' : String(ingredient.amount),
      unit: ingredient.unit || '',
    })),
    instructions: recipe?.instructions || '',
  });
}

function parseOptionalInt(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseAmount(value) {
  const raw = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function buildRecipePayload(form) {
  const ingredients = (form.ingredients || [])
    .map((row) => {
      const name = (row.name || '').trim();
      if (!name) return null;
      const amount = parseAmount(row.amount);
      const unit = (row.unit || '').trim() || null;
      return { name, amount, unit };
    })
    .filter(Boolean);

  const tags = (form.tagsText || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title: (form.title || '').trim(),
    description: (form.description || '').trim() || null,
    source_url: (form.source_url || '').trim() || null,
    servings: parseOptionalInt(form.servings),
    tags,
    ingredients,
    instructions: (form.instructions || '').trim() || null,
  };
}

export function formatIngredientAmount(ingredient) {
  const parts = [];
  if (ingredient?.amount != null) {
    const amount = Number(ingredient.amount);
    parts.push(Number.isInteger(amount) ? String(amount) : String(amount));
  }
  if (ingredient?.unit) parts.push(ingredient.unit);
  return parts.join(' ');
}
