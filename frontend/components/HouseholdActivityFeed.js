import { Activity } from 'lucide-react';
import { t } from '../lib/i18n';
import { parseDate } from '../lib/helpers';

function formatActivityTime(value, lang = 'en') {
  const parsed = parseDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  return parsed.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HouseholdActivityFeed({ activity = [], messages = {}, lang = 'en', limit = 5 }) {
  const allEntries = Array.isArray(activity) ? activity : [];
  const entries = limit ? allEntries.slice(0, limit) : allEntries;
  const title = t(messages, 'module.dashboard.activity_title');
  const unknownActor = t(messages, 'module.dashboard.activity_unknown_actor');

  return (
    <div className="bento-card bento-activity" role="region" aria-label={title}>
      <div className="bento-card-header">
        <h2 className="bento-card-title"><Activity size={16} aria-hidden="true" /> {title}</h2>
      </div>
      {entries.length === 0 ? (
        <div className="bento-empty">{t(messages, 'module.dashboard.activity_empty')}</div>
      ) : (
        <div className="activity-feed-list">
          {entries.map((entry) => {
            const actor = entry.actor_display_name || unknownActor;
            const when = formatActivityTime(entry.created_at, lang);
            return (
              <div key={entry.id} className="activity-feed-item">
                <span className="activity-feed-dot" aria-hidden="true" />
                <div className="activity-feed-copy">
                  <div className="activity-feed-summary">{entry.summary}</div>
                  <div className="activity-feed-meta">
                    <span>{actor}</span>
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
