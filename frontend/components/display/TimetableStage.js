import { useMemo } from 'react';
import { GraduationCap, WifiOff } from 'lucide-react';
import { Avatar } from './StageCards';
import { useMinuteClock } from './StageDisplay';
import { dayPart, formatClock, looksAhead, normalizeStageConfig } from './stageModel';
import TimetableWeek from './TimetableWeek';

// A display that shows one school timetable in full (Tribu 2.0): the whole
// week, today and the running period marked, for a kids' room or the hall.
export default function TimetableStage({ me, dashboard, t, locale, offlineSince = null }) {
  const now = useMinuteClock();
  const config = useMemo(() => normalizeStageConfig(dashboard?.config || me?.config), [dashboard?.config, me?.config]);
  const part = dayPart(now, config.dayParts);
  const eink = config.mode === 'eink';
  const dark = config.themeMode === 'auto' ? !eink && looksAhead(part) : !eink && config.themeMode === 'dark';
  const timeFormat = dashboard.time_format === '12h' ? '12h' : '24h';
  const week = (dashboard.school_weeks || [])[0];

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
          <div className="stage-clock" data-testid="display-time">
            {formatClock(now, locale, timeFormat)}
          </div>
          <div className="stage-date">
            {new Intl.DateTimeFormat(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(now)}
          </div>
        </div>
        <div className="stage-timetable-title">
          {(week?.children || []).map((child, index) => (
            <Avatar key={child.display_name} member={child} index={index} size={44} />
          ))}
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
        <TimetableWeek week={week} now={now} t={t} locale={locale} eink={eink} />
      ) : (
        <div className="stage-card stage-timetable-empty">
          <GraduationCap size={40} aria-hidden="true" />
          <p>{t('display.timetable.empty')}</p>
        </div>
      )}
      {config.themeMode === 'auto' && part === 'night' && !eink && (
        <div className="stage-night-veil" aria-hidden="true" />
      )}
    </div>
  );
}
