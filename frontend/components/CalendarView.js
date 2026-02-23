import { useApp } from '../contexts/AppContext';
import { useCalendar } from '../hooks/useCalendar';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { navBtn, styles } from '../lib/styles';

export default function CalendarView() {
  const { familyId, families, tokens, messages, ui, isMobile, switchFamily, loadEvents, loadDashboard } = useApp();
  const cal = useCalendar();

  return (
    <div style={ui.card}>
      <h2>{t(messages, 'calendar')}</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select
          style={{ ...ui.input, maxWidth: 220 }}
          value={familyId}
          onChange={(e) => switchFamily(e.target.value)}
        >
          {families.map((f) => (
            <option key={f.family_id} value={String(f.family_id)}>{f.family_name}</option>
          ))}
        </select>
        <button style={ui.secondaryBtn} onClick={() => { loadEvents(); loadDashboard(); }}>{t(messages, 'reload')}</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <button style={navBtn(cal.calendarView === 'month', tokens)} onClick={() => cal.setCalendarView('month')}>Monat</button>
        <button style={navBtn(cal.calendarView === 'week', tokens)} onClick={() => cal.setCalendarView('week')}>Woche</button>
        {cal.calendarView === 'month' && (
          <>
            <button style={ui.secondaryBtn} onClick={() => { cal.setCalendarMonth(new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth() - 1, 1)); cal.setSelectedDate(null); }}>&#9664;</button>
            <span style={{ alignSelf: 'center', fontWeight: 600 }}>{cal.monthLabel}</span>
            <button style={ui.secondaryBtn} onClick={() => { cal.setCalendarMonth(new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth() + 1, 1)); cal.setSelectedDate(null); }}>&#9654;</button>
          </>
        )}
      </div>

      {cal.calendarMsg && <p>{cal.calendarMsg}</p>}

      {cal.calendarView === 'month' ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6, fontSize: 12, color: tokens.muted }}>
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {cal.monthCells.map((c, idx) => {
              const isSelected = !c.empty && cal.selectedDate && cal.selectedDate.getFullYear() === cal.calendarMonth.getFullYear() && cal.selectedDate.getMonth() === cal.calendarMonth.getMonth() && cal.selectedDate.getDate() === c.day;
              return (
                <button
                  key={idx}
                  type="button"
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
                  style={{
                    ...ui.smallCard,
                    minHeight: isMobile ? 52 : 72,
                    padding: 8,
                    opacity: c.empty ? 0.35 : 1,
                    textAlign: 'left',
                    cursor: c.empty ? 'default' : 'pointer',
                    borderColor: isSelected ? tokens.primary : ui.smallCard.borderColor,
                  }}
                >
                  {!c.empty && (
                    <>
                      <div style={{ fontWeight: 600 }}>{c.day}</div>
                      {c.count > 0 && <div style={{ fontSize: 12, color: tokens.muted }}>{c.count} Termine</div>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ ...ui.smallCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>KW {cal.weekInfo.weekNumber}</strong>
            <small style={{ color: tokens.muted }}>
              {cal.weekInfo.weekStart.toLocaleDateString('de-DE')} bis {new Date(cal.weekInfo.weekEnd.getTime() - 1).toLocaleDateString('de-DE')}
            </small>
          </div>

          {cal.weekInfo.weekEvents.length === 0 && (
            <div style={ui.smallCard}>Keine Termine in der aktuellen Woche</div>
          )}

          {cal.weekInfo.weekEvents.map((e) => (
            <div key={e.id} style={ui.smallCard}>
              <strong>{e.title}</strong>
              <small>{prettyDate(e.starts_at)}</small>
            </div>
          ))}
        </div>
      )}

      {cal.calendarView === 'month' && cal.selectedDate && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${tokens.border}`, paddingTop: 12 }}>
          <h3 style={{ margin: '0 0 8px' }}>
            {cal.selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </h3>

          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            {cal.selectedDayEvents.length === 0 && <small style={{ color: tokens.muted }}>Keine Termine an diesem Tag</small>}
            {cal.selectedDayEvents.map((ev) => (
              <div key={ev.id} style={ui.smallCard}>
                <strong>{ev.title}</strong>
                <small>{prettyDate(ev.starts_at)}</small>
              </div>
            ))}
          </div>

          <form onSubmit={cal.createEvent} style={styles.formGrid}>
            <input style={ui.input} placeholder={t(messages, 'title')} value={cal.title} onChange={(e) => cal.setTitle(e.target.value)} required />
            <textarea style={ui.input} placeholder={t(messages, 'description')} value={cal.description} onChange={(e) => cal.setDescription(e.target.value)} />
            <input style={ui.input} type="datetime-local" value={cal.startsAt} onChange={(e) => cal.setStartsAt(e.target.value)} required />
            <input style={ui.input} type="datetime-local" value={cal.endsAt} onChange={(e) => cal.setEndsAt(e.target.value)} />
            <label><input type="checkbox" checked={cal.allDay} onChange={(e) => cal.setAllDay(e.target.checked)} /> Ganztägig</label>
            <button style={ui.primaryBtn} type="submit">Termin für diesen Tag erstellen</button>
          </form>
        </div>
      )}

      {cal.calendarView === 'week' && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${tokens.border}`, paddingTop: 12 }}>
          <form onSubmit={cal.addBirthday} style={{ ...styles.formGrid }}>
            <h3 style={{ marginBottom: 0 }}>Geburtstag anlegen</h3>
            <input style={ui.input} placeholder="Name" value={cal.birthdayName} onChange={(e) => cal.setBirthdayName(e.target.value)} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input style={ui.input} type="number" min="1" max="12" placeholder="Monat" value={cal.birthdayMonth} onChange={(e) => cal.setBirthdayMonth(e.target.value)} required />
              <input style={ui.input} type="number" min="1" max="31" placeholder="Tag" value={cal.birthdayDay} onChange={(e) => cal.setBirthdayDay(e.target.value)} required />
            </div>
            <button style={ui.secondaryBtn} type="submit">Geburtstag speichern</button>
          </form>
        </div>
      )}
    </div>
  );
}
