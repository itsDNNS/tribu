import { useRef } from 'react';
import { t } from '../lib/i18n';
import { TASK_RECURRENCE_OPTIONS } from '../lib/taskRecurrenceOptions';
import RewardsDialog from './rewards/RewardsDialog';

export default function TaskEditDialog({
  open,
  onClose,
  messages,
  members,
  form,
  setForm,
  onSubmit,
  title,
  submitLabel,
}) {
  const firstFieldRef = useRef(null);

  if (!open) return null;

  return (
    <RewardsDialog
      id="task-edit"
      title={title || t(messages, 'module.tasks.edit_title')}
      closeLabel={t(messages, 'module.tasks.cancel')}
      onClose={onClose}
      onSubmit={onSubmit}
      initialFocusRef={firstFieldRef}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t(messages, 'module.tasks.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {submitLabel || t(messages, 'module.tasks.save')}
          </button>
        </>
      )}
    >
      <div className="rewards-field">
        <input
          ref={firstFieldRef}
          className="form-input"
          placeholder={t(messages, 'module.tasks.title')}
          aria-label={t(messages, 'module.tasks.title')}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          maxLength={240}
        />
        <textarea
          className="form-input"
          placeholder={t(messages, 'module.tasks.description')}
          aria-label={t(messages, 'module.tasks.description')}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          className="form-input"
          type="datetime-local"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value, due_is_date: false })}
          aria-label={t(messages, 'module.tasks.due_date')}
        />
        <select
          className="form-input"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          aria-label={t(messages, 'module.tasks.priority')}
        >
          <option value="low">{t(messages, 'module.tasks.priority.low')}</option>
          <option value="normal">{t(messages, 'module.tasks.priority.normal')}</option>
          <option value="high">{t(messages, 'module.tasks.priority.high')}</option>
        </select>
        <select className="form-input" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
          aria-label={t(messages, 'module.tasks.recurrence')}>
          {TASK_RECURRENCE_OPTIONS.map((value) => (
            <option key={value || 'none'} value={value}>
              {t(messages, value ? `module.tasks.recurrence.${value}` : 'module.tasks.recurrence.none')}
            </option>
          ))}
        </select>
        <select
          className="form-input"
          value={form.assigned_to_user_id}
          onChange={(e) => setForm({ ...form, assigned_to_user_id: e.target.value })}
          aria-label={t(messages, 'module.tasks.assignee')}
        >
          <option value="">{t(messages, 'module.tasks.unassigned')}</option>
          {members.map((m) => (
            <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>
          ))}
        </select>
      </div>
    </RewardsDialog>
  );
}
