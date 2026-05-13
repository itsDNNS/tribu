import { useState } from 'react';
import { Gift, Plus, Star, Check, X, Award, ArrowUpCircle, ArrowDownCircle, Gem, Zap, Heart, Trophy, Clock, CheckSquare } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useRewards } from '../hooks/useRewards';
import { CurrencyIcon } from '../lib/currency-icons';
import { t } from '../lib/i18n';
import { parseServerInstant } from '../lib/helpers';
import MemberAvatar from './MemberAvatar';
import * as api from '../lib/api';

const CURRENCY_PRESETS = [
  { name: 'Stars', icon: 'star', Icon: Star },
  { name: 'Gems', icon: 'gem', Icon: Gem },
  { name: 'Hearts', icon: 'heart', Icon: Heart },
  { name: 'Bolts', icon: 'zap', Icon: Zap },
  { name: 'Trophies', icon: 'trophy', Icon: Trophy },
];

function RewardAmount({ currency, amount, sign = '' }) {
  return (
    <span className="rewards-amount">
      {sign}{amount} <CurrencyIcon icon={currency.icon} label={currency.name} />
    </span>
  );
}

function RewardsPageHeader({ messages, currency }) {
  return (
    <div className="family-view-header rewards-page-header">
      <span className="rewards-page-icon" aria-hidden="true">
        <Gift size={24} />
      </span>
      <div className="rewards-page-title">
        <h1>{t(messages, 'module.rewards.name')}</h1>
        {currency && (
          <span className="rewards-header-currency">
            <CurrencyIcon icon={currency.icon} label={currency.name} /> {currency.name}
          </span>
        )}
      </div>
    </div>
  );
}

function RewardsPanel({ title, children, className = '', action }) {
  return (
    <section className={`rewards-panel${className ? ` ${className}` : ''}`}>
      <div className="rewards-panel-header">
        <h2 className="rewards-section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RewardRowIcon({ children, tone = 'neutral' }) {
  return <span className={`rewards-row-icon rewards-row-icon-${tone}`} aria-hidden="true">{children}</span>;
}

export default function RewardsView() {
  const { messages, members, me, isChild, tasks, loadTasks, lang, demoMode } = useApp();
  const rw = useRewards();

  const [tab, setTab] = useState('overview');
  const [creatingCurrency, setCreatingCurrency] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleAmount, setRuleAmount] = useState(1);
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState(5);
  const [rewardIcon, setRewardIcon] = useState('');
  const [earnUserId, setEarnUserId] = useState('');
  const [earnAmount, setEarnAmount] = useState(1);
  const [earnNote, setEarnNote] = useState('');
  const [confirmingTask, setConfirmingTask] = useState(null);
  const [confirmAmount, setConfirmAmount] = useState(1);

  const rewardTasks = (tasks || []).filter((task) => task.status === 'open' && task.token_reward_amount > 0);
  const activeCatalog = rw.catalog.filter((reward) => reward.is_active);

  if (rw.loading) {
    return (
      <div className="rewards-page">
        <RewardsPageHeader messages={messages} />
        <section className="rewards-panel">
          <div className="skeleton skeleton-text rewards-widget-skeleton-line" />
          <div className="skeleton skeleton-text rewards-widget-skeleton-line short" />
        </section>
      </div>
    );
  }

  async function handleEarnForTask() {
    if (!confirmingTask || !rw.currency) return;
    if (!demoMode) {
      const { ok } = await api.apiUpdateTask(confirmingTask.id, { status: 'done' });
      if (!ok) return;
    }
    const note = t(messages, 'module.rewards.from_task').replace('{title}', confirmingTask.title);
    await rw.earnTokens(confirmingTask.assigned_to_user_id || me?.user_id, confirmAmount, note);
    setConfirmingTask(null);
    if (loadTasks) await loadTasks();
  }

  async function handleEarn(e) {
    e.preventDefault();
    if (!earnUserId) return;
    await rw.earnTokens(Number(earnUserId), earnAmount, earnNote);
    setEarnUserId('');
    setEarnAmount(1);
    setEarnNote('');
  }

  if (!rw.currency && !isChild) {
    return (
      <div className="rewards-page rewards-page-setup">
        <RewardsPageHeader messages={messages} />
        <section className="rewards-panel rewards-setup">
          <div className="rewards-panel-header">
            <h2 className="rewards-section-title">{t(messages, 'module.rewards.currency_setup')}</h2>
          </div>
          <div className="rewards-setup-grid">
            {CURRENCY_PRESETS.map((preset) => {
              const PresetIcon = preset.Icon;
              return (
                <button
                  key={preset.name}
                  className="rewards-setup-option"
                  type="button"
                  disabled={creatingCurrency}
                  onClick={async () => {
                    if (creatingCurrency) return;
                    setCreatingCurrency(true);
                    await rw.createCurrency(preset.name, preset.icon);
                    setCreatingCurrency(false);
                  }}
                >
                  <RewardRowIcon tone={preset.icon}>
                    <PresetIcon size={20} />
                  </RewardRowIcon>
                  <span className="rewards-setup-option-name">{preset.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  if (!rw.currency && isChild) {
    return (
      <div className="rewards-page">
        <RewardsPageHeader messages={messages} />
        <div className="rewards-empty">{t(messages, 'module.rewards.no_currency')}</div>
      </div>
    );
  }

  if (isChild) {
    const myTasks = rewardTasks.filter((task) => task.assigned_to_user_id === me?.user_id);
    const target = activeCatalog
      .filter((reward) => !rw.myBalance || rw.myBalance.balance < reward.cost)
      .sort((a, b) => a.cost - b.cost)[0];
    const progress = target && rw.myBalance ? Math.min(100, Math.round((rw.myBalance.balance / target.cost) * 100)) : 0;
    const remaining = target && rw.myBalance ? Math.max(0, target.cost - rw.myBalance.balance) : 0;

    return (
      <div className="rewards-page rewards-child-page">
        <RewardsPageHeader messages={messages} currency={rw.currency} />
        {rw.myBalance && (
          <section className="rewards-hero rewards-panel">
            <div className="rewards-hero-value">
              <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {rw.myBalance.balance}
            </div>
            <div className="rewards-hero-label">{rw.currency.name}</div>
            {rw.myBalance.pending > 0 && <div className="rewards-hero-pending">{t(messages, 'module.rewards.pending').replace('{count}', rw.myBalance.pending)}</div>}
          </section>
        )}

        {target && rw.myBalance && (
          <section className="rewards-progress rewards-panel">
            <div className="rewards-progress-label">
              {t(messages, 'module.rewards.progress_toward').replace('{name}', target.name)}
            </div>
            <div className="rewards-progress-bar">
              <span className="rewards-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="rewards-progress-info">
              <span><RewardAmount currency={rw.currency} amount={`${rw.myBalance.balance} / ${target.cost}`} /></span>
              <span>{t(messages, 'module.rewards.progress_remaining').replace('{count}', remaining)}</span>
            </div>
          </section>
        )}

        {myTasks.length > 0 && (
          <RewardsPanel title={t(messages, 'module.rewards.tasks_with_reward')}>
            <div className="rewards-list">
              {myTasks.map((task) => (
                <div key={task.id} className="rewards-row rewards-row-task">
                  <RewardRowIcon tone="task"><CheckSquare size={16} /></RewardRowIcon>
                  <span className="rewards-row-title">{task.title}</span>
                  <RewardAmount currency={rw.currency} amount={task.token_reward_amount} sign="+" />
                </div>
              ))}
            </div>
          </RewardsPanel>
        )}

        <RewardsPanel title={t(messages, 'module.rewards.catalog')}>
          {activeCatalog.length === 0 && <div className="rewards-empty">{t(messages, 'module.rewards.no_rewards')}</div>}
          <div className="rewards-catalog-grid">
            {activeCatalog.map((reward) => {
              const canAfford = rw.myBalance && rw.myBalance.balance >= reward.cost;
              return (
                <div key={reward.id} className={`rewards-catalog-card${canAfford ? '' : ' rewards-catalog-card-locked'}`}>
                  <RewardRowIcon tone="spend"><Award size={18} /></RewardRowIcon>
                  <div className="rewards-row-title">
                    <div className="rewards-balance-card-name">{reward.name}</div>
                    <div className="rewards-row-meta"><RewardAmount currency={rw.currency} amount={reward.cost} /></div>
                  </div>
                  <button className="btn-sm" type="button" disabled={!canAfford} onClick={() => rw.redeem(reward)}>
                    {t(messages, 'module.rewards.redeem')}
                  </button>
                </div>
              );
            })}
          </div>
        </RewardsPanel>
      </div>
    );
  }

  return (
    <div className="rewards-page">
      <RewardsPageHeader messages={messages} currency={rw.currency} />

      <div className="rewards-tabs" role="group" aria-label={t(messages, 'module.rewards.name')}>
        {['overview', 'catalog'].map((key) => (
          <button
            key={key}
            type="button"
            className={`rewards-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
          >
            {t(messages, `module.rewards.tab_${key}`)}
            {key === 'overview' && rw.pendingCount > 0 && <span className="rewards-tab-badge">{rw.pendingCount}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="rewards-grid">
          <RewardsPanel title={t(messages, 'module.rewards.balances_title')} className="rewards-panel-wide">
            <div className="rewards-balances">
              {rw.balances.map((balance, index) => {
                const member = members.find((item) => item.user_id === balance.user_id);
                return (
                  <div key={balance.user_id} className="rewards-balance-card">
                    <MemberAvatar member={member || { display_name: balance.display_name }} index={index} size={30} />
                    <div>
                      <div className="rewards-balance-card-name">{balance.display_name}</div>
                      <div className="rewards-balance-card-value"><RewardAmount currency={rw.currency} amount={balance.balance} /></div>
                    </div>
                    {balance.pending > 0 && (
                      <span className="rewards-balance-pending">{t(messages, 'module.rewards.pending').replace('{count}', balance.pending)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </RewardsPanel>

          <RewardsPanel title={t(messages, 'module.rewards.earn_quick')} className="rewards-quick-award">
            <form onSubmit={handleEarn} className="rewards-earn-form">
              <select className="form-input rewards-earn-select" value={earnUserId} onChange={(e) => setEarnUserId(e.target.value)} required>
                <option value="">{t(messages, 'module.rewards.earn_member')}</option>
                {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}
              </select>
              <input className="form-input rewards-earn-amount" type="number" min={1} value={earnAmount} onChange={(e) => setEarnAmount(Number(e.target.value))} aria-label={t(messages, 'module.rewards.earn_amount')} />
              <input className="form-input rewards-earn-note" value={earnNote} onChange={(e) => setEarnNote(e.target.value)} placeholder={t(messages, 'module.rewards.earn_note')} />
              <button className="btn-sm rewards-submit-btn" type="submit">
                <Plus size={14} aria-hidden="true" /> {t(messages, 'module.rewards.earn_tokens')}
              </button>
            </form>
          </RewardsPanel>

          {rewardTasks.length > 0 && (
            <RewardsPanel title={t(messages, 'module.rewards.tasks_with_reward')} className="rewards-panel-wide">
              <div className="rewards-list">
                {rewardTasks.map((task) => {
                  const assignee = members.find((member) => member.user_id === task.assigned_to_user_id);
                  const isConfirming = confirmingTask?.id === task.id;
                  return (
                    <div key={task.id} className="rewards-task-confirm">
                      <div className={`rewards-row rewards-row-task${isConfirming ? ' rewards-row-top' : ''}`}>
                        <button
                          className="btn-ghost rewards-action rewards-action-task"
                          type="button"
                          onClick={() => {
                            setConfirmingTask(isConfirming ? null : task);
                            setConfirmAmount(task.token_reward_amount);
                          }}
                          aria-label={`${t(messages, 'module.rewards.earn_tokens')}: ${task.title}`}
                        >
                          <CheckSquare size={16} aria-hidden="true" />
                        </button>
                        <span className="rewards-row-title">{task.title}</span>
                        {assignee && <span className="rewards-row-meta">{assignee.display_name}</span>}
                        <RewardAmount currency={rw.currency} amount={task.token_reward_amount} sign="+" />
                      </div>
                      {isConfirming && (
                        <div className="rewards-row rewards-row-bottom">
                          <span className="rewards-row-meta">{assignee?.display_name || ''}</span>
                          <input type="number" className="form-input rewards-earn-amount" min={1} value={confirmAmount} onChange={(e) => setConfirmAmount(Number(e.target.value))} aria-label={t(messages, 'module.rewards.earn_amount')} />
                          <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} />
                          <button className="btn-sm rewards-action rewards-action-confirm" type="button" onClick={handleEarnForTask} aria-label={t(messages, 'module.rewards.confirm')}><Check size={14} aria-hidden="true" /></button>
                          <button className="btn-ghost rewards-action rewards-action-reject" type="button" onClick={() => setConfirmingTask(null)} aria-label={t(messages, 'module.rewards.reject')}><X size={14} aria-hidden="true" /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </RewardsPanel>
          )}

          {rw.pendingTxns.length > 0 && (
            <RewardsPanel title={`${t(messages, 'module.rewards.txn_pending')} (${rw.pendingCount})`} className="rewards-panel-wide">
              <div className="rewards-list">
                {rw.pendingTxns.map((transaction) => {
                  const memberName = members.find((member) => member.user_id === transaction.user_id)?.display_name || '';
                  return (
                    <div key={transaction.id} className="rewards-row rewards-row-pending">
                      <RewardRowIcon tone="pending"><Award size={16} /></RewardRowIcon>
                      <span className="rewards-row-title">
                        {memberName}: <RewardAmount currency={rw.currency} amount={transaction.amount} sign={transaction.kind === 'earn' ? '+' : '-'} />
                        {transaction.note && <span className="rewards-row-note"> {transaction.note}</span>}
                      </span>
                      <button className="btn-ghost rewards-action rewards-action-confirm" type="button" onClick={() => rw.confirmTxn(transaction.id)} aria-label={t(messages, 'module.rewards.confirm')}><Check size={16} aria-hidden="true" /></button>
                      <button className="btn-ghost rewards-action rewards-action-reject" type="button" onClick={() => rw.rejectTxn(transaction.id)} aria-label={t(messages, 'module.rewards.reject')}><X size={16} aria-hidden="true" /></button>
                    </div>
                  );
                })}
              </div>
            </RewardsPanel>
          )}

          <div className="rewards-history-link">
            <button className="btn-ghost" type="button" onClick={() => setTab('history')}>
              <Clock size={13} aria-hidden="true" />
              {t(messages, 'module.rewards.history_link')}
            </button>
          </div>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="rewards-grid rewards-catalog-management">
          <RewardsPanel title={t(messages, 'module.rewards.earning_rules')}>
            {rw.rules.length === 0 && <div className="rewards-empty">{t(messages, 'module.rewards.no_rules')}</div>}
            <div className="rewards-list">
              {rw.rules.map((rule) => (
                <div key={rule.id} className="rewards-row rewards-row-earn">
                  <RewardRowIcon tone="earn"><Star size={16} /></RewardRowIcon>
                  <span className="rewards-row-title">{rule.name}</span>
                  <RewardAmount currency={rw.currency} amount={rule.amount} sign="+" />
                  <button className="btn-ghost rewards-action rewards-action-delete" type="button" onClick={() => rw.deleteRule(rule.id)} aria-label={t(messages, 'aria.delete_item').replace('{name}', rule.name)}><X size={14} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); await rw.createRule(ruleName, ruleAmount); setRuleName(''); setRuleAmount(1); }} className="rewards-add-form">
              <input className="form-input rewards-add-name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder={t(messages, 'module.rewards.rule_name')} required />
              <input className="form-input rewards-add-amount" type="number" min={1} value={ruleAmount} onChange={(e) => setRuleAmount(Number(e.target.value))} aria-label={t(messages, 'module.rewards.rule_amount')} />
              <button className="btn-sm rewards-add-btn" type="submit" aria-label={t(messages, 'module.rewards.add_rule')}><Plus size={14} aria-hidden="true" /></button>
            </form>
          </RewardsPanel>

          <RewardsPanel title={t(messages, 'module.rewards.catalog')}>
            {rw.catalog.length === 0 && <div className="rewards-empty">{t(messages, 'module.rewards.no_rewards')}</div>}
            <div className="rewards-list">
              {rw.catalog.map((reward) => (
                <div key={reward.id} className="rewards-row rewards-row-spend">
                  <RewardRowIcon tone="spend"><Award size={16} /></RewardRowIcon>
                  <span className="rewards-row-title">{reward.name}</span>
                  <RewardAmount currency={rw.currency} amount={reward.cost} />
                  <button className="btn-ghost rewards-action rewards-action-delete" type="button" onClick={() => rw.deleteReward(reward.id)} aria-label={t(messages, 'aria.delete_item').replace('{name}', reward.name)}><X size={14} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); await rw.createReward(rewardName, rewardCost, rewardIcon || null); setRewardName(''); setRewardCost(5); setRewardIcon(''); }} className="rewards-add-form rewards-add-reward-form">
              <input className="form-input rewards-add-name" value={rewardName} onChange={(e) => setRewardName(e.target.value)} placeholder={t(messages, 'module.rewards.reward_name')} required />
              <input className="form-input rewards-add-amount" type="number" min={1} value={rewardCost} onChange={(e) => setRewardCost(Number(e.target.value))} aria-label={t(messages, 'module.rewards.reward_cost')} />
              <select className="form-input rewards-add-icon" value={rewardIcon} onChange={(e) => setRewardIcon(e.target.value)} aria-label={t(messages, 'module.rewards.reward_icon')}>
                <option value="">{t(messages, 'module.rewards.reward_icon')}</option>
                {CURRENCY_PRESETS.map((preset) => (
                  <option key={preset.icon} value={preset.icon}>{preset.name}</option>
                ))}
              </select>
              <button className="btn-sm rewards-add-btn" type="submit" aria-label={t(messages, 'module.rewards.add_reward')}><Plus size={14} aria-hidden="true" /></button>
            </form>
          </RewardsPanel>
        </div>
      )}

      {tab === 'history' && (
        <RewardsPanel
          title={t(messages, 'module.rewards.transactions')}
          action={(
            <button className="btn-ghost rewards-history-back" type="button" onClick={() => setTab('overview')}>
              {t(messages, 'module.rewards.tab_overview')}
            </button>
          )}
        >
          <div className="rewards-list">
            {rw.transactions.map((transaction) => {
              const memberName = members.find((member) => member.user_id === transaction.user_id)?.display_name || '';
              const date = parseServerInstant(transaction.created_at).toLocaleDateString(lang);
              return (
                <div key={transaction.id} className="rewards-row rewards-history-row">
                  <RewardRowIcon tone={transaction.kind === 'earn' ? 'earn' : 'spend'}>
                    {transaction.kind === 'earn' ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                  </RewardRowIcon>
                  <span className="rewards-history-date">{date}</span>
                  <span className="rewards-history-member">{memberName}</span>
                  <span className="rewards-row-title">
                    {transaction.note || t(messages, transaction.kind === 'earn' ? 'module.rewards.txn_earn' : 'module.rewards.txn_redeem')}
                  </span>
                  <RewardAmount currency={rw.currency} amount={transaction.amount} sign={transaction.kind === 'earn' ? '+' : '-'} />
                  <span className={`rewards-history-status rewards-history-status-${transaction.status}`}>
                    {t(messages, `module.rewards.txn_${transaction.status}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </RewardsPanel>
      )}
    </div>
  );
}
