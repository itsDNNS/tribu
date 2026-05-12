import { useState } from 'react';
import { Plus, Clock, Check, X, ChevronDown, Pencil } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTasks } from '../hooks/useTasks';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { TASK_RECURRENCE_OPTIONS } from '../lib/taskRecurrenceOptions';
import MemberAvatar from './MemberAvatar';
import ConfirmDialog from './ConfirmDialog';
import TaskEditDialog from './TaskEditDialog';

export default function TasksView() {
  const { familyId, families, members, messages, lang, isChild, timeFormat, tasks } = useApp();
  const tk = useTasks();
  const [showFormDetails, setShowFormDetails] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const taskList = Array.isArray(tasks) ? tasks : [];
  const openCount = taskList.filter((task) => task.status === 'open').length;
  const doneCount = taskList.filter((task) => task.status === 'done').length;
  const overdueCount = taskList.filter((task) => task.status === 'open' && task.due_date && new Date(task.due_date) < new Date()).length;
  const highPriorityCount = taskList.filter((task) => task.status === 'open' && task.priority === 'high').length;

  return (
    <div className="tasks-page">
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

      <TaskEditDialog
        open={!!tk.editingTask}
        onClose={tk.closeEdit}
        messages={messages}
        members={members}
        form={tk.editForm}
        setForm={tk.setEditForm}
        onSubmit={tk.updateTask}
      />

      <div className="view-header family-view-header">
        <div>
          <div className="view-kicker">{t(messages, 'module.tasks.open')}</div>
          <h1 className="view-title">{t(messages, 'module.tasks.name')}</h1>
          <div className="view-subtitle">
            {families.find((f) => String(f.family_id) === String(familyId))?.family_name || ''}
          </div>
        </div>
      </div>

      <div className="tasks-focus-strip" role="group" aria-label={t(messages, 'module.tasks.refine')}>
        <div className="tasks-focus-chip">
          <strong>{openCount}</strong>
          <span>{t(messages, 'module.tasks.open')}</span>
        </div>
        <div className="tasks-focus-chip tasks-focus-chip-danger">
          <strong>{overdueCount}</strong>
          <span>{t(messages, 'module.tasks.overdue')}</span>
        </div>
        <div className="tasks-focus-chip tasks-focus-chip-warm">
          <strong>{highPriorityCount}</strong>
          <span>{t(messages, 'module.tasks.priority.high')}</span>
        </div>
        <div className="tasks-focus-chip">
          <strong>{doneCount}</strong>
          <span>{t(messages, 'module.tasks.done')}</span>
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
                      {TASK_RECURRENCE_OPTIONS.map((value) => (
                        <option key={value || 'none'} value={value}>
                          {t(messages, value ? `module.tasks.recurrence.${value}` : 'module.tasks.recurrence.none')}
                        </option>
                      ))}
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
            <div className="tasks-refine-controls" role="group" aria-label={t(messages, 'module.tasks.refine')}>
              <select
                className="form-input tasks-refine-input"
                value={tk.assigneeFilter}
                onChange={(e) => tk.setAssigneeFilter(e.target.value)}
                aria-label={t(messages, 'module.tasks.filter_assignee')}
              >
                <option value="">{t(messages, 'module.tasks.filter_assignee_all')}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>
                ))}
              </select>
              <select
                className="form-input tasks-refine-input"
                value={tk.priorityFilter}
                onChange={(e) => tk.setPriorityFilter(e.target.value)}
                aria-label={t(messages, 'module.tasks.filter_priority')}
              >
                <option value="">{t(messages, 'module.tasks.filter_priority_all')}</option>
                <option value="high">{t(messages, 'module.tasks.priority.high')}</option>
                <option value="normal">{t(messages, 'module.tasks.priority.normal')}</option>
                <option value="low">{t(messages, 'module.tasks.priority.low')}</option>
              </select>
              <select
                className="form-input tasks-refine-input"
                value={tk.taskSort}
                onChange={(e) => tk.setTaskSort(e.target.value)}
                aria-label={t(messages, 'module.tasks.sort')}
              >
                <option value="created">{t(messages, 'module.tasks.sort.created')}</option>
                <option value="priority">{t(messages, 'module.tasks.sort.priority')}</option>
                <option value="assignee">{t(messages, 'module.tasks.sort.assignee')}</option>
              </select>
            </div>
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
                    <>
                      <button
                        className="task-edit-btn"
                        onClick={() => tk.openEdit(task)}
                        aria-label={t(messages, 'aria.edit_task').replace('{title}', task.title)}
                      >
                        <Pencil size={16} />
                      </button>
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
                    </>
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
