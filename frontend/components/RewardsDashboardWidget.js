import { Award, ChevronRight, Star, Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useRewards } from '../hooks/useRewards';
import { CurrencyIcon } from '../lib/currency-icons';
import { t } from '../lib/i18n';
import { currencyName, familyGoalProgress, goalFor, openFamilyGoals, waitingForAdults } from '../lib/rewards';
import MemberAvatar from './MemberAvatar';
import { DashboardCardHeading } from './DashboardDetails';

function RewardsCardShell({ messages, setActiveView, children, loading = false }) {
  return (
    <div className={`bento-card bento-rewards bento-card-illustrated rewards-widget-card${loading ? ' rewards-widget-loading' : ''}`}>
      <DashboardCardHeading icon={Star} tone="amber" title={t(messages, 'module.rewards.name')} action={t(messages, 'module.rewards.view_all')} onClick={() => setActiveView('rewards')} />
      {children}
    </div>
  );
}

function Bar({ value, label, max, now }) {
  return (
    <span className="dashboard-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={now}>
      <span style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </span>
  );
}

// The family goal everyone saves for, in one line.
function FamilyGoalLine({ goal, messages }) {
  if (!goal) return null;
  const state = familyGoalProgress(goal);
  return (
    <div className="rewards-widget-family">
      <Users size={14} aria-hidden="true" />
      <span className="rewards-widget-family-name">{goal.name}</span>
      <Bar value={state.fraction} label={goal.name} max={state.cost} now={state.progress} />
      <span className="rewards-widget-family-count">{t(messages, 'module.rewards.family_goal_count').replace('{progress}', state.progress).replace('{cost}', state.cost)}</span>
    </div>
  );
}

export default function RewardsDashboardWidget() {
  const { messages, isChild, members, setActiveView } = useApp();
  const rw = useRewards();

  if (rw.loading || !rw.currency) {
    return (
      <RewardsCardShell messages={messages} setActiveView={setActiveView} loading>
        <div className="rewards-widget-skeleton">
          <div className="skeleton skeleton-text rewards-widget-skeleton-line" />
          <div className="skeleton skeleton-text rewards-widget-skeleton-line short" />
        </div>
      </RewardsCardShell>
    );
  }

  const name = currencyName(rw.currency, messages);
  const familyGoal = openFamilyGoals(rw.catalog)[0];

  if (isChild) {
    const goal = rw.myBalance ? goalFor(rw.myBalance, rw.catalog, { fallback: true }) : null;
    return (
      <RewardsCardShell messages={messages} setActiveView={setActiveView}>
        {rw.myBalance && (
          <div className="rewards-widget-balance">
            <span className="rewards-widget-balance-value">
              <CurrencyIcon icon={rw.currency.icon} label={name} /> {rw.myBalance.balance}
            </span>
            <span className="rewards-widget-balance-label">{name}</span>
          </div>
        )}
        {goal && (
          <div className="rewards-widget-goal">
            <div className="rewards-widget-goal-copy">
              <span className="rewards-widget-goal-label">
                {goal.reached
                  ? t(messages, 'family.goal_reached').replace('{reward}', goal.reward.name)
                  : t(messages, 'module.rewards.progress_toward').replace('{name}', goal.reward.name)}
              </span>
              <span className="rewards-widget-goal-cost">
                {goal.cost} <CurrencyIcon icon={rw.currency.icon} label={name} />
              </span>
            </div>
            <div className="rewards-progress-bar">
              <span className="rewards-progress-fill" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
            </div>
          </div>
        )}
        <FamilyGoalLine goal={familyGoal} messages={messages} />
      </RewardsCardShell>
    );
  }

  const waiting = waitingForAdults(rw.transactions);
  // Children always; grown-ups once they collect or chose a wish.
  const people = rw.balances.filter((balance) => {
    const member = members.find((item) => item.user_id === balance.user_id);
    return member && (!member.is_adult || balance.balance > 0 || balance.goal_reward_id);
  });

  return (
    <RewardsCardShell messages={messages} setActiveView={setActiveView}>
      {waiting.count > 0 && (
        <button type="button" className="rewards-widget-pending" onClick={() => setActiveView('rewards')}>
          <Award size={14} aria-hidden="true" />
          <span>{t(messages, 'module.rewards.waiting_count').replace('{count}', waiting.count)}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      )}
      {people.length > 0 && (
        <div className="rewards-child-list" aria-label={t(messages, 'module.rewards.family_title')}>
          {people.slice(0, 4).map((balance) => {
            const index = members.findIndex((item) => item.user_id === balance.user_id);
            const member = members[index];
            const goal = goalFor(balance, rw.catalog, { fallback: !member?.is_adult });
            return (
              <div key={balance.user_id} className="rewards-child-row">
                <MemberAvatar member={member || { display_name: balance.display_name }} index={Math.max(0, index)} size={26} />
                <span className="rewards-child-copy">
                  <span className="rewards-child-name">{balance.display_name}</span>
                  {goal && <Bar value={goal.progress} label={goal.reward.name} max={goal.cost} now={goal.points} />}
                </span>
                <span className="rewards-child-balance">
                  <CurrencyIcon icon={rw.currency.icon} label={name} /> {balance.balance}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <FamilyGoalLine goal={familyGoal} messages={messages} />
    </RewardsCardShell>
  );
}
