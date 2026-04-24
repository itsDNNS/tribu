import { useState } from 'react';
import { ChevronLeft, ChevronRight, UtensilsCrossed, Plus, Edit2, CalendarDays, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { useApp } from '../contexts/AppContext';
import { useMealPlans, formatIsoDate, weekDays } from '../hooks/useMealPlans';
import { MEAL_SLOTS } from '../lib/meal-plans';
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

function DraggableFilledCell({ meal, onClick, messages }) {
  const draggable = useDraggable({ id: `meal:${meal.id}`, data: { mealId: meal.id } });
  const droppable = useDroppable({ id: `slot:${meal.plan_date}:${meal.slot}` });
  const setContainerRef = (node) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };
  const classes = [
    'meal-grid-cell',
    'meal-grid-cell-filled',
    `meal-grid-slot-${meal.slot}`,
    draggable.isDragging ? 'meal-grid-cell-dragging' : '',
    droppable.isOver ? 'meal-grid-cell-drop-over' : '',
  ].filter(Boolean).join(' ');
  return (
    <div ref={setContainerRef} className={classes}>
      <button
        type="button"
        className="meal-cell-edit-btn"
        onClick={() => {
          if (draggable.isDragging) return;
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
        ref={draggable.setActivatorNodeRef}
        type="button"
        className="meal-cell-grip-btn"
        aria-label={t(messages, 'module.meal_plans.drag_aria').replace('{name}', meal.meal_name)}
        {...draggable.listeners}
        {...draggable.attributes}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function DroppableEmptyCell({ date, slot, messages, onClick }) {
  const iso = formatIsoDate(date);
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${iso}:${slot}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`meal-grid-cell meal-grid-cell-empty${isOver ? ' meal-grid-cell-drop-over' : ''}`}
      onClick={() => onClick(date, slot)}
      aria-label={t(messages, 'module.meal_plans.add_for_slot_aria')
        .replace('{slot}', slotLabel(messages, slot))
        .replace('{date}', formatDayNumber(date))}
    >
      <Plus size={14} aria-hidden="true" />
    </button>
  );
}

export default function MealPlansView() {
  const { familyId, families, messages, demoMode, shoppingLists } = useApp();
  const hook = useMealPlans();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(hook.emptyFormFor(formatIsoDate(hook.weekStart), 'noon'));
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeDrag, setActiveDrag] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (demoMode) {
    return (
      <div className="view">
        <div className="view-header">
          <h1 className="view-title">{t(messages, 'module.meal_plans.name')}</h1>
        </div>
        <div className="empty-state">
          <UtensilsCrossed size={32} aria-hidden="true" />
          <p>{t(messages, 'module.meal_plans.demo_blocked')}</p>
        </div>
      </div>
    );
  }

  const currentFamilyName = families.find((f) => String(f.family_id) === String(familyId))?.family_name || '';
  const days = weekDays(hook.weekStart);
  const today = new Date();

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

  function handleDragStart(event) {
    const id = event.active?.data?.current?.mealId ?? null;
    setActiveDrag(hook.meals.find((m) => m.id === id) || null);
  }

  async function handleDragEnd(event) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || !active) return;
    const mealId = active?.data?.current?.mealId;
    if (mealId == null) return;
    const overId = String(over.id);
    if (!overId.startsWith('slot:')) return;
    const [, planDate, slot] = overId.split(':');
    if (!planDate || !slot) return;
    await hook.moveMeal(mealId, planDate, slot);
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  async function handlePushToShopping(shoppingListId, ingredientNames) {
    if (editingId == null) return { ok: false };
    return hook.pushToShopping(editingId, shoppingListId, ingredientNames);
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
        onPushToShopping={editingId != null ? handlePushToShopping : null}
      />

      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.meal_plans.name')}</h1>
          <div className="view-subtitle">{currentFamilyName}</div>
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

      {hook.loading && <p className="meal-loading">{t(messages, 'module.meal_plans.loading')}</p>}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
                if (meal) {
                  return (
                    <DraggableFilledCell
                      key={`${iso}:${slot}`}
                      meal={meal}
                      onClick={openEdit}
                      messages={messages}
                    />
                  );
                }
                return (
                  <DroppableEmptyCell
                    key={`${iso}:${slot}`}
                    date={d}
                    slot={slot}
                    messages={messages}
                    onClick={openAdd}
                  />
                );
              })}
            </div>
          ))}
        </section>
        <DragOverlay>
          {activeDrag ? (
            <div className={`meal-grid-cell meal-grid-cell-filled meal-grid-slot-${activeDrag.slot} meal-cell-overlay`}>
              <span className="meal-cell-title">{activeDrag.meal_name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
