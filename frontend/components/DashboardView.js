import { useApp } from '../contexts/AppContext';
import { prettyDate } from '../lib/helpers';
import { t } from '../lib/i18n';
import { styles } from '../lib/styles';

export default function DashboardView() {
  const { summary, me, profileImage, isMobile, tokens, messages, ui } = useApp();

  return (
    <div>
      <div style={ui.card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img src={profileImage || 'https://placehold.co/64x64?text=U'} alt="profile" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <h2 style={{ margin: 0 }}>{t(messages, 'welcome')}{me?.display_name ? `, ${me.display_name}` : ''}</h2>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{t(messages, 'important_first')}</p>
          </div>
        </div>
      </div>

      <div style={{ ...styles.grid2, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
        <div style={ui.card}><h3>{t(messages, 'next_events')}</h3>{summary.next_events?.length ? summary.next_events.map(e => <p key={e.id}><strong>{e.title}</strong><br /><small>{prettyDate(e.starts_at)}</small></p>) : <p>{t(messages, 'no_upcoming_events')}</p>}</div>
        <div style={ui.card}><h3>{t(messages, 'upcoming_birthdays_4w')}</h3>{summary.upcoming_birthdays?.length ? summary.upcoming_birthdays.map((b, i) => <p key={i}><strong>{b.person_name}</strong><br /><small>{b.occurs_on} in {b.days_until} Tagen</small></p>) : <p>{t(messages, 'no_upcoming_birthdays')}</p>}</div>
      </div>
    </div>
  );
}
