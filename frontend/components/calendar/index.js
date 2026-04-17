import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCalendar } from '../../hooks/useCalendar';
import { t } from '../../lib/i18n';
import { DeleteRecurringDialog, EventCard } from './CalendarHelpers';
import { getMemberColor } from '../../lib/member-colors';
import DayDetailPanel from './DayDetailPanel';

export default function CalendarView() {
  const { familyId, families, messages, isMobile, lang, demoMode, events, setActiveView, isChild, members, timeFormat } = useApp();
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
          <div className="calendar-nav">
            <button
              className="calendar-nav-btn"
              onClick={cal.prevWeek}
              aria-label={t(messages, 'aria.previous_week')}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="calendar-month-label" aria-live="polite">
              {t(messages, 'module.calendar.cw')} {cal.weekInfo.weekNumber}: {cal.weekInfo.weekStart.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} – {new Date(cal.weekInfo.weekEnd.getTime() - 1).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
            </div>
            <button
              className="calendar-nav-btn"
              onClick={cal.nextWeek}
              aria-label={t(messages, 'aria.next_week')}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button className="today-btn" onClick={cal.goToCurrentWeek}>{t(messages, 'module.calendar.today')}</button>
          <div className="calendar-view-toggle">
            <button className={`calendar-view-btn${cal.calendarView === 'month' ? ' active' : ''}`} onClick={() => cal.setCalendarView('month')}>{t(messages, 'module.calendar.month')}</button>
            <button className={`calendar-view-btn${cal.calendarView === 'week' ? ' active' : ''}`} onClick={() => cal.setCalendarView('week')}>{t(messages, 'module.calendar.week')}</button>
          </div>
        </div>
      )}

      {cal.calendarView === 'month' ? (
        <div className={isMobile ? '' : 'calendar-layout'}>
          <div className="calendar-grid-wrapper">
            <div className="calendar-weekdays">
              {weekdays.map((d) => (
                <div key={d} className="calendar-weekday">{d}</div>
              ))}
            </div>
            <div className="calendar-days-grid">
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
                        const y = picked.getFullYear();
                        const m = String(picked.getMonth() + 1).padStart(2, '0');
                        const d = String(picked.getDate()).padStart(2, '0');
                        cal.setStartsAt(`${y}-${m}-${d}T09:00`);
                      }
                    }}
                  >
                    {!c.empty && (
                      <>
                        <span className="calendar-day-num">{c.day}</span>
                        {c.count > 0 && (
                          <div className="calendar-day-dots" aria-hidden="true">
                            {(c.events || []).slice(0, 3).map((ev, di) => (
                              <div key={di} className="calendar-day-dot" style={{ background: ev.color || getMemberColor(null, di) }} />
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
          {!isMobile && (
            <DayDetailPanel cal={cal} locale={locale} messages={messages} lang={lang} timeFormat={timeFormat} events={events} members={members} isChild={isChild} demoMode={demoMode} setActiveView={setActiveView} />
          )}
        </div>
      ) : (
        <div className="week-view">
          {cal.weekInfo.days.map((dayInfo, i) => {
            const isDayToday = dayInfo.date.toDateString() === today.toDateString();
            const isSelected = cal.selectedDate && dayInfo.date.toDateString() === cal.selectedDate.toDateString();
            return (
              <div key={i} className={`week-day${isDayToday ? ' week-day-today' : ''}`}>
                <button
                  type="button"
                  className={`week-day-header${isSelected ? ' week-day-selected' : ''}`}
                  onClick={() => {
                    cal.setSelectedDate(dayInfo.date);
                    const local = new Date(dayInfo.date.getFullYear(), dayInfo.date.getMonth(), dayInfo.date.getDate(), 9, 0);
                    const offset = local.getTimezoneOffset();
                    const localIso = new Date(local.getTime() - offset * 60000).toISOString().slice(0, 16);
                    cal.setStartsAt(localIso);
                  }}
                >
                  {dayInfo.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {isDayToday && <span className="week-day-today-badge">{t(messages, 'module.calendar.today')}</span>}
                </button>
                <div className="week-day-events">
                  {dayInfo.dayEvents.length === 0 ? (
                    <div className="week-day-empty">{t(messages, 'module.calendar.no_events_day')}</div>
                  ) : (
                    dayInfo.dayEvents.map((ev, j) => (
                      <EventCard key={ev.occurrence_date ? `${ev.id}-${ev.occurrence_date}` : ev.id} ev={ev} index={j} messages={messages} lang={lang} timeFormat={timeFormat} onDelete={isChild ? null : cal.deleteEvent} onEdit={isChild ? null : cal.startEdit} members={members} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected date details on mobile */}
      {isMobile && cal.calendarView === 'month' && cal.selectedDate && (
        <DayDetailPanel cal={cal} locale={locale} messages={messages} lang={lang} timeFormat={timeFormat} events={events} members={members} isChild={isChild} demoMode={demoMode} setActiveView={setActiveView} isMobile />
      )}

      {/* Birthday form in week view */}
      {cal.calendarView === 'week' && !isChild && (
        <div className="cal-form-panel" style={{ marginTop: 'var(--space-md)' }}>
          <div className="cal-form-section-title">{t(messages, 'create_birthday')}</div>
          <form onSubmit={cal.addBirthday} className="quick-add-form">
            <input className="form-input" placeholder={t(messages, 'name')} value={cal.birthdayName} onChange={(e) => cal.setBirthdayName(e.target.value)} required />
            <div className="cal-form-row">
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
