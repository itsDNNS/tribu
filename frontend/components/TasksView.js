import { useState } from 'react';
import { Plus, Clock, Check, X, ChevronDown } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTasks } from '../hooks/useTasks';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';
import ConfirmDialog from './ConfirmDialog';

export default function TasksView() {
  const { familyId, families, members, messages, lang, isChild, timeFormat, tasks } = useApp();
  const tk = useTasks();
  const [showFormDetails, setShowFormDetails] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

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

      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.tasks.name')}</h1>
          <div className="view-subtitle">
            {families.find((f) => String(f.family_id) === String(familyId))?.family_name || ''}
          </div>
        </div>
      </div>

      <div className="tasks-layout">
        <div className="tasks-wrapper">
          {/* Quick Add */}
          {!isChild && (
            <>
              <form onSubmit={tk.createTask} className="quick-add-bar">
                <input
                  className="quick-add-input"
                  placeholder={t(messages, 'module.tasks.title') || 'Neue Aufgabe hinzufügen...'}
                  value={tk.taskTitle}
                  onChange={(e) => tk.setTaskTitle(e.target.value)}
                  required
                />
                <button className="quick-add-btn" type="submit" aria-label={t(messages, 'aria.add_task')}>
                  <Plus size={22} />
                </button>
              </form>

              <button type="button" className="task-form-toggle" onClick={() => setShowFormDetails(prev => !prev)} aria-expanded={showFormDetails} aria-controls={showFormDetails ? 'task-form-details' : undefined}>
                <ChevronDown size={14} className={showFormDetails ? 'task-form-toggle-open' : ''} />
                {t(messages, showFormDetails ? 'module.tasks.less_options' : 'module.tasks.more_options')}
              </button>

              {showFormDetails && (
                <div id="task-form-details" className="task-form-fields">
                  <textarea
                    className="form-input task-form-desc"
                    placeholder={t(messages, 'module.tasks.description')}
                    value={tk.taskDesc}
                    onChange={(e) => tk.setTaskDesc(e.target.value)}
                  />
                  <div className="task-form-grid">
                    <input className="form-input task-form-input" type="datetime-local" value={tk.taskDueDate} onChange={(e) => tk.setTaskDueDate(e.target.value)} />
                    <select className="form-input task-form-input" value={tk.taskPriority} onChange={(e) => tk.setTaskPriority(e.target.value)}>
                      <option value="low">{t(messages, 'module.tasks.priority.low')}</option>
                      <option value="normal">{t(messages, 'module.tasks.priority.normal')}</option>
                      <option value="high">{t(messages, 'module.tasks.priority.high')}</option>
                    </select>
                    <select className="form-input task-form-input" value={tk.taskRecurrence} onChange={(e) => tk.setTaskRecurrence(e.target.value)}>
                      <option value="">{t(messages, 'module.tasks.recurrence.none')}</option>
                      <option value="daily">{t(messages, 'module.tasks.recurrence.daily')}</option>
                      <option value="weekly">{t(messages, 'module.tasks.recurrence.weekly')}</option>
                      <option value="monthly">{t(messages, 'module.tasks.recurrence.monthly')}</option>
                      <option value="yearly">{t(messages, 'module.tasks.recurrence.yearly')}</option>
                    </select>
                    <select className="form-input task-form-input" value={tk.taskAssignee} onChange={(e) => tk.setTaskAssignee(e.target.value)}>
                      <option value="">{t(messages, 'module.tasks.unassigned')}</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Filter Tabs */}
          <div className="tasks-toolbar">
            <div className="tasks-filter-tabs">
              <button className={`tasks-filter-btn${tk.taskFilter === 'all' ? ' active' : ''}`} onClick={() => tk.setTaskFilter('all')} aria-pressed={tk.taskFilter === 'all'}>{t(messages, 'module.tasks.all')}</button>
              <button className={`tasks-filter-btn${tk.taskFilter === 'open' ? ' active' : ''}`} onClick={() => tk.setTaskFilter('open')} aria-pressed={tk.taskFilter === 'open'}>{t(messages, 'module.tasks.open')}</button>
              <button className={`tasks-filter-btn${tk.taskFilter === 'done' ? ' active' : ''}`} onClick={() => tk.setTaskFilter('done')} aria-pressed={tk.taskFilter === 'done'}>{t(messages, 'module.tasks.done')}</button>
            </div>
            <div className="tasks-count">{tk.filteredTasks.length} {t(messages, 'module.tasks.name')}</div>
          </div>

          {/* Task List */}
          <div className="tasks-list">
            {tk.filteredTasks.length === 0 && (
              <div className="tasks-empty">
                <span>{t(messages, 'module.tasks.no_tasks')}</span>
                {!isChild && tasks.length === 0 && (
                  <button className="bento-empty-action" onClick={() => document.querySelector('.quick-add-input')?.focus()}>
                    {t(messages, 'module.tasks.add_first')}
                  </button>
                )}
              </div>
            )}
            {tk.filteredTasks.map((task) => {
              const isOverdue = task.due_date && task.status === 'open' && new Date(task.due_date) < new Date();
              const isDone = task.status === 'done';
              const assignee = members.find((m) => m.user_id === task.assigned_to_user_id);
              const assigneeIndex = assignee ? members.indexOf(assignee) : 0;

              return (
                <div key={task.id} className={`task-card${isOverdue ? ' overdue' : ''}${isDone ? ' done' : ''}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={t(messages, 'aria.mark_task').replace('{title}', task.title)}
                    className={`task-checkbox${isDone ? ' checked' : ''}`}
                    onClick={() => tk.toggleTask(task.id, task.status)}
                  >
                    {isDone && <Check size={14} color="white" />}
                  </button>

                  <div className="task-content">
                    <div className="task-title-row">
                      <span className={`task-title${isDone ? ' done' : ''}`}>{task.title}</span>
                    </div>
                    {task.description && <div className="task-description">{task.description}</div>}
                    <div className="task-meta">
                      <span className={`task-badge badge-${task.priority}`}>
                        {t(messages, `module.tasks.priority.${task.priority}`)}
                      </span>
                      {isOverdue && <span className="task-badge badge-overdue">{t(messages, 'module.tasks.overdue')}</span>}
                      {task.recurrence && <span className="task-badge badge-recurring">{t(messages, `module.tasks.recurrence.${task.recurrence}`)}</span>}
                      {task.due_date && (
                        <span className={`task-due${isOverdue ? ' overdue' : ''}`}>
                          <Clock size={12} aria-hidden="true" />
                          {prettyDate(task.due_date, lang, timeFormat)}
                        </span>
                      )}
                    </div>
                  </div>

                  {assignee && <MemberAvatar member={assignee} index={assigneeIndex} size={24} />}

                  {!isChild && (
                    <button
                      className="task-delete-btn"
                      onClick={() => setConfirmAction({
                        title: t(messages, 'module.tasks.delete_task'),
                        message: t(messages, 'module.tasks.delete_confirm').replace('{title}', task.title),
                        danger: true,
                        action: () => { tk.deleteTask(task.id); setConfirmAction(null); },
                      })}
                      aria-label={t(messages, 'aria.delete_task').replace('{title}', task.title)}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
