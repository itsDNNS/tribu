import { Gift, Award, ChevronRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useRewards } from '../hooks/useRewards';
import { t } from '../lib/i18n';

export default function RewardsDashboardWidget() {
  const { messages, isChild, members, setActiveView } = useApp();
  const rw = useRewards();

  if (rw.loading) {
    return (
      <div className="bento-card bento-rewards glass glow-amber">
        <div className="bento-card-header">
          <Gift size={16} /> <span>{t(messages, 'module.rewards.name')}</span>
        </div>
        <div className="skeleton skeleton-text" style={{ width: '60%', height: 14 }} />
        <div className="skeleton skeleton-text" style={{ width: '40%', height: 14, marginTop: 6 }} />
      </div>
    );
  }

  if (!rw.currency) return null;

  // Child: own balance + best affordable reward
  if (isChild) {
    const affordable = rw.catalog.filter(r => r.is_active && rw.myBalance && rw.myBalance.balance >= r.cost).sort((a, b) => b.cost - a.cost);
    const nextReward = affordable[0] || rw.catalog.filter(r => r.is_active).sort((a, b) => a.cost - b.cost)[0];

    return (
      <div className="bento-card bento-rewards glass glow-amber">
        <div className="bento-card-header">
          <Gift size={16} /> <span>{t(messages, 'module.rewards.name')}</span>
          <button className="bento-more" onClick={() => setActiveView('rewards')}>{t(messages, 'view_all')}</button>
        </div>
        {rw.myBalance && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{rw.currency.icon} {rw.myBalance.balance}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rw.currency.name}</div>
          </div>
        )}
        {nextReward && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', marginTop: 4, padding: '6px 8px', background: 'var(--glass-border)', borderRadius: 8 }}>
            <Award size={14} style={{ color: 'var(--amethyst)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{nextReward.name}</span>
            <span style={{ fontWeight: 600 }}>{nextReward.cost} {rw.currency.icon}</span>
          </div>
        )}
      </div>
    );
  }

  // Adult: child balances + pending count
  const childBalances = rw.balances.filter(b => {
    const m = members.find(mem => mem.user_id === b.user_id);
    return m && !m.is_adult;
  });

  return (
    <div className="bento-card bento-rewards glass glow-amber">
      <div className="bento-card-header">
        <Gift size={16} /> <span>{t(messages, 'module.rewards.name')}</span>
        <button className="bento-more" onClick={() => setActiveView('rewards')}>{t(messages, 'view_all')}</button>
      </div>
      {childBalances.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {childBalances.map(b => {
            const member = members.find(m => m.user_id === b.user_id);
            return (
              <div key={b.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                {member?.profile_image ? (
                  <img src={member.profile_image} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div className="sidebar-user-avatar" style={{ width: 24, height: 24, borderRadius: '50%', fontSize: '0.6rem' }}>{(b.display_name || '?')[0].toUpperCase()}</div>
                )}
                <span style={{ flex: 1 }}>{b.display_name}</span>
                <span style={{ fontWeight: 600 }}>{rw.currency.icon} {b.balance}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t(messages, 'module.rewards.no_currency')}</div>
      )}
      {rw.pendingCount > 0 && (
        <button className="btn-ghost" onClick={() => setActiveView('rewards')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem', color: 'var(--warning)', padding: 0 }}>
          <Award size={13} />
          {t(messages, 'module.rewards.widget_pending').replace('{count}', rw.pendingCount)}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}
