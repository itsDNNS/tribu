import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ListChecks, Cake, Users, Calendar, CheckCircle, CheckSquare, UserPlus, Circle, ShoppingCart, Utensils, Sparkles, Printer, Settings2, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { prettyDate, parseDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { getMemberColor } from '../lib/member-colors';
import { apiCompleteSetupChecklistStep, apiDismissSetupChecklist, apiGetDashboardLayout, apiGetSetupChecklist, apiListMealPlans, apiResetDashboardLayout, apiUpdateDashboardLayout } from '../lib/api';
import AssignedBadges from './AssignedBadges';
import MemberAvatar from './MemberAvatar';
import RewardsDashboardWidget from './RewardsDashboardWidget';
import HouseholdActivityFeed from './HouseholdActivityFeed';
import QuickCaptureCard from './QuickCaptureCard';

const DEFAULT_DASHBOARD_LAYOUT = ['quick_capture', 'daily_loop', 'events', 'tasks', 'birthdays', 'activity', 'rewards'];

function normalizeDashboardLayout(modules, availableModules = DEFAULT_DASHBOARD_LAYOUT) {
  const available = new Set(availableModules);
  const ordered = [];
  (Array.isArray(modules) ? modules : []).forEach((module) => {
    if (available.has(module) && !ordered.includes(module)) ordered.push(module);
  });
  return ordered.concat(availableModules.filter((module) => !ordered.includes(module)));
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

function countDueRoutines(tasks, today = todayIsoDate()) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (!task || task.status !== 'open' || !task.recurrence) return false;
    const dueDate = normalizeDateOnly(task.due_date);
    return Boolean(dueDate) && dueDate <= today;
  }).length;
}

function DailyLoopCard({ mealsTodayCount, shoppingOpenCount, routineDueCount, messages, setActiveView }) {
  const hasDailyInputs = mealsTodayCount > 0 || shoppingOpenCount > 0 || routineDueCount > 0;
  const items = [
    {
      key: 'meals',
      icon: Utensils,
      value: mealsTodayCount,
      label: t(messages, 'module.dashboard.daily_loop_meals'),
      actionLabel: t(messages, 'module.dashboard.daily_loop_open_meals'),
      onClick: () => setActiveView('meal_plans'),
    },
    {
      key: 'shopping',
      icon: ShoppingCart,
      value: shoppingOpenCount,
      label: t(messages, 'module.dashboard.daily_loop_shopping'),
      actionLabel: t(messages, 'module.dashboard.daily_loop_open_shopping'),
      onClick: () => setActiveView('shopping'),
    },
    {
      key: 'routines',
      icon: ListChecks,
      value: routineDueCount,
      label: t(messages, 'module.dashboard.daily_loop_routines'),
      actionLabel: t(messages, 'module.dashboard.daily_loop_open_routines'),
      onClick: () => setActiveView('tasks'),
    },
  ];

  return (
    <div className="bento-card bento-daily-loop" role="region" aria-label={t(messages, 'module.dashboard.daily_loop_title')}>
      <div className="bento-card-header daily-loop-header">
        <div>
          <h2 className="bento-card-title"><Sparkles size={16} aria-hidden="true" /> {t(messages, 'module.dashboard.daily_loop_title')}</h2>
          <p className="daily-loop-subtitle">{t(messages, 'module.dashboard.daily_loop_subtitle')}</p>
        </div>
      </div>
      <div className="daily-loop-list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="daily-loop-item">
              <span className="daily-loop-icon" aria-hidden="true"><Icon size={16} /></span>
              <div className="daily-loop-copy">
                <span className="daily-loop-value" data-testid={`daily-loop-${item.key}`}>{item.value}</span>
                <span className="daily-loop-label">{item.label}</span>
              </div>
              <button type="button" className="daily-loop-action" onClick={item.onClick}>{item.actionLabel}</button>
            </div>
          );
        })}
      </div>
      {!hasDailyInputs && <div className="daily-loop-empty">{t(messages, 'module.dashboard.daily_loop_empty')}</div>}
    </div>
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

export default function DashboardView() {
  const { summary, me, members, tasks, events, shoppingLists, activity, quickCaptureInbox, familyId, setActiveView, messages, lang, timeFormat, isChild, isAdmin, demoMode, loadQuickCaptureInbox, loadTasks, loadShoppingLists, loadActivity } = useApp();
  const todayIso = useMemo(() => todayIsoDate(), []);
  const [mealsTodayCount, setMealsTodayCount] = useState(0);
  const [setupChecklist, setSetupChecklist] = useState(null);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [dashboardLayout, setDashboardLayout] = useState(DEFAULT_DASHBOARD_LAYOUT);

  const openTasks = tasks.filter((task) => task.status === 'open');
  const shoppingOpenCount = useMemo(() => countOpenShoppingItems(shoppingLists), [shoppingLists]);
  const routineDueCount = useMemo(() => countDueRoutines(tasks, todayIso), [tasks, todayIso]);
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const todayStr = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    let cancelled = false;
    if (!familyId || demoMode) {
      setMealsTodayCount(0);
      return () => { cancelled = true; };
    }

    apiListMealPlans(familyId, todayIso, todayIso).then((res) => {
      if (cancelled) return;
      const items = Array.isArray(res?.data?.items) ? res.data.items : Array.isArray(res?.data) ? res.data : [];
      setMealsTodayCount(items.length);
    }).catch(() => {
      if (!cancelled) setMealsTodayCount(0);
    });

    return () => { cancelled = true; };
  }, [familyId, demoMode, todayIso]);

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

  const todayEventCount = (summary.next_events || []).filter((ev) => {
    const d = parseDate(ev.starts_at);
    if (!d) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  const adultQuickActions = [
    { key: 'event', label: t(messages, 'module.dashboard.quick_event'), icon: Calendar, onClick: () => setActiveView('calendar') },
    { key: 'task', label: t(messages, 'module.dashboard.quick_task'), icon: CheckSquare, onClick: () => setActiveView('tasks') },
    { key: 'shopping', label: t(messages, 'module.dashboard.quick_shopping'), icon: ShoppingCart, onClick: () => setActiveView('shopping') },
    { key: 'weekly-plan', label: t(messages, 'module.dashboard.quick_weekly_plan'), icon: Printer, onClick: () => setActiveView('weekly_plan') },
    ...(isAdmin ? [{ key: 'invite', label: t(messages, 'module.dashboard.quick_invite'), icon: UserPlus, onClick: () => setActiveView('admin') }] : []),
  ];

  const quickActions = isChild
    ? [
        { key: 'my-tasks', label: t(messages, 'module.dashboard.quick_my_tasks'), icon: CheckSquare, onClick: () => setActiveView('tasks') },
        { key: 'rewards', label: t(messages, 'module.dashboard.quick_rewards'), icon: CheckCircle, onClick: () => setActiveView('rewards') },
      ]
    : adultQuickActions;

  const heroChips = [
    ...(isAdmin ? [{ key: 'members', testId: 'hero-chip-members', value: members.length, label: t(messages, 'module.dashboard.chip_members'), icon: Users, onClick: () => setActiveView('admin') }] : []),
    { key: 'events', testId: 'hero-chip-events', value: todayEventCount, label: t(messages, 'module.dashboard.chip_today_events'), icon: CalendarClock, onClick: () => setActiveView('calendar') },
    { key: 'tasks', testId: 'hero-chip-tasks', value: openTasks.length, label: t(messages, 'module.dashboard.chip_open_tasks'), icon: ListChecks, onClick: () => setActiveView('tasks') },
  ];

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

  const summaryText = (() => {
    let s = todayEventCount > 0
      ? t(messages, 'module.dashboard.summary_events').replace('{count}', todayEventCount)
      : t(messages, 'module.dashboard.summary_no_events');
    if (openTasks.length > 0) {
      s += t(messages, 'module.dashboard.summary_tasks').replace('{count}', openTasks.length);
    } else {
      s += '.';
    }
    return s;
  })();
  const availableDashboardModules = isChild
    ? DEFAULT_DASHBOARD_LAYOUT.filter((module) => module !== 'quick_capture')
    : DEFAULT_DASHBOARD_LAYOUT;
  const orderedDashboardLayout = normalizeDashboardLayout(dashboardLayout, availableDashboardModules);
  const moduleOrder = (moduleKey) => orderedDashboardLayout.indexOf(moduleKey);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{getGreeting(messages)}, {me?.display_name || 'User'}</h1>
          <div className="view-subtitle">{summaryText}</div>
        </div>
        <div className="dashboard-header-actions">
          <div className="view-date">{todayStr}</div>
          <button type="button" className="dashboard-layout-toggle" onClick={() => setLayoutEditing((current) => !current)}>
            <Settings2 size={15} aria-hidden="true" />
            <span>{t(messages, 'module.dashboard.customize_layout')}</span>
          </button>
        </div>
      </div>

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
                <span>{t(messages, `module.dashboard.module_${moduleKey}`)}</span>
                <span className="dashboard-layout-controls">
                  <button type="button" onClick={() => moveDashboardModule(moduleKey, -1)} disabled={index === 0} aria-label={t(messages, 'module.dashboard.move_module_up').replace('{module}', t(messages, `module.dashboard.module_${moduleKey}`))}>
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => moveDashboardModule(moduleKey, 1)} disabled={index === orderedDashboardLayout.length - 1} aria-label={t(messages, 'module.dashboard.move_module_down').replace('{module}', t(messages, `module.dashboard.module_${moduleKey}`))}>
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div
        className="hero-context-chips"
        role="group"
        aria-label={t(messages, 'module.dashboard.context_chips_label')}
      >
        {heroChips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.key}
              type="button"
              className="hero-chip"
              data-testid={chip.testId}
              onClick={chip.onClick}
            >
              <span className="hero-chip-icon" aria-hidden="true"><Icon size={14} /></span>
              <span className="hero-chip-value">{chip.value}</span>
              <span className="hero-chip-label">{chip.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className="dashboard-quick-actions"
        role="group"
        aria-label={t(messages, 'module.dashboard.quick_actions_label')}
      >
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              className="quick-action-pill"
              data-testid={`quick-action-${action.key}`}
              onClick={action.onClick}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>

      {showActivationPanel && (
        <ActivationPanel
          steps={checklistSteps}
          completedCount={checklistCompletedCount}
          totalCount={checklistTotalCount}
          messages={messages}
          onDismiss={handleDismissSetupChecklist}
        />
      )}

      <div className="bento-grid">
        {!isChild && (
          <div className="dashboard-module-shell" style={{ order: moduleOrder('quick_capture') }} data-dashboard-module="quick_capture">
            <QuickCaptureCard
              familyId={familyId}
              inbox={quickCaptureInbox}
              messages={messages}
              loadQuickCaptureInbox={loadQuickCaptureInbox}
              loadTasks={loadTasks}
              loadShoppingLists={loadShoppingLists}
              loadActivity={loadActivity}
            />
          </div>
        )}

        <div className="dashboard-module-shell" style={{ order: moduleOrder('daily_loop') }} data-dashboard-module="daily_loop">
          <DailyLoopCard
            mealsTodayCount={mealsTodayCount}
            shoppingOpenCount={shoppingOpenCount}
            routineDueCount={routineDueCount}
            messages={messages}
            setActiveView={setActiveView}
          />
        </div>

        {/* Events Card */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('events') }} data-dashboard-module="events">
        <div className="bento-card bento-events" role="region" aria-label={t(messages, 'next_events')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><CalendarClock size={16} aria-hidden="true" /> {t(messages, 'next_events')}</h2>
            <button className="bento-more" onClick={() => setActiveView('calendar')}>{t(messages, 'module.dashboard.all')}</button>
          </div>
          <div className="event-list">
            {summary.next_events?.length === 0 && (
              <div className="bento-empty">
                <span>{t(messages, 'module.dashboard.empty_events')}</span>
                {!isChild && <button className="bento-empty-action" onClick={() => setActiveView('calendar')}>{t(messages, 'module.dashboard.empty_events_action')}</button>}
              </div>
            )}
            {summary.next_events?.slice(0, 4).map((ev, i) => {
              const goToEvent = () => {
                const d = parseDate(ev.starts_at);
                if (d) sessionStorage.setItem('tribu_calendar_focus', d.toISOString());
                setActiveView('calendar');
              };
              return (
              <div key={ev.id} className="event-item" style={{ cursor: 'pointer' }} onClick={goToEvent} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToEvent(); } }}>
                <div className="event-time">{parseDate(ev.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' })}</div>
                <div className="event-dot" style={{ background: ev.color || getMemberColor(null, i) }} aria-hidden="true" />
                <div className="event-info">
                  <div className="event-title">{ev.title}</div>
                  <div className="event-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {prettyDate(ev.starts_at, lang, timeFormat)}
                    <AssignedBadges assignedTo={ev.assigned_to} members={members} />
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Tasks Card */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('tasks') }} data-dashboard-module="tasks">
        <div className="bento-card bento-tasks" role="region" aria-label={t(messages, 'module.dashboard.open_tasks')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><ListChecks size={16} aria-hidden="true" /> {t(messages, 'module.dashboard.open_tasks')}</h2>
            <button className="bento-more" onClick={() => setActiveView('tasks')}>{t(messages, 'module.dashboard.all')}</button>
          </div>
          <div className="task-preview-list">
            {openTasks.length === 0 && (
              <div className="bento-empty">
                <span>{tasks.length > 0 ? t(messages, 'module.dashboard.empty_tasks') : t(messages, 'module.tasks.no_tasks')}</span>
                {!isChild && <button className="bento-empty-action" onClick={() => setActiveView('tasks')}>{t(messages, 'module.dashboard.empty_tasks_action')}</button>}
              </div>
            )}
            {openTasks.slice(0, 5).map((task) => {
              const assignee = members.find((m) => m.user_id === task.assigned_to_user_id);
              const priorityColor = task.priority === 'high' ? 'var(--danger)' : task.priority === 'normal' ? 'var(--amethyst)' : 'var(--sapphire)';
              return (
                <div key={task.id} className="task-preview-item">
                  <div className="task-preview-info">
                    <div className="task-preview-title">{task.title}</div>
                  </div>
                  <div className="task-priority-dot" style={{ background: priorityColor }} aria-hidden="true" />
                  {assignee && <MemberAvatar member={assignee} index={members.indexOf(assignee)} size={22} />}
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Birthdays Card */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('birthdays') }} data-dashboard-module="birthdays">
        <div className="bento-card bento-birthdays" role="region" aria-label={t(messages, 'upcoming_birthdays_4w')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><Cake size={16} aria-hidden="true" /> {t(messages, 'upcoming_birthdays_4w')}</h2>
          </div>
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
                  <div className="birthday-avatar" style={{ background: c.bg }} aria-hidden="true"><Cake size={16} style={{ color: c.color }} /></div>
                  <div className="birthday-info">
                    <div className="birthday-name">{b.person_name}</div>
                    <div className="birthday-date">{b.occurs_on}</div>
                  </div>
                  <div className="birthday-countdown" style={{ background: c.bg, color: c.color }}>
                    {b.days_until} {t(messages, 'module.dashboard.days')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>

        <div className="dashboard-module-shell" style={{ order: moduleOrder('activity') }} data-dashboard-module="activity">
          <HouseholdActivityFeed activity={activity} messages={messages} lang={lang} />
        </div>

        {/* Rewards Widget */}
        <div className="dashboard-module-shell" style={{ order: moduleOrder('rewards') }} data-dashboard-module="rewards">
          <RewardsDashboardWidget />
        </div>
      </div>
    </div>
  );
}
