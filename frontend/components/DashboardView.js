import { CalendarClock, ListChecks, Cake, BarChart3, Users, Calendar, CheckCircle, Plus, CheckSquare, UserPlus, Clock } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { getMemberColor } from '../lib/member-colors';

function getGreeting(messages) {
  const h = new Date().getHours();
  if (h < 12) return t(messages, 'module.dashboard.greeting_morning');
  if (h < 18) return t(messages, 'module.dashboard.greeting_afternoon');
  return t(messages, 'module.dashboard.greeting_evening');
}

export default function DashboardView() {
  const { summary, me, members, tasks, events, setActiveView, messages, lang } = useApp();

  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();
  const openTasks = tasks.filter((t) => t.status === 'open');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const donePercent = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const todayStr = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const summaryText = (() => {
    const evCount = summary.next_events?.length || 0;
    let s = evCount > 0
      ? t(messages, 'module.dashboard.summary_events').replace('{count}', evCount)
      : t(messages, 'module.dashboard.summary_no_events');
    if (openTasks.length > 0) {
      s += t(messages, 'module.dashboard.summary_tasks').replace('{count}', openTasks.length);
    } else {
      s += '.';
    }
    return s;
  })();

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'dashboard')}</h1>
          <div className="view-subtitle">{t(messages, 'important_first')}</div>
        </div>
        <div className="view-date">{todayStr}</div>
      </div>

      <div className="bento-grid stagger">
        {/* Welcome Card */}
        <div className="bento-card bento-welcome glass glow-purple" role="region" aria-label={t(messages, 'aria.welcome')}>
          <div className="welcome-row">
            <div className="welcome-avatar">{initials}</div>
            <div className="welcome-text">
              <h2>{getGreeting(messages)}, {me?.display_name || 'User'}</h2>
              <p>{summaryText}</p>
            </div>
          </div>
          <div className="welcome-actions">
            <button className="btn-ghost" onClick={() => setActiveView('calendar')}><Plus size={15} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_event')}</button>
            <button className="btn-ghost" onClick={() => setActiveView('tasks')}><CheckSquare size={15} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_task')}</button>
            <button className="btn-ghost" onClick={() => setActiveView('contacts')}><UserPlus size={15} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_contact')}</button>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bento-card bento-stats glass" role="region" aria-label={t(messages, 'module.dashboard.family')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><BarChart3 size={16} aria-hidden="true" /> {t(messages, 'module.dashboard.family')}</h2>
          </div>
          <div className="stat-grid">
            <div className="stat-item stat-item-link" onClick={() => setActiveView('admin')} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveView('admin')}>
              <div className="stat-icon" style={{ background: 'rgba(124,58,237,0.12)' }}><Users size={18} style={{ color: 'var(--amethyst)' }} aria-hidden="true" /></div>
              <div><div className="stat-value">{members.length}</div><div className="stat-label">{t(messages, 'module.dashboard.members')}</div></div>
            </div>
            <div className="stat-item stat-item-link" onClick={() => setActiveView('calendar')} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveView('calendar')}>
              <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.12)' }}><Calendar size={18} style={{ color: 'var(--sapphire)' }} aria-hidden="true" /></div>
              <div><div className="stat-value">{events.length}</div><div className="stat-label">{t(messages, 'module.dashboard.events_count')}</div></div>
            </div>
            <div className="stat-item stat-item-link" onClick={() => setActiveView('tasks')} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActiveView('tasks')}>
              <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}><CheckCircle size={18} style={{ color: 'var(--success)' }} aria-hidden="true" /></div>
              <div><div className="stat-value">{donePercent}%</div><div className="stat-label">{t(messages, 'module.dashboard.tasks_done')}</div></div>
            </div>
          </div>
        </div>

        {/* Events Card */}
        <div className="bento-card bento-events glass glow-blue" role="region" aria-label={t(messages, 'next_events')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><CalendarClock size={16} aria-hidden="true" /> {t(messages, 'next_events')}</h2>
            <button className="bento-more" onClick={() => setActiveView('calendar')}>{t(messages, 'module.dashboard.all')}</button>
          </div>
          <div className="event-list">
            {summary.next_events?.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t(messages, 'no_upcoming_events')}</div>
            )}
            {summary.next_events?.slice(0, 4).map((ev, i) => (
              <div key={ev.id} className="event-item">
                <div className="event-time">{new Date(ev.starts_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="event-dot" style={{ background: ev.color || getMemberColor(null, i) }} aria-hidden="true" />
                <div className="event-info">
                  <div className="event-title">{ev.title}</div>
                  <div className="event-meta">{prettyDate(ev.starts_at, lang)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tasks Card */}
        <div className="bento-card bento-tasks glass" role="region" aria-label={t(messages, 'module.dashboard.open_tasks')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><ListChecks size={16} aria-hidden="true" /> {t(messages, 'module.dashboard.open_tasks')}</h2>
            <button className="bento-more" onClick={() => setActiveView('tasks')}>{t(messages, 'module.dashboard.all')}</button>
          </div>
          <div className="task-preview-list">
            {openTasks.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t(messages, 'module.tasks.no_tasks')}</div>
            )}
            {openTasks.slice(0, 5).map((task, i) => {
              const assignee = members.find((m) => m.user_id === task.assigned_to_user_id);
              const priorityColor = task.priority === 'high' ? 'var(--danger)' : task.priority === 'normal' ? 'var(--amethyst)' : 'var(--sapphire)';
              return (
                <div key={task.id} className="task-preview-item">
                  <div className="task-check">
                    <CheckSquare size={12} style={{ opacity: 0 }} aria-hidden="true" />
                  </div>
                  <div className="task-preview-info">
                    <div className="task-preview-title">{task.title}</div>
                  </div>
                  <div className="task-priority-dot" style={{ background: priorityColor }} aria-hidden="true" />
                  {assignee && (
                    <div className="task-assignee-mini" style={{ background: getMemberColor(assignee, members.indexOf(assignee)) }}>
                      {(assignee.display_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Birthdays Card */}
        <div className="bento-card bento-birthdays glass glow-rose" role="region" aria-label={t(messages, 'upcoming_birthdays_4w')}>
          <div className="bento-card-header">
            <h2 className="bento-card-title"><Cake size={16} aria-hidden="true" /> {t(messages, 'upcoming_birthdays_4w')}</h2>
          </div>
          <div className="birthday-list">
            {summary.upcoming_birthdays?.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t(messages, 'no_upcoming_birthdays')}</div>
            )}
            {summary.upcoming_birthdays?.slice(0, 3).map((b, i) => {
              const colors = [
                { bg: 'rgba(244,63,94,0.12)', color: '#fb7185' },
                { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
                { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
              ];
              const c = colors[i % colors.length];
              return (
                <div key={i} className="birthday-item">
                  <div className="birthday-avatar" aria-hidden="true">🎂</div>
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
    </div>
  );
}
