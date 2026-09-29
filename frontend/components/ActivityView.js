import HouseholdActivityFeed from './HouseholdActivityFeed';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';

export default function ActivityView() {
  const { activity, messages, lang } = useApp();

  return (
    <div className="activity-page">
      <header className="list-header">
        <h1>{t(messages, 'module.activity.title')}</h1>
      </header>

      <div className="activity-history-layout">
        <HouseholdActivityFeed activity={activity} messages={messages} lang={lang} limit={0} />
      </div>
    </div>
  );
}
