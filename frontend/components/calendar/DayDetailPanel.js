import { Plus } from 'lucide-react';
import { t } from '../../lib/i18n';
import { RECURRENCE_OPTIONS, AssignChips, EventCard } from './CalendarHelpers';
import { COLOR_PALETTE } from '../../lib/member-colors';

export default function DayDetailPanel({ cal, locale, messages, lang, timeFormat, events, members, isChild, demoMode, setActiveView, isMobile }) {
  if (!cal.selectedDate) return null;

  return (
    <div className={`day-detail-panel${isMobile ? ' day-detail-panel-mobile' : ''}`} style={isMobile ? { marginTop: 'var(--space-md)' } : undefined}>
      {/* Date header */}
      <div className="day-detail-date">
        {cal.selectedDate.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <div className="day-detail-weekday">
        {cal.selectedDate.toLocaleDateString(locale, { weekday: 'long' })}
      </div>

      {/* Event list */}
      <div className="day-detail-events">
        {cal.selectedDayEvents.length === 0 && (
          <div className="cal-empty-day">
            {t(messages, 'module.calendar.no_events_day')}
            {events.length === 0 && !demoMode && (
              <div className="cal-import-cta">
                <button type="button" className="bento-empty-action" onClick={() => setActiveView('settings')}>
                  {t(messages, 'module.calendar.import_cta')}
                </button>
              </div>
            )}
          </div>
        )}
        {cal.selectedDayEvents.map((ev, i) => (
          <EventCard
            key={ev.occurrence_date ? `${ev.id}-${ev.occurrence_date}` : ev.id}
            ev={ev} index={i} messages={messages} lang={lang} timeFormat={timeFormat}
            onDelete={isChild ? null : cal.deleteEvent}
            onEdit={isChild ? null : cal.startEdit}
            members={members}
          />
        ))}
      </div>

      {/* Edit form */}
      {cal.editingEvent && (
        <form onSubmit={cal.saveEdit} className="cal-edit-form">
          <div className="cal-form-section-title">{t(messages, 'module.calendar.edit_event')}</div>
          <input className="form-input" value={cal.editTitle} onChange={e => cal.setEditTitle(e.target.value)} required />
          <div className="cal-form-row">
            <input className="form-input cal-form-datetime" type="datetime-local" value={cal.editStartsAt} onChange={e => cal.setEditStartsAt(e.target.value)} required />
            <input className="form-input cal-form-datetime" type="datetime-local" value={cal.editEndsAt} onChange={e => cal.setEditEndsAt(e.target.value)} />
          </div>
          <input className="form-input" value={cal.editDescription} onChange={e => cal.setEditDescription(e.target.value)} placeholder={t(messages, 'module.calendar.description')} />
          <div className="cal-form-actions">
            <button className="btn-sm" type="submit">{t(messages, 'save')}</button>
            <button className="btn-ghost" type="button" onClick={cal.cancelEdit}>{t(messages, 'cancel')}</button>
          </div>
        </form>
      )}

      {/* Create form */}
      {!isChild && !cal.editingEvent && (
        <>
          <div className="cal-form-section-title">{t(messages, 'module.calendar.quick_add')}</div>
          <form onSubmit={cal.createEvent} className="quick-add-form">
            <input className="form-input cal-form-input-lg" placeholder={t(messages, 'module.calendar.new_event')} value={cal.title} onChange={e => cal.setTitle(e.target.value)} required />
            <div className="cal-form-row">
              <input className="form-input cal-form-datetime" type="datetime-local" value={cal.startsAt} onChange={e => cal.setStartsAt(e.target.value)} required />
              <input className="form-input cal-form-datetime" type="datetime-local" value={cal.endsAt} onChange={e => cal.setEndsAt(e.target.value)} />
            </div>
            <select className="form-input cal-form-datetime" value={cal.recurrence} onChange={e => cal.setRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(messages, opt.key)}</option>
              ))}
            </select>
            {cal.recurrence && (
              <input className="form-input cal-form-datetime" type="date" value={cal.recurrenceEnd} onChange={e => cal.setRecurrenceEnd(e.target.value)} placeholder={t(messages, 'module.calendar.repeat_until')} />
            )}
            {members.length > 0 && (
              <div>
                <div className="cal-form-label">{t(messages, 'module.calendar.assign_to')}</div>
                <AssignChips members={members} assignedTo={cal.assignedTo} setAssignedTo={cal.setAssignedTo} messages={messages} />
              </div>
            )}
            <div>
              <div className="cal-form-label">{t(messages, 'module.calendar.color')}</div>
              <div className="color-picker">
                <button type="button" onClick={() => cal.setColor('')}
                  className={`color-swatch color-swatch-none${!cal.color ? ' color-swatch-active' : ''}`}
                  aria-label={t(messages, 'module.calendar.color_none')} />
                {COLOR_PALETTE.slice(0, 8).map(c => (
                  <button type="button" key={c} onClick={() => cal.setColor(c)}
                    className={`color-swatch${cal.color === c ? ' color-swatch-active' : ''}`}
                    style={{ background: c }}
                    aria-label={c} />
                ))}
              </div>
            </div>
            <button className="btn-sm" type="submit"><Plus size={14} /> {t(messages, 'create_event')}</button>
          </form>
        </>
      )}
    </div>
  );
}
