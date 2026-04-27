import { useEffect, useState } from 'react';
import { Calendar, Cake, Users } from 'lucide-react';

/**
 * Glanceable wall/tablet layout for a paired display device.
 *
 * Read-only by design: no settings/admin/search/sidebar/quick-add
 * controls are rendered. The component receives only the data
 * returned by `/display/dashboard`, which is already a curated
 * server-side projection (no member emails, no admin-only metadata).
 */
export default function DisplayDashboard({ me, dashboard }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="display-dashboard" data-testid="display-dashboard">
      <header className="display-header">
        <div className="display-header-left">
          <div className="display-date" data-testid="display-date">{dateLabel}</div>
          <div className="display-time" data-testid="display-time">{timeLabel}</div>
        </div>
        <div className="display-header-right">
          <div className="display-family-name" data-testid="display-family-name">
            {dashboard.family_name}
          </div>
          <div className="display-device-name" data-testid="display-device-name">
            {me.name}
          </div>
        </div>
      </header>

      <section className="display-card display-events" data-testid="display-events">
        <div className="display-card-header">
          <Calendar size={18} aria-hidden="true" />
          <h2>Next events</h2>
        </div>
        {dashboard.next_events.length === 0 ? (
          <p className="display-empty">No upcoming events.</p>
        ) : (
          <ul className="display-list">
            {dashboard.next_events.map((event, idx) => (
              <li key={`${event.starts_at}-${event.title}-${idx}`} className="display-list-row">
                <div className="display-event-when">
                  {formatEventWhen(event)}
                </div>
                <div className="display-event-title">{event.title}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="display-card display-birthdays" data-testid="display-birthdays">
        <div className="display-card-header">
          <Cake size={18} aria-hidden="true" />
          <h2>Upcoming birthdays</h2>
        </div>
        {dashboard.upcoming_birthdays.length === 0 ? (
          <p className="display-empty">No birthdays in the next 4 weeks.</p>
        ) : (
          <ul className="display-list">
            {dashboard.upcoming_birthdays.map((b) => (
              <li key={`${b.person_name}-${b.occurs_on}`} className="display-list-row">
                <div className="display-birthday-name">{b.person_name}</div>
                <div className="display-birthday-when">
                  {formatBirthdayWhen(b)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="display-card display-members" data-testid="display-members">
        <div className="display-card-header">
          <Users size={18} aria-hidden="true" />
          <h2>Family</h2>
        </div>
        <ul className="display-member-row">
          {dashboard.members.map((m, idx) => (
            <li
              key={`${m.display_name}-${idx}`}
              className="display-member-chip"
              style={m.color ? { borderColor: m.color } : undefined}
            >
              <span className="display-member-name">{m.display_name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatEventWhen(event) {
  if (event.all_day) {
    const d = parseLooseDate(event.starts_at);
    return d ? d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' }) : event.starts_at;
  }
  const d = parseLooseDate(event.starts_at);
  if (!d) return event.starts_at;
  return d.toLocaleString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatBirthdayWhen(b) {
  if (b.days_until === 0) return 'Today';
  if (b.days_until === 1) return 'Tomorrow';
  return `in ${b.days_until} days`;
}

function parseLooseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
