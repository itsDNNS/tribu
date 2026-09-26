// Monochrome stage for e-ink frames that fetch a picture instead of running a browser.
// Rendered by next/og (Satori): flexbox only, inline styles, no CSS variables.
// Icons are plain SVG (Lucide shapes, ISC) because Satori cannot run React hooks
// and emoji would be fetched from the internet.
import {
  addDays,
  dayPart,
  formatClock,
  initials,
  looksAhead,
  mealsFor,
  normalizeStageConfig,
  parseLocal,
  rotatingCards,
  sameDay,
  soonItems,
  timeline,
  upcomingEvents,
  weatherKind,
} from './stageModel';

export const IMAGE_FORMATS = {
  compact: { width: 800, height: 480, scale: 1 },
  large: { width: 1200, height: 825, scale: 1.45 },
};

const BLACK = '#000';
// Satori lays fragments out as rows, so card content uses explicit columns.
const COLUMN = { display: 'flex', flexDirection: 'column', width: '100%' };
const WHITE = '#fff';

// Which card each zone shows: one page per refresh, like the e-ink browser mode.
export function imageCards(config, dashboard, { now, epochMs }) {
  const ahead = looksAhead(dayPart(now, config.dayParts));
  const page = Math.floor(epochMs / (config.refreshSeconds * 1000));
  const cards = {};
  for (const zone of Object.keys(config.zones)) {
    const list = rotatingCards(config.zones[zone].cards, dashboard, { skipEmpty: config.skipEmpty, ahead, now });
    cards[zone] = list[page % list.length];
  }
  return cards;
}

const CLOUD = 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242';
const ICONS = {
  clear: ['M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  partly: ['M12 2v2', 'm4.93 4.93 1.41 1.41', 'M20 12h2', 'm19.07 4.93-1.41 1.41', 'M15.947 12.65a4 4 0 0 0-5.925-4.128', 'M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z'],
  cloudy: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  fog: [CLOUD, 'M16 17H7', 'M17 21H9'],
  rain: [CLOUD, 'M16 14v6', 'M8 14v6', 'M12 16v6'],
  snow: [CLOUD, 'M8 15h.01', 'M8 19h.01', 'M12 17h.01', 'M12 21h.01', 'M16 15h.01', 'M16 19h.01'],
  storm: ['M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973', 'm13 12-3 5h4l-3 5'],
  umbrella: ['M12 13v7a2 2 0 0 0 4 0', 'M12 2v2', 'M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z'],
};

function Icon({ name, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BLACK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {name === 'clear' && <circle cx="12" cy="12" r="4" />}
      {(ICONS[name] || ICONS.cloudy).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

function WeatherGlyph({ code, size }) {
  return <Icon name={weatherKind(code)} size={size} />;
}

function Box({ s, children, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `${2 * s}px solid ${BLACK}`,
        borderRadius: 10 * s,
        padding: `${10 * s}px ${14 * s}px`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ s, children }) {
  return (
    <div style={{ display: 'flex', fontSize: 11 * s, fontWeight: 700, letterSpacing: 1.2 * s, textTransform: 'uppercase', marginBottom: 6 * s }}>
      {children}
    </div>
  );
}

function Initial({ s, member, filled = true, size = 22 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size * s,
        height: size * s,
        borderRadius: 999,
        border: `${2 * s}px solid ${BLACK}`,
        background: filled ? BLACK : WHITE,
        color: filled ? WHITE : BLACK,
        fontSize: size * 0.45 * s,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials(member?.display_name)}
    </div>
  );
}

function Line({ s, children, bold = false, size = 14 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontSize: size * s, fontWeight: bold ? 700 : 400, marginBottom: 5 * s, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

function CardContent({ card, ctx }) {
  const { dashboard, members, t, locale, timeFormat, now, ahead, s } = ctx;
  const clock = (date) => formatClock(date, locale, timeFormat);
  switch (card) {
    case 'dinner': {
      const meals = mealsFor(dashboard, ahead ? addDays(now, 1) : now);
      const main = meals.find((meal) => meal.slot === 'evening') || meals[meals.length - 1];
      return (
        <div style={COLUMN}>
          <Label s={s}>{t(ahead ? 'display.stage.meals_tomorrow' : 'display.stage.meals_today')}</Label>
          <Line s={s} bold size={20}>{main ? main.meal_name : t('display.stage.meals_empty')}</Line>
          {meals.filter((meal) => meal !== main).map((meal) => (
            <Line key={meal.slot} s={s} size={13}>{`${t(`module.meal_plans.slot.${meal.slot}`)}: ${meal.meal_name}`}</Line>
          ))}
        </div>
      );
    }
    case 'shopping': {
      const shopping = dashboard.shopping || { open_count: 0, lists: [] };
      const items = shopping.lists.flatMap((list) => list.items).slice(0, 6);
      return (
        <div style={COLUMN}>
          <Label s={s}>{t('display.stage.shopping_title').replace('{count}', shopping.open_count)}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {items.map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: 'flex', alignItems: 'center', width: '50%', fontSize: 14 * s, marginBottom: 5 * s }}>
                <div style={{ display: 'flex', width: 12 * s, height: 12 * s, border: `${2 * s}px solid ${BLACK}`, borderRadius: 3 * s, marginRight: 6 * s }} />
                {item}
              </div>
            ))}
          </div>
          {shopping.open_count > items.length && <Line s={s} size={12}>{t('display.stage.more').replace('{count}', shopping.open_count - items.length)}</Line>}
        </div>
      );
    }
    case 'weather': {
      const weather = dashboard.weather;
      if (!weather) return <div style={COLUMN}><Label s={s}>{t('display.stage.weather_title')}</Label><Line s={s} size={13}>{t('display.stage.weather_empty')}</Line></div>;
      return (
        <div style={COLUMN}>
          <Label s={s}>{`${t('display.stage.weather_title')} · ${weather.location_name}`}</Label>
          <div style={{ display: 'flex' }}>
            {weather.hourly.filter((_, index) => index % 3 === 0).slice(0, 5).map((hour) => (
              <div key={hour.time} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, fontSize: 12 * s }}>
                <span>{clock(new Date(hour.time))}</span>
                <WeatherGlyph code={hour.code} size={22 * s} />
                <span style={{ fontWeight: 700, fontSize: 15 * s }}>{`${hour.temperature}°`}</span>
              </div>
            ))}
          </div>
          {weather.rain_from && (
            <Line s={s} size={13} bold>
              <Icon name="umbrella" size={14 * s} />
              <span style={{ marginLeft: 5 * s }}>{t('display.stage.weather_rain_from').replace('{time}', weather.rain_from)}</span>
            </Line>
          )}
        </div>
      );
    }
    case 'reminders': {
      const tasks = (dashboard.due_tasks || []).slice(0, 4);
      return (
        <div style={COLUMN}>
          <Label s={s}>{t(ahead ? 'display.stage.reminders_open' : 'display.stage.reminders_title')}</Label>
          {tasks.length === 0 && <Line s={s} size={13}>{t('display.stage.reminders_empty')}</Line>}
          {tasks.map((task, index) => (
            <div key={`${task.title}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 6 * s }}>
              <div style={{ display: 'flex', width: 13 * s, height: 13 * s, marginTop: 2 * s, border: `${2 * s}px solid ${BLACK}`, borderRadius: 3 * s, marginRight: 7 * s, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 14 * s }}>{task.title}</span>
                <span style={{ fontSize: 11 * s, textDecoration: task.due_state === 'overdue' ? 'underline' : 'none' }}>{t(`display.stage.due_${task.due_state || 'today'}`)}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'school': {
      const group = ((ahead ? dashboard.tomorrow_school_timetables : dashboard.today_school_timetables) || [])[0];
      return (
        <div style={COLUMN}>
          <Label s={s}>{t(ahead ? 'display.stage.school_tomorrow' : 'display.stage.school_today')}</Label>
          {!group && <Line s={s} size={13}>{t('display.stage.school_empty')}</Line>}
          {group && <Line s={s} bold size={14}>{[group.children.map((child) => child.display_name).join(' & '), group.class_label].filter(Boolean).join(' · ')}</Line>}
          {group && group.lessons.filter((lesson) => lesson.kind !== 'break').slice(0, 6).map((lesson, index) => (
            <Line key={index} s={s} size={13}>{`${lesson.start_time.slice(0, 5)}  ${lesson.subject || ''}`}</Line>
          ))}
        </div>
      );
    }
    case 'soon':
    case 'birthdays': {
      const items = card === 'soon'
        ? soonItems(dashboard).slice(0, 3)
        : (dashboard.upcoming_birthdays || []).slice(0, 4).map((item) => ({ kind: 'birthday', title: item.person_name, days: item.days_until }));
      return (
        <div style={COLUMN}>
          <Label s={s}>{t(card === 'soon' ? 'display.stage.soon_title' : 'display.stage.birthdays_title')}</Label>
          {items.length === 0 && <Line s={s} size={13}>{t(card === 'soon' ? 'display.stage.soon_empty' : 'display.stage.birthdays_empty')}</Line>}
          {items.map((item) => (
            <div key={`${item.title}-${item.days}`} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 * s }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36 * s, height: 30 * s, border: `${2 * s}px solid ${BLACK}`, borderRadius: 6 * s, fontSize: 16 * s, fontWeight: 700, marginRight: 8 * s }}>
                {String(Math.max(0, item.days))}
              </div>
              <span style={{ fontSize: 14 * s, fontWeight: 700 }}>
                {item.kind === 'birthday' ? t('display.stage.birthday_of').replace('{name}', item.title) : item.title}
              </span>
            </div>
          ))}
        </div>
      );
    }
    case 'stars': {
      const rows = dashboard.rewards?.members || [];
      return (
        <div style={COLUMN}>
          <Label s={s}>{dashboard.rewards?.currency_name || t('display.stage.stars_title')}</Label>
          {rows.length === 0 && <Line s={s} size={13}>{t('display.stage.stars_empty')}</Line>}
          {rows.slice(0, 3).map((row) => {
            const cost = row.next_reward_cost || 0;
            const filled = cost ? Math.min(10, Math.round((row.balance / cost) * 10)) : 0;
            return (
              <div key={row.member_ref} style={{ display: 'flex', flexDirection: 'column', marginBottom: 6 * s }}>
                <span style={{ fontSize: 13 * s, fontWeight: 700 }}>{`${members[row.member_ref]?.display_name || ''} · ${row.balance}${cost ? ` / ${cost}` : ''}${row.next_reward_name ? ` · ${row.next_reward_name}` : ''}`}</span>
                {cost > 0 && (
                  <div style={{ display: 'flex', marginTop: 3 * s }}>
                    {Array.from({ length: 10 }, (_, index) => (
                      <div key={index} style={{ display: 'flex', flex: 1, height: 8 * s, marginRight: 2 * s, border: `${1.5 * s}px solid ${BLACK}`, background: index < filled ? BLACK : WHITE }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    case 'people': {
      return (
        <div style={{ display: 'flex' }}>
          {members.slice(0, 5).map((member, index) => {
            const next = (dashboard.today_events || []).find((event) => !event.all_day && (event.member_refs || []).includes(index) && (parseLocal(event.ends_at) || parseLocal(event.starts_at)) > now);
            const routines = (dashboard.routines || []).filter((routine) => routine.member_ref === index);
            return (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: 8 * s, padding: 8 * s, border: `${1.5 * s}px solid ${BLACK}`, borderRadius: 8 * s }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 * s }}>
                  <Initial s={s} member={member} size={24} />
                  <span style={{ marginLeft: 6 * s, fontSize: 14 * s, fontWeight: 700 }}>{member.display_name}</span>
                </div>
                <span style={{ fontSize: 12 * s }}>{next ? `${clock(parseLocal(next.starts_at))} ${next.title}` : t('display.stage.nothing_planned')}</span>
                {routines.length > 0 && (
                  <span style={{ fontSize: 11 * s, marginTop: 4 * s }}>
                    {t('display.stage.routines_progress').replace('{done}', routines.filter((routine) => routine.done).length).replace('{total}', routines.length)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    case 'week': {
      const monday = addDays(now, -((now.getDay() + 6) % 7));
      const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
      return (
        <div style={COLUMN}>
          <Label s={s}>{t('display.stage.week_title')}</Label>
          <div style={{ display: 'flex' }}>
            {Array.from({ length: 7 }, (_, index) => addDays(monday, index)).map((day) => {
              const events = (dashboard.week_events || []).filter((event) => sameDay(parseLocal(event.starts_at), day));
              const today = sameDay(day, now);
              return (
                <div key={day.toISOString()} style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: 4 * s, padding: 5 * s, border: `${1.5 * s}px solid ${BLACK}`, borderRadius: 6 * s, background: today ? BLACK : WHITE, color: today ? WHITE : BLACK }}>
                  <span style={{ fontSize: 12 * s, fontWeight: 700 }}>{`${weekday.format(day)} ${day.getDate()}`}</span>
                  {events.slice(0, 3).map((event, index) => (
                    <span key={index} style={{ fontSize: 10 * s }}>{event.title}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

function Timeline({ ctx, style }) {
  const { dashboard, members, t, now, ahead, s } = ctx;
  const day = ahead ? addDays(now, 1) : now;
  const data = timeline(ahead ? dashboard.tomorrow_events : dashboard.today_events, now, { day, showNow: !ahead });
  const hours = [];
  for (let hour = data.startHour; hour <= data.endHour; hour += 2) hours.push(hour);
  const pos = (hour) => ((hour - data.startHour) / (data.endHour - data.startHour)) * 100;
  const lanes = data.lanes.slice(0, 5);
  return (
    <Box s={s} style={style}>
      <Label s={s}>{t(ahead ? 'display.stage.timeline_tomorrow' : 'display.stage.timeline_today')}</Label>
      {lanes.length === 0 && <Line s={s} size={13}>{t(ahead ? 'display.stage.tomorrow_free' : 'display.stage.today_free')}</Line>}
      {lanes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: 30 * s, position: 'relative' }}>
          <div style={{ display: 'flex', position: 'relative', height: 14 * s }}>
            {hours.map((hour) => (
              <span key={hour} style={{ position: 'absolute', left: `${pos(hour)}%`, fontSize: 10 * s, fontWeight: 700 }}>{String(hour)}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-around', position: 'relative' }}>
            {data.nowPct !== null && (
              <div style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0, left: `${data.nowPct}%`, width: 3 * s, background: BLACK }} />
            )}
            {lanes.map((lane) => (
              <div key={lane.ref ?? 'all'} style={{ display: 'flex', position: 'relative', height: 24 * s }}>
                <div style={{ display: 'flex', position: 'absolute', left: -30 * s, top: 1 * s }}>
                  {lane.ref === null ? <Initial s={s} member={{ display_name: '*' }} filled={false} /> : <Initial s={s} member={members[lane.ref]} />}
                </div>
                {lane.blocks.map((block, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      position: 'absolute',
                      left: `${block.left}%`,
                      width: `${block.width}%`,
                      height: 22 * s,
                      padding: `0 ${4 * s}px`,
                      borderRadius: 5 * s,
                      background: BLACK,
                      color: WHITE,
                      fontSize: 11 * s,
                      fontWeight: 700,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {block.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Box>
  );
}

export function StageImage({ dashboard, t, locale, now, epochMs, format }) {
  const config = normalizeStageConfig(dashboard.config);
  const { scale: s } = IMAGE_FORMATS[format];
  const part = dayPart(now, config.dayParts);
  const ahead = looksAhead(part);
  const timeFormat = dashboard.time_format === '12h' ? '12h' : '24h';
  const members = Array.isArray(dashboard.members) ? dashboard.members : [];
  const ctx = { dashboard, members, t, locale, timeFormat, now, ahead, s };
  const cards = imageCards(config, dashboard, { now, epochMs });
  const clock = (date) => formatClock(date, locale, timeFormat);
  const events = upcomingEvents(dashboard, now);
  const hero = events[0];
  const weather = dashboard.weather;
  const large = format === 'large';
  const zone = (name, style) => (
    <Box s={s} style={style}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <CardContent card={cards[name]} ctx={ctx} />
      </div>
    </Box>
  );

  let heroLabel = t('display.stage.nothing_upcoming');
  if (hero?.live) heroLabel = t('display.stage.now_until').replace('{time}', clock(hero.end));
  else if (hero && sameDay(hero.start, now)) heroLabel = t('display.stage.next');
  else if (hero) heroLabel = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(hero.start);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: WHITE, color: BLACK, padding: `${16 * s}px ${20 * s}px ${10 * s}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 * s }}>
        <span style={{ fontSize: 58 * s, fontWeight: 700, letterSpacing: -2 * s, lineHeight: 1 }}>{clock(now)}</span>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16 * s }}>
          <span style={{ fontSize: 17 * s, fontWeight: 700 }}>{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</span>
          <span style={{ fontSize: 15 * s }}>{`${t(`display.stage.greeting_${part}`)}${dashboard.family_name ? `, ${dashboard.family_name}` : ''}`}</span>
        </div>
        {weather && (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', padding: `${6 * s}px ${12 * s}px`, border: `${2 * s}px solid ${BLACK}`, borderRadius: 10 * s }}>
            <div style={{ display: 'flex', marginRight: 8 * s }}><WeatherGlyph code={weather.current_code} size={30 * s} /></div>
            <span style={{ fontSize: 30 * s, fontWeight: 700, marginRight: 10 * s }}>{`${weather.current_temperature}°`}</span>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12 * s }}>
              {weather.today && <span>{t('display.stage.weather_until').replace('{max}', weather.today.max)}</span>}
              {weather.rain_from && <span style={{ fontWeight: 700 }}>{t('display.stage.weather_rain_from').replace('{time}', weather.rain_from)}</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: large ? 2.4 : 1.7, marginRight: 12 * s }}>
          <Box s={s} style={{ marginBottom: 10 * s }}>
            <Label s={s}>{heroLabel}</Label>
            {hero ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 30 * s, fontWeight: 700, marginRight: 10 * s }}>{clock(hero.start)}</span>
                  <span style={{ fontSize: 28 * s, fontWeight: 700 }}>{hero.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 * s, fontSize: 14 * s }}>
                  {(hero.member_refs || []).slice(0, 3).map((ref) => (
                    <div key={ref} style={{ display: 'flex', marginRight: 4 * s }}><Initial s={s} member={members[ref]} /></div>
                  ))}
                  <span style={{ marginLeft: 4 * s }}>{[(hero.member_refs || []).map((ref) => members[ref]?.display_name).filter(Boolean).join(', '), hero.location].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
            ) : (
              <Line s={s} bold size={22}>{t('display.stage.all_quiet')}</Line>
            )}
          </Box>
          <Timeline ctx={ctx} style={{ flex: 1, marginBottom: large ? 10 * s : 0 }} />
          {large && zone('d', { height: 118 * s })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {zone('a', { flex: 1, marginBottom: 10 * s })}
          {zone('b', { flex: 1, marginBottom: large ? 10 * s : 0 })}
          {large && zone('c', { height: 118 * s })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 10 * s, fontWeight: 700, marginTop: 4 * s }}>
        {t('display.stage.updated').replace('{time}', clock(now))}
      </div>
    </div>
  );
}

export function StateImage({ title, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: WHITE, color: BLACK, padding: 40, textAlign: 'center' }}>
      <span style={{ fontSize: 40, fontWeight: 700, marginBottom: 16 }}>{title}</span>
      <span style={{ fontSize: 22, maxWidth: 640 }}>{text}</span>
    </div>
  );
}
