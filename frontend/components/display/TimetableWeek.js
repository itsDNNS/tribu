import { Coffee } from 'lucide-react';
import { currentPeriodPosition, schoolToday, subjectPalette } from '../../lib/schoolTimetable';

const WEEKDAYS = [1, 2, 3, 4, 5, 6];

// Monday … Saturday in the display's language (2024-01-01 was a Monday).
function weekdayName(locale, weekday, width) {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(new Date(2024, 0, weekday));
}

function clock(value) {
  return String(value || '').slice(0, 5);
}

// The week as a grid: today's column (or tomorrow's, looking ahead in the
// evening) and the running period marked. Shared by the full-screen
// timetable and the "timetable" card in a large zone.
export default function TimetableWeek({ week, now, t, locale, eink = false, ahead = false }) {
  const weekdays = WEEKDAYS.filter((day) => day <= 5 || week.include_saturday);
  const todayValue = now.getDay() === 0 ? 7 : now.getDay();
  const tomorrowValue = (todayValue % 7) + 1;
  const marked = ahead ? (weekdays.includes(tomorrowValue) ? tomorrowValue : null) : schoolToday(weekdays, now);
  const periods = [...(week.periods || [])].sort((a, b) => a.position - b.position);
  const current = !ahead && marked ? currentPeriodPosition(periods, now) : null;
  const subjects = new Map(
    (week.lessons || []).map((lesson) => [`${lesson.weekday}:${lesson.period_position}`, lesson.subject]),
  );
  const rows = [
    'auto',
    ...periods.map((period) => (period.kind === 'break' ? 'minmax(0, 0.5fr)' : 'minmax(0, 1fr)')),
  ].join(' ');
  const markLabel = t(ahead ? 'display.stage.tomorrow' : 'display.timetable.today');
  const today = marked;
  return (
    <div
      className="stage-timetable"
      role="grid"
      aria-label={week.name}
      style={{
        gridTemplateColumns: `minmax(6.5em, auto) repeat(${weekdays.length}, minmax(0, 1fr))`,
        gridTemplateRows: rows,
      }}
    >
      <div className="stage-tt-corner" />
      {weekdays.map((day) => (
        <div key={day} role="columnheader" className={`stage-tt-day${day === today ? ' is-today' : ''}`}>
          <b>{weekdayName(locale, day, 'short')}</b>
          <span>{day === today ? markLabel : weekdayName(locale, day, 'long')}</span>
        </div>
      ))}
      {periods.map((period) => {
        const running = period.position === current;
        const time = `${clock(period.start_time)}–${clock(period.end_time)}`;
        if (period.kind === 'break') {
          return (
            <div key={period.position} className={`stage-tt-break${running ? ' is-now' : ''}`} role="row">
              <span className="stage-tt-time">{time}</span>
              <span className="stage-tt-break-label">
                <Coffee size={16} aria-hidden="true" />
                {period.break_label || t('display.stage.school_break')}
              </span>
            </div>
          );
        }
        return (
          <div key={period.position} className={`stage-tt-row${running ? ' is-now' : ''}`} role="row">
            <div className="stage-tt-period" role="rowheader">
              <b>{period.label}</b>
              <span>{time}</span>
            </div>
            {weekdays.map((day) => {
              const subject = subjects.get(`${day}:${period.position}`) || '';
              const palette = subjectPalette(subject);
              const isNow = running && day === today;
              return (
                <div
                  key={day}
                  role="gridcell"
                  className={`stage-tt-cell${subject ? ' is-filled' : ''}${day === today ? ' is-today' : ''}${isNow ? ' is-now' : ''}`}
                  style={palette && !eink ? { '--tt-bg': palette.bg, '--tt-fg': palette.fg } : undefined}
                >
                  {subject || '–'}
                  {isNow && <span className="stage-tt-now">{t('display.timetable.now')}</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
