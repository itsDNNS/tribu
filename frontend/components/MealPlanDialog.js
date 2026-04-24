import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, X, Plus, Trash2, ShoppingCart } from 'lucide-react';
import { t } from '../lib/i18n';
import { createEmptyMealIngredient, MEAL_SLOTS } from '../lib/meal-plans';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

function slotLabel(messages, slot) {
  return t(messages, `module.meal_plans.slot.${slot}`);
}

export default function MealPlanDialog({
  open,
  onClose,
  messages,
  form,
  setForm,
  onSubmit,
  onDelete,
  isEditing,
  ingredientHints = [],
  shoppingLists = [],
  onPushToShopping,
  recipes = [],
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [selectedListId, setSelectedListId] = useState('');
  const datalistId = useId();
  const titleId = 'meal-dialog-title';

  useEffect(() => {
    if (!open) return;
    if (shoppingLists.length > 0 && !selectedListId) {
      setSelectedListId(String(shoppingLists[0].id));
    }
  }, [open, shoppingLists, selectedListId]);

  useDialogFocusTrap({ open, containerRef: dialogRef, initialFocusRef: firstFieldRef, onClose });

  if (!open) return null;

  function updateIngredient(index, patch) {
    setForm((prev) => {
      const next = prev.ingredients.slice();
      next[index] = { ...next[index], ...patch };
      return { ...prev, ingredients: next };
    });
  }

  function addIngredient() {
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, createEmptyMealIngredient()],
    }));
  }

  function removeIngredient(index) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  }

  function applyRecipe(recipeId) {
    const recipe = recipes.find((item) => String(item.id) === String(recipeId));
    if (!recipe) return;
    setForm((prev) => ({
      ...prev,
      meal_name: recipe.title || prev.meal_name,
      ingredients: (recipe.ingredients || []).map((ingredient) => ({
        name: ingredient.name || '',
        amount: ingredient.amount == null ? '' : String(ingredient.amount),
        unit: ingredient.unit || '',
      })),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cal-dialog-backdrop" onClick={submitting ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="meal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="meal-dialog-header">
          <h2 id={titleId} className="meal-dialog-title">
            {isEditing
              ? t(messages, 'module.meal_plans.edit_title')
              : t(messages, 'module.meal_plans.add_title')}
          </h2>
          <button
            type="button"
            className="meal-dialog-close"
            onClick={onClose}
            aria-label={t(messages, 'module.meal_plans.cancel')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className="meal-form" onSubmit={handleSubmit}>
          {recipes.length > 0 && (
            <div className="meal-recipe-picker">
              <label className="meal-recipe-picker-label" htmlFor="meal-recipe-select">
                <BookOpen size={14} aria-hidden="true" />
                {t(messages, 'module.meal_plans.recipe_select')}
              </label>
              <select
                id="meal-recipe-select"
                className="form-input meal-recipe-picker-select"
                value=""
                onChange={(e) => applyRecipe(e.target.value)}
                aria-label={t(messages, 'module.meal_plans.recipe_select')}
              >
                <option value="">{t(messages, 'module.meal_plans.recipe_select_placeholder')}</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="meal-form-grid">
            <input
              ref={firstFieldRef}
              className="form-input meal-form-name"
              placeholder={t(messages, 'module.meal_plans.meal_name_placeholder')}
              aria-label={t(messages, 'module.meal_plans.meal_name')}
              value={form.meal_name}
              onChange={(e) => setForm((prev) => ({ ...prev, meal_name: e.target.value }))}
              required
              maxLength={200}
            />
            <input
              className="form-input"
              type="date"
              value={form.plan_date}
              onChange={(e) => setForm((prev) => ({ ...prev, plan_date: e.target.value }))}
              aria-label={t(messages, 'module.meal_plans.week')}
              required
            />
            <select
              className="form-input"
              value={form.slot}
              onChange={(e) => setForm((prev) => ({ ...prev, slot: e.target.value }))}
              aria-label={t(messages, 'module.meal_plans.slot.morning')}
            >
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>{slotLabel(messages, s)}</option>
              ))}
            </select>
          </div>

          <div className="meal-ingredients">
            <div className="meal-ingredients-header">
              <span className="meal-ingredients-title">
                {t(messages, 'module.meal_plans.ingredients')}
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm meal-ingredient-add"
                onClick={addIngredient}
              >
                <Plus size={14} aria-hidden="true" />
                {t(messages, 'module.meal_plans.ingredient_add')}
              </button>
            </div>
            {form.ingredients.length === 0 && (
              <p className="meal-ingredient-empty">
                {t(messages, 'module.meal_plans.ingredient_none')}
              </p>
            )}
            {form.ingredients.length > 0 && (
              <datalist id={datalistId}>
                {ingredientHints.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
            <ul className="meal-ingredient-list">
              {form.ingredients.map((row, index) => (
                <li key={index} className="meal-ingredient-row">
                  <input
                    className="form-input meal-ingredient-name"
                    list={datalistId}
                    placeholder={t(messages, 'module.meal_plans.ingredient_name_placeholder')}
                    aria-label={t(messages, 'module.meal_plans.ingredient_name')}
                    value={row.name}
                    onChange={(e) => updateIngredient(index, { name: e.target.value })}
                    maxLength={120}
                  />
                  <input
                    className="form-input meal-ingredient-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="500"
                    aria-label={t(messages, 'module.meal_plans.ingredient_amount')}
                    value={row.amount}
                    onChange={(e) => updateIngredient(index, { amount: e.target.value })}
                  />
                  <input
                    className="form-input meal-ingredient-unit"
                    placeholder={t(messages, 'module.meal_plans.ingredient_unit_placeholder')}
                    aria-label={t(messages, 'module.meal_plans.ingredient_unit')}
                    value={row.unit}
                    onChange={(e) => updateIngredient(index, { unit: e.target.value })}
                    maxLength={20}
                  />
                  <button
                    type="button"
                    className="btn-ghost meal-ingredient-remove"
                    onClick={() => removeIngredient(index)}
                    aria-label={t(messages, 'module.meal_plans.ingredient_remove_aria').replace('{name}', row.name || '')}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <textarea
            className="form-input meal-form-notes"
            placeholder={t(messages, 'module.meal_plans.notes_placeholder')}
            aria-label={t(messages, 'module.meal_plans.notes_aria')}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />

          {isEditing && onPushToShopping && (form.ingredients || []).some((i) => (i.name || '').trim()) && shoppingLists.length > 0 && (
            <div className="meal-push">
              <div className="meal-push-label">
                <ShoppingCart size={14} aria-hidden="true" />
                {t(messages, 'module.meal_plans.push_to_shopping')}
              </div>
              <div className="meal-push-row">
                <select
                  className="form-input meal-push-list"
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  aria-label={t(messages, 'module.meal_plans.push_to_shopping')}
                >
                  {shoppingLists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary meal-push-btn"
                  disabled={pushing || !selectedListId}
                  onClick={async () => {
                    const names = (form.ingredients || [])
                      .map((i) => (i.name || '').trim())
                      .filter(Boolean);
                    if (names.length === 0 || !selectedListId) return;
                    setPushing(true);
                    try {
                      await onPushToShopping(Number(selectedListId), names);
                    } finally {
                      setPushing(false);
                    }
                  }}
                >
                  <ShoppingCart size={14} aria-hidden="true" />
                  {t(messages, 'module.meal_plans.push_to_shopping')}
                </button>
              </div>
            </div>
          )}

          <div className="meal-form-actions">
            {isEditing && onDelete && (
              <button
                type="button"
                className="btn btn-secondary meal-dialog-delete"
                onClick={onDelete}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t(messages, 'module.meal_plans.delete')}
              </button>
            )}
            <div className="meal-form-actions-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t(messages, 'module.meal_plans.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {t(messages, 'module.meal_plans.save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
