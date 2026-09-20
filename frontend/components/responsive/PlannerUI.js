import { Plus, MapPin, MoreVertical, CalendarDays } from 'lucide-react';
import { t } from '../../lib/i18n';
import {
  calendarEventColors,
  calendarEventStyle,
} from '../../lib/calendar-colors';
import MemberAvatar from '../MemberAvatar';

export const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (date, count) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
export const plannerText = (messages, key) =>
  t(messages, `module.responsive.${key}`);
export function DayStrip({
  days,
  selected,
  onSelect,
  locale,
  messages,
  colors = () => [],
}) {
  return (
    <div
      className="ui-day-strip"
      role="group"
      aria-label={plannerText(messages, 'select_day')}
    >
      {days.map((date) => (
        <button
          type="button"
          key={dateKey(date)}
          className={`ui-strip-day ${dateKey(date) === dateKey(selected) ? 'selected' : ''} ${dateKey(date) === dateKey(new Date()) ? 'today' : ''}`}
          aria-pressed={dateKey(date) === dateKey(selected)}
          aria-current={
            dateKey(date) === dateKey(new Date()) ? 'date' : undefined
          }
          aria-label={date.toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          onClick={() => onSelect(date)}
        >
          <span>
            {date
              .toLocaleDateString(locale, { weekday: 'short' })
              .replace(/\.$/, '')}
          </span>
          <strong>{date.getDate()}</strong>
          <Dots colors={colors(date)} />
        </button>
      ))}
    </div>
  );
}
export function Dots({ colors = [] }) {
  return (
    <span className="ui-strip-dots" aria-hidden="true">
      {colors.slice(0, 3).map((color, i) => (
        <i key={i} style={{ background: color }} />
      ))}
    </span>
  );
}
export function WeekPresentation({ value, onChange, messages }) {
  return (
    <div className="ui-week-options">
      <div
        className="ui-segments"
        role="group"
        aria-label={plannerText(messages, 'detail_view')}
      >
        {[
          ['day', 'one_day'],
          ['all', 'whole_week'],
        ].map(([mode, key]) => (
          <button
            type="button"
            key={mode}
            className={value === mode ? 'active' : ''}
            aria-pressed={value === mode}
            onClick={() => onChange(mode)}
          >
            {plannerText(messages, key)}
          </button>
        ))}
      </div>
    </div>
  );
}
export function AgendaDay({
  date,
  locale,
  messages,
  count,
  onAdd,
  children,
  condensed = false,
}) {
  return (
    <section className="ui-agenda-day" data-agenda-date={dateKey(date)}>
      <header className="ui-agenda-head">
        <div>
          {!condensed && (
            <div className="ui-eyebrow">
              {plannerText(messages, 'your_day')}
            </div>
          )}
          <h3>
            {date.toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>
          {count != null && (
            <p>{plannerText(messages, 'entries').replace('{count}', count)}</p>
          )}
        </div>
        {onAdd && (
          <button
            className="tc-icon"
            type="button"
            onClick={() => onAdd(date)}
            aria-label={`${t(messages, 'create_event')}: ${date.toLocaleDateString(locale)}`}
          >
            <Plus size={19} />
          </button>
        )}
      </header>
      <div className="ui-agenda-items">{children}</div>
    </section>
  );
}
export function EventCard({
  event,
  members,
  participants,
  time,
  messages,
  onOpen,
}) {
  const people = participants(event);
  return (
    <article
      className="ui-event-card"
      style={calendarEventStyle(event, members)}
    >
      <div className="ui-event-time">
        <time>
          {event.all_day ? t(messages, 'all_day') : time(event.starts_at)}
        </time>
        {!event.all_day && event.ends_at && (
          <small>{time(event.ends_at)}</small>
        )}
      </div>
      <button
        className="ui-event-content"
        type="button"
        onClick={() => onOpen(event)}
      >
        <strong>{event.title}</strong>
        {event.location && (
          <span className="ui-event-location">
            <MapPin size={13} />
            {event.location}
          </span>
        )}
        <span className="ui-event-people">
          <span className="ui-avatars">
            {people.slice(0, 3).map((member) => (
              <MemberAvatar key={member.user_id} member={member} size={19} />
            ))}
          </span>
          <span>{people.map((member) => member.display_name).join(', ')}</span>
        </span>
      </button>
      <button
        className="tc-icon bare ui-event-more"
        type="button"
        aria-label={`${plannerText(messages, 'event_options')}: ${event.title}`}
        onClick={() => onOpen(event)}
      >
        <MoreVertical size={17} />
      </button>
    </article>
  );
}
export function EmptyDay({ messages, onAdd, condensed = false }) {
  if (condensed)
    return (
      <p className="ui-week-empty">{plannerText(messages, 'empty_hint')}</p>
    );
  return (
    <div className="ui-agenda-empty">
      <CalendarDays size={24} />
      <div>
        <strong>{plannerText(messages, 'empty_day')}</strong>
        <p>{plannerText(messages, 'empty_hint')}</p>
        {onAdd && (
          <button type="button" className="tc-btn" onClick={onAdd}>
            <Plus size={15} />
            {t(messages, 'create_event')}
          </button>
        )}
      </div>
    </div>
  );
}
export function CompactMonth({
  month,
  selected,
  onSelect,
  eventsOn,
  members,
  locale,
  messages,
  weekStart,
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - (weekStart === 'sunday' ? 0 : 1) + 7) % 7;
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from(
    { length: Math.ceil((offset + last) / 7) * 7 },
    (_, i) => addDays(first, i - offset),
  );
  const count = new Set(
    days
      .filter((date) => date.getMonth() === month.getMonth())
      .flatMap((date) =>
        eventsOn(date).map((event) => `${event.id}:${event.starts_at}`),
      ),
  ).size;
  function keyboard(e, date) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      e.key
    ];
    if (delta == null) return;
    e.preventDefault();
    const next = addDays(date, delta);
    onSelect(next);
    const grid = e.currentTarget.closest('.ui-month-grid');
    requestAnimationFrame(() =>
      grid?.querySelector(`[data-date="${dateKey(next)}"]`)?.focus(),
    );
  }
  return (
    <section
      className="ui-month-panel"
      aria-label={month.toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      })}
    >
      <div className="ui-month-grid">
        {days.slice(0, 7).map((date) => (
          <div className="ui-weekday" key={dateKey(date)}>
            {date
              .toLocaleDateString(locale, { weekday: 'short' })
              .replace(/\.$/, '')}
          </div>
        ))}
        {days.map((date) => (
          <div
            key={dateKey(date)}
            className={`ui-day-cell ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${dateKey(date) === dateKey(selected) ? 'selected' : ''} ${dateKey(date) === dateKey(new Date()) ? 'today' : ''}`}
          >
            <button
              className="ui-day-button"
              type="button"
              data-date={dateKey(date)}
              aria-pressed={dateKey(date) === dateKey(selected)}
              aria-current={
                dateKey(date) === dateKey(new Date()) ? 'date' : undefined
              }
              aria-label={`${date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${plannerText(messages, 'entries').replace('{count}', eventsOn(date).length)}`}
              onClick={() => onSelect(date)}
              onKeyDown={(e) => keyboard(e, date)}
            >
              <span className="ui-day-number">{date.getDate()}</span>
              <Dots
                colors={eventsOn(date).flatMap((event) =>
                  calendarEventColors(event, members),
                )}
              />
            </button>
          </div>
        ))}
      </div>
      <footer className="ui-month-caption">
        <span>
          ● &nbsp;
          {plannerText(messages, 'month_count')
            .replace('{count}', count)
            .replace(
              '{month}',
              month.toLocaleDateString(locale, { month: 'long' }),
            )}
        </span>
        <span>{plannerText(messages, 'tap_day')}</span>
      </footer>
    </section>
  );
}
