import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Edit2, CalendarDays, GripVertical, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useMealPlans, formatIsoDate, weekDays } from '../hooks/useMealPlans';
import { MEAL_SLOTS } from '../lib/meal-plans';
import { apiListRecipes } from '../lib/api';
import { t } from '../lib/i18n';
import ConfirmDialog from './ConfirmDialog';
import MealPlanDialog from './MealPlanDialog';

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

function formatDayNumber(date) {
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}

function ingredientsSummary(messages, ingredients) {
  const count = ingredients?.length || 0;
  if (count === 0) return '';
  if (count === 1) return t(messages, 'module.meal_plans.ingredients_summary_one');
  return t(messages, 'module.meal_plans.ingredients_summary').replace('{count}', String(count));
}

function weekRangeLabel(weekStart, weekEnd) {
  const fmt = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  return `${fmt(weekStart)} - ${fmt(weekEnd)}${weekStart.getFullYear() === weekEnd.getFullYear() ? ` ${weekEnd.getFullYear()}` : ''}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
  ].filter(Boolean).join(' ');
  const moveLabel = t(messages, 'module.meal_plans.drag_aria').replace('{name}', meal.meal_name);
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
        aria-label={t(messages, 'module.meal_plans.edit_aria').replace('{name}', meal.meal_name)}
      >
        <span className="meal-cell-title">{meal.meal_name}</span>
        {(meal.ingredients?.length || 0) > 0 && (
          <span className="meal-cell-meta">{ingredientsSummary(messages, meal.ingredients)}</span>
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
        <div className="meal-cell-move-panel" onClick={(event) => event.stopPropagation()}>
          <label className="sr-only" htmlFor={moveControlId}>{moveLabel}</label>
          <select
            id={moveControlId}
            className="form-input meal-cell-move-select"
            value={`${meal.plan_date}:${meal.slot}`}
            onChange={(event) => onMoveMeal(meal.id, event.target.value)}
          >
            {moveTargets.map((target) => (
              <option key={target.value} value={target.value}>{target.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function EmptyMealCell({ date, slot, messages, onClick, isDropOver, onDragOver, onDrop }) {
  return (
    <button
      type="button"
      className={`meal-grid-cell meal-grid-cell-empty${isDropOver ? ' meal-grid-cell-drop-over' : ''}`}
      onClick={() => onClick(date, slot)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-label={t(messages, 'module.meal_plans.add_for_slot_aria')
        .replace('{slot}', slotLabel(messages, slot))
        .replace('{date}', formatDayNumber(date))}
    >
      <Plus size={14} aria-hidden="true" />
    </button>
  );
}

export default function MealPlansView() {
  const { familyId, families, messages, demoMode, shoppingLists = [] } = useApp();
  const hook = useMealPlans();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(hook.emptyFormFor(formatIsoDate(hook.weekStart), 'noon'));
  const [confirmAction, setConfirmAction] = useState(null);
  const [draggingMealId, setDraggingMealId] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  const [moveMenuMealId, setMoveMenuMealId] = useState(null);
  const [recipes, setRecipes] = useState([]);
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
    return () => { active = false; };
  }, [familyId, demoMode]);


  useEffect(() => {
    if ((shoppingLists || []).length > 0 && !selectedWeekListId) {
      setSelectedWeekListId(String(shoppingLists[0].id));
    }
  }, [shoppingLists, selectedWeekListId]);

  const currentFamilyName = families.find((f) => String(f.family_id) === String(familyId))?.family_name || '';
  const days = weekDays(hook.weekStart);
  const today = new Date();
  const moveTargets = days.flatMap((day, dayIndex) => {
    const iso = formatIsoDate(day);
    const dayLabel = `${t(messages, WEEKDAY_KEYS[dayIndex])} ${formatDayNumber(day)}`;
    return MEAL_SLOTS.map((slot) => ({
      value: `${iso}:${slot}`,
      label: `${dayLabel} · ${slotLabel(messages, slot)}`,
    }));
  });
  const visibleMeals = days.flatMap((day) => (
    MEAL_SLOTS.map((slot) => hook.getCell(formatIsoDate(day), slot)).filter(Boolean)
  ));
  const mealCountBySlot = MEAL_SLOTS.reduce((acc, slot) => {
    acc[slot] = visibleMeals.filter((meal) => meal.slot === slot).length;
    return acc;
  }, {});

  function openAdd(date, slot) {
    setEditingId(null);
    setForm(hook.emptyFormFor(formatIsoDate(date), slot));
    setDialogOpen(true);
  }

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
    const res = editingId != null
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
      message: t(messages, 'module.meal_plans.delete_confirm').replace('{name}', name),
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
      await hook.pushWeekToShopping(Number(selectedWeekListId));
    } finally {
      setPushingWeek(false);
    }
  }


  async function handlePushToShopping(shoppingListId, ingredientNames) {
    if (editingId == null) return { ok: false };
    return hook.pushToShopping(editingId, shoppingListId, ingredientNames);
  }

  return (
    <div className="meal-plans-page">
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
        onPushToShopping={editingId != null && !demoMode ? handlePushToShopping : null}
        recipes={recipes}
      />

      <div className="view-header meal-plan-header">
        <div className="meal-plan-title-block">
          <span className="meal-plan-page-icon" aria-hidden="true">
            <UtensilsCrossed size={22} />
          </span>
          <div>
            <h1 className="view-title">{t(messages, 'module.meal_plans.name')}</h1>
            <div className="view-subtitle">{currentFamilyName || weekRangeLabel(hook.weekStart, hook.weekEnd)}</div>
          </div>
        </div>
        <div className="meal-header-actions">
          <div className="meal-week-nav" role="group" aria-label={t(messages, 'module.meal_plans.week')}>
            <button
              type="button"
              className="btn btn-secondary meal-week-nav-btn"
              onClick={hook.goPrevWeek}
              aria-label={t(messages, 'module.meal_plans.prev_week')}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-secondary meal-week-nav-label"
              onClick={hook.goToday}
              aria-label={t(messages, 'module.meal_plans.today')}
            >
              <CalendarDays size={14} aria-hidden="true" />
              {weekRangeLabel(hook.weekStart, hook.weekEnd)}
            </button>
            <button
              type="button"
              className="btn btn-secondary meal-week-nav-btn"
              onClick={hook.goNextWeek}
              aria-label={t(messages, 'module.meal_plans.next_week')}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {!demoMode && shoppingLists.length > 0 && (
            <div className="meal-week-shopping" role="group" aria-label={t(messages, 'module.meal_plans.push_week_to_shopping')}>
              <select
                className="form-input meal-week-shopping-list"
                value={selectedWeekListId}
                onChange={(e) => setSelectedWeekListId(e.target.value)}
                aria-label={t(messages, 'module.meal_plans.push_to_shopping')}
              >
                {shoppingLists.map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePushWeekToShopping}
                disabled={pushingWeek || !selectedWeekListId}
                aria-label={t(messages, 'module.meal_plans.push_week_to_shopping_aria')}
              >
                <ShoppingCart size={16} aria-hidden="true" />
                {t(messages, 'module.meal_plans.push_week_to_shopping')}
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openAdd(days[0], 'noon')}
          >
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.meal_plans.add')}
          </button>
        </div>
      </div>

      <div className="meal-plan-week-summary" aria-label={t(messages, 'module.meal_plans.week')}>
        {MEAL_SLOTS.map((slot) => (
          <div key={slot} className={`meal-plan-summary-card meal-plan-summary-${slot}`}>
            <span className="meal-plan-summary-label">{slotLabel(messages, slot)}</span>
            <strong className="meal-plan-summary-value">{mealCountBySlot[slot] || 0}</strong>
          </div>
        ))}
      </div>

      {hook.loading && <p className="meal-loading">{t(messages, 'module.meal_plans.loading')}</p>}

      <section className="meal-grid" aria-label={t(messages, 'module.meal_plans.name')}>
        <div className="meal-grid-corner" aria-hidden="true" />
        {days.map((d, idx) => (
          <div
            key={d.toISOString()}
            className={`meal-grid-day-header${isSameDay(d, today) ? ' meal-grid-day-today' : ''}`}
          >
            <span className="meal-grid-day-name">{t(messages, WEEKDAY_KEYS[idx])}</span>
            <span className="meal-grid-day-date">{formatDayNumber(d)}</span>
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
                  onClick={openAdd}
                  isDropOver={isDropOver}
                  {...dragTargetProps}
                />
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
