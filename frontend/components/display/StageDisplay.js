import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, MapPin, Moon, Sun, Sunrise, Umbrella, Users, WifiOff } from 'lucide-react';
import { Avatar, CARD_COMPONENTS, WeatherIcon } from './StageCards';
import {
  addDays,
  dayPart,
  formatClock,
  looksAhead,
  memberColor,
  normalizeStageConfig,
  rotatingCards,
  sameDay,
  timeline,
  upcomingEvents,
  ZONES,
} from './stageModel';
import { useStageRotation } from './useStageRotation';

const PART_ICONS = { morning: Sunrise, day: Sun, evening: Moon, night: Moon };
const SWIPE_DISTANCE = 60;

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    id = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    return () => clearTimeout(id);
  }, []);
  return now;
}

function relativeStart(start, now, locale) {
  const minutes = Math.max(1, Math.round((start - now) / 60000));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return minutes < 60 ? format.format(minutes, 'minute') : format.format(Math.round(minutes / 60), 'hour');
}

function Hero({ dashboard, members, t, locale, timeFormat, now, ahead }) {
  const events = upcomingEvents(dashboard, now);
  const tomorrow = addDays(now, 1);
  // In the evening the hero looks at tomorrow once today has nothing left.
  const hero = events[0];
  const heroIsLater = hero && !sameDay(hero.start, now);
  const following = events.slice(1, 4);
  const clock = (date) => formatClock(date, locale, timeFormat);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  let label = t('display.stage.nothing_upcoming');
  if (hero?.live) label = t('display.stage.now_until').replace('{time}', clock(hero.end));
  else if (hero && !heroIsLater) label = `${t('display.stage.next')} · ${relativeStart(hero.start, now, locale)}`;
  else if (hero && sameDay(hero.start, tomorrow)) label = `${t(ahead ? 'display.stage.tomorrow_morning' : 'display.stage.tomorrow')} · ${weekday.format(hero.start)}`;
  else if (hero) label = dateLabel.format(hero.start);

  return (
    <section className="stage-card stage-hero" data-testid="display-focus" aria-label={t('display.stage.next')}>
      <div className="stage-hero-main">
        <p className="stage-label stage-hero-when">
          <Clock size={16} aria-hidden="true" />
          <span>{!ahead && hero && heroIsLater ? `${t('display.stage.nothing_today')} · ${label}` : label}</span>
        </p>
        {hero ? (
          <>
            <h1 className="stage-hero-title">{hero.title}</h1>
            <p className="stage-hero-meta">
              <span className="stage-hero-people" data-testid="display-event-participants" aria-label={t('display.stage.participants').replace('{count}', hero.member_refs?.length || 0)}>
                {(hero.member_refs || []).slice(0, 4).map((ref) => (
                  <Avatar key={ref} member={members[ref]} index={ref} size={34} />
                ))}
              </span>
              <span>
                {(hero.member_refs || []).map((ref) => members[ref]?.display_name).filter(Boolean).join(', ')}
                {hero.member_refs?.length ? ' · ' : ''}
                {`${clock(hero.start)} – ${clock(hero.end)}`}
              </span>
            </p>
            {hero.location && (
              <p className="stage-hero-hint">
                <MapPin size={18} aria-hidden="true" />
                {hero.location}
              </p>
            )}
          </>
        ) : (
          <h1 className="stage-hero-title stage-hero-title--quiet">{t('display.stage.all_quiet')}</h1>
        )}
      </div>
      {following.length > 0 && (
        <div className="stage-hero-next">
          <p className="stage-label">{t(ahead ? 'display.stage.also_coming' : 'display.stage.afterwards')}</p>
          {following.map((event) => (
            <div key={`${event.title}-${event.starts_at}`} className="stage-next-row">
              {event.member_refs?.length ? (
                <Avatar member={members[event.member_refs[0]]} index={event.member_refs[0]} size={30} />
              ) : (
                <span className="stage-avatar stage-avatar--all" aria-hidden="true"><Users size={15} /></span>
              )}
              <b>{sameDay(event.start, now) ? clock(event.start) : `${weekday.format(event.start).slice(0, 2)} ${clock(event.start)}`}</b>
              <span>{event.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Timeline({ dashboard, members, t, locale, now, ahead }) {
  const day = ahead ? addDays(now, 1) : now;
  const events = ahead ? dashboard.tomorrow_events : dashboard.today_events;
  const data = timeline(events, now, { day, showNow: !ahead });
  const hours = [];
  for (let hour = data.startHour; hour <= data.endHour; hour += 2) hours.push(hour);
  const pos = (hour) => ((hour - data.startHour) / (data.endHour - data.startHour)) * 100;
  const title = ahead
    ? `${t('display.stage.timeline_tomorrow')} · ${new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}`
    : t('display.stage.timeline_today');
  return (
    <section className="stage-card stage-timeline" data-testid="display-events" aria-label={title}>
      <p className="stage-label">{title}</p>
      {data.allDay.length > 0 && (
        <p className="stage-allday">
          {data.allDay.map((event) => (
            <span key={event.title}>{event.title}</span>
          ))}
        </p>
      )}
      {data.lanes.length ? (
        <div className="stage-tl">
          <div className="stage-tl-hours" aria-hidden="true">
            {hours.map((hour) => (
              <span key={hour} style={{ left: `${pos(hour)}%` }}>{hour}</span>
            ))}
          </div>
          <div className="stage-tl-body">
            {hours.map((hour) => (
              <i key={hour} className="stage-tl-grid" style={{ left: `${pos(hour)}%` }} aria-hidden="true" />
            ))}
            {data.nowPct !== null && (
              <>
                <i className="stage-tl-past" style={{ width: `${data.nowPct}%` }} aria-hidden="true" />
                <i className="stage-tl-now" style={{ left: `${data.nowPct}%` }} aria-hidden="true" />
              </>
            )}
            {data.lanes.map((lane) => (
              <div key={lane.ref ?? 'all'} className="stage-lane">
                <span className="stage-lane-who">
                  {lane.ref === null ? (
                    <span className="stage-avatar stage-avatar--all" aria-label={t('display.stage.everyone')}><Users size={15} /></span>
                  ) : (
                    <Avatar member={members[lane.ref]} index={lane.ref} size={30} />
                  )}
                </span>
                <div className="stage-lane-track">
                  {lane.blocks.map((block, index) => (
                    <span
                      key={`${block.title}-${index}`}
                      className="stage-block"
                      style={{
                        left: `${block.left}%`,
                        width: `${block.width}%`,
                        '--block-color': lane.ref === null ? 'var(--stage-accent)' : memberColor(members[lane.ref], lane.ref),
                      }}
                      title={block.title}
                    >
                      {block.title}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="stage-empty">{t(ahead ? 'display.stage.tomorrow_free' : 'display.stage.today_free')}</p>
      )}
    </section>
  );
}

function Zone({ zone, index, config, dashboard, context, ahead, now }) {
  const cards = rotatingCards(config.zones[zone].cards, dashboard, { skipEmpty: config.skipEmpty, ahead, now });
  const eink = config.mode === 'eink';
  const rotation = useStageRotation({
    cardCount: cards.length,
    intervalSeconds: config.zones[zone].interval_seconds,
    zoneIndex: index,
    zoneCount: ZONES.length,
    stagger: config.stagger,
    eink,
    refreshSeconds: config.refreshSeconds,
    pauseOnTouch: config.pauseOnTouch,
  });
  const card = cards[rotation.index] || cards[0];
  const Card = CARD_COMPONENTS[card];
  const pointer = useRef(null);

  const onPointerDown = (event) => {
    pointer.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || eink) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(event.clientY - start.y)) {
      if (dx < 0) rotation.next();
      else rotation.previous();
    } else {
      rotation.pause();
    }
  };

  return (
    <section
      className={`stage-card stage-zone stage-zone--${zone}${card === 'dinner' ? ' stage-zone--media' : ''}`}
      data-testid={`display-zone-${zone}`}
      data-card={card}
      data-paused={rotation.paused || undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div key={`${card}-${rotation.slotKey}`} className="stage-zone-card">
        {Card && <Card {...context} ahead={ahead} now={now} />}
      </div>
      {cards.length > 1 && (
        <>
          <span className="stage-dots" aria-hidden="true">
            {cards.map((name, dot) => (
              <i key={name} className={dot === rotation.index ? 'is-on' : undefined} />
            ))}
          </span>
          {!eink && (
            <span className="stage-progress" aria-hidden="true">
              <b
                key={rotation.slotKey}
                style={{
                  animationDuration: `${rotation.intervalMs}ms`,
                  animationDelay: `-${Math.min(rotation.elapsedMs, rotation.intervalMs)}ms`,
                  animationPlayState: rotation.paused ? 'paused' : 'running',
                }}
              />
            </span>
          )}
        </>
      )}
    </section>
  );
}

export default function StageDisplay({ me, dashboard, t, locale, offlineSince = null }) {
  const now = useMinuteClock();
  const config = useMemo(() => normalizeStageConfig(dashboard?.config || me?.config), [dashboard?.config, me?.config]);
  const part = dayPart(now, config.dayParts);
  const ahead = looksAhead(part);
  const members = Array.isArray(dashboard.members) ? dashboard.members : [];
  const timeFormat = dashboard.time_format === '12h' ? '12h' : '24h';
  const eink = config.mode === 'eink';
  const context = { dashboard, members, t, locale, timeFormat };
  const PartIcon = PART_ICONS[part];
  const weather = dashboard.weather;
  const dark = !eink && ahead;

  return (
    <div
      className={`stage stage--${config.mode}${dark ? ' stage--dark' : ''}`}
      data-testid="display-dashboard"
      data-display-mode={config.mode}
      data-layout-preset="stage"
      data-day-part={part}
      data-eink-format={eink ? config.einkFormat : undefined}
      role="region"
      aria-label={t('display.stage.region_label')}
    >
      <header className="stage-head">
        <div className="stage-clock-block">
          <div className="stage-clock" data-testid="display-time">{formatClock(now, locale, timeFormat)}</div>
          <div className="stage-date">{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</div>
        </div>
        <div className="stage-greeting">
          <strong data-testid="display-family-name">
            {t(`display.stage.greeting_${part}`)}
            {dashboard.family_name ? `, ${dashboard.family_name}` : ''}
          </strong>
          <span className="stage-mode">
            <PartIcon size={16} aria-hidden="true" />
            {t(`display.stage.mode_${part}`)}
          </span>
        </div>
        {offlineSince && (
          <span className="stage-offline" role="status">
            <WifiOff size={16} aria-hidden="true" />
            {t('display.stage.offline').replace('{time}', formatClock(offlineSince, locale, timeFormat))}
          </span>
        )}
        {weather && (
          <div className="stage-weather" data-testid="display-weather">
            <WeatherIcon code={weather.current_code} size={44} night={weather.current_is_day === false} />
            <b>{weather.current_temperature}°</b>
            <span>
              {ahead && weather.tomorrow ? (
                <small>{t('display.stage.weather_tomorrow').replace('{min}', weather.tomorrow.min).replace('{max}', weather.tomorrow.max)}</small>
              ) : (
                weather.today && <small>{t('display.stage.weather_until').replace('{max}', weather.today.max)}</small>
              )}
              {!ahead && weather.rain_from && (
                <small className="stage-rain">
                  <Umbrella size={15} aria-hidden="true" />
                  {t('display.stage.weather_rain_from').replace('{time}', weather.rain_from)}
                </small>
              )}
            </span>
          </div>
        )}
      </header>
      <div className="stage-grid">
        <Hero {...context} now={now} ahead={ahead} />
        <Timeline {...context} now={now} ahead={ahead} />
        {ZONES.map((zone, index) => (
          <Zone key={zone} zone={zone} index={index} config={config} dashboard={dashboard} context={context} ahead={ahead} now={now} />
        ))}
      </div>
      {eink && (
        <p className="stage-updated">
          {t('display.stage.updated').replace('{time}', formatClock(parseGenerated(dashboard.generated_at) || now, locale, timeFormat))}
        </p>
      )}
      {config.nightDim && part === 'night' && !eink && <div className="stage-night-veil" aria-hidden="true" />}
    </div>
  );
}

function parseGenerated(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
