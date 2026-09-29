import { useEffect, useState } from 'react';
import { Calendar, CheckCircle, CheckSquare, Circle, ShoppingCart, Sparkles, UserPlus, Utensils } from 'lucide-react';
import { apiCompleteSetupChecklistStep, apiDismissSetupChecklist, apiGetSetupChecklist } from '../../lib/api';
import { t } from '../../lib/i18n';

const ICONS = {
  members: UserPlus,
  calendar: Calendar,
  tasks: CheckSquare,
  shopping: ShoppingCart,
  meal_plan: Utensils,
  routine: CheckSquare,
  phone_sync: Sparkles,
  backup_guidance: CheckCircle,
};
const VIEWS = {
  members: 'admin',
  calendar: 'calendar',
  tasks: 'tasks',
  shopping: 'shopping',
  meal_plan: 'meal_plans',
  routine: 'tasks',
  phone_sync: 'settings',
  backup_guidance: 'admin',
};
const MANUAL = new Set(['phone_sync', 'backup_guidance']);

// The first-week setup steps: from the backend, or worked out from what the
// family already has when the backend has none.
export function useSetupChecklist({ familyId, demoMode, isChild, isAdmin, members, events, tasks, shoppingLists, messages, setActiveView }) {
  const [checklist, setChecklist] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!familyId || demoMode || isChild) {
      setChecklist(null);
      return () => { cancelled = true; };
    }
    apiGetSetupChecklist(familyId).then((res) => {
      if (!cancelled && res?.ok) setChecklist(res.data);
    }).catch(() => {
      if (!cancelled) setChecklist(null);
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode, isChild]);

  const completeStep = async (key) => {
    if (!familyId) return;
    const response = await apiCompleteSetupChecklistStep(familyId, key).catch(() => null);
    if (response?.ok) setChecklist(response.data);
  };

  const dismiss = async () => {
    if (!familyId) return;
    setChecklist((current) => (current ? { ...current, dismissed: true, show_on_dashboard: false } : current));
    const response = await apiDismissSetupChecklist(familyId).catch(() => null);
    if (response?.ok) setChecklist(response.data);
  };

  const step = (key, done, prefix, view) => ({
    key,
    done,
    title: t(messages, `${prefix}_title`),
    description: t(messages, `${prefix}_desc`),
    ctaLabel: t(messages, `${prefix}_cta`),
    doneLabel: t(messages, key === 'members' ? 'module.dashboard.setup_step_done' : `${prefix}_done`),
    onClick: () => setActiveView(view),
  });
  const fallback = [
    ...(isAdmin ? [step('members', members.length >= 2, 'module.dashboard.setup_step_members', 'admin')] : []),
    step('event', events.length > 0, 'module.dashboard.activation_step_event', 'calendar'),
    step('task', tasks.length > 0, 'module.dashboard.activation_step_task', 'tasks'),
    step('shopping', (Array.isArray(shoppingLists) ? shoppingLists : []).length > 0, 'module.dashboard.activation_step_shopping', 'shopping'),
  ];
  const remote = Array.isArray(checklist?.steps)
    ? checklist.steps.map((item) => ({
      key: item.key,
      done: Boolean(item.completed),
      title: t(messages, `module.dashboard.setup_step_${item.key}_title`),
      description: t(messages, `module.dashboard.setup_step_${item.key}_desc`),
      ctaLabel: t(messages, MANUAL.has(item.key) ? 'module.dashboard.setup_step_manual_cta' : `module.dashboard.setup_step_${item.key}_cta`),
      doneLabel: t(messages, 'module.dashboard.setup_step_done'),
      onClick: MANUAL.has(item.key)
        ? () => completeStep(item.key)
        : () => setActiveView(item.target_view || VIEWS[item.key] || 'dashboard'),
      icon: ICONS[item.key] || Circle,
    }))
    : [];
  const steps = remote.length > 0 ? remote : fallback;
  const completed = checklist?.completed_count ?? steps.filter((item) => item.done).length;
  const total = checklist?.total_count ?? steps.length;
  const show = !isChild && steps.length > 0
    && (checklist?.show_on_dashboard ?? (!checklist?.dismissed && completed < total));
  return { steps, completed, total, show, dismiss };
}

export function SetupChecklist({ steps, completed, total, messages, onDismiss }) {
  return (
    <section className="activation-panel setup-checklist-panel" aria-label={t(messages, 'module.dashboard.setup_checklist_title')}>
      <div className="activation-panel-header">
        <div>
          <h2 className="activation-panel-title">{t(messages, 'module.dashboard.setup_checklist_title')}</h2>
          <p className="activation-panel-subtitle">{t(messages, 'module.dashboard.setup_checklist_subtitle')}</p>
        </div>
        <div className="setup-checklist-progress" aria-label={t(messages, 'module.dashboard.setup_checklist_progress').replace('{completed}', completed).replace('{total}', total)}>
          <span>{completed}/{total}</span>
        </div>
      </div>
      <ul className="activation-step-list setup-checklist-list">
        {steps.map((item) => (
          <li key={item.key} className={`activation-step${item.done ? ' activation-step-done' : ''}`} data-testid={`activation-step-${item.key}`}>
            <span
              className="activation-step-icon"
              aria-label={t(messages, item.done ? 'module.dashboard.activation_step_done_aria' : 'module.dashboard.activation_step_pending_aria')}
              role="img"
            >
              {item.done ? <CheckCircle size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
            </span>
            <div className="activation-step-body">
              <div className="activation-step-title">{item.title}</div>
              <div className="activation-step-desc">{item.description}</div>
            </div>
            {item.done ? (
              <span className="activation-step-status">{item.doneLabel}</span>
            ) : (
              <button type="button" className="activation-step-cta" onClick={item.onClick}>{item.ctaLabel}</button>
            )}
          </li>
        ))}
      </ul>
      <div className="setup-checklist-footer">
        <button type="button" className="setup-checklist-dismiss" onClick={onDismiss}>
          {t(messages, 'module.dashboard.setup_checklist_dismiss')}
        </button>
      </div>
    </section>
  );
}
