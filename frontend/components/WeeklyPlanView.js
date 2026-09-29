import { usePlannerLayout } from '../hooks/useResponsiveUI';
import {
  DayStrip,
  WeekPresentation,
  dateKey,
} from './responsive/PlannerUI';
import { eventOccursOn } from '../lib/calendar-dates';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Printer,
  ShoppingCart,
  Utensils,
  Cake,
  BookOpen,
  Plus,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import MemberAvatar from './MemberAvatar';
import { apiGetEvents, apiListMealPlans, apiListRecipes } from '../lib/api';
import { handOff } from '../lib/viewHandoff';
import { parseDate } from '../lib/helpers';
import { t } from '../lib/i18n';

const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoDate(date) {
  const d = parseDate(date);
  if (!d) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
    return value.slice(0, 10);
  return toIsoDate(value) || null;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekRange(anchor = new Date()) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return { start, end, startIso: toIsoDate(start), endIso: toIsoDate(end) };
}

function isWithinWeek(value, weekStart) {
  const iso = normalizeDateOnly(value);
  if (!iso) return false;
  const week = getWeekRange(weekStart);
  return iso >= week.startIso && iso <= week.endIso;
}

function eventDate(event) {
  return event?.starts_at || event?.start || event?.date;
}

function taskDate(task) {
  return task?.due_date || task?.due_at;
}

function mealDate(meal) {
  return meal?.plan_date || meal?.date || meal?.planned_for || meal?.meal_date;
}

function birthdayDate(birthday, weekStart) {
  const range = getWeekRange(weekStart);
  const startYear = range.start.getFullYear();
  const endYear = range.end.getFullYear();
  const years = [...new Set([startYear, endYear])];
  let monthDay = null;

  if (birthday?.month && birthday?.day) {
    monthDay = `${String(birthday.month).padStart(2, '0')}-${String(birthday.day).padStart(2, '0')}`;
  } else {
    const raw = birthday?.date || birthday?.birthday || birthday?.next_date;
    const iso = normalizeDateOnly(raw);
    if (iso) monthDay = iso.slice(5, 10);
  }

  if (!monthDay) return null;
  return (
    years
      .map((year) => `${year}-${monthDay}`)
      .find(
        (candidate) => candidate >= range.startIso && candidate <= range.endIso,
      ) || `${startYear}-${monthDay}`
  );
}

function openShoppingCount(list) {
  if (
    typeof list?.item_count === 'number' ||
    typeof list?.checked_count === 'number'
  ) {
    return Math.max(
      0,
      Number(list.item_count || 0) - Number(list.checked_count || 0),
    );
  }
  return (Array.isArray(list?.items) ? list.items : []).filter(
    (item) => !item?.checked && !item?.is_checked,
  ).length;
}

// Meals of a day in the order they are eaten.
const SLOT_ORDER = { morning: 0, noon: 1, evening: 2 };

function compareMeals(a, b) {
  const byDate = String(normalizeDateOnly(mealDate(a)) || '').localeCompare(String(normalizeDateOnly(mealDate(b)) || ''));
  return byDate || (SLOT_ORDER[a?.slot] ?? 9) - (SLOT_ORDER[b?.slot] ?? 9);
}

function compareByDate(getter) {
  return (a, b) =>
    String(normalizeDateOnly(getter(a)) || '').localeCompare(
      String(normalizeDateOnly(getter(b)) || ''),
    );
}

function asStringId(value) {
  return value === null || value === undefined || value === ''
    ? null
    : String(value);
}

function assignedListMatches(assignedTo, selectedMemberId) {
  if (!selectedMemberId) return true;
  if (!assignedTo || assignedTo === 'all') return true;
  if (Array.isArray(assignedTo))
    return assignedTo.map(String).includes(selectedMemberId);
  return String(assignedTo) === selectedMemberId;
}

function assignedUserMatches(value, selectedMemberId) {
  if (!selectedMemberId) return true;
  const assigned = asStringId(value);
  return !assigned || assigned === selectedMemberId;
}

const SECTION_CONFIG = [
  { key: 'events', labelKey: 'module.weekly_plan.events', icon: CalendarDays },
  { key: 'tasks', labelKey: 'module.weekly_plan.tasks', icon: ListChecks },
  { key: 'meals', labelKey: 'module.weekly_plan.meals', icon: Utensils },
  { key: 'birthdays', labelKey: 'module.weekly_plan.birthdays', icon: Cake },
  {
    key: 'shopping',
    labelKey: 'module.weekly_plan.shopping',
    icon: ShoppingCart,
  },
];

export function buildWeeklyPlanSections({
  weekStart,
  events = [],
  tasks = [],
  meals = [],
  birthdays = [],
  shoppingLists = [],
  memberId = '',
}) {
  const selectedMemberId = asStringId(memberId);
  const openShopping = (Array.isArray(shoppingLists) ? shoppingLists : [])
    .map((list) => ({
      id: list.id,
      title: list.name || list.title,
      count: openShoppingCount(list),
    }))
    .filter((item) => item.count > 0);

  return {
    events: (Array.isArray(events) ? events : [])
      .filter(
        (event) =>
          Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).some(
            (date) => eventOccursOn(event, date),
          ) && assignedListMatches(event?.assigned_to, selectedMemberId),
      )
      .sort(compareByDate(eventDate)),
    tasks: (Array.isArray(tasks) ? tasks : [])
      .filter(
        (task) =>
          task?.status === 'open' &&
          isWithinWeek(taskDate(task), weekStart) &&
          assignedUserMatches(task?.assigned_to_user_id, selectedMemberId),
      )
      .sort(compareByDate(taskDate)),
    meals: (Array.isArray(meals) ? meals : [])
      .filter(
        (meal) =>
          isWithinWeek(mealDate(meal), weekStart) &&
          assignedUserMatches(
            meal?.assigned_to_user_id || meal?.member_id || meal?.user_id,
            selectedMemberId,
          ),
      )
      .sort(compareMeals),
    birthdays: (Array.isArray(birthdays) ? birthdays : [])
      .filter((birthday) => {
        const next = birthdayDate(birthday, weekStart);
        return (
          next &&
          isWithinWeek(next, weekStart) &&
          assignedUserMatches(
            birthday?.user_id || birthday?.member_id,
            selectedMemberId,
          )
        );
      })
      .sort((a, b) =>
        String(birthdayDate(a, weekStart)).localeCompare(
          String(birthdayDate(b, weekStart)),
        ),
      ),
    shopping: openShopping,
  };
}

function formatDate(value, locale) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatWeekLabel(range, locale) {
  return `${range.start.toLocaleDateString(locale, { day: '2-digit', month: 'short' })} – ${range.end.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function Section({
  title,
  icon: Icon,
  items,
  emptyLabel,
  renderItem,
  sectionKey,
}) {
  return (
    <section
      className={`weekly-plan-section weekly-plan-section-${sectionKey}`}
      role="region"
      aria-label={title}
    >
      <span
        className={`weekly-plan-section-visual weekly-plan-section-visual-${sectionKey}`}
        aria-hidden="true"
      >
        <Icon size={22} />
      </span>
      <div className="weekly-plan-section-header">
        <h2>{title}</h2>
        <span className="weekly-plan-section-count">{items.length}</span>
      </div>
      {items.length ? (
        <ul>{items.map(renderItem)}</ul>
      ) : (
        <p className="weekly-plan-empty">{emptyLabel}</p>
      )}
    </section>
  );
}

// Each entry opens where it comes from (discussion #511).
function WeeklyPlanItem({ meta, title, accent = 'neutral', onOpen, extra = null }) {
  return (
    <li className={`weekly-plan-item weekly-plan-item-${accent}`}>
      {onOpen ? (
        <button type="button" className="weekly-plan-item-open" onClick={onOpen}>
          <span>{meta}</span>
          <strong>{title}</strong>
        </button>
      ) : (
        <>
          <span>{meta}</span>
          <strong>{title}</strong>
        </>
      )}
      {extra}
    </li>
  );
}

export default function WeeklyPlanView({
  initialDate,
  initialMeals = null,
  initialEvents = null,
  onCreateForm,
}) {
  const {
    events = [],
    tasks = [],
    shoppingLists = [],
    birthdays = [],
    members = [],
    familyId,
    messages,
    lang,
    timeFormat,
    setActiveView,
    isChild,
    hiddenAreas = [],
  } = useApp();
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const [anchor, setAnchor] = useState(initialDate || new Date());
  const { ref: plannerRef, compact } = usePlannerLayout();
  const [presentation, setPresentation] = useState('day');
  const [meals, setMeals] = useState(initialMeals || []);
  const [weeklyEvents, setWeeklyEvents] = useState(initialEvents || events);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [visibleSections, setVisibleSections] = useState(
    () => new Set(SECTION_CONFIG.map((section) => section.key)),
  );
  const range = useMemo(() => getWeekRange(anchor), [anchor]);

  useEffect(() => {
    if (initialEvents !== null) return;
    setWeeklyEvents(events);
  }, [events, initialEvents]);

  useEffect(() => {
    let cancelled = false;
    if (initialEvents !== null || !familyId)
      return () => {
        cancelled = true;
      };
    apiGetEvents(
      familyId,
      range.start.toISOString(),
      new Date(range.end.getTime() + 1).toISOString(),
    )
      .then((res) => {
        if (cancelled) return;
        setWeeklyEvents(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setWeeklyEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId, initialEvents, range.startIso, range.endIso]);

  useEffect(() => {
    let cancelled = false;
    if (initialMeals || !familyId)
      return () => {
        cancelled = true;
      };
    apiListMealPlans(familyId, range.startIso, range.endIso)
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res?.data?.items)
          ? res.data.items
          : Array.isArray(res?.data)
            ? res.data
            : [];
        setMeals(items);
      })
      .catch(() => {
        if (!cancelled) setMeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId, initialMeals, range.startIso, range.endIso]);

  // Meals named like a family recipe link to it.
  const recipesShown = !hiddenAreas.includes('recipes');
  useEffect(() => {
    let cancelled = false;
    if (!familyId || !recipesShown) return undefined;
    apiListRecipes(familyId)
      .then((res) => {
        if (!cancelled && Array.isArray(res?.data)) setRecipes(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyId, recipesShown]);
  const recipeFor = (meal) => {
    const name = String(meal?.meal_name || meal?.title || '').trim().toLowerCase();
    return name ? recipes.find((recipe) => String(recipe.title || '').trim().toLowerCase() === name) : null;
  };

  const go = (view, key, value) => {
    if (key) handOff(key, value);
    setActiveView(view);
  };
  const openEvent = (event) => {
    const at = parseDate(eventDate(event));
    go('calendar', at ? 'tribu_calendar_focus' : null, at?.toISOString());
  };
  const openMeal = (meal) => go('meal_plans', 'tribu_meal_focus', normalizeDateOnly(mealDate(meal)));
  const openList = (list) => go('shopping', 'tribu_shopping_list', list.id);
  const slotLabel = (slot) => (slot ? t(messages, `module.meal_plans.slot.${slot}`) : '');
  const recipeLink = (meal) => {
    const recipe = recipesShown ? recipeFor(meal) : null;
    return recipe ? (
      <button
        type="button"
        className="weekly-plan-recipe-link no-print"
        onClick={() => go('recipes', 'tribu_recipe_open', recipe.id)}
      >
        <BookOpen size={13} aria-hidden="true" />
        {t(messages, 'module.weekly_plan.recipe')}
      </button>
    ) : null;
  };
  const sections = useMemo(
    () =>
      buildWeeklyPlanSections({
        weekStart: range.start,
        events: weeklyEvents,
        tasks,
        meals,
        birthdays,
        shoppingLists,
        memberId: selectedMemberId,
      }),
    [
      range.start,
      weeklyEvents,
      tasks,
      meals,
      birthdays,
      shoppingLists,
      selectedMemberId,
    ],
  );
  const timeOptions =
    timeFormat === '12h'
      ? { hour: 'numeric', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit', hour12: false };
  const toggleSection = (sectionKey) => {
    setVisibleSections((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next.size ? next : current;
    });
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(range.start, i));
  const todayKey = dateKey(new Date());
  // Everything of one day, in the order people look for it (discussion #511).
  const dayItems = (date) => {
    const key = dateKey(date);
    const items = [];
    if (visibleSections.has('birthdays')) {
      for (const birthday of sections.birthdays) {
        if (birthdayDate(birthday, range.start) !== key) continue;
        items.push({
          kind: 'birthdays',
          id: `birthday-${birthday.id || birthday.person_name}`,
          title: birthday.person_name || birthday.name,
          meta: '',
          onOpen: () => go('contacts', 'tribu_contacts_tab', 'birthdays'),
        });
      }
    }
    if (visibleSections.has('events')) {
      const events = sections.events
        .filter((event) => eventOccursOn(event, date))
        .sort((a, b) => (a.all_day ? 0 : 1) - (b.all_day ? 0 : 1) || String(eventDate(a)).localeCompare(String(eventDate(b))));
      for (const event of events) {
        items.push({
          kind: 'events',
          id: `event-${event.id || event.title}`,
          title: event.title,
          meta: event.all_day ? '' : parseDate(eventDate(event))?.toLocaleTimeString(locale, timeOptions) || '',
          onOpen: () => openEvent(event),
        });
      }
    }
    if (visibleSections.has('meals')) {
      for (const meal of sections.meals) {
        if (normalizeDateOnly(mealDate(meal)) !== key) continue;
        items.push({
          kind: 'meals',
          id: `meal-${meal.id || meal.meal_name}`,
          title: meal.meal_name || meal.title || meal.name,
          meta: slotLabel(meal.slot),
          onOpen: () => openMeal(meal),
          extra: recipeLink(meal),
        });
      }
    }
    if (visibleSections.has('tasks')) {
      for (const task of sections.tasks) {
        if (normalizeDateOnly(taskDate(task)) !== key) continue;
        items.push({
          kind: 'tasks',
          id: `task-${task.id || task.title}`,
          title: task.title,
          meta: '',
          onOpen: () => go('tasks'),
        });
      }
    }
    return items;
  };
  const dayAdders = (date) => {
    if (isChild || !onCreateForm) return [];
    const iso = toIsoDate(date);
    return [
      ['event', CalendarDays, 'module.dashboard.quick_event', () => {
        handOff('tribu_calendar_focus', new Date(`${iso}T14:00`).toISOString());
        onCreateForm('event');
      }],
      ['task', ListChecks, 'module.dashboard.quick_capture_add_task', () => onCreateForm('task')],
      ...(hiddenAreas.includes('meal_plans') ? [] : [['meal', Utensils, 'module.dashboard.quick_meal', () => {
        handOff('tribu_meal_focus', iso);
        onCreateForm('meal');
      }]]),
    ];
  };
  const dayColumn = (date, { wide = false } = {}) => {
    const key = dateKey(date);
    const items = dayItems(date);
    const adders = dayAdders(date);
    const long = date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    return (
      <section key={key} className={`week-day${key === todayKey ? ' is-today' : ''}${wide ? ' is-wide' : ''}`} aria-label={long}>
        <header className="week-day-head">
          <span className="week-day-name">
            {key === todayKey && !wide ? t(messages, 'nav.group.today') : date.toLocaleDateString(locale, { weekday: wide ? 'long' : 'short' })}
          </span>
          <strong className="week-day-date">{date.toLocaleDateString(locale, { day: 'numeric', month: wide ? 'long' : 'numeric' })}</strong>
          {key === todayKey && wide && <span className="week-day-today">{t(messages, 'nav.group.today')}</span>}
          {adders.length > 0 && (
            <details className="week-day-add">
              <summary aria-label={t(messages, 'module.weekly_plan.add_to_day').replace('{day}', long)} title={t(messages, 'module.weekly_plan.add_to_day').replace('{day}', long)}>
                <Plus size={15} aria-hidden="true" />
              </summary>
              <div className="week-day-add-menu">
                {adders.map(([kind, Icon, labelKey, run]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.closest('details').open = false;
                      run();
                    }}
                  >
                    <Icon size={15} aria-hidden="true" /> {t(messages, labelKey)}
                  </button>
                ))}
              </div>
            </details>
          )}
        </header>
        {items.length ? (
          <ul className="week-day-items">
            {items.map((item) => {
              const Icon = SECTION_CONFIG.find((section) => section.key === item.kind).icon;
              return (
                <li key={item.id} className={`week-entry week-entry-${item.kind}`}>
                  <button type="button" className="week-entry-open" onClick={item.onOpen}>
                    <Icon size={14} aria-hidden="true" />
                    <span className="week-entry-text">
                      {item.meta && <span className="week-entry-meta">{item.meta}</span>}
                      <span className="week-entry-title">{item.title}</span>
                    </span>
                  </button>
                  {item.extra}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="week-day-free">{t(messages, 'module.weekly_plan.day_free')}</p>
        )}
      </section>
    );
  };
  const memberChips = members.length > 1 && (
    <div className="person-filter" role="group" aria-label={t(messages, 'module.weekly_plan.filter_member')}>
      {[{ key: '', label: t(messages, 'module.weekly_plan.filter_all_members') }, ...members.map((member) => ({
        key: String(member.user_id || member.id),
        label: (member.display_name || member.name || '').split(' ')[0],
        member,
      }))].map((filter) => (
        <button
          key={filter.key || 'all'}
          type="button"
          className={`person-filter-chip${selectedMemberId === filter.key ? ' active' : ''}`}
          aria-pressed={selectedMemberId === filter.key}
          onClick={() => setSelectedMemberId(filter.key)}
        >
          {filter.member && <MemberAvatar member={filter.member} index={members.indexOf(filter.member)} size={22} />}
          {filter.label}
        </button>
      ))}
    </div>
  );

  return (
    <main
      ref={plannerRef}
      className="weekly-plan-page week-glance print-surface ui-planner"
      data-density={compact ? 'compact' : 'wide'}
    >
      <header className="list-header weekly-plan-header">
        <h1>{t(messages, 'module.weekly_plan.title')}</h1>
        <div className="week-glance-nav">
          <div className="weekly-plan-nav no-print">
            <button
              type="button"
              className="btn-secondary weekly-plan-icon-btn"
              onClick={() => setAnchor(addDays(anchor, -7))}
              aria-label={t(messages, 'module.weekly_plan.previous_week')}
            >
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn-secondary weekly-plan-today-btn" onClick={() => setAnchor(new Date())}>
              {t(messages, 'module.weekly_plan.this_week')}
            </button>
            <button
              type="button"
              className="btn-secondary weekly-plan-icon-btn"
              onClick={() => setAnchor(addDays(anchor, 7))}
              aria-label={t(messages, 'module.weekly_plan.next_week')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <strong className="weekly-plan-week-pill">{formatWeekLabel(range, locale)}</strong>
          <button
            type="button"
            className="btn-secondary weekly-plan-icon-btn weekly-plan-print-btn no-print"
            onClick={() => window.print()}
            aria-label={t(messages, 'module.weekly_plan.print')}
            title={t(messages, 'module.weekly_plan.print')}
          >
            <Printer size={16} />
          </button>
        </div>
      </header>

      <div className="week-glance-filters no-print">
        {memberChips}
        <div className="week-glance-kinds" role="group" aria-label={t(messages, 'module.weekly_plan.filter_sections')}>
          {SECTION_CONFIG.map((section) => {
            const Icon = section.icon;
            return (
              <button
                type="button"
                key={section.key}
                className={`week-kind-chip week-kind-chip-${section.key}${visibleSections.has(section.key) ? ' active' : ''}`}
                onClick={() => toggleSection(section.key)}
                aria-pressed={visibleSections.has(section.key)}
              >
                <Icon size={15} aria-hidden="true" />
                {t(messages, section.labelKey)}
                <strong>{sections[section.key]?.length || 0}</strong>
              </button>
            );
          })}
        </div>
      </div>

      {compact ? (
        <div className="ui-weekly-compact no-print">
          <DayStrip days={days} selected={anchor} onSelect={setAnchor} locale={locale} messages={messages} />
          <WeekPresentation value={presentation} onChange={setPresentation} messages={messages} />
          <div className="week-glance-days">
            {(presentation === 'all' ? days : [anchor]).map((date) => dayColumn(date, { wide: true }))}
          </div>
        </div>
      ) : (
        <div className="week-board no-print">{days.map((date) => dayColumn(date))}</div>
      )}

      {visibleSections.has('shopping') && sections.shopping.length > 0 && (
        <section className="week-glance-shopping no-print" aria-label={t(messages, 'module.weekly_plan.shopping')}>
          <span className="week-glance-shopping-label">
            <ShoppingCart size={15} aria-hidden="true" /> {t(messages, 'module.weekly_plan.shopping')}
          </span>
          {sections.shopping.map((list) => (
            <button key={list.id} type="button" className="week-list-chip" onClick={() => openList(list)}>
              {list.title}
              <span>{t(messages, 'module.weekly_plan.shopping_open').replace('{count}', list.count)}</span>
            </button>
          ))}
        </section>
      )}

      {/* Printing keeps the whole week per section. */}
      <div className="weekly-plan-grid ui-print-only">
        {visibleSections.has('events') && (
          <Section
            sectionKey="events"
            title={t(messages, 'module.weekly_plan.events')}
            icon={CalendarDays}
            items={sections.events}
            emptyLabel={t(messages, 'module.weekly_plan.empty_section')}
            renderItem={(event) => (
              <WeeklyPlanItem
                key={`event-${event.id || event.title}`}
                onOpen={() => openEvent(event)}
                accent="events"
                meta={`${formatDate(eventDate(event), locale)} ${parseDate(eventDate(event))?.toLocaleTimeString(locale, timeOptions) || ''}`}
                title={event.title}
              />
            )}
          />
        )}
        {visibleSections.has('tasks') && (
          <Section
            sectionKey="tasks"
            title={t(messages, 'module.weekly_plan.tasks')}
            icon={ListChecks}
            items={sections.tasks}
            emptyLabel={t(messages, 'module.weekly_plan.empty_section')}
            renderItem={(task) => (
              <WeeklyPlanItem
                key={`task-${task.id || task.title}`}
                onOpen={() => go('tasks')}
                accent="tasks"
                meta={
                  formatDate(taskDate(task), locale) ||
                  t(messages, 'module.weekly_plan.no_due_date')
                }
                title={task.title}
              />
            )}
          />
        )}
        {visibleSections.has('meals') && (
          <Section
            sectionKey="meals"
            title={t(messages, 'module.weekly_plan.meals')}
            icon={Utensils}
            items={sections.meals}
            emptyLabel={t(messages, 'module.weekly_plan.empty_section')}
            renderItem={(meal) => (
              <WeeklyPlanItem
                key={`meal-${meal.id || meal.meal_name}`}
                accent="meals"
                meta={`${formatDate(mealDate(meal), locale)} ${slotLabel(meal.slot)}`}
                title={meal.meal_name || meal.title || meal.name}
                onOpen={() => openMeal(meal)}
                extra={recipeLink(meal)}
              />
            )}
          />
        )}
        {visibleSections.has('birthdays') && (
          <Section
            sectionKey="birthdays"
            title={t(messages, 'module.weekly_plan.birthdays')}
            icon={Cake}
            items={sections.birthdays}
            emptyLabel={t(messages, 'module.weekly_plan.empty_section')}
            renderItem={(birthday) => (
              <WeeklyPlanItem
                key={`birthday-${birthday.id || birthday.person_name || birthday.name}`}
                onOpen={() => go('contacts', 'tribu_contacts_tab', 'birthdays')}
                accent="birthdays"
                meta={formatDate(birthdayDate(birthday, range.start), locale)}
                title={birthday.person_name || birthday.name}
              />
            )}
          />
        )}
        {visibleSections.has('shopping') && (
          <Section
            sectionKey="shopping"
            title={t(messages, 'module.weekly_plan.shopping')}
            icon={ShoppingCart}
            items={sections.shopping}
            emptyLabel={t(messages, 'module.weekly_plan.empty_section')}
            renderItem={(item) => (
              <WeeklyPlanItem
                key={`shopping-${item.id || item.title}`}
                accent="shopping"
                meta={t(messages, 'module.weekly_plan.shopping_open').replace('{count}', item.count)}
                title={item.title}
                onOpen={() => openList(item)}
              />
            )}
          />
        )}
      </div>
    </main>
  );
}
