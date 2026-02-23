import { CalendarClock, ListChecks, Cake, BarChart3, Users, Calendar, CheckCircle, Plus, CheckSquare, UserPlus, Clock } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';

const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export default function DashboardView() {
  const { summary, me, members, tasks, events, setActiveView, messages } = useApp();

  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();
  const openTasks = tasks.filter((t) => t.status === 'open');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const donePercent = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  const todayStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="view-header">
        <div>
          <div className="view-title">{t(messages, 'dashboard')}</div>
          <div className="view-subtitle">{t(messages, 'important_first') || 'Alles Wichtige auf einen Blick'}</div>
        </div>
        <div className="view-date">{todayStr}</div>
      </div>

      <div className="bento-grid stagger">
        {/* Welcome Card */}
        <div className="bento-card bento-welcome glass glow-purple">
          <div className="welcome-row">
            <div className="welcome-avatar">{initials}</div>
            <div className="welcome-text">
              <h2>{getGreeting()}, {me?.display_name || 'User'}</h2>
              <p>
                {summary.next_events?.length > 0
                  ? `Heute stehen ${summary.next_events.length} Termine`
                  : 'Keine Termine heute'}
                {openTasks.length > 0 ? ` und ${openTasks.length} offene Aufgaben an.` : '.'}
              </p>
            </div>
          </div>
          <div className="welcome-actions">
            <button className="btn-ghost" onClick={() => setActiveView('calendar')}><Plus size={15} /> Termin</button>
            <button className="btn-ghost" onClick={() => setActiveView('tasks')}><CheckSquare size={15} /> Aufgabe</button>
            <button className="btn-ghost" onClick={() => setActiveView('contacts')}><UserPlus size={15} /> Kontakt</button>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bento-card bento-stats glass">
          <div className="bento-card-header">
            <div className="bento-card-title"><BarChart3 size={16} /> Familie</div>
          </div>
          <div className="stat-grid">
            <div className="stat-item">
              <div className="stat-icon" style={{ background: 'rgba(124,58,237,0.12)' }}><Users size={18} style={{ color: 'var(--amethyst)' }} /></div>
              <div><div className="stat-value">{members.length}</div><div className="stat-label">Mitglieder</div></div>
            </div>
            <div className="stat-item">
              <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.12)' }}><Calendar size={18} style={{ color: 'var(--sapphire)' }} /></div>
              <div><div className="stat-value">{events.length}</div><div className="stat-label">Termine</div></div>
            </div>
            <div className="stat-item">
              <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}><CheckCircle size={18} style={{ color: 'var(--success)' }} /></div>
              <div><div className="stat-value">{donePercent}%</div><div className="stat-label">Aufgaben erledigt</div></div>
            </div>
          </div>
        </div>

        {/* Events Card */}
        <div className="bento-card bento-events glass glow-blue">
          <div className="bento-card-header">
            <div className="bento-card-title"><CalendarClock size={16} /> {t(messages, 'next_events')}</div>
            <button className="bento-more" onClick={() => setActiveView('calendar')}>Alle &rarr;</button>
          </div>
          <div className="event-list">
            {summary.next_events?.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t(messages, 'no_upcoming_events')}</div>
            )}
            {summary.next_events?.slice(0, 4).map((ev, i) => (
              <div key={ev.id} className="event-item">
                <div className="event-time">{new Date(ev.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="event-dot" style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }} />
                <div className="event-info">
                  <div className="event-title">{ev.title}</div>
                  <div className="event-meta">{prettyDate(ev.starts_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tasks Card */}
        <div className="bento-card bento-tasks glass">
          <div className="bento-card-header">
            <div className="bento-card-title"><ListChecks size={16} /> Offene Aufgaben</div>
            <button className="bento-more" onClick={() => setActiveView('tasks')}>Alle &rarr;</button>
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
                    <CheckSquare size={12} style={{ opacity: 0 }} />
                  </div>
                  <div className="task-preview-info">
                    <div className="task-preview-title">{task.title}</div>
                  </div>
                  <div className="task-priority-dot" style={{ background: priorityColor }} />
                  {assignee && (
                    <div className="task-assignee-mini" style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                      {(assignee.display_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Birthdays Card */}
        <div className="bento-card bento-birthdays glass glow-rose">
          <div className="bento-card-header">
            <div className="bento-card-title"><Cake size={16} /> {t(messages, 'upcoming_birthdays_4w')}</div>
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
                  <div className="birthday-avatar">🎂</div>
                  <div className="birthday-info">
                    <div className="birthday-name">{b.person_name}</div>
                    <div className="birthday-date">{b.occurs_on}</div>
                  </div>
                  <div className="birthday-countdown" style={{ background: c.bg, color: c.color }}>
                    {b.days_until} Tage
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
