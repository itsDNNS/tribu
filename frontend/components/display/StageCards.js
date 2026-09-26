import {
  Bell,
  Cake,
  CalendarDays,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  GraduationCap,
  Hourglass,
  Moon,
  ShoppingCart,
  Soup,
  Star,
  Sun,
  Umbrella,
} from 'lucide-react';
import {
  addDays,
  formatClock,
  initials,
  mealsFor,
  memberColor,
  parseLocal,
  sameDay,
  soonItems,
  weatherKind,
} from './stageModel';

const WEATHER_ICONS = { clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
const MEAL_IMAGES = { morning: 'breakfast', noon: 'lunch', evening: 'dinner' };

const NIGHT_ICONS = { clear: Moon, partly: CloudMoon };

export function WeatherIcon({ code, size = 24, night = false }) {
  const kind = weatherKind(code);
  const Icon = (night && NIGHT_ICONS[kind]) || WEATHER_ICONS[kind] || Cloud;
  return <Icon size={size} aria-hidden="true" />;
}

export function Avatar({ member, index, size = 36 }) {
  if (!member) return null;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (typeof member.profile_image === 'string' && member.profile_image.startsWith('data:image/')) {
    return <img className="stage-avatar" src={member.profile_image} alt="" style={style} />;
  }
  return (
    <span className="stage-avatar" aria-hidden="true" style={{ ...style, background: memberColor(member, index) }}>
      {initials(member.display_name)}
    </span>
  );
}

function CardTitle({ icon: Icon, children }) {
  return (
    <h2 className="stage-label">
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
    </h2>
  );
}

function Empty({ text }) {
  return <p className="stage-empty">{text}</p>;
}

function DinnerCard({ dashboard, t, ahead, now }) {
  const day = ahead ? addDays(now, 1) : now;
  const meals = mealsFor(dashboard, day);
  const main = meals.find((meal) => meal.slot === 'evening') || meals[meals.length - 1];
  return (
    <>
      {main && <img className="stage-meal-photo" src={`/illustrations/meal-${MEAL_IMAGES[main.slot] || 'dinner'}.jpg`} alt="" />}
      <div className="stage-card-body">
        <CardTitle icon={Soup}>{t(ahead ? 'display.stage.meals_tomorrow' : 'display.stage.meals_today')}</CardTitle>
        {main ? (
          <>
            <p className="stage-meal-name">{main.meal_name}</p>
            <ul className="stage-meal-others">
              {meals.filter((meal) => meal !== main).map((meal) => (
                <li key={`${meal.slot}-${meal.meal_name}`}>
                  <span>{t(`module.meal_plans.slot.${meal.slot}`)}</span>
                  {meal.meal_name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty text={t('display.stage.meals_empty')} />
        )}
      </div>
    </>
  );
}

function ShoppingCard({ dashboard, t }) {
  const shopping = dashboard.shopping || { open_count: 0, lists: [] };
  const items = shopping.lists.flatMap((list) => list.items).slice(0, 8);
  const more = shopping.open_count - items.length;
  return (
    <div className="stage-card-body">
      <CardTitle icon={ShoppingCart}>{t('display.stage.shopping_title').replace('{count}', shopping.open_count)}</CardTitle>
      {items.length ? (
        <ul className="stage-checklist">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <i aria-hidden="true" />
              {item}
            </li>
          ))}
          {more > 0 && <li className="stage-more">{t('display.stage.more').replace('{count}', more)}</li>}
        </ul>
      ) : (
        <Empty text={t('display.stage.shopping_empty')} />
      )}
    </div>
  );
}

function WeatherCard({ dashboard, t, locale, timeFormat }) {
  const weather = dashboard.weather;
  if (!weather) {
    return (
      <div className="stage-card-body">
        <CardTitle icon={CloudSun}>{t('display.stage.weather_title')}</CardTitle>
        <Empty text={t('display.stage.weather_empty')} />
      </div>
    );
  }
  const hours = weather.hourly.filter((_, index) => index % 3 === 0).slice(0, 5);
  return (
    <div className="stage-card-body">
      <CardTitle icon={CloudSun}>{`${t('display.stage.weather_title')} · ${weather.location_name}`}</CardTitle>
      <div className="stage-hours">
        {hours.map((hour) => {
          const rainy = (hour.precipitation_probability || 0) >= 50;
          return (
            <div key={hour.time} className={rainy ? 'is-rain' : undefined}>
              <span>{formatClock(new Date(hour.time), locale, timeFormat)}</span>
              <WeatherIcon code={hour.code} />
              <b>{hour.temperature}°</b>
            </div>
          );
        })}
      </div>
      {weather.rain_from && (
        <p className="stage-tip">
          <Umbrella size={16} aria-hidden="true" />
          {t('display.stage.weather_rain_from').replace('{time}', weather.rain_from)}
        </p>
      )}
    </div>
  );
}

function RemindersCard({ dashboard, members, t, ahead }) {
  const tasks = dashboard.due_tasks || [];
  const openRoutines = (dashboard.routines || []).filter((routine) => !routine.done);
  const rows = tasks.slice(0, 4);
  return (
    <div className="stage-card-body">
      <CardTitle icon={Bell}>{t(ahead ? 'display.stage.reminders_open' : 'display.stage.reminders_title')}</CardTitle>
      {rows.length || (ahead && openRoutines.length) ? (
        <ul className="stage-rows">
          {rows.map((task, index) => (
            <li key={`${task.title}-${index}`} className={task.due_state === 'overdue' ? 'is-overdue' : undefined}>
              {task.member_ref != null ? <Avatar member={members[task.member_ref]} index={task.member_ref} size={30} /> : <span className="stage-dot" aria-hidden="true" />}
              <span>
                {task.title}
                <small>{t(`display.stage.due_${task.due_state || 'today'}`)}</small>
              </span>
            </li>
          ))}
          {ahead && openRoutines.length > 0 && (
            <li>
              <span className="stage-dot" aria-hidden="true" />
              <span>{t('display.stage.routines_open').replace('{count}', openRoutines.length)}</span>
            </li>
          )}
        </ul>
      ) : (
        <Empty text={t('display.stage.reminders_empty')} />
      )}
    </div>
  );
}

function SchoolCard({ dashboard, members, t, ahead, locale, timeFormat, now }) {
  const groups = (ahead ? dashboard.tomorrow_school_timetables : dashboard.today_school_timetables) || [];
  const group = groups[0];
  const clock = (value) => formatClock(new Date(`2000-01-01T${value}`), locale, timeFormat);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <div className="stage-card-body">
      <CardTitle icon={GraduationCap}>{t(ahead ? 'display.stage.school_tomorrow' : 'display.stage.school_today')}</CardTitle>
      {group ? (
        <>
          <p className="stage-school-kids">
            {group.children.map((child) => {
              const index = members.findIndex((member) => member.display_name === child.display_name);
              return <Avatar key={child.display_name} member={child} index={Math.max(0, index)} size={26} />;
            })}
            <b>{group.children.map((child) => child.display_name).join(' & ') || group.name}</b>
            {group.class_label && <span>· {group.class_label}</span>}
          </p>
          <ol className="stage-lessons">
            {group.lessons.slice(0, 6).map((lesson, index) => {
              const current = !ahead && lesson.start_time.slice(0, 5) <= nowTime && nowTime < lesson.end_time.slice(0, 5);
              return lesson.kind === 'break' ? (
                <li key={index} className="is-break">{lesson.break_label || t('display.stage.school_break')}</li>
              ) : (
                <li key={index} className={current ? 'is-now' : undefined}>
                  <b>{clock(lesson.start_time)}</b>
                  {lesson.subject}
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <Empty text={t('display.stage.school_empty')} />
      )}
    </div>
  );
}

function daysLabel(days, t) {
  if (days <= 0) return t('display.stage.today');
  if (days === 1) return t('display.stage.in_one_day');
  return t('display.stage.in_days').replace('{count}', days);
}

function SoonCard({ dashboard, t }) {
  const items = soonItems(dashboard).slice(0, 3);
  return (
    <div className="stage-card-body">
      <CardTitle icon={Hourglass}>{t('display.stage.soon_title')}</CardTitle>
      {items.length ? (
        <ul className="stage-countdowns">
          {items.map((item) => (
            <li key={`${item.kind}-${item.title}-${item.date}`}>
              <span className={`stage-count stage-count--${item.kind}`}>
                <b>{Math.max(0, item.days)}</b>
                <small>{t(item.days === 1 ? 'display.stage.day' : 'display.stage.days')}</small>
              </span>
              <span>
                <b>{item.kind === 'birthday' ? t('display.stage.birthday_of').replace('{name}', item.title) : item.title}</b>
                <small>{daysLabel(item.days, t)}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={t('display.stage.soon_empty')} />
      )}
    </div>
  );
}

function StarsCard({ dashboard, members, t }) {
  const rewards = dashboard.rewards;
  const rows = rewards?.members || [];
  return (
    <div className="stage-card-body">
      <CardTitle icon={Star}>{rewards?.currency_name || t('display.stage.stars_title')}</CardTitle>
      {rows.length ? (
        <ul className="stage-goals">
          {rows.slice(0, 3).map((row) => {
            const member = members[row.member_ref];
            const cost = row.next_reward_cost || 0;
            const ready = cost > 0 && row.balance >= cost;
            return (
              <li key={row.member_ref}>
                <Avatar member={member} index={row.member_ref} size={32} />
                <div>
                  <b>
                    {member?.display_name} · {row.balance}
                    {cost ? ` / ${cost}` : ''}
                  </b>
                  {cost > 0 && (
                    <span className="stage-track" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (row.balance / cost) * 100)}%` }} />
                    </span>
                  )}
                  {row.next_reward_name && (
                    <small>
                      {ready
                        ? t('display.stage.stars_ready').replace('{reward}', row.next_reward_name)
                        : t('display.stage.stars_goal').replace('{count}', cost - row.balance).replace('{reward}', row.next_reward_name)}
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty text={t('display.stage.stars_empty')} />
      )}
    </div>
  );
}

function BirthdaysCard({ dashboard, t, locale }) {
  const birthdays = (dashboard.upcoming_birthdays || []).slice(0, 4);
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
  return (
    <div className="stage-card-body">
      <CardTitle icon={Cake}>{t('display.stage.birthdays_title')}</CardTitle>
      {birthdays.length ? (
        <ul className="stage-rows">
          {birthdays.map((birthday) => (
            <li key={`${birthday.person_name}-${birthday.occurs_on}`}>
              <Cake size={20} aria-hidden="true" />
              <span>
                {birthday.person_name}
                <small>
                  {format.format(parseLocal(`${birthday.occurs_on}T12:00:00`))} · {daysLabel(birthday.days_until, t)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={t('display.stage.birthdays_empty')} />
      )}
    </div>
  );
}

function Ring({ done, total, color }) {
  const r = 19;
  const length = 2 * Math.PI * r;
  return (
    <svg className="stage-ring" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r={r} className="stage-ring-track" />
      <circle
        cx="23"
        cy="23"
        r={r}
        className="stage-ring-fill"
        style={{ stroke: color }}
        strokeDasharray={length}
        strokeDashoffset={total ? length * (1 - done / total) : length}
        transform="rotate(-90 23 23)"
      />
    </svg>
  );
}

function PeopleCard({ dashboard, members, t, locale, timeFormat, ahead, now }) {
  const events = ahead ? dashboard.tomorrow_events || [] : [...(dashboard.today_events || []), ...(dashboard.tomorrow_events || [])];
  const stars = new Map((dashboard.rewards?.members || []).map((row) => [row.member_ref, row.balance]));
  return (
    <div className="stage-people">
      {members.slice(0, 6).map((member, index) => {
        const next = events.find((event) => {
          if (event.all_day || !(event.member_refs || []).includes(index)) return false;
          const start = parseLocal(event.starts_at);
          return ahead || (start && (parseLocal(event.ends_at) || start) > now);
        });
        const routines = (dashboard.routines || []).filter((routine) => routine.member_ref === index);
        const due = (dashboard.due_tasks || []).filter((task) => task.member_ref === index && task.due_state !== 'tomorrow');
        const start = next && parseLocal(next.starts_at);
        const color = memberColor(member, index);
        return (
          <div key={`${member.display_name}-${index}`} className="stage-person">
            <div className="stage-person-top">
              <Avatar member={member} index={index} size={42} />
              <b>{member.display_name}</b>
              {stars.has(index) && (
                <span className="stage-stars">
                  <Star size={14} aria-hidden="true" />
                  {stars.get(index)}
                </span>
              )}
            </div>
            <p className="stage-person-next">
              <span>{t(ahead ? 'display.stage.first_tomorrow' : 'display.stage.next')}</span>
              <b>{next ? `${sameDay(start, now) || ahead ? '' : `${t('display.stage.tomorrow')} `}${formatClock(start, locale, timeFormat)} ${next.title}` : t('display.stage.nothing_planned')}</b>
            </p>
            {routines.length > 0 ? (
              <div className="stage-person-progress">
                <Ring done={routines.filter((routine) => routine.done).length} total={routines.length} color={color} />
                <small>{t('display.stage.routines_progress').replace('{done}', routines.filter((routine) => routine.done).length).replace('{total}', routines.length)}</small>
              </div>
            ) : due.length > 0 ? (
              <div className="stage-person-progress">
                <Bell size={18} aria-hidden="true" />
                <small>{t('display.stage.tasks_due').replace('{count}', due.length)}</small>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function WeekCard({ dashboard, t, locale, now }) {
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dayNumber = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  return (
    <div className="stage-week">
      <CardTitle icon={CalendarDays}>{t('display.stage.week_title')}</CardTitle>
      <div className="stage-week-days">
        {days.map((day) => {
          const events = (dashboard.week_events || []).filter((event) => {
            const start = parseLocal(event.starts_at);
            const end = parseLocal(event.ends_at) || start;
            const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
            return start && start < addDays(dayStart, 1) && (end > dayStart || sameDay(start, day));
          });
          return (
            <div key={day.toISOString()} className={`stage-week-day${sameDay(day, now) ? ' is-today' : ''}`}>
              <b>
                {weekday.format(day)}
                <span>{dayNumber.format(day)}</span>
              </b>
              {events.slice(0, 3).map((event, index) => (
                <span key={`${event.title}-${index}`} className="stage-week-item">
                  <i style={{ background: event.participant_colors?.[0] || 'var(--stage-accent)' }} aria-hidden="true" />
                  {event.title}
                </span>
              ))}
              {events.length > 3 && <span className="stage-more">{t('display.stage.more').replace('{count}', events.length - 3)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const CARD_COMPONENTS = {
  dinner: DinnerCard,
  shopping: ShoppingCard,
  weather: WeatherCard,
  reminders: RemindersCard,
  school: SchoolCard,
  soon: SoonCard,
  stars: StarsCard,
  birthdays: BirthdaysCard,
  people: PeopleCard,
  week: WeekCard,
};

