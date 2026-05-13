import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import { createEmptyMealForm } from '../lib/meal-plans';
import * as api from '../lib/api';

/** Return the Monday of the ISO week for a given date, in local time. */
function isoWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay: 0 = Sunday. We want Monday as week start.
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
  d.setDate(d.getDate() - dayOfWeek);
  return d;
}

export function formatIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function mealInRange(meal, start, end) {
  return meal.plan_date >= formatIsoDate(start) && meal.plan_date <= formatIsoDate(end);
}

function ingredientNamesFromMeals(items) {
  return Array.from(new Set(
    items.flatMap((meal) => (meal.ingredients || []).map((ingredient) => ingredient.name).filter(Boolean)),
  )).sort((a, b) => a.localeCompare(b));
}

export function useMealPlans() {
  const { familyId, messages, demoMode, mealPlans: demoMeals = [], setMealPlans } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [weekStart, setWeekStart] = useState(() => isoWeekStart(new Date()));
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ingredientHints, setIngredientHints] = useState([]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const load = useCallback(async (fid = familyId) => {
    if (demoMode) {
      setMeals(demoMeals.filter((meal) => mealInRange(meal, weekStart, weekEnd)));
      return;
    }
    if (!fid) {
      setMeals([]);
      return;
    }
    setLoading(true);
    const start = formatIsoDate(weekStart);
    const end = formatIsoDate(weekEnd);
    const { ok, data } = await api.apiListMealPlans(fid, start, end);
    if (ok && Array.isArray(data)) setMeals(data);
    setLoading(false);
  }, [familyId, demoMode, demoMeals, weekStart, weekEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const loadIngredientHints = useCallback(async (fid = familyId) => {
    if (demoMode) {
      setIngredientHints(ingredientNamesFromMeals(demoMeals));
      return;
    }
    if (!fid) {
      setIngredientHints([]);
      return;
    }
    const { ok, data } = await api.apiListMealPlanIngredients(fid);
    if (ok && data?.items) setIngredientHints(data.items);
  }, [familyId, demoMode, demoMeals]);

  useEffect(() => {
    loadIngredientHints();
  }, [loadIngredientHints]);

  const goPrevWeek = useCallback(() => setWeekStart((w) => addDays(w, -7)), []);
  const goNextWeek = useCallback(() => setWeekStart((w) => addDays(w, 7)), []);
  const goToday = useCallback(() => setWeekStart(isoWeekStart(new Date())), []);

  const byCell = useMemo(() => {
    const map = new Map();
    for (const m of meals) map.set(`${m.plan_date}:${m.slot}`, m);
    return map;
  }, [meals]);

  function getCell(date, slot) {
    const iso = typeof date === 'string' ? date : formatIsoDate(date);
    return byCell.get(`${iso}:${slot}`) || null;
  }

  function buildPayload(form) {
    const ingredients = (form.ingredients || [])
      .map((row) => {
        const name = (row.name || '').trim();
        if (!name) return null;
        const amountRaw = typeof row.amount === 'string' ? row.amount.replace(',', '.').trim() : row.amount;
        let amount = null;
        if (amountRaw !== '' && amountRaw != null) {
          const n = Number(amountRaw);
          if (Number.isFinite(n) && n >= 0) amount = n;
        }
        const unit = (row.unit || '').trim() || null;
        return { name, amount, unit };
      })
      .filter(Boolean);
    return {
      plan_date: form.plan_date,
      slot: form.slot,
      meal_name: (form.meal_name || '').trim(),
      ingredients,
      notes: (form.notes || '').trim() || null,
    };
  }

  async function createMeal(form) {
    const payload = buildPayload(form);
    if (demoMode) {
      if (demoMeals.some((meal) => meal.plan_date === payload.plan_date && meal.slot === payload.slot)) {
        toastError(t(messages, 'module.meal_plans.slot_taken'));
        return { ok: false, status: 409 };
      }
      const now = new Date().toISOString();
      const data = {
        id: Math.max(0, ...demoMeals.map((meal) => meal.id || 0)) + 1,
        family_id: Number(familyId) || 1,
        ...payload,
        created_by_user_id: 1,
        created_at: now,
        updated_at: now,
      };
      setMealPlans((prev) => [...prev, data]);
      toastSuccess(t(messages, 'module.meal_plans.created'));
      announce(t(messages, 'module.meal_plans.created'));
      return { ok: true, data };
    }
    const { ok, data, status } = await api.apiCreateMealPlan({ family_id: Number(familyId), ...payload });
    if (!ok) {
      if (status === 409) toastError(t(messages, 'module.meal_plans.slot_taken'));
      else toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false, status };
    }
    toastSuccess(t(messages, 'module.meal_plans.created'));
    announce(t(messages, 'module.meal_plans.created'));
    await Promise.all([load(), loadIngredientHints()]);
    return { ok: true, data };
  }

  async function updateMeal(planId, form) {
    const payload = buildPayload(form);
    if (demoMode) {
      if (demoMeals.some((meal) => meal.id !== planId && meal.plan_date === payload.plan_date && meal.slot === payload.slot)) {
        toastError(t(messages, 'module.meal_plans.slot_taken'));
        return { ok: false, status: 409 };
      }
      const current = demoMeals.find((meal) => meal.id === planId);
      if (!current) return { ok: false, status: 404 };
      const updated = { ...current, ...payload, updated_at: new Date().toISOString() };
      setMealPlans((prev) => prev.map((meal) => (meal.id === planId ? updated : meal)));
      toastSuccess(t(messages, 'module.meal_plans.updated'));
      announce(t(messages, 'module.meal_plans.updated'));
      return { ok: true, data: updated };
    }
    const { ok, data, status } = await api.apiUpdateMealPlan(planId, payload);
    if (!ok) {
      if (status === 409) toastError(t(messages, 'module.meal_plans.slot_taken'));
      else toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false, status };
    }
    toastSuccess(t(messages, 'module.meal_plans.updated'));
    announce(t(messages, 'module.meal_plans.updated'));
    await Promise.all([load(), loadIngredientHints()]);
    return { ok: true, data };
  }

  async function deleteMeal(planId) {
    if (demoMode) {
      setMealPlans((prev) => prev.filter((meal) => meal.id !== planId));
      toastSuccess(t(messages, 'module.meal_plans.deleted'));
      announce(t(messages, 'module.meal_plans.deleted'));
      return true;
    }
    const { ok, data } = await api.apiDeleteMealPlan(planId);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return false;
    }
    toastSuccess(t(messages, 'module.meal_plans.deleted'));
    announce(t(messages, 'module.meal_plans.deleted'));
    await load();
    return true;
  }

  async function moveMeal(planId, plan_date, slot) {
    const current = meals.find((m) => m.id === planId);
    if (current && current.plan_date === plan_date && current.slot === slot) return true;
    if (demoMode) {
      if (demoMeals.some((meal) => meal.id !== planId && meal.plan_date === plan_date && meal.slot === slot)) {
        toastError(t(messages, 'module.meal_plans.slot_taken'));
        return false;
      }
      setMealPlans((prev) => prev.map((meal) => (
        meal.id === planId ? { ...meal, plan_date, slot, updated_at: new Date().toISOString() } : meal
      )));
      return true;
    }
    // Optimistic local update so the drop lands without waiting for the round-trip.
    setMeals((prev) => prev.map((m) => (m.id === planId ? { ...m, plan_date, slot } : m)));
    const { ok, status, data } = await api.apiUpdateMealPlan(planId, { plan_date, slot });
    if (!ok) {
      if (status === 409) toastError(t(messages, 'module.meal_plans.slot_taken'));
      else toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      // Refetch to restore server truth on any failure.
      await load();
      return false;
    }
    await load();
    return true;
  }

  async function pushToShopping(planId, shoppingListId, ingredientNames = null) {
    if (demoMode) return { ok: false };
    const { ok, data } = await api.apiAddMealIngredientsToShopping(planId, shoppingListId, ingredientNames);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    const added = data?.added_count ?? 0;
    const template = added === 1
      ? t(messages, 'module.meal_plans.pushed_one')
      : t(messages, 'module.meal_plans.pushed_many');
    const msg = template.replace('{count}', String(added));
    toastSuccess(msg);
    announce(msg);
    return { ok: true, added };
  }

  async function pushWeekToShopping(shoppingListId) {
    if (demoMode) return { ok: false };
    const { ok, data } = await api.apiAddWeekMealIngredientsToShopping(
      Number(familyId),
      formatIsoDate(weekStart),
      shoppingListId,
    );
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return { ok: false };
    }
    const added = data?.added_count ?? 0;
    const template = added === 1
      ? t(messages, 'module.meal_plans.pushed_one')
      : t(messages, 'module.meal_plans.pushed_many');
    const msg = template.replace('{count}', String(added));
    toastSuccess(msg);
    announce(msg);
    return { ok: true, added };
  }


  function populateFormFromMeal(meal) {
    return {
      plan_date: meal.plan_date,
      slot: meal.slot,
      meal_name: meal.meal_name || '',
      ingredients: (meal.ingredients || []).map((i) => ({
        name: i.name || '',
        amount: i.amount == null ? '' : String(i.amount),
        unit: i.unit || '',
      })),
      notes: meal.notes || '',
    };
  }

  function emptyFormFor(dateIso, slot) {
    return createEmptyMealForm({ plan_date: dateIso, slot });
  }

  return {
    weekStart,
    weekEnd,
    loading,
    meals,
    ingredientHints,
    goPrevWeek,
    goNextWeek,
    goToday,
    reload: load,
    getCell,
    createMeal,
    updateMeal,
    deleteMeal,
    moveMeal,
    pushToShopping,
    pushWeekToShopping,
    populateFormFromMeal,
    emptyFormFor,
  };
}
