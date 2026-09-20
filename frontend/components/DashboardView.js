import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, ListChecks, Cake, Calendar, CheckCircle, CheckSquare, UserPlus, Circle, ShoppingCart, Utensils, Sparkles, Settings2, ArrowUp, ArrowDown, RotateCcw, MapPin, Search, ArrowRight, Clock, UserRound, Check, UtensilsCrossed, Sun, Moon } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { parseDate, parseServerInstant } from '../lib/helpers';
import { t } from '../lib/i18n';
import { getMemberColor } from '../lib/member-colors';
import { apiCompleteSetupChecklistStep, apiDismissSetupChecklist, apiGetDashboardLayout, apiGetSetupChecklist, apiListMealPlans, apiResetDashboardLayout, apiUpdateDashboardLayout } from '../lib/api';
import { useDashboardTasks } from '../hooks/useDashboardTasks';
import { useCurrentMinute } from '../hooks/useCurrentMinute';
import AssignedBadges from './AssignedBadges';
import MemberAvatar from './MemberAvatar';
import RewardsDashboardWidget from './RewardsDashboardWidget';
import QuickCaptureCard from './QuickCaptureCard';
import DashboardMealsCard from './DashboardMealsCard';
import HouseholdActivityFeed from './HouseholdActivityFeed';
import { DashboardModules, DashboardBadge, DashboardDateTile, DashboardCardHeading, DashboardWelcome, DashboardFooter } from './DashboardDetails';

const DEFAULT_DASHBOARD_LAYOUT = ['quick_capture', 'events', 'tasks', 'meals', 'daily_loop', 'birthdays', 'rewards', 'activity'];

function normalizeDashboardLayout(modules, availableModules = DEFAULT_DASHBOARD_LAYOUT) {
  const available = new Set(availableModules);
  const ordered = [];
  (Array.isArray(modules) ? modules : []).forEach((module) => {
    if (available.has(module) && !ordered.includes(module)) ordered.push(module);
  });
  const normalized = [...ordered];
  availableModules.forEach((module, defaultIndex) => {
    if (normalized.includes(module)) return;
    let insertAt = normalized.length;
    for (let i = defaultIndex + 1; i < availableModules.length; i += 1) {
      const nextDefaultModule = availableModules[i];
      const nextIndex = normalized.indexOf(nextDefaultModule);
      if (nextIndex !== -1) {
        insertAt = nextIndex;
        break;
      }
    }
    normalized.splice(insertAt, 0, module);
  });
  return normalized;
}

function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = parseDate(value);
  if (!parsed) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

function countOpenShoppingItems(lists) {
  return (Array.isArray(lists) ? lists : []).reduce((sum, list) => {
    if (!list) return sum;
    if (typeof list.item_count === 'number' || typeof list.checked_count === 'number') {
      return sum + Math.max(0, Number(list.item_count || 0) - Number(list.checked_count || 0));
    }
    const items = Array.isArray(list.items) ? list.items : [];
    return sum + items.filter((item) => !item?.checked && !item?.is_checked).length;
  }, 0);
}

function getEventOccurrenceDate(event) {
  return normalizeDateOnly(event?.starts_at) || normalizeDateOnly(event?.occurrence_date);
}

function getEventOccurrenceKey(event) {
  const date = getEventOccurrenceDate(event) || '';
  const startsAt = event?.starts_at ? String(event.starts_at) : '';
  return `${event?.id ?? event?.title ?? startsAt}:${date}:${startsAt}`;
}

function countTodayEvents(events, summary, today = todayIsoDate()) {
  const sources = [
    ...(Array.isArray(events) ? events : []),
    ...(Array.isArray(summary?.next_events) ? summary.next_events : []),
  ];
  const seen = new Set();
  return sources.reduce((count, event) => {
    if (getEventOccurrenceDate(event) !== today) return count;
    const key = getEventOccurrenceKey(event);
    if (seen.has(key)) return count;
    seen.add(key);
    return count + 1;
  }, 0);
}

function getOpenTaskCount(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => task?.status === 'open').length;
}

function getUpcomingBirthdayCount(summary) {
  return Array.isArray(summary?.upcoming_birthdays) ? summary.upcoming_birthdays.length : 0;
}

function formatEventTime(value, locale, timeFormat) {
  const date = parseDate(value);
  if (!date) return '';
  return formatClockTime(date, locale, timeFormat);
}

function formatClockTime(value, locale, timeFormat) {
  return value.toLocaleTimeString(locale, {
    hour: timeFormat === '12h' ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

function TodayStatusItem({ label, value, testId, icon: Icon, tone, onClick, detail, progress }) {
  return (
    <button type="button" className={`today-status-item today-status-item-${tone}`} onClick={onClick}>
      <span className="today-status-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2.1} />
      </span>
      <span className="today-status-value" data-testid={testId}>{value}</span>
      <span className="today-status-label">{label}</span>
      {detail && <span className="today-status-detail">{detail}</span>}
      {progress != null && <span className="dashboard-progress"><span style={{ width: `${progress}%` }} /></span>}
    </button>
  );
}

function DailyLoopCard({ routines, messages, setActiveView, completeTask, pendingTasks, canCompleteTask }) {
  const completed = routines.filter((task) => task.status === 'done').length;
  const percent = routines.length ? Math.round(completed / routines.length * 100) : 0;
  return (
    <section className="bento-card bento-daily-loop" role="region" aria-label={t(messages, 'module.dashboard.routines_title')}>
      <DashboardCardHeading title={t(messages, 'module.dashboard.routines_title')} icon={UtensilsCrossed} tone="amber" />
      <button type="button" className="dashboard-routine-ring" onClick={() => setActiveView('tasks')} aria-label={`${t(messages, 'module.dashboard.daily_loop_open_routines')}: ${percent}%`}>
        <svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="19" className="routine-ring-track" /><circle cx="23" cy="23" r="19" className="routine-ring-fill" strokeDasharray="119.38" strokeDashoffset={119.38 * (1 - percent / 100)} /></svg>
        <span>{percent}%</span>
      </button>
      <p className="dashboard-routine-summary">{t(messages, 'module.dashboard.routines_progress').replace('{completed}', completed).replace('{total}', routines.length)}</p>
      <div className="dashboard-routine-list">
        {routines.slice(0, 5).map((task) => (
          <div key={task.id} className={`dashboard-routine-row${task.status === 'done' ? ' is-done' : ''}`}>
            <button type="button" role="checkbox" aria-checked={task.status === 'done'} className="task-checkbox" disabled={!canCompleteTask(task) || pendingTasks.has(task.id) || task.status === 'done'} aria-label={t(messages, 'aria.mark_task').replace('{title}', task.title)} onClick={() => completeTask(task.id)}>{task.status === 'done' && <Check size={12} aria-hidden="true" />}</button>
            <button type="button" className="dashboard-row-link" onClick={() => setActiveView('tasks')}>{task.title}</button>
          </div>
        ))}
        {routines.length === 0 && <button type="button" className="dashboard-card-link" onClick={() => setActiveView('tasks')}>{t(messages, 'module.dashboard.daily_loop_open_routines')} <ArrowRight size={12} /></button>}
      </div>
    </section>
  );
}

function NextUpCard({ event, locale, lang, timeFormat, messages, members, setActiveView, isChild }) {
  const eventDate = event ? parseDate(event.starts_at) : null;
  const assigned = event?.assigned_to === 'all' ? members : members.filter((member) => Array.isArray(event?.assigned_to) ? event.assigned_to.includes(member.user_id) : String(member.user_id) === String(event?.assigned_to));
  const goToEvent = () => {
    if (eventDate) sessionStorage.setItem('tribu_calendar_focus', eventDate.toISOString());
    setActiveView('calendar');
  };
  const now = new Date();
  const distance = eventDate ? Math.round((Date.UTC(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000) : 0;
  return (
    <section className={`next-up-card${event ? '' : ' next-up-empty'}`} role="region" aria-label={t(messages, 'module.dashboard.next_up_title')}>
      <img className="next-up-landscape" src="/illustrations/family-landscape.svg" alt="" />
      <div className="next-up-heading">
        <h2 className="next-up-eyebrow"><DashboardBadge icon={Calendar} />{t(messages, 'module.dashboard.next_up_title')}</h2>
        {event && <span className="next-up-day-label">{new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(distance, 'day')}</span>}
      </div>
      {event ? (
        <button type="button" className="next-up-content" onClick={goToEvent}>
          <span className="next-up-time-chip"><DashboardDateTile value={event.starts_at} locale={locale} month /></span>
          <span className="next-up-details">
            <span className="next-up-title"><span className="event-dot" style={{ background: event.color || 'var(--amethyst)' }} />{event.title}</span>
            <span className="next-up-meta"><Clock size={12} aria-hidden="true" />{event.all_day ? t(messages, 'all_day') : `${formatEventTime(event.starts_at, locale, timeFormat)}${event.ends_at ? ` – ${formatEventTime(event.ends_at, locale, timeFormat)}` : ''}`}</span>
            {(assigned.length > 0 || event.location) && <span className="next-up-meta">{assigned.length ? <UserRound size={12} aria-hidden="true" /> : <MapPin size={12} aria-hidden="true" />}{assigned.length ? assigned.map((member) => member.display_name).join(', ') : event.location}</span>}
          </span>
          <span className="next-up-arrow" aria-hidden="true"><ArrowRight size={15} /></span>
        </button>
      ) : (
        <div className="next-up-clear">
          <div className="next-up-title">{t(messages, 'module.dashboard.next_up_empty')}</div>
          <p>{t(messages, 'module.dashboard.next_up_empty_hint')}</p>
          {!isChild && <button type="button" className="next-up-empty-action" onClick={goToEvent}>{t(messages, 'module.dashboard.empty_events_action')}</button>}
        </div>
      )}
      <span className="next-up-visual" aria-hidden="true"><Calendar size={37} strokeWidth={1.7} /></span>
      <p className="dashboard-handwritten next-up-quote">„{t(messages, 'module.dashboard.hero_note')}“</p>
    </section>
  );
}

function getGreeting(messages) {
  const h = new Date().getHours();
  if (h < 12) return t(messages, 'module.dashboard.greeting_morning');
  if (h < 18) return t(messages, 'module.dashboard.greeting_afternoon');
  return t(messages, 'module.dashboard.greeting_evening');
}

function ActivationPanel({ steps, completedCount, totalCount, messages, onDismiss }) {
  return (
    <section className="activation-panel setup-checklist-panel" aria-label={t(messages, 'module.dashboard.setup_checklist_title')}>
      <div className="activation-panel-header">
        <div>
          <h2 className="activation-panel-title">{t(messages, 'module.dashboard.setup_checklist_title')}</h2>
          <p className="activation-panel-subtitle">{t(messages, 'module.dashboard.setup_checklist_subtitle')}</p>
        </div>
        <div className="setup-checklist-progress" aria-label={t(messages, 'module.dashboard.setup_checklist_progress').replace('{completed}', completedCount).replace('{total}', totalCount)}>
          <span>{completedCount}/{totalCount}</span>
        </div>
      </div>
      <ul className="activation-step-list setup-checklist-list">
        {steps.map((step) => {
          const ariaLabel = step.done
            ? t(messages, 'module.dashboard.activation_step_done_aria')
            : t(messages, 'module.dashboard.activation_step_pending_aria');
          return (
            <li
              key={step.key}
              className={`activation-step${step.done ? ' activation-step-done' : ''}`}
              data-testid={`activation-step-${step.key}`}
            >
              <span className="activation-step-icon" aria-label={ariaLabel} role="img">
                {step.done ? <CheckCircle size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
              </span>
              <div className="activation-step-body">
                <div className="activation-step-title">{step.title}</div>
                <div className="activation-step-desc">{step.description}</div>
              </div>
              {step.done ? (
                <span className="activation-step-status">{step.doneLabel}</span>
              ) : (
                <button type="button" className="activation-step-cta" onClick={step.onClick}>
                  {step.ctaLabel}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="setup-checklist-footer">
        <button type="button" className="setup-checklist-dismiss" onClick={onDismiss}>
          {t(messages, 'module.dashboard.setup_checklist_dismiss')}
        </button>
      </div>
    </section>
  );
}

export default function DashboardView({ onOpenSearch, onOpenNotifications, unreadCount = 0, notificationButtonRef = null, onDashboardLayoutActionChange } = {}) {
  const { theme, setTheme, summary, me, members, tasks, setTasks, events, shoppingLists, mealPlans = [], activity = [], quickCaptureInbox, familyId, families, setActiveView, messages, lang, timeFormat, isChild, isAdmin, demoMode, loadQuickCaptureInbox, loadTasks, loadShoppingLists, loadActivity, loadDashboard } = useApp();
  const currentMinute = useCurrentMinute();
  const todayIso = todayIsoDate();
  const [setupChecklist, setSetupChecklist] = useState(null);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const { pendingTasks, taskError, completeTask, canCompleteTask } = useDashboardTasks({ familyId, demoMode, isChild, me, tasks, setTasks, loadTasks, loadDashboard, loadActivity });
  const [dashboardLayout, setDashboardLayout] = useState(DEFAULT_DASHBOARD_LAYOUT);
  const [mealResult, setMealResult] = useState({ familyId: null, date: null, meals: [], loading: true, error: false });
  const mealsToday = demoMode ? mealPlans.filter((meal) => meal.plan_date === todayIso)
    : mealResult.familyId === familyId && mealResult.date === todayIso ? mealResult.meals : [];
  const mealsTodayCount = mealsToday.length;
  const mealsLoading = !demoMode && Boolean(familyId) && (mealResult.loading || mealResult.familyId !== familyId || mealResult.date !== todayIso);
  const customizeLayoutLabel = t(messages, 'module.dashboard.customize_layout');
  const toggleDashboardLayoutEditing = useCallback(() => {
    setLayoutEditing((current) => !current);
  }, []);

  const openTasks = tasks.filter((task) => task.status === 'open');
  const shoppingOpenCount = useMemo(() => countOpenShoppingItems(shoppingLists), [shoppingLists]);
  const todayEventCount = useMemo(() => countTodayEvents(events, summary, todayIso), [events, summary, todayIso]);
  const openTaskCount = useMemo(() => getOpenTaskCount(tasks), [tasks]);
  const birthdaySoonCount = getUpcomingBirthdayCount(summary);
  const nextUpEvent = Array.isArray(summary?.next_events) ? summary.next_events[0] : null;
  const locale = lang || 'en';
  const todayStr = currentMinute.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const currentTimeStr = formatClockTime(currentMinute, locale, timeFormat);
  const currentFamily = Array.isArray(families) ? families.find((family) => String(family.family_id) === String(familyId)) : null;

  useEffect(() => {
    let cancelled = false;
    if (!familyId || demoMode || isChild) {
      setSetupChecklist(null);
      return () => { cancelled = true; };
    }
    apiGetSetupChecklist(familyId).then((res) => {
      if (!cancelled && res?.ok) setSetupChecklist(res.data);
    }).catch(() => {
      if (!cancelled) setSetupChecklist(null);
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode, isChild]);

  useEffect(() => {
    let cancelled = false;
    if (demoMode) {
      setDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
      return () => { cancelled = true; };
    }
    apiGetDashboardLayout().then((res) => {
      if (!cancelled && res?.ok) setDashboardLayout(normalizeDashboardLayout(res.data?.modules));
    }).catch(() => {
      if (!cancelled) setDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
    });
    return () => { cancelled = true; };
  }, [demoMode]);

  useEffect(() => {
    let cancelled = false;
    if (!familyId || demoMode) {
      return () => { cancelled = true; };
    }
    setMealResult({ familyId, date: todayIso, meals: [], loading: true, error: false });
    apiListMealPlans(familyId, todayIso, todayIso).then((res) => {
      if (!cancelled) setMealResult({ familyId, date: todayIso, meals: res?.ok && Array.isArray(res.data) ? res.data : [], loading: false, error: !res?.ok });
    }).catch(() => {
      if (!cancelled) setMealResult({ familyId, date: todayIso, meals: [], loading: false, error: true });
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode, todayIso]);

  useEffect(() => {
    if (typeof onDashboardLayoutActionChange !== 'function') return undefined;
    onDashboardLayoutActionChange({
      label: customizeLayoutLabel,
      pressed: layoutEditing,
      onClick: toggleDashboardLayoutEditing,
    });
    return () => onDashboardLayoutActionChange(null);
  }, [customizeLayoutLabel, layoutEditing, onDashboardLayoutActionChange, toggleDashboardLayoutEditing]);

  const safeShoppingLists = Array.isArray(shoppingLists) ? shoppingLists : [];
  const hasShoppingContent = safeShoppingLists.some((list) => {
    if (!list) return false;
    const items = Array.isArray(list.items) ? list.items : [];
    return items.length > 0;
  }) || safeShoppingLists.length > 0;
  const inviteDone = members.length >= 2;
  const eventDone = events.length > 0;
  const taskDone = tasks.length > 0;
  const shoppingDone = hasShoppingContent;

  const fallbackChecklistSteps = [];
  if (isAdmin) {
    fallbackChecklistSteps.push({
      key: 'members',
      done: inviteDone,
      title: t(messages, 'module.dashboard.setup_step_members_title'),
      description: t(messages, 'module.dashboard.setup_step_members_desc'),
      ctaLabel: t(messages, 'module.dashboard.setup_step_members_cta'),
      doneLabel: t(messages, 'module.dashboard.setup_step_done'),
      onClick: () => setActiveView('admin'),
    });
  }
  fallbackChecklistSteps.push(
    {
      key: 'event',
      done: eventDone,
      title: t(messages, 'module.dashboard.activation_step_event_title'),
      description: t(messages, 'module.dashboard.activation_step_event_desc'),
      ctaLabel: t(messages, 'module.dashboard.activation_step_event_cta'),
      doneLabel: t(messages, 'module.dashboard.activation_step_event_done'),
      onClick: () => setActiveView('calendar'),
      icon: Calendar,
    },
    {
      key: 'task',
      done: taskDone,
      title: t(messages, 'module.dashboard.activation_step_task_title'),
      description: t(messages, 'module.dashboard.activation_step_task_desc'),
      ctaLabel: t(messages, 'module.dashboard.activation_step_task_cta'),
      doneLabel: t(messages, 'module.dashboard.activation_step_task_done'),
      onClick: () => setActiveView('tasks'),
      icon: CheckSquare,
    },
    {
      key: 'shopping',
      done: shoppingDone,
      title: t(messages, 'module.dashboard.activation_step_shopping_title'),
      description: t(messages, 'module.dashboard.activation_step_shopping_desc'),
      ctaLabel: t(messages, 'module.dashboard.activation_step_shopping_cta'),
      doneLabel: t(messages, 'module.dashboard.activation_step_shopping_done'),
      onClick: () => setActiveView('shopping'),
      icon: ShoppingCart,
    },
  );

  const checklistIconMap = {
    members: UserPlus,
    calendar: Calendar,
    tasks: CheckSquare,
    shopping: ShoppingCart,
    meal_plan: Utensils,
    routine: CheckSquare,
    phone_sync: Sparkles,
    backup_guidance: CheckCircle,
  };
  const checklistViewMap = {
    members: 'admin',
    calendar: 'calendar',
    tasks: 'tasks',
    shopping: 'shopping',
    meal_plan: 'meal_plans',
    routine: 'tasks',
    phone_sync: 'settings',
    backup_guidance: 'admin',
  };
  const manualChecklistKeys = new Set(['phone_sync', 'backup_guidance']);
  const handleCompleteSetupChecklistStep = async (stepKey) => {
    if (!familyId) return;
    const response = await apiCompleteSetupChecklistStep(familyId, stepKey).catch(() => null);
    if (response?.ok) {
      setSetupChecklist(response.data);
    }
  };
  const remoteChecklistSteps = Array.isArray(setupChecklist?.steps)
    ? setupChecklist.steps.map((step) => {
        const titleKey = `module.dashboard.setup_step_${step.key}_title`;
        const descKey = `module.dashboard.setup_step_${step.key}_desc`;
        const ctaKey = manualChecklistKeys.has(step.key)
          ? 'module.dashboard.setup_step_manual_cta'
          : `module.dashboard.setup_step_${step.key}_cta`;
        return {
          key: step.key,
          done: Boolean(step.completed),
          title: t(messages, titleKey),
          description: t(messages, descKey),
          ctaLabel: t(messages, ctaKey),
          doneLabel: t(messages, 'module.dashboard.setup_step_done'),
          onClick: manualChecklistKeys.has(step.key)
            ? () => handleCompleteSetupChecklistStep(step.key)
            : () => setActiveView(step.target_view || checklistViewMap[step.key] || 'dashboard'),
          icon: checklistIconMap[step.key] || Circle,
        };
      })
    : [];
  const checklistSteps = remoteChecklistSteps.length > 0 ? remoteChecklistSteps : fallbackChecklistSteps;
  const checklistCompletedCount = setupChecklist?.completed_count ?? checklistSteps.filter((step) => step.done).length;
  const checklistTotalCount = setupChecklist?.total_count ?? checklistSteps.length;
  const showActivationPanel = !isChild && checklistSteps.length > 0 && (setupChecklist?.show_on_dashboard ?? (!(setupChecklist?.dismissed) && checklistCompletedCount < checklistTotalCount));
  const handleDismissSetupChecklist = async () => {
    if (!familyId) return;
    setSetupChecklist((current) => current ? { ...current, dismissed: true, show_on_dashboard: false } : current);
    const response = await apiDismissSetupChecklist(familyId).catch(() => null);
    if (response?.ok) setSetupChecklist(response.data);
  };

  const moveDashboardModule = async (moduleKey, direction) => {
    const current = normalizeDashboardLayout(dashboardLayout, availableDashboardModules);
    const index = current.indexOf(moduleKey);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDashboardLayout(next);
    if (!demoMode) {
      const response = await apiUpdateDashboardLayout(next).catch(() => null);
      if (response?.ok) setDashboardLayout(normalizeDashboardLayout(response.data?.modules, availableDashboardModules));
    }
  };

  const resetDashboardModules = async () => {
    setDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
    if (!demoMode) {
      const response = await apiResetDashboardLayout().catch(() => null);
      if (response?.ok) setDashboardLayout(normalizeDashboardLayout(response.data?.modules, availableDashboardModules));
    }
  };

  const availableDashboardModules = isChild
    ? DEFAULT_DASHBOARD_LAYOUT.filter((module) => module !== 'quick_capture')
    : DEFAULT_DASHBOARD_LAYOUT;
  const orderedDashboardLayout = normalizeDashboardLayout(dashboardLayout, availableDashboardModules);
  const moduleOrder = (moduleKey) => orderedDashboardLayout.indexOf(moduleKey);
  const moduleLabel = (moduleKey) => t(messages, moduleKey === 'meals' ? 'module.meal_plans.name' : `module.dashboard.module_${moduleKey}`);
  const heroName = me?.display_name || currentFamily?.family_name || 'User';

  return (
    <div className="dashboard-today-page">
      <section className="today-command-center" role="region" aria-label={t(messages, 'module.dashboard.today_command_center')}>
        <div className="today-command-header">
          <div>
            <h1 className="view-title today-command-title">
              {getGreeting(messages)}, <span>{heroName}</span>
            </h1>
            <p className="today-command-family">
              <span>{todayStr}</span>
              <span className="today-command-time-separator" aria-hidden="true"> · </span>
              <time
                className="today-command-clock"
                data-testid="dashboard-clock"
                dateTime={currentMinute.toISOString()}
                aria-label={`${t(messages, 'module.dashboard.current_time')}: ${currentTimeStr}`}
                suppressHydrationWarning
              >
                {currentTimeStr}
              </time>
              <DashboardWelcome messages={messages} />
            </p>
          </div>
          <div className="dashboard-header-actions">
            {typeof onOpenSearch === 'function' && (
              <button
                type="button"
                className="dashboard-search-btn"
                onClick={onOpenSearch}
                aria-label={t(messages, 'search.placeholder')}
              >
                <Search size={16} aria-hidden="true" />
                <span className="dashboard-search-placeholder">{t(messages, 'search.placeholder')}</span>
                <kbd className="dashboard-search-kbd">⌘K</kbd>
              </button>
            )}
            {typeof onOpenNotifications === 'function' && (
              <button
                ref={notificationButtonRef}
                type="button"
                className="dashboard-icon-action dashboard-notifications-action"
                onClick={onOpenNotifications}
                aria-label={t(messages, 'notifications')}
              >
                <Bell size={17} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="dashboard-action-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            {typeof setTheme === 'function' && <button type="button" className="dashboard-icon-action" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={t(messages, 'module.dashboard.toggle_theme')}>{theme === 'light' ? <Sun size={20} strokeWidth={1.6} /> : <Moon size={20} strokeWidth={1.6} />}</button>}
            <button
              type="button"
              className="dashboard-layout-toggle"
              onClick={toggleDashboardLayoutEditing}
              aria-label={customizeLayoutLabel}
              aria-pressed={layoutEditing}
              title={customizeLayoutLabel}
            >
              <Settings2 size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="today-command-grid">
          <NextUpCard
            event={nextUpEvent}
            locale={locale}
            lang={lang}
            timeFormat={timeFormat}
            messages={messages}
            members={members}
            setActiveView={setActiveView}
            isChild={isChild}
          />
          <div className="today-status-card" role="group" aria-label={t(messages, 'module.dashboard.today_status_label')}>
            <div className="today-status-heading"><span><span className="dashboard-wave" aria-hidden="true">👋</span>{t(messages, 'module.dashboard.today_status_label')}</span><span className="today-status-date">{currentMinute.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</span></div>
            <div className="today-status-grid">
              <TodayStatusItem icon={Calendar} tone="events" label={t(messages, 'module.dashboard.today_status_events')} value={todayEventCount} detail={t(messages, 'module.dashboard.planned_short')} testId="today-status-events" onClick={() => setActiveView('calendar')} />
              <TodayStatusItem icon={CheckCircle} tone="tasks" label={t(messages, 'module.dashboard.today_status_tasks')} value={openTaskCount} detail={t(messages, 'module.dashboard.completed_short').replace('{count}', tasks.filter((task) => task.status === 'done').length)} progress={tasks.length ? tasks.filter((task) => task.status === 'done').length / tasks.length * 100 : 0} testId="today-status-tasks" onClick={() => setActiveView('tasks')} />
              <TodayStatusItem icon={ShoppingCart} tone="shopping" label={t(messages, 'module.dashboard.today_status_shopping')} value={shoppingOpenCount} detail={t(messages, 'module.dashboard.open_short').replace('{count}', shoppingOpenCount)} testId="today-status-shopping" onClick={() => setActiveView('shopping')} />
              <TodayStatusItem icon={Utensils} tone="meals" label={t(messages, 'module.dashboard.meals_label')} value={mealsLoading || (!demoMode && mealResult.error) ? '–' : mealsTodayCount} detail={t(messages, 'module.dashboard.planned_short')} testId="today-status-meals" onClick={() => setActiveView('meal_plans')} />
              <TodayStatusItem icon={Cake} tone="birthdays" label={t(messages, 'module.dashboard.today_status_birthdays')} value={birthdaySoonCount} detail={t(messages, 'module.dashboard.birthdays_short')} testId="today-status-birthdays" onClick={() => setActiveView('contacts')} />
            </div>
          </div>
        </div>

      </section>

      {layoutEditing && (
        <section className="dashboard-layout-panel" aria-label={t(messages, 'module.dashboard.customize_layout')}>
          <div className="dashboard-layout-panel-header">
            <div>
              <h2>{t(messages, 'module.dashboard.customize_layout')}</h2>
              <p>{t(messages, 'module.dashboard.customize_layout_hint')}</p>
            </div>
            <button type="button" className="dashboard-layout-reset" onClick={resetDashboardModules}>
              <RotateCcw size={14} aria-hidden="true" />
              {t(messages, 'module.dashboard.reset_layout')}
            </button>
          </div>
          <ol className="dashboard-layout-list">
            {orderedDashboardLayout.map((moduleKey, index) => (
              <li key={moduleKey} className="dashboard-layout-item">
                <span>{moduleLabel(moduleKey)}</span>
                <span className="dashboard-layout-controls">
                  <button type="button" onClick={() => moveDashboardModule(moduleKey, -1)} disabled={index === 0} aria-label={t(messages, 'module.dashboard.move_module_up').replace('{module}', moduleLabel(moduleKey))}>
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveDashboardModule(moduleKey, 1)} disabled={index === orderedDashboardLayout.length - 1} aria-label={t(messages, 'module.dashboard.move_module_down').replace('{module}', moduleLabel(moduleKey))}>
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {taskError && <p role="alert" className="quick-capture-error">{t(messages, 'toast.error')}</p>}
      <DashboardModules>
        {!isChild && (
          <div className="dashboard-module-shell" style={{ order: moduleOrder('quick_capture') }} data-dashboard-module="quick_capture">
            <QuickCaptureCard
              familyId={familyId}
              inbox={quickCaptureInbox}
              messages={messages}
              setActiveView={setActiveView}
              loadQuickCaptureInbox={loadQuickCaptureInbox}
              loadTasks={loadTasks}
              loadShoppingLists={loadShoppingLists}
              loadActivity={loadActivity}
            />
          </div>
        )}

        <div className="dashboard-module-shell" style={{ order: moduleOrder('daily_loop') }} data-dashboard-module="daily_loop">
          <DailyLoopCard
            routines={tasks.filter((task) => task.recurrence && (task.status === 'done' ? normalizeDateOnly(parseServerInstant(task.completed_at)) === todayIso : task.status === 'open' && normalizeDateOnly(task.due_date) && normalizeDateOnly(task.due_date) <= todayIso))}
            completeTask={completeTask}
            pendingTasks={pendingTasks}
            canCompleteTask={canCompleteTask}
            messages={messages}
            setActiveView={setActiveView}
          />
        </div>

        {/* Events Card */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('events') }} data-dashboard-module="events">
        <div className="bento-card bento-events bento-card-illustrated" role="region" aria-label={t(messages, 'next_events')}>
          <DashboardCardHeading icon={Calendar} tone="purple" title={t(messages, 'next_events')} action={t(messages, 'module.rewards.view_all')} onClick={() => setActiveView('calendar')} />
          <div className="event-list">
            {summary.next_events?.length === 0 && (
              <div className="bento-empty">
                <span>{t(messages, 'module.dashboard.empty_events')}</span>
              </div>
            )}
            {summary.next_events?.slice(0, 4).map((ev, i) => (
              <button type="button" key={`${ev.id}:${ev.starts_at}`} className="event-item" onClick={() => { sessionStorage.setItem('tribu_calendar_focus', parseDate(ev.starts_at).toISOString()); setActiveView('calendar'); }}>
                <DashboardDateTile value={ev.starts_at} locale={locale} month />
                <div className="event-info">
                  <div className="event-title"><span className="event-dot" style={{ background: ev.color || getMemberColor(null, i) }} aria-hidden="true" />{ev.title}</div>
                  <div className="event-meta"><Clock size={11} aria-hidden="true" />{ev.all_day ? t(messages, 'all_day') : `${formatEventTime(ev.starts_at, locale, timeFormat)}${ev.ends_at ? ` – ${formatEventTime(ev.ends_at, locale, timeFormat)}` : ''}`}</div>
                  {ev.location && <div className="event-meta"><MapPin size={11} aria-hidden="true" />{ev.location}</div>}
                </div>
                <AssignedBadges assignedTo={ev.assigned_to} members={members} />
              </button>
            ))}
          </div>
        </div>
        </div>

        {/* Tasks Card */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('tasks') }} data-dashboard-module="tasks">
        <div className="bento-card bento-tasks bento-card-illustrated" role="region" aria-label={t(messages, 'module.dashboard.open_tasks')}>
          <DashboardCardHeading icon={ListChecks} tone="amber" title={t(messages, 'module.dashboard.open_tasks')} action={t(messages, 'module.rewards.view_all')} onClick={() => setActiveView('tasks')} />
          <div className="task-preview-list">
            {openTasks.length === 0 && (
              <div className="bento-empty">
                <span>{tasks.length > 0 ? t(messages, 'module.dashboard.empty_tasks') : t(messages, 'module.tasks.no_tasks')}</span>
                {!isChild && <button className="bento-empty-action" onClick={() => setActiveView('tasks')}>{t(messages, 'module.dashboard.empty_tasks_action')}</button>}
              </div>
            )}
            {openTasks.slice(0, 5).map((task) => {
              const assignee = members.find((m) => m.user_id === task.assigned_to_user_id);
              return (
                <div key={task.id} className="task-preview-item">
                  <button type="button" role="checkbox" aria-checked={false} className="task-checkbox" disabled={!canCompleteTask(task) || pendingTasks.has(task.id)} aria-label={t(messages, 'aria.mark_task').replace('{title}', task.title)} onClick={() => completeTask(task.id)} />
                  <div className="task-preview-info">
                    <button type="button" className="task-preview-title dashboard-row-link" onClick={() => setActiveView('tasks')}>{task.title}</button>

                  </div>
                  {assignee && <span className="dashboard-task-person" style={{ '--person-color': getMemberColor(assignee, members.indexOf(assignee)) }}>{assignee.display_name}</span>}
                  {task.due_date && <span className={`dashboard-task-due${normalizeDateOnly(task.due_date) <= todayIso ? ' is-due' : ''}`}>{normalizeDateOnly(task.due_date) === todayIso ? t(messages, 'module.calendar.today') : parseDate(task.due_date)?.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>}

                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Birthdays Card */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('birthdays') }} data-dashboard-module="birthdays">
        <div className="bento-card bento-birthdays bento-card-illustrated" role="region" aria-label={t(messages, 'upcoming_birthdays_4w')}>
          <DashboardCardHeading icon={Cake} tone="purple" title={t(messages, 'upcoming_birthdays_4w')} action={t(messages, 'module.rewards.view_all')} onClick={() => setActiveView('contacts')} />
          <div className="birthday-list">
            {summary.upcoming_birthdays?.length === 0 && (
              <div className="bento-empty">{t(messages, 'module.dashboard.empty_birthdays')}</div>
            )}
            {summary.upcoming_birthdays?.slice(0, 3).map((b, i) => {
              const c = b.days_until <= 3
                ? { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }
                : b.days_until <= 7
                ? { bg: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }
                : { bg: 'rgba(120,130,180,0.08)', color: 'var(--text-muted)' };
              return (
                <div key={i} className="birthday-item">
                  <MemberAvatar member={{ display_name: b.person_name }} index={i} size={41} />
                  <div className="birthday-info">
                    <div className="birthday-countdown">{new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(b.days_until, 'day')}</div>
                    <div className="birthday-name">{b.person_name}</div>
                    <div className="birthday-date">{b.occurs_on}</div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
        </div>

        <div className="dashboard-module-shell" style={{ order: moduleOrder('meals') }} data-dashboard-module="meals">
          <DashboardMealsCard meals={mealsToday} loading={mealsLoading} error={!demoMode && mealResult.error} messages={messages} setActiveView={setActiveView} />
        </div>
        <div className="dashboard-module-shell" style={{ order: moduleOrder('activity') }} data-dashboard-module="activity">
          <HouseholdActivityFeed activity={activity} messages={messages} lang={lang} limit={3} dashboard />
        </div>

        {/* Rewards Widget */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('rewards') }} data-dashboard-module="rewards">
          <RewardsDashboardWidget />
        </div>

        {showActivationPanel && (
          <div className="dashboard-module-shell dashboard-activation-shell" data-dashboard-module="setup_checklist">
            <ActivationPanel
              steps={checklistSteps}
              completedCount={checklistCompletedCount}
              totalCount={checklistTotalCount}
              messages={messages}
              onDismiss={handleDismissSetupChecklist}
            />
          </div>
        )}
      </DashboardModules>
      <DashboardFooter messages={messages} />
    </div>
  );
}
