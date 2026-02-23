import { useApp } from '../contexts/AppContext';
import { useTasks } from '../hooks/useTasks';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { navBtn, styles } from '../lib/styles';

export default function TasksView() {
  const { familyId, families, members, tokens, messages, ui, isMobile, switchFamily } = useApp();
  const tk = useTasks();

  return (
    <div style={ui.card}>
      <h2>{t(messages, 'module.tasks.name')}</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <select
          style={{ ...ui.input, maxWidth: 220 }}
          value={familyId}
          onChange={(e) => switchFamily(e.target.value)}
        >
          {families.map((f) => (
            <option key={f.family_id} value={String(f.family_id)}>{f.family_name}</option>
          ))}
        </select>
        <button style={navBtn(tk.taskFilter === 'all', tokens)} onClick={() => tk.setTaskFilter('all')}>{t(messages, 'module.tasks.all')}</button>
        <button style={navBtn(tk.taskFilter === 'open', tokens)} onClick={() => tk.setTaskFilter('open')}>{t(messages, 'module.tasks.open')}</button>
        <button style={navBtn(tk.taskFilter === 'done', tokens)} onClick={() => tk.setTaskFilter('done')}>{t(messages, 'module.tasks.done')}</button>
      </div>

      {tk.taskMsg && <p>{tk.taskMsg}</p>}

      <form onSubmit={tk.createTask} style={{ ...styles.formGrid, marginBottom: 14 }}>
        <input style={ui.input} placeholder={t(messages, 'module.tasks.title')} value={tk.taskTitle} onChange={(e) => tk.setTaskTitle(e.target.value)} required />
        <textarea style={ui.input} placeholder={t(messages, 'module.tasks.description')} value={tk.taskDesc} onChange={(e) => tk.setTaskDesc(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
          <input style={ui.input} type="datetime-local" value={tk.taskDueDate} onChange={(e) => tk.setTaskDueDate(e.target.value)} />
          <select style={ui.input} value={tk.taskPriority} onChange={(e) => tk.setTaskPriority(e.target.value)}>
            <option value="low">{t(messages, 'module.tasks.priority.low')}</option>
            <option value="normal">{t(messages, 'module.tasks.priority.normal')}</option>
            <option value="high">{t(messages, 'module.tasks.priority.high')}</option>
          </select>
          <select style={ui.input} value={tk.taskRecurrence} onChange={(e) => tk.setTaskRecurrence(e.target.value)}>
            <option value="">{t(messages, 'module.tasks.recurrence.none')}</option>
            <option value="daily">{t(messages, 'module.tasks.recurrence.daily')}</option>
            <option value="weekly">{t(messages, 'module.tasks.recurrence.weekly')}</option>
            <option value="monthly">{t(messages, 'module.tasks.recurrence.monthly')}</option>
            <option value="yearly">{t(messages, 'module.tasks.recurrence.yearly')}</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
          <select style={ui.input} value={tk.taskAssignee} onChange={(e) => tk.setTaskAssignee(e.target.value)}>
            <option value="">{t(messages, 'module.tasks.unassigned')}</option>
            {members.map((m) => (
              <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>
            ))}
          </select>
          <button style={ui.primaryBtn} type="submit">{t(messages, 'module.tasks.add')}</button>
        </div>
      </form>

      <div style={{ display: 'grid', gap: 8 }}>
        {tk.filteredTasks.length === 0 && <p style={{ color: tokens.muted }}>{t(messages, 'module.tasks.no_tasks')}</p>}
        {tk.filteredTasks.map((task) => {
          const isOverdue = task.due_date && task.status === 'open' && new Date(task.due_date) < new Date();
          const assignee = members.find((m) => m.user_id === task.assigned_to_user_id);
          return (
            <div key={task.id} style={{ ...ui.smallCard, opacity: task.status === 'done' ? 0.6 : 1, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={task.status === 'done'}
                onChange={() => tk.toggleTask(task.id, task.status)}
                style={{ width: 20, height: 20, cursor: 'pointer' }}
              />
              <div>
                <strong style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</strong>
                {task.description && <div style={{ fontSize: 13, color: tokens.muted }}>{task.description}</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {task.due_date && (
                    <span style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 6,
                      background: isOverdue ? '#fecaca' : tokens.surface,
                      color: isOverdue ? '#991b1b' : tokens.muted,
                      border: `1px solid ${isOverdue ? '#f87171' : tokens.border}`,
                    }}>
                      {isOverdue && `${t(messages, 'module.tasks.overdue')} `}{prettyDate(task.due_date)}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 6,
                    background: task.priority === 'high' ? '#fef3c7' : task.priority === 'low' ? '#e0f2fe' : tokens.surface,
                    color: task.priority === 'high' ? '#92400e' : task.priority === 'low' ? '#075985' : tokens.muted,
                    border: `1px solid ${tokens.border}`,
                  }}>
                    {t(messages, `module.tasks.priority.${task.priority}`)}
                  </span>
                  {task.recurrence && (
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: tokens.surface, color: tokens.muted, border: `1px solid ${tokens.border}` }}>
                      {t(messages, `module.tasks.recurrence.${task.recurrence}`)}
                    </span>
                  )}
                  {assignee && (
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: tokens.surface, color: tokens.muted, border: `1px solid ${tokens.border}` }}>
                      {assignee.display_name}
                    </span>
                  )}
                </div>
              </div>
              <button
                style={{ ...ui.secondaryBtn, padding: '6px 10px', fontSize: 13, color: '#ef4444' }}
                onClick={() => tk.deleteTask(task.id)}
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
