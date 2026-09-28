import { useEffect, useMemo, useState } from 'react';
import { Cake, Check, ChevronDown, CloudOff, Inbox, ShoppingCart, Sparkles, Utensils, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useTasks } from '../../hooks/useTasks';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';
import { useSwipeActions } from '../../hooks/useSwipeActions';
import { apiConvertQuickCapture, apiDismissQuickCapture, apiGetEvents, apiListMealPlans } from '../../lib/api';
import { t, tc } from '../../lib/i18n';
import { NO_HIDDEN_AREAS } from '../../lib/navigation';
import { getMemberColor } from '../../lib/member-colors';
import { buildToday } from '../../lib/today/buildToday';
import { clock, dayLabel, greeting, isoDate } from '../../lib/today/todayFormat';
import { peekHandOff, takeHandOff } from '../../lib/handoff';
import MemberAvatar from '../MemberAvatar';
import SwipeReveal, { swipeStyle } from '../SwipeReveal';
import RewardsDashboardWidget from '../RewardsDashboardWidget';
import { SetupChecklist, useSetupChecklist } from './SetupChecklist';
import KidsToday from './KidsToday';

const DAYS = 7;

function openShopping(setActiveView) {
  try { sessionStorage.setItem('tribu_shopping_trip', '1'); } catch { /* private mode */ }
  setActiveView('shopping');
}

function openCalendarDay(setActiveView, iso, time) {
  const [year, month, day] = iso.split('-').map(Number);
  const [hour, minute] = (time || '08:00').split(':').map(Number);
  try {
    sessionStorage.setItem('tribu_calendar_focus', new Date(year, month - 1, day, hour, minute).toISOString());
  } catch { /* private mode */ }
  setActiveView('calendar');
}

function People({ ids, members, messages }) {
  if (!ids.length) return null;
  if (members.length > 2 && ids.length >= members.length) {
    return <span className="today-people-all">{t(messages, 'module.tasks.all')}</span>;
  }
  const people = ids.map((id) => members.find((member) => Number(member.user_id) === Number(id))).filter(Boolean);
  return (
    <span className="today-people" aria-label={people.map((member) => member.display_name).join(', ')}>
      {people.slice(0, 3).map((member) => (
        <MemberAvatar key={member.user_id} member={member} index={members.indexOf(member)} size={24} />
      ))}
      {people.length > 3 && <span className="today-people-more">+{people.length - 3}</span>}
    </span>
  );
}

function TodayRow({ item, task, past, ctx, timeLabel = null }) {
  const { messages, locale, timeFormat, members, setActiveView, toggleTask, canComplete } = ctx;
  const title = item.kind === 'birthday'
    ? t(messages, 'module.today.birthday').replace('{name}', item.title)
    : item.title;
  const firstPerson = members.find((member) => item.people.includes(Number(member.user_id)));
  const open = () => {
    if (item.kind === 'event') openCalendarDay(setActiveView, item.date, item.time);
    else setActiveView({ task: 'tasks', meal: 'meal_plans', birthday: 'contacts' }[item.kind]);
  };
  // Tribu 2.0 (N-4): swipe right to finish a task, as in the task list.
  const swipeable = Boolean(task) && !item.done && canComplete(task);
  const { offset, handlers } = useSwipeActions({
    enabled: swipeable,
    onSwipeRight: swipeable ? () => toggleTask(task) : undefined,
  });
  const row = (
    <div className={`today-row today-row-${item.kind}${past ? ' past' : ''}${item.done ? ' done' : ''}${swipeable ? ' swipe-slide' : ''}`} style={swipeStyle(offset)} {...(swipeable ? handlers : {})}>
      <span className={`today-row-time${timeLabel ? ' overdue' : ''}`}>
        {timeLabel || (item.kind === 'meal' ? t(messages, `module.meal_plans.slot.${item.slot}`) : clock(item.time, locale, timeFormat))}
        {item.endTime && <small>{clock(item.endTime, locale, timeFormat)}</small>}
      </span>
      {item.kind === 'task' ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          className={`task-row-check${item.done ? ' checked' : ''}`}
          aria-label={t(messages, 'aria.mark_task').replace('{title}', item.title)}
          disabled={!task || !canComplete(task)}
          onClick={() => task && toggleTask(task)}
        >
          {item.done && <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
      ) : (
        <span className={`today-row-mark today-row-mark-${item.kind}`} aria-hidden="true">
          {item.kind === 'event' && <span className="today-row-dot" style={{ background: firstPerson ? getMemberColor(firstPerson, members.indexOf(firstPerson)) : 'var(--color-accent)' }} />}
          {item.kind === 'meal' && <Utensils size={16} />}
          {item.kind === 'birthday' && <Cake size={16} />}
        </span>
      )}
      <button type="button" className="today-row-main" onClick={open}>
        <span className="today-row-title">{title}</span>
        {task?.waiting && (
          <span className="today-row-waiting">
            <CloudOff size={13} aria-hidden="true" />
            {t(messages, 'offline.waiting')}
          </span>
        )}
      </button>
      <People ids={item.people} members={members} messages={messages} />
    </div>
  );
  if (!swipeable) return <li>{row}</li>;
  return (
    <li className="swipe-shell">
      <SwipeReveal offset={offset} right={{ icon: <Check size={18} />, label: t(messages, 'module.tasks.done'), tone: 'success' }} />
      {row}
    </li>
  );
}

function InboxHint({ items, members, messages, familyId, loadQuickCaptureInbox, loadTasks, loadShoppingLists }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const run = async (id, action, reload) => {
    setBusyId(id);
    try {
      const result = await action();
      if (result?.ok) await Promise.allSettled([loadQuickCaptureInbox?.(familyId), reload?.(familyId)]);
    } finally {
      setBusyId(null);
    }
  };
  // A child's entry is a suggestion (Tribu 2.0, E5).
  const suggestedBy = (item) => {
    if (!item.suggested_by_user_id) return '';
    const member = members.find((m) => Number(m.user_id) === Number(item.suggested_by_user_id));
    return member?.display_name?.split(' ')[0] || '';
  };
  return (
    <section className="today-hint" aria-label={t(messages, 'module.dashboard.quick_capture_inbox_title')}>
      <div className="today-hint-head">
        <span className="today-hint-icon" aria-hidden="true"><Inbox size={18} /></span>
        <span className="today-hint-text">{tc(messages, 'module.dashboard.quick_capture_inbox_count', items.length)}</span>
        <button type="button" className="today-hint-action" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {t(messages, 'module.today.inbox_review')}
          <ChevronDown size={14} className={open ? 'open' : ''} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul className="today-inbox">
          {items.map((item) => (
            <li key={item.id}>
              <span className="today-inbox-text">
                {item.text}
                {suggestedBy(item) && (
                  <small>{t(messages, 'module.today.suggested_by').replace('{name}', suggestedBy(item))}</small>
                )}
              </span>
              <span className="today-inbox-actions">
                <button type="button" disabled={busyId === item.id} onClick={() => run(item.id, () => apiConvertQuickCapture(item.id, { destination: 'task' }), loadTasks)}>
                  {t(messages, 'module.dashboard.quick_capture_to_task')}
                </button>
                <button type="button" disabled={busyId === item.id} onClick={() => run(item.id, () => apiConvertQuickCapture(item.id, { destination: 'shopping' }), loadShoppingLists)}>
                  {t(messages, 'module.dashboard.quick_capture_to_shopping')}
                </button>
                <button type="button" disabled={busyId === item.id} aria-label={t(messages, 'module.dashboard.quick_capture_dismiss')} onClick={() => run(item.id, () => apiDismissQuickCapture(item.id))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function countOpenShopping(lists) {
  return (Array.isArray(lists) ? lists : []).reduce((sum, list) => {
    if (!list) return sum;
    if (typeof list.item_count === 'number' || typeof list.checked_count === 'number') {
      return sum + Math.max(0, Number(list.item_count || 0) - Number(list.checked_count || 0));
    }
    return sum + (Array.isArray(list.items) ? list.items : []).filter((item) => !item?.checked && !item?.is_checked).length;
  }, 0);
}

// Today (Tribu 2.0): the day as one timeline, the overdue tasks folded away,
// the week ahead in a line per day and hints only when they help.
export default function TodayView({ onOpenCapture } = {}) {
  const {
    summary, me, members = [], events = [], shoppingLists, mealPlans = [], quickCaptureInbox, familyId,
    families, setActiveView, messages, lang, timeFormat, isChild, isAdmin, demoMode,
    loadQuickCaptureInbox, loadTasks, loadShoppingLists, hiddenAreas = NO_HIDDEN_AREAS,
  } = useApp();
  const tk = useTasks();
  const now = useCurrentMinute();
  const today = isoDate(now);
  const locale = lang || 'en';
  // The family hub opens someone's day.
  const [memberId, setMemberId] = useState(() => peekHandOff('today_member') ?? null);
  useEffect(() => { takeHandOff('today_member'); }, []);
  const [setupOpen, setSetupOpen] = useState(false);
  const [range, setRange] = useState({ key: null, events: [] });
  const [meals, setMeals] = useState({ key: null, items: [] });
  const rangeKey = `${familyId}:${today}`;

  // The week's occurrences, reloaded when the family's events change.
  useEffect(() => {
    if (!familyId || demoMode) return undefined;
    let cancelled = false;
    const [year, month, day] = today.split('-').map(Number);
    const start = new Date(year, month - 1, day);
    const end = new Date(year, month - 1, day + DAYS);
    apiGetEvents(familyId, start.toISOString(), end.toISOString()).then((res) => {
      if (!cancelled && res?.ok && Array.isArray(res.data)) setRange({ key: rangeKey, events: res.data });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [familyId, demoMode, today, rangeKey, events]);

  useEffect(() => {
    if (!familyId || demoMode) return undefined;
    let cancelled = false;
    apiListMealPlans(familyId, today, today).then((res) => {
      if (!cancelled && res?.ok && Array.isArray(res.data)) setMeals({ key: rangeKey, items: res.data });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [familyId, demoMode, today, rangeKey]);

  const dayEvents = demoMode ? events : range.key === rangeKey ? range.events : events;
  const dayMeals = demoMode ? mealPlans : meals.key === rangeKey ? meals.items : [];

  const day = useMemo(() => buildToday({
    now,
    events: dayEvents,
    tasks: tk.visibleTasks,
    meals: dayMeals,
    birthdays: summary?.upcoming_birthdays || [],
    members,
    // Children see only their own day (Tribu 2.0, F5).
    memberId: isChild ? me?.user_id ?? null : memberId,
    days: DAYS,
  }), [now, dayEvents, tk.visibleTasks, dayMeals, summary, members, memberId, isChild, me]);

  const setup = useSetupChecklist({
    familyId, demoMode, isChild, isAdmin, members, events, tasks: tk.visibleTasks, shoppingLists, messages, setActiveView,
  });
  const inboxItems = (Array.isArray(quickCaptureInbox) ? quickCaptureInbox : [])
    .filter((item) => item && (!item.status || item.status === 'open'));
  const shoppingCount = countOpenShopping(shoppingLists);
  const shoppingTime = now.getHours() >= 15 || now.getDay() === 6;
  // Someone else out shopping right now (Tribu 2.0, L4).
  const shopper = (Array.isArray(shoppingLists) ? shoppingLists : [])
    .map((list) => list?.shopper)
    .find((entry) => entry && Number(entry.user_id) !== Number(me?.user_id));
  const showShopping = Boolean(shopper) || (shoppingCount > 0 && shoppingTime);
  const tasksById = new Map(tk.visibleTasks.map((task) => [task.id, task]));
  const canComplete = (task) => !isChild || (me?.user_id != null && String(task.assigned_to_user_id) === String(me.user_id));
  const ctx = {
    messages, locale, timeFormat, members, setActiveView, toggleTask: tk.toggleTask, canComplete,
  };
  const hasTimed = day.today.some((item) => item.time || item.kind === 'meal');
  const heroName = me?.display_name?.split(' ')[0]
    || (Array.isArray(families) ? families.find((family) => String(family.family_id) === String(familyId))?.family_name : null)
    || '';
  const nowLabel = clock(`${now.getHours()}:${now.getMinutes()}`, locale, timeFormat);

  const rows = [];
  day.today.forEach((item, index) => {
    if (hasTimed && index === day.nowIndex) rows.push(<NowMarker key="now" label={nowLabel} messages={messages} />);
    rows.push(
      <TodayRow
        // Stable while the week's events load, so rows are not remounted.
        key={`${item.kind}-${item.id ?? item.title}-${item.time ?? ''}`}
        item={item}
        task={item.kind === 'task' ? tasksById.get(item.id) : null}
        past={index < day.nowIndex && Boolean(item.time || item.kind === 'meal') && !(item.kind === 'task' && !item.done)}
        ctx={ctx}
      />,
    );
  });
  if (hasTimed && day.nowIndex >= day.today.length) rows.push(<NowMarker key="now" label={nowLabel} messages={messages} />);

  if (isChild) {
    return (
      <KidsToday
        day={day}
        tasksById={tasksById}
        toggleTask={tk.toggleTask}
        canComplete={canComplete}
        name={heroName}
        now={now}
        locale={locale}
        timeFormat={timeFormat}
        messages={messages}
        showRewards={!hiddenAreas.includes('rewards')}
        onOpenRewards={() => setActiveView('rewards')}
        onSuggest={onOpenCapture}
      />
    );
  }

  return (
    <div className="today-page">
      <header className="today-head">
        <div>
          <h1>{greeting(messages, now.getHours())}{heroName ? `, ${heroName}` : ''}</h1>
          <p>{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="today-main">
        {members.length > 1 && (
          <div className="person-filter" role="group" aria-label={t(messages, 'module.today.filter')}>
            {[{ key: null, label: t(messages, 'module.tasks.all') }, ...members.map((member) => ({ key: member.user_id, label: member.display_name?.split(' ')[0], member }))].map((filter) => (
              <button
                key={filter.key ?? 'all'}
                type="button"
                className={`person-filter-chip${memberId === filter.key ? ' active' : ''}`}
                aria-pressed={memberId === filter.key}
                onClick={() => setMemberId(filter.key)}
              >
                {filter.member && <MemberAvatar member={filter.member} index={members.indexOf(filter.member)} size={22} />}
                {filter.label}
              </button>
            ))}
          </div>
        )}

        {(setup.show || inboxItems.length > 0 || showShopping) && (
          <div className="today-hints">
            {showShopping && (
              <section className="today-hint" aria-label={t(messages, 'module.shopping.name')}>
                <div className="today-hint-head">
                  <span className="today-hint-icon" aria-hidden="true"><ShoppingCart size={18} /></span>
                  <span className="today-hint-text">
                    {shopper
                      ? t(messages, 'module.shopping.shopper_now').replace('{name}', shopper.display_name?.split(' ')[0] || shopper.display_name)
                      : tc(messages, 'module.today.shopping_hint', shoppingCount)}
                  </span>
                  <button type="button" className="today-hint-action" onClick={() => (shopper ? setActiveView('shopping') : openShopping(setActiveView))}>
                    {t(messages, shopper ? 'module.today.shopping_view' : 'module.today.shopping_start')}
                  </button>
                </div>
              </section>
            )}
            {inboxItems.length > 0 && !isChild && (
              <InboxHint
                items={inboxItems}
                members={members}
                messages={messages}
                familyId={familyId}
                loadQuickCaptureInbox={loadQuickCaptureInbox}
                loadTasks={loadTasks}
                loadShoppingLists={loadShoppingLists}
              />
            )}
            {setup.show && (
              <section className="today-hint" aria-label={t(messages, 'module.dashboard.setup_checklist_title')}>
                <div className="today-hint-head">
                  <span className="today-hint-icon" aria-hidden="true"><Sparkles size={18} /></span>
                  <span className="today-hint-text">
                    {t(messages, 'module.today.setup_hint').replace('{completed}', setup.completed).replace('{total}', setup.total)}
                  </span>
                  <button type="button" className="today-hint-action" aria-expanded={setupOpen} onClick={() => setSetupOpen((value) => !value)}>
                    {t(messages, 'module.today.setup_continue')}
                    <ChevronDown size={14} className={setupOpen ? 'open' : ''} aria-hidden="true" />
                  </button>
                </div>
                {setupOpen && (
                  <SetupChecklist steps={setup.steps} completed={setup.completed} total={setup.total} messages={messages} onDismiss={setup.dismiss} />
                )}
              </section>
            )}
          </div>
        )}

        <section className="today-day" aria-labelledby="today-day-title">
          <h2 id="today-day-title" className="today-section-title">{t(messages, 'module.today.title')}</h2>
          {day.today.length > 0 ? (
            <ol className="today-list">{rows}</ol>
          ) : (
            <div className="today-empty">
              <span>{t(messages, 'module.today.empty')}</span>
              {typeof onOpenCapture === 'function' && (
                <button type="button" className="bento-empty-action" onClick={onOpenCapture}>{t(messages, 'module.today.empty_action')}</button>
              )}
            </div>
          )}
        </section>

        {day.overdue.length > 0 && (
          <details className="today-overdue">
            <summary className="today-section-title">
              {t(messages, 'module.today.still_open')}
              <span className="today-count">{day.overdue.length}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <ol className="today-list">
              {day.overdue.map((item) => {
                const label = dayLabel(item.date, locale);
                return (
                  <TodayRow
                    key={`overdue-${item.id}`}
                    item={{ ...item, time: null }}
                    task={tasksById.get(item.id)}
                    past={false}
                    ctx={ctx}
                    timeLabel={`${label.weekday} ${label.date}`}
                  />
                );
              })}
            </ol>
          </details>
        )}
      </div>

      <aside className="today-side">
        {day.week.length > 0 && (
          <section className="today-week" aria-labelledby="today-week-title">
            <h2 id="today-week-title" className="today-section-title">{t(messages, 'module.today.week')}</h2>
            <ul>
              {day.week.map((entry) => {
                const label = dayLabel(entry.date, locale);
                return (
                  <li key={entry.date}>
                    <button type="button" className="today-week-day" onClick={() => openCalendarDay(setActiveView, entry.date)}>
                      <span className="today-week-label"><strong>{label.weekday}</strong>{label.date}</span>
                      <span className="today-week-items">
                        {entry.items.map((item, index) => (
                          <span key={`${item.kind}-${item.id ?? item.title}-${index}`} className={`today-week-item today-week-${item.kind}`}>
                            {item.kind === 'birthday' ? t(messages, 'module.today.birthday').replace('{name}', item.title) : item.title}
                            {item.time && <em>{clock(item.time, locale, timeFormat)}</em>}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {!hiddenAreas.includes('rewards') && <RewardsDashboardWidget />}
      </aside>
    </div>
  );
}

function NowMarker({ label, messages }) {
  return (
    <li className="today-now" aria-label={`${t(messages, 'module.today.now')} ${label}`}>
      <span className="today-row-time">{label}</span>
      <span className="today-now-line" aria-hidden="true" />
    </li>
  );
}
