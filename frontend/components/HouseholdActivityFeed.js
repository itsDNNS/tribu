import { Activity, MessagesSquare, CalendarDays, CheckCircle, ShoppingCart, ClipboardCheck } from 'lucide-react';
import { t } from '../lib/i18n';
import { DashboardCardHeading, DashboardBadge } from './DashboardDetails';
import { parseServerInstant } from '../lib/helpers';

function formatActivityTime(value, lang = 'en') {
  const parsed = parseServerInstant(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  return parsed.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HouseholdActivityFeed({ activity = [], messages = {}, lang = 'en', limit = 5, dashboard = false }) {
  const allEntries = Array.isArray(activity) ? activity : [];
  const entries = limit ? allEntries.slice(0, limit) : allEntries;
  const title = t(messages, dashboard ? 'module.dashboard.feed_title' : 'module.dashboard.activity_title');
  const unknownActor = t(messages, 'module.dashboard.activity_unknown_actor');

  return (
    <div className="bento-card bento-activity" role="region" aria-label={title}>
      {dashboard ? <DashboardCardHeading title={title} icon={MessagesSquare} /> : <div className="bento-card-header"><h2 className="bento-card-title"><Activity size={16} aria-hidden="true" /> {title}</h2></div>}
      {entries.length === 0 ? (
        <div className="bento-empty">{t(messages, 'module.dashboard.activity_empty')}</div>
      ) : (
        <div className="activity-feed-list">
          {entries.map((entry) => {
            const actor = entry.actor_display_name || unknownActor;
            const instant = parseServerInstant(entry.created_at);
            const minutesAgo = instant ? Math.max(0, Math.floor((Date.now() - instant.getTime()) / 60000)) : 0;
            const when = dashboard && instant ? new Intl.RelativeTimeFormat(lang || 'en', { numeric: 'auto' }).format(minutesAgo < 60 ? -minutesAgo : minutesAgo < 1440 ? -Math.floor(minutesAgo / 60) : -Math.floor(minutesAgo / 1440), minutesAgo < 60 ? 'minute' : minutesAgo < 1440 ? 'hour' : 'day') : formatActivityTime(entry.created_at, lang);
            const completed = entry.action === 'completed' || entry.action === 'checked';
            const feedIcon = completed ? CheckCircle : entry.object_type === 'event' ? CalendarDays : entry.object_type === 'shopping_item' ? ShoppingCart : ClipboardCheck;
            return (
              <div key={entry.id} className="activity-feed-item">
                <span className="activity-feed-marker">{dashboard ? <DashboardBadge icon={feedIcon} tone={completed ? 'green' : entry.object_type === 'event' ? 'blue' : 'amber'} /> : <span className="activity-feed-dot" aria-hidden="true" />}</span>
                <div className="activity-feed-copy">
                  <div className="activity-feed-summary">{entry.summary}</div>
                  <div className="activity-feed-meta">
                    {!dashboard && <span>{actor}</span>}
                    {when && <span>{when}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
