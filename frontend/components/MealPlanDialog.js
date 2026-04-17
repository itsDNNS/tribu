import { useEffect, useId, useRef, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { t } from '../lib/i18n';
import { MEAL_SLOTS } from '../hooks/useMealPlans';

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
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [submitting, setSubmitting] = useState(false);
  const datalistId = useId();
  const titleId = 'meal-dialog-title';

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    firstFieldRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const previous = previousFocusRef.current;
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [open]);

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
      ingredients: [...prev.ingredients, { name: '', amount: '', unit: '' }],
    }));
  }

  function removeIngredient(index) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
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
