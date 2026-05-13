import { Award, ChevronRight, Gift, Trophy } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useRewards } from '../hooks/useRewards';
import { CurrencyIcon } from '../lib/currency-icons';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';

function RewardsCardShell({ messages, setActiveView, children, loading = false }) {
  return (
    <div className={`bento-card bento-rewards bento-card-illustrated rewards-widget-card${loading ? ' rewards-widget-loading' : ''}`}>
      <span className="bento-card-visual bento-card-visual-rewards rewards-widget-visual" aria-hidden="true">
        <Gift size={30} />
      </span>
      <div className="bento-card-header rewards-widget-header">
        <div>
          <h2 className="bento-card-title">{t(messages, 'module.rewards.name')}</h2>
        </div>
      </div>
      {children}
      <div className="bento-card-footer rewards-widget-footer">
        <button type="button" className="bento-card-action" onClick={() => setActiveView('rewards')}>
          {t(messages, 'module.rewards.view_all')}
        </button>
      </div>
    </div>
  );
}

export default function RewardsDashboardWidget() {
  const { messages, isChild, members, setActiveView } = useApp();
  const rw = useRewards();

  if (rw.loading) {
    return (
      <RewardsCardShell messages={messages} setActiveView={setActiveView} loading>
        <div className="rewards-widget-skeleton">
          <div className="skeleton skeleton-text rewards-widget-skeleton-line" />
          <div className="skeleton skeleton-text rewards-widget-skeleton-line short" />
        </div>
      </RewardsCardShell>
    );
  }

  if (!rw.currency) {
    return (
      <RewardsCardShell messages={messages} setActiveView={setActiveView}>
        <div className="rewards-widget-empty">
          <span className="rewards-widget-empty-icon" aria-hidden="true">
            <Trophy size={18} />
          </span>
          <span>{t(messages, 'module.rewards.no_currency')}</span>
        </div>
      </RewardsCardShell>
    );
  }

  if (isChild) {
    const activeRewards = rw.catalog.filter((reward) => reward.is_active);
    const nextReward = activeRewards
      .filter((reward) => !rw.myBalance || rw.myBalance.balance < reward.cost)
      .sort((a, b) => a.cost - b.cost)[0] || activeRewards.sort((a, b) => b.cost - a.cost)[0];
    const progress = nextReward && rw.myBalance
      ? Math.min(100, Math.round((rw.myBalance.balance / nextReward.cost) * 100))
      : 0;

    return (
      <RewardsCardShell messages={messages} setActiveView={setActiveView}>
        {rw.myBalance && (
          <div className="rewards-widget-balance">
            <span className="rewards-widget-balance-value">
              <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {rw.myBalance.balance}
            </span>
            <span className="rewards-widget-balance-label">{rw.currency.name}</span>
          </div>
        )}
        {nextReward && (
          <div className="rewards-widget-goal">
            <div className="rewards-widget-goal-copy">
              <span className="rewards-widget-goal-label">
                {t(messages, 'module.rewards.progress_toward').replace('{name}', nextReward.name)}
              </span>
              <span className="rewards-widget-goal-cost">
                {nextReward.cost} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} />
              </span>
            </div>
            <div className="rewards-progress-bar">
              <span className="rewards-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </RewardsCardShell>
    );
  }

  const childBalances = rw.balances.filter((balance) => {
    const member = members.find((item) => item.user_id === balance.user_id);
    return member && !member.is_adult;
  });
  const totalBalance = childBalances.reduce((sum, balance) => sum + balance.balance, 0);

  return (
    <RewardsCardShell messages={messages} setActiveView={setActiveView}>
      <div className="rewards-widget-summary" aria-label={t(messages, 'module.rewards.balances_title')}>
        <div className="rewards-widget-total">
          <span className="rewards-widget-total-value">
            <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {totalBalance}
          </span>
          <span className="rewards-widget-total-label">{rw.currency.name}</span>
        </div>
        {rw.pendingCount > 0 && (
          <button type="button" className="rewards-widget-pending" onClick={() => setActiveView('rewards')}>
            <Award size={14} aria-hidden="true" />
            <span>{t(messages, 'module.rewards.widget_pending').replace('{count}', rw.pendingCount)}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {childBalances.length > 0 ? (
        <div className="rewards-child-list">
          {childBalances.slice(0, 3).map((balance, index) => {
            const member = members.find((item) => item.user_id === balance.user_id);
            return (
              <div key={balance.user_id} className="rewards-child-row">
                <MemberAvatar member={member || { display_name: balance.display_name }} index={index} size={26} />
                <span className="rewards-child-name">{balance.display_name}</span>
                <span className="rewards-child-balance">
                  <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {balance.balance}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rewards-widget-empty">{t(messages, 'module.rewards.no_currency')}</div>
      )}
    </RewardsCardShell>
  );
}
