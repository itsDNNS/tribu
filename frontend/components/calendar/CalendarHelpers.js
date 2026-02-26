import { useEffect, useRef } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { prettyDate } from '../../lib/helpers';
import { t } from '../../lib/i18n';

export const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

export const RECURRENCE_OPTIONS = [
  { value: '', key: 'module.calendar.no_repeat' },
  { value: 'daily', key: 'module.calendar.repeat_daily' },
  { value: 'weekly', key: 'module.calendar.repeat_weekly' },
  { value: 'biweekly', key: 'module.calendar.repeat_biweekly' },
  { value: 'monthly', key: 'module.calendar.repeat_monthly' },
  { value: 'yearly', key: 'module.calendar.repeat_yearly' },
];

export function DeleteRecurringDialog({ event, messages, onDeleteThis, onDeleteAll, onCancel }) {
  const firstBtnRef = useRef(null);

  useEffect(() => {
    firstBtnRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-recurring-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
      }}
    >
      <div className="glass" style={{
        padding: 'var(--space-xl)', maxWidth: 380, width: '90%',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-md)',
      }}>
        <div id="delete-recurring-title" style={{ fontWeight: 600, fontSize: '1rem' }}>
          {t(messages, 'module.calendar.delete_recurring_question')}
        </div>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          {event.title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button ref={firstBtnRef} className="btn-sm" onClick={onDeleteThis} style={{ width: '100%' }}>
            {t(messages, 'module.calendar.delete_this_only')}
          </button>
          <button className="btn-sm" onClick={onDeleteAll} style={{ width: '100%', background: 'var(--danger, #e53e3e)', color: '#fff' }}>
            {t(messages, 'module.calendar.delete_all')}
          </button>
          <button className="btn-sm" onClick={onCancel} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}>
            {t(messages, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssignChips({ members, assignedTo, setAssignedTo, messages }) {
  const toggle = (id) => {
    if (id === 'all') {
      setAssignedTo((prev) => prev.includes('all') ? [] : ['all']);
      return;
    }
    setAssignedTo((prev) => {
      const filtered = prev.filter((v) => v !== 'all');
      return filtered.includes(id) ? filtered.filter((v) => v !== id) : [...filtered, id];
    });
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <button
        type="button"
        onClick={() => toggle('all')}
        style={{
          padding: '4px 10px', borderRadius: 999, fontSize: '0.78rem', cursor: 'pointer',
          border: assignedTo.includes('all') ? '1.5px solid var(--amethyst)' : '1.5px solid var(--border-color, rgba(255,255,255,0.15))',
          background: assignedTo.includes('all') ? 'var(--amethyst)' : 'transparent',
          color: assignedTo.includes('all') ? '#fff' : 'var(--text-secondary)',
        }}
      >
        {t(messages, 'module.calendar.assign_all')}
      </button>
      {members.map((m, i) => {
        const selected = assignedTo.includes('all') || assignedTo.includes(m.user_id);
        const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
        return (
          <button
            key={m.user_id}
            type="button"
            onClick={() => toggle(m.user_id)}
            style={{
              padding: '4px 10px', borderRadius: 999, fontSize: '0.78rem', cursor: 'pointer',
              border: `1.5px solid ${color}`,
              background: selected ? color : 'transparent',
              color: selected ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {m.display_name}
          </button>
        );
      })}
    </div>
  );
}

export function AssignedBadges({ assignedTo, members }) {
  if (!assignedTo) return null;

  let badgeMembers;
  if (assignedTo === 'all') {
    badgeMembers = members;
  } else if (Array.isArray(assignedTo)) {
    badgeMembers = members.filter((m) => assignedTo.includes(m.user_id));
  } else {
    return null;
  }
  if (badgeMembers.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
      {badgeMembers.map((m, i) => {
        const initials = m.display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        return (
          <span
            key={m.user_id}
            title={m.display_name}
            style={{
              width: 20, height: 20, borderRadius: '50%', fontSize: '0.6rem', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: MEMBER_COLORS[i % MEMBER_COLORS.length], color: '#fff',
            }}
          >
            {initials}
          </span>
        );
      })}
    </div>
  );
}

export function EventCard({ ev, index, messages, onDelete, members }) {
  return (
    <div className="day-event-card" style={{ borderColor: MEMBER_COLORS[index % MEMBER_COLORS.length] }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          {ev.title}
          {ev.is_recurring && <Repeat size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{prettyDate(ev.starts_at, messages)}</div>
        {members && <AssignedBadges assignedTo={ev.assigned_to} members={members} />}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(ev); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
          aria-label={t(messages, 'aria.delete_event').replace('{title}', ev.title)}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
