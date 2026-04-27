import { useEffect, useMemo, useState } from 'react';
import { Calendar, Cake, Users } from 'lucide-react';

/**
 * Glanceable wall/tablet layout for a paired display device.
 *
 * Read-only by design: no settings/admin/search/sidebar/quick-add
 * controls are rendered. The component receives only the data
 * returned by `/display/dashboard`, which is already a curated
 * server-side projection: `family_name`, `device_name`, `members`
 * (display_name + optional color only — no user_id, email, or
 * profile image), display-safe events, and birthday countdowns.
 *
 * Layout follows the "Tribu Hearth" three-column grid in landscape
 * (Pulse | Horizon | Tribe) and collapses to a single vertical stack
 * in portrait or under 1024px.
 */
export default function DisplayDashboard({ me, dashboard }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const timeLabel = formatTimeOfDay(now);
  const dateLabel = formatBigDate(now);

  const events = Array.isArray(dashboard.next_events) ? dashboard.next_events : [];
  const eventGroups = useMemo(() => groupEventsByDay(events, now), [events, now]);
  const focus = useMemo(() => pickFocusEvent(events, now), [events, now]);

  const birthdays = Array.isArray(dashboard.upcoming_birthdays)
    ? dashboard.upcoming_birthdays
    : [];
  const celebration = birthdays[0] || null;
  const imminentNames = new Set(
    birthdays.filter((b) => b.days_until <= 2).map((b) => b.person_name)
  );

  const familyName = dashboard.family_name || '';
  const deviceName = (me && me.name) || dashboard.device_name || '';

  return (
    <div
      className="display-dashboard"
      data-testid="display-dashboard"
      role="region"
      aria-label="Tribu shared home display"
    >
      <section className="display-pulse" data-testid="display-pulse">
        <div className="display-card display-identity">
          <div className="display-hearth-label">
            <span className="display-hearth-prefix">The</span>
            <span
              className="display-hearth-name"
              data-testid="display-family-name"
            >
              {familyName || 'Family'}
            </span>
            <span className="display-hearth-suffix">Home</span>
          </div>
          {deviceName && (
            <div
              className="display-device-tag"
              data-testid="display-device-name"
            >
              {deviceName}
            </div>
          )}
        </div>

        <div className="display-card display-clock-shell" aria-live="off">
          <div className="display-clock" data-testid="display-time">
            {timeLabel}
          </div>
          <div className="display-date" data-testid="display-date">
            {dateLabel}
          </div>
        </div>

        <FocusCard focus={focus} />
      </section>

      <section
        className="display-card display-horizon"
        data-testid="display-events"
        aria-live="polite"
      >
        <header className="display-section-header">
          <Calendar size={22} aria-hidden="true" />
          <h2>Family agenda</h2>
        </header>
        {eventGroups.length === 0 ? (
          <EmptyHearth message="The hearth is quiet — nothing scheduled in the next 14 days." />
        ) : (
          <ol className="display-agenda">
            {eventGroups.map((group) => (
              <li key={group.key} className="display-agenda-day">
                <div className="display-agenda-day-head">
                  <span className="display-agenda-day-name">
                    {group.dayLabel}
                  </span>
                  <span className="display-agenda-day-date">
                    {group.subLabel}
                  </span>
                </div>
                <ul className="display-agenda-list">
                  {group.events.map((ev, idx) => (
                    <AgendaRow
                      key={`${group.key}-${idx}`}
                      event={ev}
                      now={now}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="display-tribe">
        <div
          className="display-card display-card-celebration"
          data-testid="display-birthdays"
        >
          <header className="display-section-header">
            <Cake size={22} aria-hidden="true" />
            <h2>Celebration</h2>
          </header>
          {celebration ? (
            <CelebrationCard birthday={celebration} />
          ) : (
            <EmptyHearth
              tone="soft"
              message="No birthdays in the next 4 weeks."
            />
          )}
        </div>

        <div
          className="display-card display-card-members"
          data-testid="display-members"
        >
          <header className="display-section-header">
            <Users size={22} aria-hidden="true" />
            <h2>Family</h2>
          </header>
          {dashboard.members && dashboard.members.length > 0 ? (
            <ul className="display-member-wall">
              {dashboard.members.map((m, idx) => {
                const isCelebrant = imminentNames.has(m.display_name);
                const tint = sanitizeColor(m.color) || fallbackTint(idx);
                return (
                  <li
                    key={`${m.display_name}-${idx}`}
                    className={
                      'display-member' +
                      (isCelebrant ? ' display-member--celebrant' : '')
                    }
                    style={{ '--member-tint': tint }}
                    data-testid="display-member"
                  >
                    <span className="display-member-avatar" aria-hidden="true">
                      {initials(m.display_name)}
                    </span>
                    <span className="display-member-name">
                      {m.display_name}
                    </span>
                    {isCelebrant && (
                      <span
                        className="display-member-badge"
                        aria-label="Birthday soon"
                        title="Birthday soon"
                      >
                        🎂
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyHearth
              tone="soft"
              message="No family members yet."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function FocusCard({ focus }) {
  if (!focus) {
    return (
      <div
        className="display-card display-focus display-focus--empty"
        data-testid="display-focus"
        data-status="empty"
      >
        <div className="display-focus-eyebrow">Right now</div>
        <div className="display-focus-title">All clear</div>
        <div className="display-focus-meta">
          Nothing on the immediate horizon — enjoy the calm.
        </div>
      </div>
    );
  }
  const { event, status } = focus;
  const eyebrow =
    status === 'live'
      ? 'Happening now'
      : status === 'today'
      ? "Today's focus"
      : 'Coming up';
  const tint = sanitizeColor(event.color);
  return (
    <div
      className={`display-card display-focus display-focus--${status}`}
      data-testid="display-focus"
      data-status={status}
      style={tint ? { '--focus-tint': tint } : undefined}
    >
      <div className="display-focus-eyebrow">{eyebrow}</div>
      <div className="display-focus-title" title={event.title}>
        {event.title}
      </div>
      <div className="display-focus-meta">
        {formatFocusMeta(event, status)}
      </div>
    </div>
  );
}

function CelebrationCard({ birthday }) {
  const imminent = birthday.days_until <= 2;
  return (
    <div
      className="display-celebration"
      data-status={imminent ? 'imminent' : 'soon'}
    >
      <div className="display-celebration-emoji" aria-hidden="true">
        {birthday.days_until === 0 ? '🎉' : '🎂'}
      </div>
      <div className="display-celebration-name">{birthday.person_name}</div>
      <div className="display-celebration-when">
        {formatBirthdayWhen(birthday)}
      </div>
    </div>
  );
}

function AgendaRow({ event, now }) {
  const live = isEventLive(event, now);
  const tint = sanitizeColor(event.color);
  return (
    <li
      className={
        'display-agenda-row' + (live ? ' display-agenda-row--live' : '')
      }
      style={tint ? { '--row-tint': tint } : undefined}
      data-status={live ? 'live' : 'scheduled'}
    >
      <span className="display-agenda-when">{formatAgendaWhen(event)}</span>
      <span className="display-agenda-title">{event.title}</span>
      {event.category && (
        <span className="display-agenda-category">{event.category}</span>
      )}
    </li>
  );
}

function EmptyHearth({ message, tone = 'default' }) {
  return (
    <div className={`display-empty display-empty--${tone}`}>
      <span className="display-empty-glyph" aria-hidden="true">
        ·
      </span>
      <span>{message}</span>
    </div>
  );
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FALLBACK_TINTS = [
  'var(--member-1)',
  'var(--member-2)',
  'var(--member-3)',
  'var(--member-4)',
];

function fallbackTint(idx) {
  return FALLBACK_TINTS[idx % FALLBACK_TINTS.length];
}

// Calendar/member colors arrive from user-editable payload fields and
// are not validated server-side. They flow into CSS custom properties
// via inline `style`, where React does not escape values — a stray
// `;` or `url(...)` would let an attacker break out of the declaration
// and inject arbitrary CSS. Allow only the shapes Tribu actually emits:
// 3- or 6-digit hex (case-insensitive). Everything else falls back.
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function sanitizeColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : null;
}

function initials(name) {
  if (!name) return '·';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  const out = parts.map((p) => p[0]?.toUpperCase() || '').join('');
  return out || '·';
}

function parseLooseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function formatTimeOfDay(d) {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBigDate(d) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function eventEnd(event, start) {
  const end = parseLooseDate(event.ends_at);
  if (end) return end;
  return new Date(start.getTime() + HOUR_MS);
}

function isEventLive(event, now) {
  const start = parseLooseDate(event.starts_at);
  if (!start) return false;
  if (event.all_day) {
    return startOfDay(start).getTime() === startOfDay(now).getTime();
  }
  const end = eventEnd(event, start);
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
}

function pickFocusEvent(events, now) {
  if (!Array.isArray(events) || events.length === 0) return null;

  const live = events.find((e) => isEventLive(e, now));
  if (live) return { event: live, status: 'live' };

  const today = startOfDay(now).getTime();
  const enriched = events
    .map((e) => ({ e, t: parseLooseDate(e.starts_at) }))
    .filter(({ t }) => !!t);

  const todayUpcoming = enriched
    .filter(
      ({ t }) =>
        startOfDay(t).getTime() === today && t.getTime() >= now.getTime()
    )
    .sort((a, b) => a.t - b.t);
  if (todayUpcoming.length > 0)
    return { event: todayUpcoming[0].e, status: 'today' };

  const upcoming = enriched
    .filter(({ t }) => t.getTime() >= now.getTime())
    .sort((a, b) => a.t - b.t);
  if (upcoming.length > 0) return { event: upcoming[0].e, status: 'upcoming' };

  return null;
}

function groupEventsByDay(events, now) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const today = startOfDay(now).getTime();
  const enriched = events
    .map((e) => ({ e, t: parseLooseDate(e.starts_at) }))
    .filter(({ t }) => !!t)
    .sort((a, b) => a.t - b.t);

  const groups = new Map();
  for (const { e, t } of enriched) {
    const anchor = startOfDay(t);
    const key = dayKey(anchor);
    if (!groups.has(key)) {
      groups.set(key, { key, anchor, events: [] });
    }
    groups.get(key).events.push(e);
  }

  return Array.from(groups.values()).map((g) => {
    const diffDays = Math.round((g.anchor.getTime() - today) / DAY_MS);
    let dayLabel;
    if (diffDays === 0) dayLabel = 'Today';
    else if (diffDays === 1) dayLabel = 'Tomorrow';
    else if (diffDays > 1 && diffDays < 7) {
      dayLabel = g.anchor.toLocaleDateString(undefined, { weekday: 'long' });
    } else {
      dayLabel = g.anchor.toLocaleDateString(undefined, {
        weekday: 'long',
      });
    }
    const subLabel = g.anchor.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
    });
    return { ...g, dayLabel, subLabel };
  });
}

function formatAgendaWhen(event) {
  if (event.all_day) return 'All day';
  const d = parseLooseDate(event.starts_at);
  if (!d) return event.starts_at || '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFocusMeta(event, status) {
  const start = parseLooseDate(event.starts_at);
  if (!start) return event.starts_at || '';
  if (event.all_day) {
    if (status === 'today' || status === 'live') return 'All day today';
    return start.toLocaleDateString(undefined, {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    });
  }
  const time = start.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (status === 'live') {
    const end = parseLooseDate(event.ends_at);
    return end
      ? `Until ${end.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : `Started at ${time}`;
  }
  if (status === 'today') return `Starts at ${time}`;
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  return `${day} · ${time}`;
}

function formatBirthdayWhen(b) {
  if (b.days_until === 0) return 'Today';
  if (b.days_until === 1) return 'Tomorrow';
  if (b.days_until < 7) return `In ${b.days_until} days`;
  if (b.days_until < 14) return 'Next week';
  return `In ${b.days_until} days`;
}
