import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Edit2,
  ExternalLink,
  Link2,
  Plus,
  Search,
  Star,
  Tags,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import { announce } from '../lib/announce';
import * as api from '../lib/api';
import { errorText } from '../lib/helpers';
import { t, tc } from '../lib/i18n';
import { buildRecipePayload, createEmptyRecipeForm, createEmptyRecipeIngredient, formatIngredientAmount, recipeDraftToForm, recipeToForm } from '../lib/recipes';
import ConfirmDialog from './ConfirmDialog';
import RecipeDetail from './recipes/RecipeDetail';
import { inBody } from './inBody';


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
  return tc(messages, 'module.recipes.ingredients_summary', count);
}

function RecipeCard({ recipe, messages, onOpen, onEdit, onToggleFavorite }) {
  const ingredients = recipe.ingredients || [];
  const previewIngredients = ingredients.slice(0, 4);
  const sourceUrl = safeHttpUrl(recipe.source_url);

  return (
    // The whole card opens the recipe; its buttons and link keep their own jobs.
    <article className="recipe-card recipe-card-clickable" onClick={(e) => { if (!e.target.closest('button, a')) onOpen(recipe); }}>
      <div className="recipe-card-visual" aria-hidden="true">
        <BookOpen size={24} />
      </div>
      <div className="recipe-card-header">
        <div className="recipe-card-title-row">
          <h3 className="recipe-card-title">
            <button type="button" className="recipe-card-open" onClick={() => onOpen(recipe)}>{recipe.title}</button>
          </h3>
        </div>
        <div className="recipe-card-actions">
          <button
            type="button"
            className={`recipe-card-action ${recipe.is_favorite ? 'recipe-card-action-active' : ''}`}
            onClick={() => onToggleFavorite(recipe)}
            aria-label={(recipe.is_favorite
              ? t(messages, 'module.recipes.favorite_remove_aria')
              : t(messages, 'module.recipes.favorite_add_aria')).replace('{title}', recipe.title)}
          >
            <Star size={14} aria-hidden="true" fill={recipe.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="recipe-card-action"
            onClick={() => onEdit(recipe)}
            aria-label={t(messages, 'module.recipes.edit_aria').replace('{title}', recipe.title)}
          >
            <Edit2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {(recipe.servings || ingredients.length > 0 || recipe.is_favorite || recipe.last_used_at) && (
        <div className="recipe-card-meta">
          {recipe.is_favorite && (
            <span className="recipe-card-meta-item recipe-card-favorite">
              <Star size={13} aria-hidden="true" fill="currentColor" />
              {t(messages, 'module.recipes.favorite')}
            </span>
          )}
          {recipe.last_used_at && (
            <span className="recipe-card-meta-item">{t(messages, 'module.recipes.used_recently')}</span>
          )}
          {recipe.servings && (
            <span className="recipe-card-meta-item">
              <Users size={13} aria-hidden="true" />
              {tc(messages, 'module.recipes.servings_count', recipe.servings)}
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
  onImport,
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  // Reading a recipe from a web page (discussion #511).
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    if (!open) return;
    setImportUrl('');
    setImported(false);
  }, [open]);

  async function runImport() {
    if (importing || !importUrl.trim()) return;
    setImporting(true);
    try {
      setImported(await onImport(importUrl.trim()));
    } finally {
      setImporting(false);
    }
  }
  const datalistId = useId();
  const titleId = 'recipe-dialog-title';

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
      ingredients: [...prev.ingredients, createEmptyRecipeIngredient()],
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

  return inBody(
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

        <form className="recipe-form ui-sheet-form" onSubmit={handleSubmit}><div className="ui-sheet-body">
          {!isEditing && onImport && (
            <div className="recipe-import">
              <label className="recipe-import-label" htmlFor="recipe-import-url">
                <Link2 size={15} aria-hidden="true" /> {t(messages, 'module.recipes.import_title')}
              </label>
              <div className="recipe-import-row">
                <input
                  id="recipe-import-url"
                  className="form-input"
                  type="url"
                  inputMode="url"
                  placeholder={t(messages, 'module.recipes.import_placeholder')}
                  value={importUrl}
                  onChange={(e) => { setImportUrl(e.target.value); setImported(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runImport(); } }}
                  maxLength={500}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={importing || !importUrl.trim()}
                  onClick={runImport}
                >
                  {importing ? t(messages, 'module.recipes.import_loading') : t(messages, 'module.recipes.import_button')}
                </button>
              </div>
              <p className="recipe-import-hint" role="status">
                {imported ? t(messages, 'module.recipes.import_done') : t(messages, 'module.recipes.import_hint')}
              </p>
            </div>
          )}
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

          </div><div className="recipe-form-actions ui-sheet-actions">
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
  const { familyId, messages, demoMode, shoppingLists, loadShoppingLists } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const [recipeItems, setRecipeItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => createEmptyRecipeForm());
  const [query, setQuery] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  // The recipe open to cook from (discussion #511).
  const [openId, setOpenId] = useState(null);

  const loadRecipes = useCallback(async (fid = familyId) => {
    if (!fid || demoMode) {
      setRecipeItems([]);
      return;
    }
    setLoading(true);
    const { ok, data } = await api.apiListRecipes(fid);
    if (ok && Array.isArray(data)) setRecipeItems(data);
    setLoading(false);
  }, [familyId, demoMode]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const ingredientHints = useMemo(() => {
    const seen = new Set();
    const names = [];
    for (const recipe of recipeItems) {
      for (const ingredient of recipe.ingredients || []) {
        const name = (ingredient.name || '').trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [recipeItems]);

  async function createRecipe(formToCreate) {
    if (demoMode) {
      toastError(t(messages, 'module.recipes.demo_blocked'));
      return { ok: false };
    }
    const payload = { family_id: Number(familyId), ...buildRecipePayload(formToCreate) };
    const { ok, data } = await api.apiCreateRecipe(payload);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    toastSuccess(t(messages, 'module.recipes.created'));
    announce(t(messages, 'module.recipes.created'));
    await loadRecipes();
    return { ok: true, data };
  }

  async function updateRecipe(recipeId, formToUpdate) {
    const payload = buildRecipePayload(formToUpdate);
    const { ok, data } = await api.apiUpdateRecipe(recipeId, payload);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    toastSuccess(t(messages, 'module.recipes.updated'));
    announce(t(messages, 'module.recipes.updated'));
    await loadRecipes();
    return { ok: true, data };
  }

  async function updateRecipeFields(recipeId, fields) {
    const { ok, data } = await api.apiUpdateRecipe(recipeId, fields);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    await loadRecipes();
    return { ok: true, data };
  }

  async function deleteRecipe(recipeId) {
    const { ok, data } = await api.apiDeleteRecipe(recipeId);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return false;
    }
    toastSuccess(t(messages, 'module.recipes.deleted'));
    announce(t(messages, 'module.recipes.deleted'));
    await loadRecipes();
    return true;
  }

  async function pushToShopping(recipeId, shoppingListId, ingredientNames = null) {
    const { ok, data } = await api.apiAddRecipeIngredientsToShopping(recipeId, shoppingListId, ingredientNames);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    const added = data?.added_count ?? 0;
    const template = added === 1
      ? t(messages, 'module.recipes.pushed_one')
      : t(messages, 'module.recipes.pushed_many');
    const msg = template.replace('{count}', String(added));
    toastSuccess(msg);
    announce(msg);
    await loadShoppingLists?.();
    return { ok: true, added };
  }

  const recipes = {
    recipes: recipeItems,
    loading,
    ingredientHints,
    reload: loadRecipes,
    createRecipe,
    updateRecipe,
    updateRecipeFields,
    deleteRecipe,
    pushToShopping,
    emptyForm: createEmptyRecipeForm,
    populateFormFromRecipe: recipeToForm,
  };


  const openRecipe = openId != null ? recipeItems.find((recipe) => recipe.id === openId) || null : null;

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
        <header className="list-header">
          <h1>{t(messages, 'module.recipes.name')}</h1>
        </header>
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

  // Fills the form from a recipe page; the family checks it before saving.
  async function importFromUrl(url) {
    const { ok, data } = await api.apiImportRecipe(familyId, url);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return false;
    }
    setForm(recipeDraftToForm(data));
    return true;
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

  async function handleToggleFavorite(recipe) {
    return recipes.updateRecipeFields(recipe.id, { is_favorite: !recipe.is_favorite });
  }

  return (
    <div className="recipes-page">
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
        onImport={importFromUrl}
      />

      <header className="list-header">
        <h1>{t(messages, 'module.recipes.name')}</h1>
        {!openRecipe && (
          <button type="button" className="list-header-action" onClick={openAdd}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.recipes.add')}
          </button>
        )}
      </header>
      {openRecipe ? (
        <RecipeDetail
          key={openRecipe.id}
          recipe={openRecipe}
          messages={messages}
          shoppingLists={shoppingLists}
          onBack={() => setOpenId(null)}
          onEdit={openEdit}
          onToggleFavorite={handleToggleFavorite}
          onPushToShopping={recipes.pushToShopping}
        />
      ) : (<>
      <label className="recipe-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(messages, 'module.recipes.search_placeholder')}
          aria-label={t(messages, 'module.recipes.search')}
        />
      </label>

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
              onOpen={(item) => setOpenId(item.id)}
              onEdit={openEdit}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </section>
      )}
      </>)}
    </div>
  );
}
