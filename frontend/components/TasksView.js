import { useEffect, useState } from 'react';
import {
  Plus, Check, ChevronDown, MoreHorizontal, Flag, Repeat, Clock, Moon, Sun, CalendarArrowUp, Pencil, Trash2,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useTasks } from '../hooks/useTasks';
import { useSwipeActions } from '../hooks/useSwipeActions';
import { prettyDate, prettyDateOnly } from '../lib/helpers';
import { t } from '../lib/i18n';
import { groupTasks, postponeOptions, OVERDUE_FOLD_LIMIT } from '../lib/taskGroups';
import MemberAvatar from './MemberAvatar';
import TaskEditDialog from './TaskEditDialog';
import BottomSheet from './responsive/BottomSheet';

const GROUP_LABELS = {
  overdue: 'module.tasks.overdue',
  today: 'module.tasks.group_today',
  upcoming: 'module.tasks.group_upcoming',
  no_date: 'module.tasks.group_no_date',
  done: 'module.tasks.done',
};

const POSTPONE_ICONS = { tonight: Moon, tomorrow: Sun, next_week: CalendarArrowUp };

// One task: check it, tap it to edit, swipe right to finish, swipe left
// (or the "…" button) for postpone, edit and delete.
function TaskRow({ task, group, members, messages, lang, timeFormat, canEdit, onToggle, onEdit, onActions }) {
  const done = task.status === 'done';
  const { offset, handlers } = useSwipeActions({
    onSwipeRight: done ? undefined : () => onToggle(task),
    onSwipeLeft: canEdit && !done ? () => onActions(task) : undefined,
  });
  const assignee = members.find((m) => m.user_id === task.assigned_to_user_id);
  const due = task.due_date
    ? (task.due_is_date ? prettyDateOnly(task.due_date, lang) : prettyDate(task.due_date, lang, timeFormat))
    : null;
  const high = task.priority === 'high' && !done;
  const content = (
    <>
      <span className="task-row-title">{task.title}</span>
      {(due || high || task.recurrence) && (
        <span className="task-row-meta">
          {high && (
            <span className="task-row-flag">
              <Flag size={13} aria-hidden="true" />
              {t(messages, 'module.tasks.priority.high')}
            </span>
          )}
          {due && (
            <span className={`task-row-due${group === 'overdue' ? ' overdue' : ''}`}>
              <Clock size={13} aria-hidden="true" />
              {due}
            </span>
          )}
          {task.recurrence && (
            <span className="task-row-repeat">
              <Repeat size={13} aria-hidden="true" />
              {t(messages, `module.tasks.recurrence.${task.recurrence}`)}
            </span>
          )}
        </span>
      )}
    </>
  );
  return (
    <li className="task-row-shell">
      <div className="task-row-swipe" aria-hidden="true">
        <span className={`task-row-swipe-done${offset > 0 ? ' visible' : ''}`}>
          <Check size={18} />{t(messages, 'module.tasks.done')}
        </span>
        <span className={`task-row-swipe-later${offset < 0 ? ' visible' : ''}`}>
          {t(messages, 'module.tasks.postpone')}<Clock size={18} />
        </span>
      </div>
      <div
        className={`task-row${done ? ' done' : ''}`}
        style={offset ? { transform: `translateX(${offset}px)`, transition: 'none' } : undefined}
        {...handlers}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={t(messages, 'aria.mark_task').replace('{title}', task.title)}
          className={`task-row-check${done ? ' checked' : ''}`}
          onClick={() => onToggle(task)}
        >
          {done && <Check size={14} aria-hidden="true" />}
        </button>
        {canEdit ? (
          <button
            type="button"
            className="task-row-main"
            onClick={() => onEdit(task)}
            aria-label={t(messages, 'aria.edit_task').replace('{title}', task.title)}
          >
            {content}
          </button>
        ) : (
          <div className="task-row-main">{content}</div>
        )}
        {assignee && <MemberAvatar member={assignee} index={members.indexOf(assignee)} size={28} />}
        {canEdit && (
          <button
            type="button"
            className="task-row-more"
            aria-haspopup="dialog"
            aria-label={t(messages, 'module.tasks.actions').replace('{title}', task.title)}
            onClick={() => onActions(task)}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export default function TasksView({ createRequest, onCreateHandled }) {
  const { members, messages, lang, isChild, timeFormat } = useApp();
  const tk = useTasks();
  const [openGroups, setOpenGroups] = useState({});
  const [actionTask, setActionTask] = useState(null);
  const canEdit = !isChild;

  // "New task" from the + sheet opens the task dialog.
  useEffect(() => {
    if (createRequest?.kind !== 'task' || !canEdit) return;
    tk.openCreate();
    onCreateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest?.id]);

  const groups = groupTasks(tk.visibleTasks);
  const openCount = tk.visibleTasks.filter((task) => task.status !== 'done').length;
  const isOpen = (key) => openGroups[key] ?? (key === 'done'
    ? false
    : key !== 'overdue' || groups.overdue.length <= OVERDUE_FOLD_LIMIT);
  const toggleGroup = (key) => setOpenGroups((current) => ({ ...current, [key]: !isOpen(key) }));
  const filters = [{ key: '', label: t(messages, 'module.tasks.all') }, ...members.map((m) => ({ key: String(m.user_id), label: m.display_name, member: m }))];

  return (
    <div className="tasks-page tasks-v2">
      <TaskEditDialog
        open={Boolean(tk.editingTask) || tk.creating}
        onClose={tk.closeEdit}
        messages={messages}
        members={members}
        form={tk.editForm}
        setForm={tk.setEditForm}
        onSubmit={tk.creating ? tk.createTask : tk.updateTask}
        title={tk.creating ? t(messages, 'module.tasks.new_task') : undefined}
        submitLabel={tk.creating ? t(messages, 'module.tasks.add') : undefined}
      />

      {actionTask && (
        <BottomSheet title={actionTask.title} messages={messages} onClose={() => setActionTask(null)} className="task-actions-sheet">
          <p className="task-actions-label">{t(messages, 'module.tasks.postpone')}</p>
          <div className="task-actions-list">
            {postponeOptions().map((option) => {
              const Icon = POSTPONE_ICONS[option];
              return (
                <button
                  key={option}
                  type="button"
                  className="task-action"
                  onClick={() => { const task = actionTask; setActionTask(null); tk.postponeTask(task, option); }}
                >
                  <Icon size={18} aria-hidden="true" />
                  {t(messages, `module.tasks.postpone_${option}`)}
                </button>
              );
            })}
          </div>
          <div className="task-actions-list">
            <button type="button" className="task-action" onClick={() => { const task = actionTask; setActionTask(null); tk.openEdit(task); }}>
              <Pencil size={18} aria-hidden="true" />
              {t(messages, 'module.tasks.edit')}
            </button>
            <button type="button" className="task-action danger" onClick={() => { const task = actionTask; setActionTask(null); tk.deleteTask(task); }}>
              <Trash2 size={18} aria-hidden="true" />
              {t(messages, 'module.tasks.delete_task')}
            </button>
          </div>
        </BottomSheet>
      )}

      <header className="list-header">
        <h1>{t(messages, 'module.tasks.name')}</h1>
        {canEdit && (
          <button className="tasks-new-btn" type="button" onClick={tk.openCreate}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.tasks.new_task')}
          </button>
        )}
      </header>

      {members.length > 1 && (
        <div className="person-filter" role="group" aria-label={t(messages, 'module.tasks.filter_assignee')}>
          {filters.map((filter) => (
            <button
              key={filter.key || 'all'}
              type="button"
              className={`person-filter-chip${tk.assigneeFilter === filter.key ? ' active' : ''}`}
              aria-pressed={tk.assigneeFilter === filter.key}
              onClick={() => tk.setAssigneeFilter(filter.key)}
            >
              {filter.member && <MemberAvatar member={filter.member} index={members.indexOf(filter.member)} size={22} />}
              {filter.label}
            </button>
          ))}
        </div>
      )}

      {openCount === 0 && (
        <div className="tasks-empty">
          <span>{t(messages, tk.visibleTasks.length ? 'module.tasks.all_done' : 'module.tasks.no_tasks')}</span>
          {canEdit && tk.visibleTasks.length === 0 && (
            <button className="bento-empty-action" type="button" onClick={tk.openCreate}>
              {t(messages, 'module.tasks.add_first')}
            </button>
          )}
        </div>
      )}

      {Object.entries(groups).map(([key, items]) => {
        if (!items.length) return null;
        const label = t(messages, GROUP_LABELS[key]);
        const foldable = key === 'done' || (key === 'overdue' && items.length > OVERDUE_FOLD_LIMIT);
        const expanded = isOpen(key);
        const listId = `task-group-${key}`;
        return (
          <section key={key} className={`task-group task-group-${key}`} aria-label={label}>
            {foldable ? (
              <button type="button" className="task-group-head" aria-expanded={expanded} aria-controls={listId} onClick={() => toggleGroup(key)}>
                <span>{label}</span>
                <span className="task-group-count">{items.length}</span>
                <ChevronDown size={16} aria-hidden="true" className={expanded ? 'open' : ''} />
              </button>
            ) : (
              <h2 className="task-group-head">
                <span>{label}</span>
                <span className="task-group-count">{items.length}</span>
              </h2>
            )}
            {expanded && (
              <ul id={listId} className="task-list">
                {items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    group={key}
                    members={members}
                    messages={messages}
                    lang={lang}
                    timeFormat={timeFormat}
                    canEdit={canEdit}
                    onToggle={tk.toggleTask}
                    onEdit={tk.openEdit}
                    onActions={setActionTask}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
