import { useEffect, useId, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Minus, Pencil, Plus, ShoppingCart, Star, Users } from 'lucide-react';
import { t, tc } from '../../lib/i18n';
import { formatIngredientAmount, recipeSteps, scaleRecipeIngredients } from '../../lib/recipes';

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

// One recipe to cook from (discussion #511): ingredients and the steps side
// by side, or as tabs on a phone. Ingredients and steps can be ticked off
// while cooking; editing sits behind "Edit".
export default function RecipeDetail({ recipe, messages, shoppingLists = [], onBack, onEdit, onToggleFavorite, onPushToShopping }) {
  const [tab, setTab] = useState('ingredients');
  const [servings, setServings] = useState(recipe.servings || null);
  const [doneIngredients, setDoneIngredients] = useState([]);
  const [doneSteps, setDoneSteps] = useState([]);
  const [listId, setListId] = useState('');
  const [pushing, setPushing] = useState(false);
  const tabsId = useId();
  // Imported recipes bring section names ("For the dough:") between steps.
  const lines = recipeSteps(recipe.instructions).map((text) => ({ text, heading: text.endsWith(':') && text.length <= 60 }));
  const steps = lines.filter((line) => !line.heading);
  const ingredients = recipe.servings && servings
    ? scaleRecipeIngredients(recipe.ingredients || [], recipe.servings, servings)
    : (recipe.ingredients || []).map((ingredient) => ({ ...ingredient, scalable: true }));
  const sourceUrl = safeHttpUrl(recipe.source_url);
  // Ticked ingredients are there already; the rest goes on the list.
  const missing = (recipe.ingredients || [])
    .filter((ingredient, index) => !doneIngredients.includes(`${index}:${ingredient.name}`))
    .map((ingredient) => (ingredient.name || '').trim())
    .filter(Boolean);

  useEffect(() => {
    if (!listId && shoppingLists.length) setListId(String(shoppingLists[0].id));
  }, [listId, shoppingLists]);

  const toggle = (setter, key) => setter((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  const tabButton = (key, label) => (
    <button
      type="button"
      role="tab"
      id={`${tabsId}-${key}`}
      aria-selected={tab === key}
      aria-controls={`${tabsId}-${key}-panel`}
      className={`recipe-tab${tab === key ? ' active' : ''}`}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  return (
    <article className="recipe-detail" aria-labelledby={`${tabsId}-title`}>
      <div className="recipe-detail-top">
        <button type="button" className="recipe-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {t(messages, 'module.recipes.back')}
        </button>
        <div className="recipe-detail-actions">
          <button
            type="button"
            className={`recipe-card-action ${recipe.is_favorite ? 'recipe-card-action-active' : ''}`}
            onClick={() => onToggleFavorite(recipe)}
            aria-label={(recipe.is_favorite
              ? t(messages, 'module.recipes.favorite_remove_aria')
              : t(messages, 'module.recipes.favorite_add_aria')).replace('{title}', recipe.title)}
          >
            <Star size={15} aria-hidden="true" fill={recipe.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="school-edit-button" onClick={() => onEdit(recipe)}>
            <Pencil size={15} aria-hidden="true" /> {t(messages, 'module.recipes.edit')}
          </button>
        </div>
      </div>

      <header className="recipe-detail-head">
        <h2 id={`${tabsId}-title`}>{recipe.title}</h2>
        {recipe.description && <p className="recipe-detail-description">{recipe.description}</p>}
        <div className="recipe-detail-meta">
          {recipe.tags?.map((tag) => <span key={tag} className="recipe-tag">{tag}</span>)}
          {sourceUrl && (
            <a className="recipe-card-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} aria-hidden="true" /> {t(messages, 'module.recipes.open_source')}
            </a>
          )}
        </div>
      </header>

      <div className="recipe-tabs" role="tablist" aria-label={recipe.title}>
        {tabButton('ingredients', `${t(messages, 'module.recipes.ingredients')} · ${ingredients.length}`)}
        {tabButton('steps', `${t(messages, 'module.recipes.instructions')} · ${steps.length}`)}
      </div>

      <div className="recipe-detail-body">
        <section
          id={`${tabsId}-ingredients-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-ingredients`}
          className={`recipe-panel${tab === 'ingredients' ? ' active' : ''}`}
        >
          <div className="recipe-panel-head">
            <h3>{t(messages, 'module.recipes.ingredients')}</h3>
            {recipe.servings && servings && (
              <div className="recipe-servings" role="group" aria-label={t(messages, 'module.recipes.servings')}>
                <button type="button" onClick={() => setServings(Math.max(1, servings - 1))} disabled={servings <= 1} aria-label={t(messages, 'module.recipes.servings_less')}>
                  <Minus size={14} aria-hidden="true" />
                </button>
                <span><Users size={14} aria-hidden="true" /> {tc(messages, 'module.recipes.servings_count', servings)}</span>
                <button type="button" onClick={() => setServings(Math.min(999, servings + 1))} aria-label={t(messages, 'module.recipes.servings_more')}>
                  <Plus size={14} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {ingredients.length === 0 ? (
            <p className="recipe-panel-empty">{t(messages, 'module.recipes.ingredient_none')}</p>
          ) : (
            <ul className="recipe-check-list">
              {ingredients.map((ingredient, index) => {
                const key = `${index}:${ingredient.name}`;
                const done = doneIngredients.includes(key);
                return (
                  <li key={key}>
                    <button type="button" role="checkbox" aria-checked={done} className={`recipe-check${done ? ' done' : ''}`} onClick={() => toggle(setDoneIngredients, key)}>
                      <span className="recipe-check-box" aria-hidden="true">{done && <Check size={12} />}</span>
                      <span className="recipe-check-name">{ingredient.name}</span>
                      <span className="recipe-check-amount">{formatIngredientAmount(ingredient)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {onPushToShopping && ingredients.length > 0 && shoppingLists.length > 0 && (
            <div className="recipe-detail-push">
              <select className="form-input" value={listId} onChange={(e) => setListId(e.target.value)} aria-label={t(messages, 'module.recipes.push_to_shopping')}>
                {shoppingLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pushing || !listId || missing.length === 0}
                onClick={async () => {
                  setPushing(true);
                  try {
                    await onPushToShopping(recipe.id, Number(listId), missing);
                  } finally {
                    setPushing(false);
                  }
                }}
              >
                <ShoppingCart size={14} aria-hidden="true" /> {t(messages, 'module.recipes.push_to_shopping')} ({missing.length})
              </button>
            </div>
          )}
        </section>

        <section
          id={`${tabsId}-steps-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-steps`}
          className={`recipe-panel${tab === 'steps' ? ' active' : ''}`}
        >
          <div className="recipe-panel-head">
            <h3>{t(messages, 'module.recipes.instructions')}</h3>
          </div>
          {steps.length === 0 ? (
            <div className="recipe-panel-empty">
              <p>{t(messages, 'module.recipes.instructions_empty')}</p>
              <button type="button" className="btn btn-secondary" onClick={() => onEdit(recipe)}>
                <Pencil size={14} aria-hidden="true" /> {t(messages, 'module.recipes.edit')}
              </button>
            </div>
          ) : (
            <ol className="recipe-steps">
              {lines.map((line, position) => {
                if (line.heading) return <li key={`h${position}`} className="recipe-step-heading">{line.text.slice(0, -1)}</li>;
                const index = steps.indexOf(line);
                const step = line.text;
                const done = doneSteps.includes(index);
                return (
                  <li key={position}>
                    <button type="button" role="checkbox" aria-checked={done} className={`recipe-step${done ? ' done' : ''}`} onClick={() => toggle(setDoneSteps, index)}>
                      <span className="recipe-step-number" aria-hidden="true">{done ? <Check size={14} /> : index + 1}</span>
                      <span className="recipe-step-text">{step}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
      <p className="recipe-detail-hint">{t(messages, 'module.recipes.cooking_hint')}</p>
    </article>
  );
}
