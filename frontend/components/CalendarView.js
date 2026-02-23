import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCalendar } from '../hooks/useCalendar';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';

const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

export default function CalendarView() {
  const { familyId, families, messages, isMobile, switchFamily, loadEvents, loadDashboard } = useApp();
  const cal = useCalendar();

  const today = new Date();
  const isToday = (day) => {
    return day === today.getDate()
      && cal.calendarMonth.getMonth() === today.getMonth()
      && cal.calendarMonth.getFullYear() === today.getFullYear();
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <div className="view-title">{t(messages, 'calendar')}</div>
          <div className="view-subtitle">
            {families.find((f) => String(f.family_id) === String(familyId))?.family_name || ''}
          </div>
        </div>
      </div>

      {cal.calendarView === 'month' && (
        <div className="calendar-controls">
          <div className="calendar-nav">
            <button className="calendar-nav-btn" onClick={() => { cal.setCalendarMonth(new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth() - 1, 1)); cal.setSelectedDate(null); }}>
              <ChevronLeft size={18} />
            </button>
            <div className="calendar-month-label">{cal.monthLabel}</div>
            <button className="calendar-nav-btn" onClick={() => { cal.setCalendarMonth(new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth() + 1, 1)); cal.setSelectedDate(null); }}>
              <ChevronRight size={18} />
            </button>
          </div>
          <button className="today-btn" onClick={() => { cal.setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); cal.setSelectedDate(today); }}>Heute</button>
          <div className="calendar-view-toggle">
            <button className={`calendar-view-btn${cal.calendarView === 'month' ? ' active' : ''}`} onClick={() => cal.setCalendarView('month')}>Monat</button>
            <button className={`calendar-view-btn${cal.calendarView === 'week' ? ' active' : ''}`} onClick={() => cal.setCalendarView('week')}>Woche</button>
          </div>
        </div>
      )}

      {cal.calendarView === 'week' && (
        <div className="calendar-controls">
          <div className="calendar-view-toggle">
            <button className={`calendar-view-btn${cal.calendarView === 'month' ? ' active' : ''}`} onClick={() => cal.setCalendarView('month')}>Monat</button>
            <button className={`calendar-view-btn${cal.calendarView === 'week' ? ' active' : ''}`} onClick={() => cal.setCalendarView('week')}>Woche</button>
          </div>
        </div>
      )}

      {cal.calendarMsg && <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>{cal.calendarMsg}</p>}

      {cal.calendarView === 'month' ? (
        <div className={isMobile ? '' : 'calendar-layout'}>
          <div className="glass calendar-grid-wrapper">
            <div className="calendar-weekdays" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
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

                return (
                  <button
                    key={idx}
                    type="button"
                    className={cls.join(' ')}
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
                          <div className="calendar-day-dots">
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
                {cal.selectedDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="day-detail-weekday">
                {cal.selectedDate.toLocaleDateString('de-DE', { weekday: 'long' })}
              </div>

              <div className="day-detail-events">
                {cal.selectedDayEvents.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Keine Termine an diesem Tag</div>
                )}
                {cal.selectedDayEvents.map((ev, i) => (
                  <div key={ev.id} className="day-event-card" style={{ borderColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{ev.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{prettyDate(ev.starts_at)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Schnell anlegen</div>
              <form onSubmit={cal.createEvent} className="quick-add-form">
                <input className="form-input" placeholder="Neuer Termin..." value={cal.title} onChange={(e) => cal.setTitle(e.target.value)} required style={{ fontSize: '0.88rem', padding: '12px 14px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input className="form-input" type="datetime-local" value={cal.startsAt} onChange={(e) => cal.setStartsAt(e.target.value)} required style={{ fontSize: '0.82rem', padding: '10px 12px' }} />
                  <input className="form-input" type="datetime-local" value={cal.endsAt} onChange={(e) => cal.setEndsAt(e.target.value)} style={{ fontSize: '0.82rem', padding: '10px 12px' }} />
                </div>
                <button className="btn-sm" type="submit"><Plus size={14} /> Termin erstellen</button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="glass" style={{ padding: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <strong>KW {cal.weekInfo.weekNumber}</strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {cal.weekInfo.weekStart.toLocaleDateString('de-DE')} bis {new Date(cal.weekInfo.weekEnd.getTime() - 1).toLocaleDateString('de-DE')}
            </span>
          </div>

          <div className="day-detail-events">
            {cal.weekInfo.weekEvents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Keine Termine in der aktuellen Woche</div>
            )}
            {cal.weekInfo.weekEvents.map((ev, i) => (
              <div key={ev.id} className="day-event-card" style={{ borderColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{ev.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{prettyDate(ev.starts_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected date details on mobile */}
      {isMobile && cal.calendarView === 'month' && cal.selectedDate && (
        <div className="glass" style={{ padding: 'var(--space-lg)', marginTop: 'var(--space-md)' }}>
          <div className="day-detail-date">
            {cal.selectedDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="day-detail-weekday">
            {cal.selectedDate.toLocaleDateString('de-DE', { weekday: 'long' })}
          </div>
          <div className="day-detail-events">
            {cal.selectedDayEvents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Keine Termine</div>
            )}
            {cal.selectedDayEvents.map((ev, i) => (
              <div key={ev.id} className="day-event-card" style={{ borderColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{ev.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{prettyDate(ev.starts_at)}</div>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={cal.createEvent} className="quick-add-form">
            <input className="form-input" placeholder="Neuer Termin..." value={cal.title} onChange={(e) => cal.setTitle(e.target.value)} required />
            <input className="form-input" type="datetime-local" value={cal.startsAt} onChange={(e) => cal.setStartsAt(e.target.value)} required />
            <button className="btn-sm" type="submit"><Plus size={14} /> Termin erstellen</button>
          </form>
        </div>
      )}

      {/* Birthday form in week view */}
      {cal.calendarView === 'week' && (
        <div className="glass" style={{ padding: 'var(--space-lg)', marginTop: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-md)' }}>Geburtstag anlegen</div>
          <form onSubmit={cal.addBirthday} className="quick-add-form">
            <input className="form-input" placeholder="Name" value={cal.birthdayName} onChange={(e) => cal.setBirthdayName(e.target.value)} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="form-input" type="number" min="1" max="12" placeholder="Monat" value={cal.birthdayMonth} onChange={(e) => cal.setBirthdayMonth(e.target.value)} required />
              <input className="form-input" type="number" min="1" max="31" placeholder="Tag" value={cal.birthdayDay} onChange={(e) => cal.setBirthdayDay(e.target.value)} required />
            </div>
            <button className="btn-sm" type="submit">Geburtstag speichern</button>
          </form>
        </div>
      )}
    </div>
  );
}
