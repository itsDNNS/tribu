import { usePlannerLayout } from '../hooks/useResponsiveUI';
import { dateKey } from './responsive/PlannerUI';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit2,
  CalendarDays,
  GripVertical,
  ShoppingCart,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useMealPlans, formatIsoDate, weekDays } from '../hooks/useMealPlans';
import { MEAL_SLOTS, mealSuggestions } from '../lib/meal-plans';
import { formatDayMonth, formatWeekRange, localeForLang } from '../lib/dates';
import { apiListMealPlans, apiListRecipes } from '../lib/api';
import { t, tc } from '../lib/i18n';
import ConfirmDialog from './ConfirmDialog';
import MealPlanDialog from './MealPlanDialog';
import BottomSheet from './responsive/BottomSheet';
import { handoffDate, useHandoff } from '../lib/viewHandoff';

// The week's ingredients for the shopping preview: one line per name, with
// the amounts that go with it.
function weekIngredients(meals) {
  const byName = new Map();
  for (const meal of meals) {
    for (const ingredient of meal.ingredients || []) {
      const name = String(ingredient.name || '').trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      const amount = [ingredient.amount, ingredient.unit].filter(Boolean).join(' ');
      const entry = byName.get(key) || { name, amounts: [], meals: new Set() };
      if (amount) entry.amounts.push(amount);
      entry.meals.add(meal.meal_name);
      byName.set(key, entry);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const WEEKDAY_KEYS = [
  'module.meal_plans.weekday.monday',
  'module.meal_plans.weekday.tuesday',
  'module.meal_plans.weekday.wednesday',
  'module.meal_plans.weekday.thursday',
  'module.meal_plans.weekday.friday',
  'module.meal_plans.weekday.saturday',
  'module.meal_plans.weekday.sunday',
];

function slotLabel(messages, slot) {
  return t(messages, `module.meal_plans.slot.${slot}`);
}

function weekdayKeyForDate(date) {
  return WEEKDAY_KEYS[(date.getDay() + 6) % 7];
}

function ingredientsSummary(messages, ingredients) {
  const count = ingredients?.length || 0;
  if (count === 0) return '';
  return tc(messages, 'module.meal_plans.ingredients_summary', count);
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function FilledMealCell({
  meal,
  onClick,
  messages,
  moveTargets,
  moveMenuOpen,
  isDragging,
  isDropOver,
  onToggleMoveMenu,
  onMoveMeal,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const classes = [
    'meal-grid-cell',
    'meal-grid-cell-filled',
    `meal-grid-slot-${meal.slot}`,
    isDragging ? 'meal-grid-cell-dragging' : '',
    isDropOver ? 'meal-grid-cell-drop-over' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const moveLabel = t(messages, 'module.meal_plans.drag_aria').replace(
    '{name}',
    meal.meal_name,
  );
  const moveControlId = `meal-move-${meal.id}`;

  return (
    <div className={classes} onDragOver={onDragOver} onDrop={onDrop}>
      <button
        type="button"
        className="meal-cell-edit-btn"
        onClick={() => {
          if (isDragging) return;
          onClick(meal);
        }}
        aria-label={t(messages, 'module.meal_plans.edit_aria').replace(
          '{name}',
          meal.meal_name,
        )}
      >
        <span className="meal-cell-title">{meal.meal_name}</span>
        {(meal.ingredients?.length || 0) > 0 && (
          <span className="meal-cell-meta">
            {ingredientsSummary(messages, meal.ingredients)}
          </span>
        )}
        <Edit2 size={12} className="meal-cell-edit-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="meal-cell-grip-btn"
        aria-label={moveLabel}
        aria-controls={moveMenuOpen ? moveControlId : undefined}
        aria-expanded={moveMenuOpen}
        draggable
        onClick={(event) => {
          event.stopPropagation();
          onToggleMoveMenu(meal.id);
        }}
        onDragStart={(event) => onDragStart(event, meal)}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      {moveMenuOpen && (
        <div
          className="meal-cell-move-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <label className="sr-only" htmlFor={moveControlId}>
            {moveLabel}
          </label>
          <select
            id={moveControlId}
            className="form-input meal-cell-move-select"
            value={`${meal.plan_date}:${meal.slot}`}
            onChange={(event) => onMoveMeal(meal.id, event.target.value)}
          >
            {moveTargets.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function EmptyMealCell({
  date,
  slot,
  messages,
  locale,
  onClick,
  isDropOver,
  onDragOver,
  onDrop,
}) {
  return (
    <button
      type="button"
      className={`meal-grid-cell meal-grid-cell-empty${isDropOver ? ' meal-grid-cell-drop-over' : ''}`}
      onClick={() => onClick(date, slot)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-label={t(messages, 'module.meal_plans.add_for_slot_aria')
        .replace('{slot}', slotLabel(messages, slot))
        .replace('{date}', formatDayMonth(date, locale))}
    >
      <Plus size={14} aria-hidden="true" />
    </button>
  );
}

export default function MealPlansView(props) {
  const {
    familyId,
    messages,
    lang,
    demoMode,
    shoppingLists = [],
  } = useApp();
  // Opened from the weekly plan on a given day.
  const focusValue = useHandoff('tribu_meal_focus');
  const [focusDay] = useState(() => handoffDate(focusValue));
  const hook = useMealPlans({ initialDate: focusDay });
  const { ref: plannerRef, compact } = usePlannerLayout();
  const [selectedDay, setSelectedDay] = useState(() => focusDay || new Date());
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const weekSwipe = useRef(null);
  useEffect(() => {
    setSelectedDay((previous) =>
      dateKey(previous) >= dateKey(hook.weekStart) &&
      dateKey(previous) <= dateKey(hook.weekEnd)
        ? previous
        : hook.weekStart,
    );
  }, [hook.weekStart]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(
    hook.emptyFormFor(formatIsoDate(hook.weekStart), 'noon'),
  );
  const [confirmAction, setConfirmAction] = useState(null);
  const [draggingMealId, setDraggingMealId] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  const [moveMenuMealId, setMoveMenuMealId] = useState(null);
  const [recipes, setRecipes] = useState([]);
  // What the family cooked in the last eight weeks, for suggestions (M4).
  const [pastMeals, setPastMeals] = useState([]);
  const [selectedWeekListId, setSelectedWeekListId] = useState('');
  const [pushingWeek, setPushingWeek] = useState(false);

  useEffect(() => {
    if (!familyId || demoMode) {
      setRecipes([]);
      return undefined;
    }
    let active = true;
    apiListRecipes(familyId).then(({ ok, data }) => {
      if (active && ok && Array.isArray(data)) setRecipes(data);
    });
    return () => {
      active = false;
    };
  }, [familyId, demoMode]);

  useEffect(() => {
    if ((shoppingLists || []).length > 0 && !selectedWeekListId) {
      setSelectedWeekListId(String(shoppingLists[0].id));
    }
  }, [shoppingLists, selectedWeekListId]);

  const locale = localeForLang(lang);
  const days = weekDays(hook.weekStart);
  const today = new Date();
  const moveTargets = days.flatMap((day) => {
    const iso = formatIsoDate(day);
    const dayLabel = `${t(messages, weekdayKeyForDate(day))} ${formatDayMonth(day, locale)}`;
    return MEAL_SLOTS.map((slot) => ({
      value: `${iso}:${slot}`,
      label: `${dayLabel} · ${slotLabel(messages, slot)}`,
    }));
  });
  const visibleMeals = days.flatMap((day) =>
    MEAL_SLOTS.map((slot) => hook.getCell(formatIsoDate(day), slot)).filter(
      Boolean,
    ),
  );
  const ingredients = weekIngredients(visibleMeals);
  const mealsWithIngredients = visibleMeals.filter((meal) => (meal.ingredients || []).length).length;

  function openAdd(date, slot) {
    setEditingId(null);
    setForm(hook.emptyFormFor(formatIsoDate(date), slot));
    setDialogOpen(true);
  }

  const adding = dialogOpen && editingId == null;
  useEffect(() => {
    if (!adding || !familyId || demoMode) return undefined;
    let active = true;
    const until = new Date();
    until.setDate(until.getDate() - 1);
    const from = new Date();
    from.setDate(from.getDate() - 56);
    apiListMealPlans(familyId, formatIsoDate(from), formatIsoDate(until)).then(({ ok, data }) => {
      const rows = Array.isArray(data) ? data : data?.items;
      if (active && ok && Array.isArray(rows)) setPastMeals(rows);
    });
    return () => { active = false; };
  }, [adding, familyId, demoMode]);

  useEffect(() => {
    if (props.createRequest?.kind === 'meal') {
      openAdd(selectedDay, 'noon');
      props.onCreateHandled?.();
    }
  }, [props.createRequest?.id]);
  function openEdit(meal) {
    setEditingId(meal.id);
    setForm(hook.populateFormFromMeal(meal));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
  }

  async function handleSubmit() {
    const res =
      editingId != null
        ? await hook.updateMeal(editingId, form)
        : await hook.createMeal(form);
    if (res.ok) closeDialog();
  }

  function handleDelete() {
    if (editingId == null) return;
    const id = editingId;
    const name = form.meal_name || t(messages, 'module.meal_plans.name');
    setConfirmAction({
      title: t(messages, 'module.meal_plans.delete_title'),
      message: t(messages, 'module.meal_plans.delete_confirm').replace(
        '{name}',
        name,
      ),
      danger: true,
      action: async () => {
        setConfirmAction(null);
        await hook.deleteMeal(id);
      },
    });
    closeDialog();
  }

  function handleNativeDragStart(event, meal) {
    setDraggingMealId(meal.id);
    setMoveMenuMealId(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(meal.id));
  }

  function handleNativeDragEnd() {
    setDraggingMealId(null);
    setDragOverCell(null);
  }

  function handleNativeDragOver(event, planDate, slot) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverCell(`${planDate}:${slot}`);
  }

  async function handleNativeDrop(event, planDate, slot) {
    event.preventDefault();
    const mealId = Number(event.dataTransfer.getData('text/plain'));
    setDraggingMealId(null);
    setDragOverCell(null);
    if (!Number.isFinite(mealId)) return;
    await hook.moveMeal(mealId, planDate, slot);
  }

  async function handleMoveSelection(mealId, targetValue) {
    const [planDate, slot] = String(targetValue).split(':');
    if (!planDate || !slot) return;
    const moved = await hook.moveMeal(mealId, planDate, slot);
    if (moved) setMoveMenuMealId(null);
  }

  function toggleMoveMenu(mealId) {
    setMoveMenuMealId((current) => (current === mealId ? null : mealId));
  }

  async function handlePushWeekToShopping() {
    if (!selectedWeekListId) return;
    setPushingWeek(true);
    try {
      const res = await hook.pushWeekToShopping(Number(selectedWeekListId));
      if (res?.ok) setIngredientsOpen(false);
    } finally {
      setPushingWeek(false);
    }
  }

  async function handlePushToShopping(shoppingListId, ingredientNames) {
    if (editingId == null) return { ok: false };
    return hook.pushToShopping(editingId, shoppingListId, ingredientNames);
  }

  return (
    <div
      ref={plannerRef}
      className="meal-plans-page ui-planner"
      data-density={compact ? 'compact' : 'wide'}
    >
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

      <MealPlanDialog
        open={dialogOpen}
        onClose={closeDialog}
        messages={messages}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        onDelete={editingId != null ? handleDelete : null}
        isEditing={editingId != null}
        ingredientHints={hook.ingredientHints}
        shoppingLists={shoppingLists}
        onPushToShopping={
          editingId != null && !demoMode ? handlePushToShopping : null
        }
        recipes={recipes}
        suggestions={adding ? mealSuggestions({ recipes, pastMeals, slot: form.slot }) : []}
      />

      {/* Tribu 2.0 (M1, M2): a plain title and a slim week bar; the week
          is the content. New meals come from the global "+" or an empty slot. */}
      <header className="list-header meal-list-header">
        <h1>{t(messages, 'module.meal_plans.name')}</h1>
      </header>
      <div
        className="meal-week-nav"
        role="group"
        aria-label={t(messages, 'module.meal_plans.week')}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          weekSwipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const start = weekSwipe.current;
          weekSwipe.current = null;
          if (start == null || Math.abs(e.clientX - start) < 60) return;
          if (e.clientX < start) hook.goNextWeek();
          else hook.goPrevWeek();
        }}
      >
        <button
          type="button"
          className="tc-icon meal-week-nav-btn"
          onClick={hook.goPrevWeek}
          aria-label={t(messages, 'module.meal_plans.prev_week')}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="meal-week-nav-label"
          onClick={hook.goToday}
          aria-label={t(messages, 'module.meal_plans.today')}
        >
          <CalendarDays size={14} aria-hidden="true" />
          {formatWeekRange(hook.weekStart, hook.weekEnd, locale)}
        </button>
        <button
          type="button"
          className="tc-icon meal-week-nav-btn"
          onClick={hook.goNextWeek}
          aria-label={t(messages, 'module.meal_plans.next_week')}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {hook.loading && (
        <p className="meal-loading">
          {t(messages, 'module.meal_plans.loading')}
        </p>
      )}

      {compact ? (
        <ol
          className="meal-week-list"
          aria-label={t(messages, 'module.meal_plans.name')}
        >
          {days.map((date) => (
            <li
              key={dateKey(date)}
              className={`meal-day${isSameDay(date, today) ? ' today' : ''}`}
            >
              <div className="meal-day-head">
                <strong>{t(messages, weekdayKeyForDate(date))}</strong>
                <span>{formatDayMonth(date, locale)}</span>
              </div>
              <div className="meal-day-slots">
                {MEAL_SLOTS.map((slot) => {
                  const meal = hook.getCell(dateKey(date), slot);
                  const label = `${slotLabel(messages, slot)}, ${t(messages, weekdayKeyForDate(date))} ${formatDayMonth(date, locale)}`;
                  return meal ? (
                    <button
                      key={slot}
                      type="button"
                      className={`meal-slot filled meal-grid-slot-${slot}`}
                      onClick={() => openEdit(meal)}
                      aria-label={`${meal.meal_name}, ${label}`}
                    >
                      <small>{slotLabel(messages, slot)}</small>
                      <span>{meal.meal_name}</span>
                    </button>
                  ) : (
                    <button
                      key={slot}
                      type="button"
                      className="meal-slot empty"
                      onClick={() => openAdd(date, slot)}
                      aria-label={t(messages, 'module.meal_plans.add_for_slot_aria')
                        .replace('{slot}', slotLabel(messages, slot))
                        .replace('{date}', `${t(messages, weekdayKeyForDate(date))} ${formatDayMonth(date, locale)}`)}
                    >
                      <small>{slotLabel(messages, slot)}</small>
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <section
          className="meal-grid"
          aria-label={t(messages, 'module.meal_plans.name')}
        >
          <div className="meal-grid-corner" aria-hidden="true" />
          {days.map((d, idx) => (
            <div
              key={d.toISOString()}
              className={`meal-grid-day-header${isSameDay(d, today) ? ' meal-grid-day-today' : ''}`}
            >
              <span className="meal-grid-day-name">
                {t(messages, weekdayKeyForDate(d))}
              </span>
              <span className="meal-grid-day-date">
                {formatDayMonth(d, locale)}
              </span>
            </div>
          ))}

          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="meal-grid-row">
              <div className="meal-grid-slot-label">
                {slotLabel(messages, slot)}
              </div>
              {days.map((d) => {
                const iso = formatIsoDate(d);
                const meal = hook.getCell(iso, slot);
                const isDropOver = dragOverCell === `${iso}:${slot}`;
                const dragTargetProps = {
                  onDragOver: (event) => handleNativeDragOver(event, iso, slot),
                  onDrop: (event) => handleNativeDrop(event, iso, slot),
                };
                if (meal) {
                  return (
                    <FilledMealCell
                      key={`${iso}:${slot}`}
                      meal={meal}
                      onClick={openEdit}
                      messages={messages}
                      moveTargets={moveTargets}
                      moveMenuOpen={moveMenuMealId === meal.id}
                      isDragging={draggingMealId === meal.id}
                      isDropOver={isDropOver}
                      onToggleMoveMenu={toggleMoveMenu}
                      onMoveMeal={handleMoveSelection}
                      onDragStart={handleNativeDragStart}
                      onDragEnd={handleNativeDragEnd}
                      {...dragTargetProps}
                    />
                  );
                }
                return (
                  <EmptyMealCell
                    key={`${iso}:${slot}`}
                    date={d}
                    slot={slot}
                    messages={messages}
                    locale={locale}
                    onClick={openAdd}
                    isDropOver={isDropOver}
                    {...dragTargetProps}
                  />
                );
              })}
            </div>
          ))}
        </section>
      )}

      {/* M3: the week's ingredients go to the shopping list with a preview. */}
      {!demoMode && shoppingLists.length > 0 && visibleMeals.length > 0 && (
        <section
          className="meal-week-shopping"
          aria-label={t(messages, 'module.meal_plans.week_ingredients')}
        >
          <ShoppingCart size={18} aria-hidden="true" />
          <span className="meal-week-shopping-text">
            <strong>{t(messages, 'module.meal_plans.week_ingredients')}</strong>
            <small>
              {ingredients.length
                ? t(messages, 'module.meal_plans.week_ingredients_count')
                    .replace('{count}', ingredients.length)
                    .replace('{meals}', mealsWithIngredients)
                : t(messages, 'module.meal_plans.week_ingredients_none')}
            </small>
          </span>
          {ingredients.length > 0 && (
            <button
              type="button"
              className="meal-week-shopping-action"
              aria-haspopup="dialog"
              onClick={() => setIngredientsOpen(true)}
            >
              {t(messages, 'module.meal_plans.week_ingredients_review')}
            </button>
          )}
        </section>
      )}
      {ingredientsOpen && (
        <BottomSheet
          title={t(messages, 'module.meal_plans.week_ingredients')}
          messages={messages}
          onClose={() => setIngredientsOpen(false)}
          className="meal-ingredients-sheet"
        >
          <ul className="meal-ingredients-preview">
            {ingredients.map((ingredient) => (
              <li key={ingredient.name}>
                <span>{ingredient.name}</span>
                <small>
                  {[ingredient.amounts.join(' + '), [...ingredient.meals].join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </li>
            ))}
          </ul>
          <label className="meal-ingredients-list">
            <span>{t(messages, 'module.meal_plans.push_to_shopping')}</span>
            <select
              className="form-input"
              value={selectedWeekListId}
              onChange={(e) => setSelectedWeekListId(e.target.value)}
            >
              {shoppingLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="meal-ingredients-add"
            onClick={handlePushWeekToShopping}
            disabled={pushingWeek || !selectedWeekListId}
          >
            <ShoppingCart size={16} aria-hidden="true" />
            {t(messages, 'module.meal_plans.week_ingredients_add')}
          </button>
        </BottomSheet>
      )}
    </div>
  );
}
