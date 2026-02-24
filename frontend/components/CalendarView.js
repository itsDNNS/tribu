import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCalendar } from '../hooks/useCalendar';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';

const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

const RECURRENCE_OPTIONS = [
  { value: '', key: 'module.calendar.no_repeat' },
  { value: 'daily', key: 'module.calendar.repeat_daily' },
  { value: 'weekly', key: 'module.calendar.repeat_weekly' },
  { value: 'biweekly', key: 'module.calendar.repeat_biweekly' },
  { value: 'monthly', key: 'module.calendar.repeat_monthly' },
  { value: 'yearly', key: 'module.calendar.repeat_yearly' },
];

function DeleteRecurringDialog({ event, messages, onDeleteThis, onDeleteAll, onCancel }) {
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

function EventCard({ ev, index, messages, onDelete }) {
  return (
    <div className="day-event-card" style={{ borderColor: MEMBER_COLORS[index % MEMBER_COLORS.length] }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          {ev.title}
          {ev.is_recurring && <Repeat size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{prettyDate(ev.starts_at, messages)}</div>
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

export default function CalendarView() {
  const { familyId, families, messages, isMobile, lang, demoMode, events, switchFamily, loadEvents, loadDashboard, setActiveView } = useApp();
  const cal = useCalendar();
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const weekdays = t(messages, 'module.calendar.weekdays').split(',');

  const today = new Date();
  const isToday = (day) => {
    return day === today.getDate()
      && cal.calendarMonth.getMonth() === today.getMonth()
      && cal.calendarMonth.getFullYear() === today.getFullYear();
  };

  return (
    <div>
      {/* Delete confirmation dialog for recurring events */}
      {cal.deleteConfirm && (
        <DeleteRecurringDialog
          event={cal.deleteConfirm}
          messages={messages}
          onDeleteThis={() => cal.performDelete(cal.deleteConfirm.id, cal.deleteConfirm.occurrence_date)}
          onDeleteAll={() => cal.performDelete(cal.deleteConfirm.id, null)}
          onCancel={() => cal.setDeleteConfirm(null)}
        />
      )}

      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'calendar')}</h1>
          <div className="view-subtitle">
            {families.find((f) => String(f.family_id) === String(familyId))?.family_name || ''}
          </div>
        </div>
      </div>

      {cal.calendarView === 'month' && (
        <div className="calendar-controls">
          <div className="calendar-nav">
            <button
              className="calendar-nav-btn"
              onClick={() => { cal.setCalendarMonth(new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth() - 1, 1)); cal.setSelectedDate(null); }}
              aria-label={t(messages, 'aria.previous_month')}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="calendar-month-label" aria-live="polite">
              {cal.calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </div>
            <button
              className="calendar-nav-btn"
              onClick={() => { cal.setCalendarMonth(new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth() + 1, 1)); cal.setSelectedDate(null); }}
              aria-label={t(messages, 'aria.next_month')}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button className="today-btn" onClick={() => { cal.setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); cal.setSelectedDate(today); }}>{t(messages, 'module.calendar.today')}</button>
          <div className="calendar-view-toggle">
            <button className={`calendar-view-btn${cal.calendarView === 'month' ? ' active' : ''}`} onClick={() => cal.setCalendarView('month')}>{t(messages, 'module.calendar.month')}</button>
            <button className={`calendar-view-btn${cal.calendarView === 'week' ? ' active' : ''}`} onClick={() => cal.setCalendarView('week')}>{t(messages, 'module.calendar.week')}</button>
          </div>
        </div>
      )}

      {cal.calendarView === 'week' && (
        <div className="calendar-controls">
          <div className="calendar-view-toggle">
            <button className={`calendar-view-btn${cal.calendarView === 'month' ? ' active' : ''}`} onClick={() => cal.setCalendarView('month')}>{t(messages, 'module.calendar.month')}</button>
            <button className={`calendar-view-btn${cal.calendarView === 'week' ? ' active' : ''}`} onClick={() => cal.setCalendarView('week')}>{t(messages, 'module.calendar.week')}</button>
          </div>
        </div>
      )}

      {cal.calendarMsg && <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>{cal.calendarMsg}</p>}

      {cal.calendarView === 'month' ? (
        <div className={isMobile ? '' : 'calendar-layout'}>
          <div className="glass calendar-grid-wrapper">
            <div className="calendar-weekdays" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {weekdays.map((d) => (
                <div key={d} className="calendar-weekday">{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cal.monthCells.map((c, idx) => {
                const isSelectedDay = !c.empty && cal.selectedDate
                  && cal.selectedDate.getFullYear() === cal.calendarMonth.getFullYear()
                  && cal.selectedDate.getMonth() === cal.calendarMonth.getMonth()
                  && cal.selectedDate.getDate() === c.day;
                const isTodayCell = !c.empty && isToday(c.day);
                const cls = ['calendar-day'];
                if (c.empty) cls.push('empty');
                if (isTodayCell) cls.push('today');
                if (isSelectedDay) cls.push('selected');

                const dayDate = !c.empty
                  ? new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth(), c.day)
                  : null;
                const dayLabel = dayDate
                  ? dayDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' }) + (c.count > 0 ? `, ${t(messages, 'aria.events').replace('{count}', c.count)}` : '')
                  : undefined;

                return (
                  <button
                    key={idx}
                    type="button"
                    className={cls.join(' ')}
                    tabIndex={c.empty ? -1 : 0}
                    aria-label={dayLabel}
                    onClick={() => {
                      if (c.empty) return;
                      const picked = new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth(), c.day);
                      cal.setSelectedDate(picked);
                      if (!cal.startsAt) {
                        const local = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 9, 0);
                        const offset = local.getTimezoneOffset();
                        const localIso = new Date(local.getTime() - offset * 60000).toISOString().slice(0, 16);
                        cal.setStartsAt(localIso);
                      }
                    }}
                  >
                    {!c.empty && (
                      <>
                        <span className="calendar-day-num">{c.day}</span>
                        {c.count > 0 && (
                          <div className="calendar-day-dots" aria-hidden="true">
                            {Array.from({ length: Math.min(c.count, 3) }).map((_, di) => (
                              <div key={di} className="calendar-day-dot" style={{ background: MEMBER_COLORS[di % MEMBER_COLORS.length] }} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day Detail Panel */}
          {!isMobile && cal.selectedDate && (
            <div className="glass day-detail-panel">
              <div className="day-detail-date">
                {cal.selectedDate.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="day-detail-weekday">
                {cal.selectedDate.toLocaleDateString(locale, { weekday: 'long' })}
              </div>

              <div className="day-detail-events">
                {cal.selectedDayEvents.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    {t(messages, 'module.calendar.no_events_day')}
                    {events.length === 0 && !demoMode && (
                      <div style={{ marginTop: 'var(--space-sm)' }}>
                        <button
                          type="button"
                          onClick={() => setActiveView('settings')}
                          style={{ background: 'none', border: 'none', color: 'var(--amethyst)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                        >
                          {t(messages, 'module.calendar.import_cta')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {cal.selectedDayEvents.map((ev, i) => (
                  <EventCard key={ev.occurrence_date ? `${ev.id}-${ev.occurrence_date}` : ev.id} ev={ev} index={i} messages={messages} onDelete={cal.deleteEvent} />
                ))}
              </div>

              <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t(messages, 'module.calendar.quick_add')}</div>
              <form onSubmit={cal.createEvent} className="quick-add-form">
                <input className="form-input" placeholder={t(messages, 'module.calendar.new_event')} value={cal.title} onChange={(e) => cal.setTitle(e.target.value)} required style={{ fontSize: '0.88rem', padding: '12px 14px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input className="form-input" type="datetime-local" value={cal.startsAt} onChange={(e) => cal.setStartsAt(e.target.value)} required style={{ fontSize: '0.82rem', padding: '10px 12px' }} />
                  <input className="form-input" type="datetime-local" value={cal.endsAt} onChange={(e) => cal.setEndsAt(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }} />
                </div>
                <select className="form-input" value={cal.recurrence} onChange={(e) => cal.setRecurrence(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }}>
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(messages, opt.key)}</option>
                  ))}
                </select>
                {cal.recurrence && (
                  <input className="form-input" type="date" value={cal.recurrenceEnd} onChange={(e) => cal.setRecurrenceEnd(e.target.value)} placeholder={t(messages, 'module.calendar.repeat_until')} style={{ fontSize: '0.82rem', padding: '10px 12px' }} />
                )}
                <button className="btn-sm" type="submit"><Plus size={14} /> {t(messages, 'create_event')}</button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="glass" style={{ padding: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <strong>{t(messages, 'module.calendar.cw')} {cal.weekInfo.weekNumber}</strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {cal.weekInfo.weekStart.toLocaleDateString(locale)} {t(messages, 'module.calendar.to')} {new Date(cal.weekInfo.weekEnd.getTime() - 1).toLocaleDateString(locale)}
            </span>
          </div>

          <div className="day-detail-events">
            {cal.weekInfo.weekEvents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t(messages, 'module.calendar.no_events_week')}</div>
            )}
            {cal.weekInfo.weekEvents.map((ev, i) => (
              <EventCard key={ev.occurrence_date ? `${ev.id}-${ev.occurrence_date}` : ev.id} ev={ev} index={i} messages={messages} onDelete={cal.deleteEvent} />
            ))}
          </div>
        </div>
      )}

      {/* Selected date details on mobile */}
      {isMobile && cal.calendarView === 'month' && cal.selectedDate && (
        <div className="glass" style={{ padding: 'var(--space-lg)', marginTop: 'var(--space-md)' }}>
          <div className="day-detail-date">
            {cal.selectedDate.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="day-detail-weekday">
            {cal.selectedDate.toLocaleDateString(locale, { weekday: 'long' })}
          </div>
          <div className="day-detail-events">
            {cal.selectedDayEvents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                {t(messages, 'module.calendar.no_events')}
                {events.length === 0 && !demoMode && (
                  <div style={{ marginTop: 'var(--space-sm)' }}>
                    <button
                      type="button"
                      onClick={() => setActiveView('settings')}
                      style={{ background: 'none', border: 'none', color: 'var(--amethyst)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                    >
                      {t(messages, 'module.calendar.import_cta')}
                    </button>
                  </div>
                )}
              </div>
            )}
            {cal.selectedDayEvents.map((ev, i) => (
              <EventCard key={ev.occurrence_date ? `${ev.id}-${ev.occurrence_date}` : ev.id} ev={ev} index={i} messages={messages} onDelete={cal.deleteEvent} />
            ))}
          </div>
          <form onSubmit={cal.createEvent} className="quick-add-form">
            <input className="form-input" placeholder={t(messages, 'module.calendar.new_event')} value={cal.title} onChange={(e) => cal.setTitle(e.target.value)} required />
            <input className="form-input" type="datetime-local" value={cal.startsAt} onChange={(e) => cal.setStartsAt(e.target.value)} required />
            <select className="form-input" value={cal.recurrence} onChange={(e) => cal.setRecurrence(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }}>
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(messages, opt.key)}</option>
              ))}
            </select>
            <button className="btn-sm" type="submit"><Plus size={14} /> {t(messages, 'create_event')}</button>
          </form>
        </div>
      )}

      {/* Birthday form in week view */}
      {cal.calendarView === 'week' && (
        <div className="glass" style={{ padding: 'var(--space-lg)', marginTop: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-md)' }}>{t(messages, 'create_birthday')}</div>
          <form onSubmit={cal.addBirthday} className="quick-add-form">
            <input className="form-input" placeholder={t(messages, 'name')} value={cal.birthdayName} onChange={(e) => cal.setBirthdayName(e.target.value)} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="form-input" type="number" min="1" max="12" placeholder={t(messages, 'month')} value={cal.birthdayMonth} onChange={(e) => cal.setBirthdayMonth(e.target.value)} required />
              <input className="form-input" type="number" min="1" max="31" placeholder={t(messages, 'day')} value={cal.birthdayDay} onChange={(e) => cal.setBirthdayDay(e.target.value)} required />
            </div>
            <button className="btn-sm" type="submit">{t(messages, 'save_birthday')}</button>
          </form>
        </div>
      )}
    </div>
  );
}
