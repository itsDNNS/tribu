import { useMemo } from 'react';
import { Coffee, GraduationCap, WifiOff } from 'lucide-react';
import { Avatar } from './StageCards';
import { useMinuteClock } from './StageDisplay';
import { dayPart, formatClock, looksAhead, normalizeStageConfig } from './stageModel';
import { currentPeriodPosition, schoolToday, subjectPalette } from '../../lib/schoolTimetable';

const WEEKDAYS = [1, 2, 3, 4, 5, 6];

// Monday … Saturday in the display's language (2024-01-01 was a Monday).
function weekdayName(locale, weekday, width) {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(new Date(2024, 0, weekday));
}

function clock(value) {
  return String(value || '').slice(0, 5);
}

// A display that shows one school timetable in full (Tribu 2.0): the whole
// week, today and the running period marked, for a kids' room or the hall.
export default function TimetableStage({ me, dashboard, t, locale, offlineSince = null }) {
  const now = useMinuteClock();
  const config = useMemo(() => normalizeStageConfig(dashboard?.config || me?.config), [dashboard?.config, me?.config]);
  const part = dayPart(now, config.dayParts);
  const eink = config.mode === 'eink';
  const dark = config.themeMode === 'auto' ? !eink && looksAhead(part) : !eink && config.themeMode === 'dark';
  const timeFormat = dashboard.time_format === '12h' ? '12h' : '24h';
  const week = dashboard.school_timetable;
  const weekdays = WEEKDAYS.filter((day) => day <= 5 || week?.include_saturday);
  const today = schoolToday(weekdays, now);
  const periods = [...(week?.periods || [])].sort((a, b) => a.position - b.position);
  const current = today ? currentPeriodPosition(periods, now) : null;
  const subjects = new Map((week?.lessons || []).map((lesson) => [`${lesson.weekday}:${lesson.period_position}`, lesson.subject]));
  const rows = ['auto', ...periods.map((period) => (period.kind === 'break' ? 'minmax(0, 0.5fr)' : 'minmax(0, 1fr)'))].join(' ');

  return (
    <div
      className={`stage stage--${config.mode} stage--timetable${dark ? ' stage--dark' : ''}`}
      data-testid="display-dashboard"
      data-display-mode={config.mode}
      data-layout-preset="timetable"
      data-day-part={part}
      role="region"
      aria-label={t('display.timetable.region_label')}
    >
      <header className="stage-head">
        <div className="stage-clock-block">
          <div className="stage-clock" data-testid="display-time">{formatClock(now, locale, timeFormat)}</div>
          <div className="stage-date">{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</div>
        </div>
        <div className="stage-timetable-title">
          {(week?.children || []).map((child, index) => <Avatar key={child.display_name} member={child} index={index} size={44} />)}
          <strong>{week?.name || t('display.timetable.title')}</strong>
          {week?.class_label && <span>{week.class_label}</span>}
        </div>
        {offlineSince && (
          <span className="stage-offline" role="status">
            <WifiOff size={16} aria-hidden="true" />
            {t('display.stage.offline').replace('{time}', formatClock(offlineSince, locale, timeFormat))}
          </span>
        )}
      </header>

      {week ? (
        <div
          className="stage-timetable"
          role="grid"
          aria-label={week.name}
          style={{ gridTemplateColumns: `minmax(6.5em, auto) repeat(${weekdays.length}, minmax(0, 1fr))`, gridTemplateRows: rows }}
        >
          <div className="stage-tt-corner" />
          {weekdays.map((day) => (
            <div key={day} role="columnheader" className={`stage-tt-day${day === today ? ' is-today' : ''}`}>
              <b>{weekdayName(locale, day, 'short')}</b>
              <span>{day === today ? t('display.timetable.today') : weekdayName(locale, day, 'long')}</span>
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
      ) : (
        <div className="stage-card stage-timetable-empty">
          <GraduationCap size={40} aria-hidden="true" />
          <p>{t('display.timetable.empty')}</p>
        </div>
      )}
      {config.themeMode === 'auto' && part === 'night' && !eink && <div className="stage-night-veil" aria-hidden="true" />}
    </div>
  );
}
