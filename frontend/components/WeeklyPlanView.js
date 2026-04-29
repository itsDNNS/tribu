import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Printer, ShoppingCart, Utensils, Cake, ArrowLeft } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiGetEvents, apiListMealPlans } from '../lib/api';
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
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
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
  return years.map((year) => `${year}-${monthDay}`).find((candidate) => candidate >= range.startIso && candidate <= range.endIso) || `${startYear}-${monthDay}`;
}

function openShoppingCount(list) {
  if (typeof list?.item_count === 'number' || typeof list?.checked_count === 'number') {
    return Math.max(0, Number(list.item_count || 0) - Number(list.checked_count || 0));
  }
  return (Array.isArray(list?.items) ? list.items : []).filter((item) => !item?.checked && !item?.is_checked).length;
}

function compareByDate(getter) {
  return (a, b) => String(normalizeDateOnly(getter(a)) || '').localeCompare(String(normalizeDateOnly(getter(b)) || ''));
}

function asStringId(value) {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function assignedListMatches(assignedTo, selectedMemberId) {
  if (!selectedMemberId) return true;
  if (!assignedTo || assignedTo === 'all') return true;
  if (Array.isArray(assignedTo)) return assignedTo.map(String).includes(selectedMemberId);
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
  { key: 'shopping', labelKey: 'module.weekly_plan.shopping', icon: ShoppingCart },
];

export function buildWeeklyPlanSections({ weekStart, events = [], tasks = [], meals = [], birthdays = [], shoppingLists = [], memberId = '' }) {
  const selectedMemberId = asStringId(memberId);
  const openShopping = (Array.isArray(shoppingLists) ? shoppingLists : [])
    .map((list) => ({ id: list.id, title: list.name || list.title, detail: `${openShoppingCount(list)} open`, count: openShoppingCount(list) }))
    .filter((item) => item.count > 0);

  return {
    events: (Array.isArray(events) ? events : [])
      .filter((event) => isWithinWeek(eventDate(event), weekStart) && assignedListMatches(event?.assigned_to, selectedMemberId))
      .sort(compareByDate(eventDate)),
    tasks: (Array.isArray(tasks) ? tasks : [])
      .filter((task) => task?.status === 'open' && isWithinWeek(taskDate(task), weekStart) && assignedUserMatches(task?.assigned_to_user_id, selectedMemberId))
      .sort(compareByDate(taskDate)),
    meals: (Array.isArray(meals) ? meals : [])
      .filter((meal) => isWithinWeek(mealDate(meal), weekStart) && assignedUserMatches(meal?.assigned_to_user_id || meal?.member_id || meal?.user_id, selectedMemberId))
      .sort(compareByDate(mealDate)),
    birthdays: (Array.isArray(birthdays) ? birthdays : [])
      .filter((birthday) => {
        const next = birthdayDate(birthday, weekStart);
        return next && isWithinWeek(next, weekStart) && assignedUserMatches(birthday?.user_id || birthday?.member_id, selectedMemberId);
      })
      .sort((a, b) => String(birthdayDate(a, weekStart)).localeCompare(String(birthdayDate(b, weekStart)))),
    shopping: openShopping,
  };
}

function formatDate(value, locale) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function formatWeekLabel(range, locale) {
  return `${range.start.toLocaleDateString(locale, { day: '2-digit', month: 'short' })} – ${range.end.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function Section({ title, icon: Icon, items, emptyLabel, renderItem }) {
  return (
    <section className="weekly-plan-section" role="region" aria-label={title}>
      <h2><Icon size={17} aria-hidden="true" /> {title}</h2>
      {items.length ? <ul>{items.map(renderItem)}</ul> : <p className="weekly-plan-empty">{emptyLabel}</p>}
    </section>
  );
}

export default function WeeklyPlanView({ initialDate, initialMeals = null, initialEvents = null }) {
  const { events = [], tasks = [], shoppingLists = [], birthdays = [], members = [], familyId, messages, lang, timeFormat, setActiveView } = useApp();
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const [anchor, setAnchor] = useState(initialDate || new Date());
  const [meals, setMeals] = useState(initialMeals || []);
  const [weeklyEvents, setWeeklyEvents] = useState(initialEvents || events);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [visibleSections, setVisibleSections] = useState(() => new Set(SECTION_CONFIG.map((section) => section.key)));
  const range = useMemo(() => getWeekRange(anchor), [anchor]);

  useEffect(() => {
    if (initialEvents !== null) return;
    setWeeklyEvents(events);
  }, [events, initialEvents]);

  useEffect(() => {
    let cancelled = false;
    if (initialEvents !== null || !familyId) return () => { cancelled = true; };
    apiGetEvents(familyId, range.startIso, range.endIso).then((res) => {
      if (cancelled) return;
      setWeeklyEvents(Array.isArray(res?.data) ? res.data : []);
    }).catch(() => {
      if (!cancelled) setWeeklyEvents([]);
    });
    return () => { cancelled = true; };
  }, [familyId, initialEvents, range.startIso, range.endIso]);

  useEffect(() => {
    let cancelled = false;
    if (initialMeals || !familyId) return () => { cancelled = true; };
    apiListMealPlans(familyId, range.startIso, range.endIso).then((res) => {
      if (cancelled) return;
      const items = Array.isArray(res?.data?.items) ? res.data.items : Array.isArray(res?.data) ? res.data : [];
      setMeals(items);
    }).catch(() => {
      if (!cancelled) setMeals([]);
    });
    return () => { cancelled = true; };
  }, [familyId, initialMeals, range.startIso, range.endIso]);

  const sections = useMemo(() => buildWeeklyPlanSections({ weekStart: range.start, events: weeklyEvents, tasks, meals, birthdays, shoppingLists, memberId: selectedMemberId }), [range.start, weeklyEvents, tasks, meals, birthdays, shoppingLists, selectedMemberId]);
  const timeOptions = timeFormat === '12h' ? { hour: 'numeric', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit', hour12: false };
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

  return (
    <main className="weekly-plan-page print-surface">
      <div className="weekly-plan-toolbar no-print">
        <button type="button" className="btn-secondary" onClick={() => setActiveView('dashboard')}><ArrowLeft size={16} /> {t(messages, 'module.weekly_plan.back_dashboard')}</button>
        <div className="weekly-plan-nav">
          <button type="button" className="btn-secondary" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft size={16} /> {t(messages, 'module.weekly_plan.previous_week')}</button>
          <button type="button" className="btn-secondary" onClick={() => setAnchor(new Date())}>{t(messages, 'module.weekly_plan.this_week')}</button>
          <button type="button" className="btn-secondary" onClick={() => setAnchor(addDays(anchor, 7))}>{t(messages, 'module.weekly_plan.next_week')} <ChevronRight size={16} /></button>
        </div>
        <button type="button" className="btn-primary no-print" onClick={() => window.print()}><Printer size={16} /> {t(messages, 'module.weekly_plan.print')}</button>
      </div>
      <fieldset className="weekly-plan-filters no-print" aria-label={t(messages, 'module.weekly_plan.filters')}>
        <label className="weekly-plan-member-filter">
          <span>{t(messages, 'module.weekly_plan.filter_member')}</span>
          <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
            <option value="">{t(messages, 'module.weekly_plan.filter_all_members')}</option>
            {members.map((member) => (
              <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.display_name || member.name || member.email}</option>
            ))}
          </select>
        </label>
        <div className="weekly-plan-section-filters" aria-label={t(messages, 'module.weekly_plan.filter_sections')}>
          {SECTION_CONFIG.map((section) => (
            <label key={section.key}>
              <input
                type="checkbox"
                checked={visibleSections.has(section.key)}
                onChange={() => toggleSection(section.key)}
              />
              <span>{t(messages, section.labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <header className="weekly-plan-header">
        <p className="eyebrow">Tribu</p>
        <h1>{t(messages, 'module.weekly_plan.title')}</h1>
        <p>{t(messages, 'module.weekly_plan.subtitle')}</p>
        <strong>{formatWeekLabel(range, locale)}</strong>
      </header>
      <div className="weekly-plan-grid">
        {visibleSections.has('events') && <Section title={t(messages, 'module.weekly_plan.events')} icon={CalendarDays} items={sections.events} emptyLabel={t(messages, 'module.weekly_plan.empty_section')} renderItem={(event) => (
          <li key={`event-${event.id || event.title}`}><span>{formatDate(eventDate(event), locale)} {parseDate(eventDate(event))?.toLocaleTimeString(locale, timeOptions)}</span><strong>{event.title}</strong></li>
        )} />}
        {visibleSections.has('tasks') && <Section title={t(messages, 'module.weekly_plan.tasks')} icon={ListChecks} items={sections.tasks} emptyLabel={t(messages, 'module.weekly_plan.empty_section')} renderItem={(task) => (
          <li key={`task-${task.id || task.title}`}><span>{formatDate(taskDate(task), locale) || t(messages, 'module.weekly_plan.no_due_date')}</span><strong>{task.title}</strong></li>
        )} />}
        {visibleSections.has('meals') && <Section title={t(messages, 'module.weekly_plan.meals')} icon={Utensils} items={sections.meals} emptyLabel={t(messages, 'module.weekly_plan.empty_section')} renderItem={(meal) => (
          <li key={`meal-${meal.id || meal.meal_name}`}><span>{formatDate(mealDate(meal), locale)} {meal.slot || meal.meal_type || ''}</span><strong>{meal.meal_name || meal.title || meal.name}</strong></li>
        )} />}
        {visibleSections.has('birthdays') && <Section title={t(messages, 'module.weekly_plan.birthdays')} icon={Cake} items={sections.birthdays} emptyLabel={t(messages, 'module.weekly_plan.empty_section')} renderItem={(birthday) => (
          <li key={`birthday-${birthday.id || birthday.person_name || birthday.name}`}><span>{formatDate(birthdayDate(birthday, range.start), locale)}</span><strong>{birthday.person_name || birthday.name}</strong></li>
        )} />}
        {visibleSections.has('shopping') && <Section title={t(messages, 'module.weekly_plan.shopping')} icon={ShoppingCart} items={sections.shopping} emptyLabel={t(messages, 'module.weekly_plan.empty_section')} renderItem={(item) => (
          <li key={`shopping-${item.id || item.title}`}><span>{item.detail}</span><strong>{item.title}</strong></li>
        )} />}
      </div>
    </main>
  );
}
