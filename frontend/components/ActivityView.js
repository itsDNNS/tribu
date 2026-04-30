import HouseholdActivityFeed from './HouseholdActivityFeed';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';

export default function ActivityView() {
  const { activity, messages, lang } = useApp();

  return (
    <div>
      <div className="view-header activity-view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.activity.title')}</h1>
          <p className="view-subtitle">{t(messages, 'module.activity.subtitle')}</p>
        </div>
      </div>

      <div className="activity-history-layout">
        <HouseholdActivityFeed activity={activity} messages={messages} lang={lang} limit={0} />
      </div>
    </div>
  );
}
