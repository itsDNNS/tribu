import { useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/i18n';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

export default function TaskEditDialog({
  open,
  onClose,
  messages,
  members,
  form,
  setForm,
  onSubmit,
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  useDialogFocusTrap({ open, containerRef: dialogRef, initialFocusRef: firstFieldRef, onClose });

  if (!open) return null;

  const titleId = 'task-edit-dialog-title';

  return (
    <div className="cal-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="gift-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gift-dialog-header">
          <h2 id={titleId} className="gift-dialog-title">{t(messages, 'module.tasks.edit_title')}</h2>
          <button
            type="button"
            className="gift-dialog-close"
            onClick={onClose}
            aria-label={t(messages, 'module.tasks.cancel')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className="gift-form" onSubmit={onSubmit}>
          <div className="gift-form-grid">
            <input
              ref={firstFieldRef}
              className="form-input gift-form-row-full"
              placeholder={t(messages, 'module.tasks.title')}
              aria-label={t(messages, 'module.tasks.title')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              maxLength={200}
            />
            <textarea
              className="form-input gift-form-notes"
              placeholder={t(messages, 'module.tasks.description')}
              aria-label={t(messages, 'module.tasks.description')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <input
              className="form-input"
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
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
            <select
              className="form-input"
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              aria-label={t(messages, 'module.tasks.recurrence')}
            >
              <option value="">{t(messages, 'module.tasks.recurrence.none')}</option>
              <option value="daily">{t(messages, 'module.tasks.recurrence.daily')}</option>
              <option value="weekly">{t(messages, 'module.tasks.recurrence.weekly')}</option>
              <option value="monthly">{t(messages, 'module.tasks.recurrence.monthly')}</option>
              <option value="yearly">{t(messages, 'module.tasks.recurrence.yearly')}</option>
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
          <div className="gift-form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t(messages, 'module.tasks.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t(messages, 'module.tasks.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
