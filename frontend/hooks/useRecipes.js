import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { announce } from '../lib/announce';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { buildRecipePayload, createEmptyRecipeForm, recipeToForm } from '../lib/recipes';
import * as api from '../lib/api';

export function useRecipes() {
  const { familyId, messages, demoMode, loadShoppingLists } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (fid = familyId) => {
    if (!fid || demoMode) {
      setRecipes([]);
      return;
    }
    setLoading(true);
    const { ok, data } = await api.apiListRecipes(fid);
    if (ok && Array.isArray(data)) setRecipes(data);
    setLoading(false);
  }, [familyId, demoMode]);

  useEffect(() => {
    load();
  }, [load]);

  const ingredientHints = useMemo(() => {
    const seen = new Set();
    const names = [];
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients || []) {
        const name = (ingredient.name || '').trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  async function createRecipe(form) {
    if (demoMode) {
      toastError(t(messages, 'module.recipes.demo_blocked'));
      return { ok: false };
    }
    const payload = { family_id: Number(familyId), ...buildRecipePayload(form) };
    const { ok, data } = await api.apiCreateRecipe(payload);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    toastSuccess(t(messages, 'module.recipes.created'));
    announce(t(messages, 'module.recipes.created'));
    await load();
    return { ok: true, data };
  }

  async function updateRecipe(recipeId, form) {
    const payload = buildRecipePayload(form);
    const { ok, data } = await api.apiUpdateRecipe(recipeId, payload);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    toastSuccess(t(messages, 'module.recipes.updated'));
    announce(t(messages, 'module.recipes.updated'));
    await load();
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
    await load();
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

  return {
    recipes,
    loading,
    ingredientHints,
    reload: load,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    pushToShopping,
    emptyForm: createEmptyRecipeForm,
    populateFormFromRecipe: recipeToForm,
  };
}
