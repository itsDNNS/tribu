import { useEffect, useRef } from 'react';
import { Cake, Download, MapPin, Pencil, Repeat, Rss, Trash2 } from 'lucide-react';
import { prettyDate } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import { getMemberColor } from '../../lib/member-colors';
import AssignedBadges from '../AssignedBadges';

export const RECURRENCE_OPTIONS = [
  { value: '', key: 'module.calendar.no_repeat' },
  { value: 'daily', key: 'module.calendar.repeat_daily' },
  { value: 'weekly', key: 'module.calendar.repeat_weekly' },
  { value: 'biweekly', key: 'module.calendar.repeat_biweekly' },
  { value: 'monthly', key: 'module.calendar.repeat_monthly' },
  { value: 'yearly', key: 'module.calendar.repeat_yearly' },
];

export function mapsLinksForLocation(location) {
  const query = encodeURIComponent((location || '').trim());
  if (!query) return null;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${query}`,
    openStreetMap: `https://www.openstreetmap.org/search?query=${query}`,
  };
}

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
      className="cal-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-recurring-title"
    >
      <div className="cal-dialog">
        <div id="delete-recurring-title" className="cal-dialog-title">
          {t(messages, 'module.calendar.delete_recurring_question')}
        </div>
        <div className="cal-dialog-subtitle">
          {event.title}
        </div>
        <div className="cal-dialog-actions">
          <button ref={firstBtnRef} className="btn-sm" onClick={onDeleteThis}>
            {t(messages, 'module.calendar.delete_this_only')}
          </button>
          <button className="btn-sm cal-dialog-delete-all" onClick={onDeleteAll}>
            {t(messages, 'module.calendar.delete_all')}
          </button>
          <button className="btn-sm cal-dialog-cancel" onClick={onCancel}>
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
    <div className="assign-chips">
      <button
        type="button"
        className={`assign-chip${assignedTo.includes('all') ? ' assign-chip-active' : ''}`}
        onClick={() => toggle('all')}
      >
        {t(messages, 'module.calendar.assign_all')}
      </button>
      {members.map((m, i) => {
        const selected = assignedTo.includes('all') || assignedTo.includes(m.user_id);
        const color = getMemberColor(m, i);
        return (
          <button
            key={m.user_id}
            type="button"
            className={`assign-chip${selected ? ' assign-chip-active' : ''}`}
            onClick={() => toggle(m.user_id)}
            style={{ borderColor: color, ...(selected && { background: color }) }}
          >
            {m.display_name}
          </button>
        );
      })}
    </div>
  );
}

export function EventCard({ ev, index, messages, lang, timeFormat, onDelete, onEdit, members }) {
  const sourceType = ev.source_type || 'local';
  const isImported = sourceType === 'import' || sourceType === 'subscription';
  const editable = !!onEdit && !ev._isBirthday && !isImported;
  const cardClickable = editable;
  const mapsLinks = mapsLinksForLocation(ev.location);

  return (
    <div className="day-event-card" style={{ borderColor: ev.color || getMemberColor(null, index), cursor: cardClickable ? 'pointer' : undefined }} onClick={() => cardClickable && onEdit(ev)}>
      <div style={{ flex: 1 }}>
        <div className="event-card-title">
          {ev._isBirthday && <Cake size={14} style={{ color: '#f43f5e', flexShrink: 0 }} aria-hidden="true" />}
          {ev.title}
          {ev.is_recurring && <Repeat size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />}
          {isImported && (
            <span
              className="event-card-source-badge"
              data-source-type={sourceType}
              title={ev.source_name || t(messages, sourceType === 'subscription' ? 'module.calendar.source_subscription' : 'module.calendar.source_import')}
            >
              {sourceType === 'subscription'
                ? <Rss size={11} aria-hidden="true" />
                : <Download size={11} aria-hidden="true" />}
              <span className="event-card-source-label">
                {ev.source_name || t(messages, sourceType === 'subscription' ? 'module.calendar.source_subscription' : 'module.calendar.source_import')}
              </span>
            </span>
          )}
        </div>
        <div className="event-card-meta">{prettyDate(ev.starts_at, lang, timeFormat)}</div>
        {ev.location && (
          <div className="event-card-location">
            <MapPin size={13} aria-hidden="true" />
            <span>{ev.location}</span>
            {mapsLinks && (
              <span className="event-card-map-links">
                <a href={mapsLinks.google} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  {t(messages, 'module.calendar.open_google_maps')}
                </a>
                <a href={mapsLinks.openStreetMap} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  {t(messages, 'module.calendar.open_openstreetmap')}
                </a>
              </span>
            )}
          </div>
        )}
        {isImported && (
          <div className="event-card-source-hint">{t(messages, 'module.calendar.source_readonly_hint')}</div>
        )}
        {members && <AssignedBadges assignedTo={ev.assigned_to} members={members} />}
      </div>
      {editable && !ev.is_recurring && (
        <button type="button" className="event-card-action" onClick={(e) => { e.stopPropagation(); onEdit(ev); }}
          aria-label={t(messages, 'aria.edit_event').replace('{title}', ev.title)}>
          <Pencil size={14} />
        </button>
      )}
      {onDelete && !ev._isBirthday && (
        <button type="button" className="event-card-action" onClick={(e) => { e.stopPropagation(); onDelete(ev); }}
          aria-label={t(messages, 'aria.delete_event').replace('{title}', ev.title)}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
