import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

export const MEAL_SLOTS = ['morning', 'noon', 'evening'];

/** Return the Monday of the ISO week for a given date, in local time. */
export function isoWeekStart(date) {
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

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const EMPTY_INGREDIENT = { name: '', amount: '', unit: '' };

export const EMPTY_FORM = {
  plan_date: '',
  slot: 'noon',
  meal_name: '',
  ingredients: [],
  notes: '',
};

export function useMealPlans() {
  const { familyId, messages, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [weekStart, setWeekStart] = useState(() => isoWeekStart(new Date()));
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ingredientHints, setIngredientHints] = useState([]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const load = useCallback(async (fid = familyId) => {
    if (!fid || demoMode) {
      setMeals([]);
      return;
    }
    setLoading(true);
    const start = formatIsoDate(weekStart);
    const end = formatIsoDate(weekEnd);
    const { ok, data } = await api.apiListMealPlans(fid, start, end);
    if (ok && Array.isArray(data)) setMeals(data);
    setLoading(false);
  }, [familyId, demoMode, weekStart, weekEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const loadIngredientHints = useCallback(async (fid = familyId) => {
    if (!fid || demoMode) {
      setIngredientHints([]);
      return;
    }
    const { ok, data } = await api.apiListMealPlanIngredients(fid);
    if (ok && data?.items) setIngredientHints(data.items);
  }, [familyId, demoMode]);

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
    if (demoMode) {
      toastError(t(messages, 'module.meal_plans.name'));
      return { ok: false };
    }
    const payload = { family_id: Number(familyId), ...buildPayload(form) };
    const { ok, data, status } = await api.apiCreateMealPlan(payload);
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
    return { ...EMPTY_FORM, plan_date: dateIso, slot };
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
    populateFormFromMeal,
    emptyFormFor,
    EMPTY_INGREDIENT,
  };
}
