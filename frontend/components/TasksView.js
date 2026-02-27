import { Plus, Clock, Check, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTasks } from '../hooks/useTasks';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { getMemberColor } from '../lib/member-colors';

export default function TasksView() {
  const { familyId, families, members, messages, lang, isMobile, isChild } = useApp();
  const tk = useTasks();

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.tasks.name')}</h1>
          <div className="view-subtitle">
            {families.find((f) => String(f.family_id) === String(familyId))?.family_name || ''}
          </div>
        </div>
      </div>

      <div className="tasks-layout">
        <div className="glass" style={{ overflow: 'hidden' }}>
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

              {/* Expanded form fields */}
              <div style={{ padding: '0 var(--space-md) var(--space-sm)', display: 'grid', gap: 'var(--space-sm)' }}>
                <textarea
                  className="form-input"
                  placeholder={t(messages, 'module.tasks.description')}
                  value={tk.taskDesc}
                  onChange={(e) => tk.setTaskDesc(e.target.value)}
                  style={{ fontSize: '0.88rem', padding: '10px 14px', minHeight: 60 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <input className="form-input" type="datetime-local" value={tk.taskDueDate} onChange={(e) => tk.setTaskDueDate(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }} />
                  <select className="form-input" value={tk.taskPriority} onChange={(e) => tk.setTaskPriority(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }}>
                    <option value="low">{t(messages, 'module.tasks.priority.low')}</option>
                    <option value="normal">{t(messages, 'module.tasks.priority.normal')}</option>
                    <option value="high">{t(messages, 'module.tasks.priority.high')}</option>
                  </select>
                  <select className="form-input" value={tk.taskRecurrence} onChange={(e) => tk.setTaskRecurrence(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }}>
                    <option value="">{t(messages, 'module.tasks.recurrence.none')}</option>
                    <option value="daily">{t(messages, 'module.tasks.recurrence.daily')}</option>
                    <option value="weekly">{t(messages, 'module.tasks.recurrence.weekly')}</option>
                    <option value="monthly">{t(messages, 'module.tasks.recurrence.monthly')}</option>
                    <option value="yearly">{t(messages, 'module.tasks.recurrence.yearly')}</option>
                  </select>
                  <select className="form-input" value={tk.taskAssignee} onChange={(e) => tk.setTaskAssignee(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }}>
                    <option value="">{t(messages, 'module.tasks.unassigned')}</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Filter Tabs */}
          <div className="tasks-toolbar" style={{ padding: '0 var(--space-md)' }}>
            <div className="tasks-filter-tabs">
              <button className={`tasks-filter-btn${tk.taskFilter === 'all' ? ' active' : ''}`} onClick={() => tk.setTaskFilter('all')} aria-pressed={tk.taskFilter === 'all'}>{t(messages, 'module.tasks.all')}</button>
              <button className={`tasks-filter-btn${tk.taskFilter === 'open' ? ' active' : ''}`} onClick={() => tk.setTaskFilter('open')} aria-pressed={tk.taskFilter === 'open'}>{t(messages, 'module.tasks.open')}</button>
              <button className={`tasks-filter-btn${tk.taskFilter === 'done' ? ' active' : ''}`} onClick={() => tk.setTaskFilter('done')} aria-pressed={tk.taskFilter === 'done'}>{t(messages, 'module.tasks.done')}</button>
            </div>
            <div className="tasks-count">{tk.filteredTasks.length} {t(messages, 'module.tasks.name')}</div>
          </div>

          {/* Task List */}
          <div className="tasks-list stagger" style={{ marginTop: 'var(--space-md)' }}>
            {tk.filteredTasks.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '0 var(--space-md)' }}>
                {t(messages, 'module.tasks.no_tasks')}
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
                          {prettyDate(task.due_date, lang)}
                        </span>
                      )}
                    </div>
                  </div>

                  {assignee && (
                    <div className="task-assignee" style={{ background: getMemberColor(assignee, assigneeIndex) }}>
                      {(assignee.display_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}

                  {!isChild && (
                    <button
                      className="sidebar-logout"
                      onClick={() => tk.deleteTask(task.id)}
                      aria-label={t(messages, 'aria.delete_task').replace('{title}', task.title)}
                      style={{ marginLeft: 0 }}
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
