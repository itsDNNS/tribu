import { Gift, Award, ChevronRight } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useRewards } from '../hooks/useRewards';
import { CurrencyIcon } from '../lib/currency-icons';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';

export default function RewardsDashboardWidget() {
  const { messages, isChild, members, setActiveView } = useApp();
  const rw = useRewards();

  if (rw.loading) {
    return (
      <div className="bento-card bento-rewards bento-card-illustrated glass glow-amber">
        <span className="bento-card-visual bento-card-visual-rewards" aria-hidden="true">
          <Gift size={30} />
        </span>
        <div className="bento-card-header">
          <h2 className="bento-card-title">{t(messages, 'module.rewards.name')}</h2>
        </div>
        <div className="skeleton skeleton-text" style={{ width: '60%', height: 14 }} />
        <div className="skeleton skeleton-text" style={{ width: '40%', height: 14, marginTop: 6 }} />
      </div>
    );
  }

  if (!rw.currency) {
    return (
      <div className="bento-card bento-rewards bento-card-illustrated">
        <span className="bento-card-visual bento-card-visual-rewards" aria-hidden="true">
          <Gift size={30} />
        </span>
        <div className="bento-card-header">
          <h2 className="bento-card-title">{t(messages, 'module.rewards.name')}</h2>
        </div>
        <div className="rewards-balance rewards-balance-empty">
          <div className="rewards-balance-value">0</div>
          <div className="rewards-balance-label">{t(messages, 'module.rewards.no_currency')}</div>
        </div>
        <div className="bento-card-footer">
          <button type="button" className="bento-card-action" onClick={() => setActiveView('rewards')}>
            {t(messages, 'module.rewards.view_all')}
          </button>
        </div>
      </div>
    );
  }

  // Child: own balance + best affordable reward
  if (isChild) {
    const affordable = rw.catalog.filter(r => r.is_active && rw.myBalance && rw.myBalance.balance >= r.cost).sort((a, b) => b.cost - a.cost);
    const nextReward = affordable[0] || rw.catalog.filter(r => r.is_active).sort((a, b) => a.cost - b.cost)[0];

    return (
      <div className="bento-card bento-rewards bento-card-illustrated glass glow-amber">
        <span className="bento-card-visual bento-card-visual-rewards" aria-hidden="true">
          <Gift size={30} />
        </span>
        <div className="bento-card-header">
          <h2 className="bento-card-title">{t(messages, 'module.rewards.name')}</h2>
        </div>
        {rw.myBalance && (
          <div className="rewards-balance">
            <div className="rewards-balance-value"><CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {rw.myBalance.balance}</div>
            <div className="rewards-balance-label">{rw.currency.name}</div>
          </div>
        )}
        {nextReward && (
          <div className="rewards-next">
            <Award size={14} style={{ color: 'var(--amethyst)', flexShrink: 0 }} />
            <span className="rewards-next-name">{nextReward.name}</span>
            <span className="rewards-next-cost">{nextReward.cost} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
          </div>
        )}
        <div className="bento-card-footer">
          <button type="button" className="bento-card-action" onClick={() => setActiveView('rewards')}>
            {t(messages, 'module.rewards.view_all')}
          </button>
        </div>
      </div>
    );
  }

  // Adult: child balances + pending count
  const childBalances = rw.balances.filter(b => {
    const m = members.find(mem => mem.user_id === b.user_id);
    return m && !m.is_adult;
  });

  return (
    <div className="bento-card bento-rewards bento-card-illustrated glass glow-amber">
      <span className="bento-card-visual bento-card-visual-rewards" aria-hidden="true">
        <Gift size={30} />
      </span>
      <div className="bento-card-header">
        <h2 className="bento-card-title">{t(messages, 'module.rewards.name')}</h2>
      </div>
      {childBalances.length > 0 ? (
        <div className="rewards-child-list">
          {childBalances.map((b, i) => {
            const member = members.find(m => m.user_id === b.user_id);
            return (
              <div key={b.user_id} className="rewards-child-row">
                <MemberAvatar member={member || { display_name: b.display_name }} index={i} size={24} />
                <span className="rewards-child-name">{b.display_name}</span>
                <span className="rewards-child-balance"><CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {b.balance}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t(messages, 'module.rewards.no_currency')}</div>
      )}
      {rw.pendingCount > 0 && (
        <button className="btn-ghost rewards-pending" onClick={() => setActiveView('rewards')}>
          <Award size={13} />
          {t(messages, 'module.rewards.widget_pending').replace('{count}', rw.pendingCount)}
          <ChevronRight size={13} />
        </button>
      )}
      <div className="bento-card-footer">
        <button type="button" className="bento-card-action" onClick={() => setActiveView('rewards')}>
          {t(messages, 'module.rewards.view_all')}
        </button>
      </div>
    </div>
  );
}
