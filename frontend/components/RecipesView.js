import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Edit2,
  ExternalLink,
  Plus,
  Search,
  ShoppingCart,
  Tags,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import { useRecipes } from '../hooks/useRecipes';
import { t } from '../lib/i18n';
import { createEmptyRecipeIngredient, formatIngredientAmount } from '../lib/recipes';
import ConfirmDialog from './ConfirmDialog';


function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function ingredientCountLabel(messages, count) {
  if (count === 1) return t(messages, 'module.recipes.ingredients_summary_one');
  return t(messages, 'module.recipes.ingredients_summary').replace('{count}', String(count));
}

function RecipeCard({ recipe, messages, onEdit }) {
  const ingredients = recipe.ingredients || [];
  const previewIngredients = ingredients.slice(0, 4);
  const sourceUrl = safeHttpUrl(recipe.source_url);

  return (
    <article className="recipe-card">
      <div className="recipe-card-header">
        <div className="recipe-card-title-row">
          <BookOpen size={17} className="recipe-card-icon" aria-hidden="true" />
          <h3 className="recipe-card-title">{recipe.title}</h3>
        </div>
        <button
          type="button"
          className="recipe-card-action"
          onClick={() => onEdit(recipe)}
          aria-label={t(messages, 'module.recipes.edit_aria').replace('{title}', recipe.title)}
        >
          <Edit2 size={14} aria-hidden="true" />
        </button>
      </div>

      {(recipe.servings || ingredients.length > 0) && (
        <div className="recipe-card-meta">
          {recipe.servings && (
            <span className="recipe-card-meta-item">
              <Users size={13} aria-hidden="true" />
              {t(messages, 'module.recipes.servings_count').replace('{count}', String(recipe.servings))}
            </span>
          )}
          {ingredients.length > 0 && (
            <span className="recipe-card-meta-item">
              {ingredientCountLabel(messages, ingredients.length)}
            </span>
          )}
        </div>
      )}

      {recipe.description && <p className="recipe-card-description">{recipe.description}</p>}

      {recipe.tags?.length > 0 && (
        <div className="recipe-tags" aria-label={t(messages, 'module.recipes.tags')}>
          {recipe.tags.map((tag) => (
            <span key={tag} className="recipe-tag">{tag}</span>
          ))}
        </div>
      )}

      {previewIngredients.length > 0 && (
        <ul className="recipe-ingredient-preview">
          {previewIngredients.map((ingredient) => {
            const amount = formatIngredientAmount(ingredient);
            return (
              <li key={ingredient.name}>
                <span>{ingredient.name}</span>
                {amount && <span className="recipe-ingredient-preview-amount">{amount}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="recipe-card-footer">
        {sourceUrl ? (
          <a className="recipe-card-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} aria-hidden="true" />
            {t(messages, 'module.recipes.open_source')}
          </a>
        ) : (
          <span className="recipe-card-muted">{t(messages, 'module.recipes.no_source')}</span>
        )}
      </div>
    </article>
  );
}

function RecipeDialog({
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
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedIngredientNames, setSelectedIngredientNames] = useState([]);
  const datalistId = useId();
  const titleId = 'recipe-dialog-title';

  useEffect(() => {
    if (!open) return;
    if (shoppingLists.length > 0 && !selectedListId) {
      setSelectedListId(String(shoppingLists[0].id));
    }
  }, [open, selectedListId, shoppingLists]);

  useEffect(() => {
    if (!open) return;
    setSelectedIngredientNames(
      (form.ingredients || [])
        .map((ingredient) => (ingredient.name || '').trim())
        .filter(Boolean),
    );
  }, [open, form.ingredients]);

  useDialogFocusTrap({ open, containerRef: dialogRef, initialFocusRef: firstFieldRef, onClose });

  if (!open) return null;

  const namedIngredients = (form.ingredients || [])
    .map((ingredient) => (ingredient.name || '').trim())
    .filter(Boolean);

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
      ingredients: [...prev.ingredients, createEmptyRecipeIngredient()],
    }));
  }

  function removeIngredient(index) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  }

  function toggleIngredient(name) {
    setSelectedIngredientNames((prev) => (
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    ));
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
        className="recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recipe-dialog-header">
          <h2 id={titleId} className="recipe-dialog-title">
            {isEditing ? t(messages, 'module.recipes.edit_title') : t(messages, 'module.recipes.add_title')}
          </h2>
          <button
            type="button"
            className="recipe-dialog-close"
            onClick={onClose}
            aria-label={t(messages, 'module.recipes.cancel')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="recipe-form" onSubmit={handleSubmit}>
          <div className="recipe-form-grid">
            <input
              ref={firstFieldRef}
              className="form-input recipe-form-title"
              placeholder={t(messages, 'module.recipes.title_placeholder')}
              aria-label={t(messages, 'module.recipes.title')}
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
              maxLength={200}
            />
            <input
              className="form-input"
              type="number"
              min="1"
              max="999"
              step="1"
              inputMode="numeric"
              placeholder={t(messages, 'module.recipes.servings_placeholder')}
              aria-label={t(messages, 'module.recipes.servings')}
              value={form.servings}
              onChange={(e) => setForm((prev) => ({ ...prev, servings: e.target.value }))}
            />
            <input
              className="form-input recipe-form-wide"
              placeholder={t(messages, 'module.recipes.description_placeholder')}
              aria-label={t(messages, 'module.recipes.description')}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={2000}
            />
            <input
              className="form-input recipe-form-wide"
              type="url"
              placeholder={t(messages, 'module.recipes.source_url_placeholder')}
              aria-label={t(messages, 'module.recipes.source_url')}
              value={form.source_url}
              onChange={(e) => setForm((prev) => ({ ...prev, source_url: e.target.value }))}
              maxLength={500}
            />
            <input
              className="form-input recipe-form-wide"
              placeholder={t(messages, 'module.recipes.tags_placeholder')}
              aria-label={t(messages, 'module.recipes.tags')}
              value={form.tagsText}
              onChange={(e) => setForm((prev) => ({ ...prev, tagsText: e.target.value }))}
            />
          </div>

          <div className="recipe-ingredients">
            <div className="recipe-ingredients-header">
              <span className="recipe-section-title">{t(messages, 'module.recipes.ingredients')}</span>
              <button type="button" className="btn-ghost btn-sm recipe-ingredient-add" onClick={addIngredient}>
                <Plus size={14} aria-hidden="true" />
                {t(messages, 'module.recipes.ingredient_add')}
              </button>
            </div>
            {form.ingredients.length === 0 && (
              <p className="recipe-ingredient-empty">{t(messages, 'module.recipes.ingredient_none')}</p>
            )}
            {form.ingredients.length > 0 && (
              <datalist id={datalistId}>
                {ingredientHints.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
            <ul className="recipe-ingredient-list">
              {form.ingredients.map((row, index) => (
                <li key={index} className="recipe-ingredient-row">
                  <input
                    className="form-input recipe-ingredient-name"
                    list={datalistId}
                    placeholder={t(messages, 'module.recipes.ingredient_name_placeholder')}
                    aria-label={t(messages, 'module.recipes.ingredient_name')}
                    value={row.name}
                    onChange={(e) => updateIngredient(index, { name: e.target.value })}
                    maxLength={120}
                  />
                  <input
                    className="form-input recipe-ingredient-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="500"
                    aria-label={t(messages, 'module.recipes.ingredient_amount')}
                    value={row.amount}
                    onChange={(e) => updateIngredient(index, { amount: e.target.value })}
                  />
                  <input
                    className="form-input recipe-ingredient-unit"
                    placeholder={t(messages, 'module.recipes.ingredient_unit_placeholder')}
                    aria-label={t(messages, 'module.recipes.ingredient_unit')}
                    value={row.unit}
                    onChange={(e) => updateIngredient(index, { unit: e.target.value })}
                    maxLength={20}
                  />
                  <button
                    type="button"
                    className="btn-ghost recipe-ingredient-remove"
                    onClick={() => removeIngredient(index)}
                    aria-label={t(messages, 'module.recipes.ingredient_remove_aria').replace('{name}', row.name || '')}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <textarea
            className="form-input recipe-form-instructions"
            placeholder={t(messages, 'module.recipes.instructions_placeholder')}
            aria-label={t(messages, 'module.recipes.instructions')}
            value={form.instructions}
            onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
          />

          {isEditing && onPushToShopping && namedIngredients.length > 0 && shoppingLists.length > 0 && (
            <div className="recipe-push">
              <div className="recipe-push-label">
                <ShoppingCart size={14} aria-hidden="true" />
                {t(messages, 'module.recipes.push_to_shopping')}
              </div>
              <div className="recipe-push-picker">
                {namedIngredients.map((name) => (
                  <label key={name} className="recipe-push-chip">
                    <input
                      type="checkbox"
                      checked={selectedIngredientNames.includes(name)}
                      onChange={() => toggleIngredient(name)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
              <div className="recipe-push-row">
                <select
                  className="form-input recipe-push-list"
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  aria-label={t(messages, 'module.recipes.push_to_shopping')}
                >
                  {shoppingLists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary recipe-push-btn"
                  disabled={pushing || !selectedListId || selectedIngredientNames.length === 0}
                  onClick={async () => {
                    if (!selectedListId || selectedIngredientNames.length === 0) return;
                    setPushing(true);
                    try {
                      await onPushToShopping(Number(selectedListId), selectedIngredientNames);
                    } finally {
                      setPushing(false);
                    }
                  }}
                >
                  <ShoppingCart size={14} aria-hidden="true" />
                  {t(messages, 'module.recipes.push_to_shopping')}
                </button>
              </div>
            </div>
          )}

          <div className="recipe-form-actions">
            {isEditing && onDelete && (
              <button type="button" className="btn btn-secondary recipe-dialog-delete" onClick={onDelete}>
                <Trash2 size={14} aria-hidden="true" />
                {t(messages, 'module.recipes.delete')}
              </button>
            )}
            <div className="recipe-form-actions-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t(messages, 'module.recipes.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {t(messages, 'module.recipes.save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RecipesView() {
  const { familyId, families, messages, demoMode, shoppingLists } = useApp();
  const recipes = useRecipes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(recipes.emptyForm());
  const [query, setQuery] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const currentFamilyName = families.find((f) => String(f.family_id) === String(familyId))?.family_name || '';

  const filteredRecipes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recipes.recipes;
    return recipes.recipes.filter((recipe) => {
      const haystack = [
        recipe.title,
        recipe.description,
        recipe.instructions,
        ...(recipe.tags || []),
        ...(recipe.ingredients || []).map((ingredient) => ingredient.name),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, recipes.recipes]);

  if (demoMode) {
    return (
      <div className="view">
        <div className="view-header">
          <h1 className="view-title">{t(messages, 'module.recipes.name')}</h1>
        </div>
        <div className="empty-state">
          <BookOpen size={32} aria-hidden="true" />
          <p>{t(messages, 'module.recipes.demo_blocked')}</p>
        </div>
      </div>
    );
  }

  function openAdd() {
    setEditingId(null);
    setForm(recipes.emptyForm());
    setDialogOpen(true);
  }

  function openEdit(recipe) {
    setEditingId(recipe.id);
    setForm(recipes.populateFormFromRecipe(recipe));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
  }

  async function handleSubmit() {
    const res = editingId != null
      ? await recipes.updateRecipe(editingId, form)
      : await recipes.createRecipe(form);
    if (res.ok) closeDialog();
  }

  function handleDelete() {
    if (editingId == null) return;
    const id = editingId;
    const title = form.title || t(messages, 'module.recipes.name');
    setConfirmAction({
      title: t(messages, 'module.recipes.delete_title'),
      message: t(messages, 'module.recipes.delete_confirm').replace('{title}', title),
      danger: true,
      action: async () => {
        setConfirmAction(null);
        await recipes.deleteRecipe(id);
      },
    });
    closeDialog();
  }

  async function handlePushToShopping(shoppingListId, ingredientNames) {
    if (editingId == null) return { ok: false };
    return recipes.pushToShopping(editingId, shoppingListId, ingredientNames);
  }

  return (
    <div>
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmDanger={confirmAction.danger}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          messages={messages}
        />
      )}

      <RecipeDialog
        open={dialogOpen}
        onClose={closeDialog}
        messages={messages}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        onDelete={editingId != null ? handleDelete : null}
        isEditing={editingId != null}
        ingredientHints={recipes.ingredientHints}
        shoppingLists={shoppingLists}
        onPushToShopping={editingId != null ? handlePushToShopping : null}
      />

      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.recipes.name')}</h1>
          <div className="view-subtitle">{currentFamilyName}</div>
        </div>
        <div className="recipe-header-actions">
          <label className="recipe-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(messages, 'module.recipes.search_placeholder')}
              aria-label={t(messages, 'module.recipes.search')}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.recipes.add')}
          </button>
        </div>
      </div>

      {recipes.loading && <p className="recipe-loading">{t(messages, 'module.recipes.loading')}</p>}

      {recipes.recipes.length === 0 && !recipes.loading ? (
        <div className="recipe-empty-rich">
          <div className="recipe-empty-icon-wrap">
            <BookOpen size={34} aria-hidden="true" />
          </div>
          <h2 className="recipe-empty-title">{t(messages, 'module.recipes.empty_title')}</h2>
          <p className="recipe-empty-body">{t(messages, 'module.recipes.empty_body')}</p>
          <button type="button" className="btn btn-primary recipe-empty-cta" onClick={openAdd}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.recipes.add_first')}
          </button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="recipe-empty-filtered">
          <Tags size={26} aria-hidden="true" />
          <p>{t(messages, 'module.recipes.no_matches')}</p>
          <button type="button" className="recipe-empty-filtered-btn" onClick={() => setQuery('')}>
            {t(messages, 'module.recipes.clear_search')}
          </button>
        </div>
      ) : (
        <section className="recipe-grid" aria-label={t(messages, 'module.recipes.name')}>
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              messages={messages}
              onEdit={openEdit}
            />
          ))}
        </section>
      )}
    </div>
  );
}
