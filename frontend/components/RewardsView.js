import { useState } from 'react';
import { Gift, Plus, Star, Check, X, Award, ArrowUpCircle, ArrowDownCircle, Gem, Zap, Heart, Trophy, Clock, CheckSquare } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { useRewards } from '../hooks/useRewards';
import { CurrencyIcon } from '../lib/currency-icons';
import { t } from '../lib/i18n';
import { errorText, parseDate } from '../lib/helpers';
import * as api from '../lib/api';

const CURRENCY_PRESETS = [
  { name: 'Stars', icon: 'star', Icon: Star, color: '#f59e0b' },
  { name: 'Gems', icon: 'gem', Icon: Gem, color: '#7c3aed' },
  { name: 'Hearts', icon: 'heart', Icon: Heart, color: '#f43f5e' },
  { name: 'Bolts', icon: 'zap', Icon: Zap, color: '#06b6d4' },
  { name: 'Trophies', icon: 'trophy', Icon: Trophy, color: '#f59e0b' },
];

export default function RewardsView() {
  const { familyId, messages, members, me, isChild, isAdmin, demoMode, tasks, setActiveView, loadTasks } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const rw = useRewards();

  const [tab, setTab] = useState('overview');
  const [creatingCurrency, setCreatingCurrency] = useState(false);

  // Form state
  const [ruleName, setRuleName] = useState('');
  const [ruleAmount, setRuleAmount] = useState(1);
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState(5);
  const [rewardIcon, setRewardIcon] = useState('');
  const [earnUserId, setEarnUserId] = useState('');
  const [earnAmount, setEarnAmount] = useState(1);
  const [earnNote, setEarnNote] = useState('');

  // Inline task-reward confirmation
  const [confirmingTask, setConfirmingTask] = useState(null);
  const [confirmAmount, setConfirmAmount] = useState(1);

  // Tasks with token rewards (open, assigned)
  const rewardTasks = (tasks || []).filter(tk => tk.status === 'open' && tk.token_reward_amount > 0);

  async function handleTaskComplete(task) {
    const { ok } = await api.apiUpdateTask(task.id, { status: 'done' });
    if (!ok) return;
    if (!task.token_require_confirmation && rw.currency) {
      await rw.earnTokens(task.assigned_to_user_id || me?.user_id, task.token_reward_amount, `Task: ${task.title}`);
    }
    setConfirmingTask(null);
    if (loadTasks) await loadTasks();
  }

  async function handleEarnForTask() {
    if (!confirmingTask || !rw.currency) return;
    const { ok } = await api.apiUpdateTask(confirmingTask.id, { status: 'done' });
    if (!ok) return;
    await rw.earnTokens(confirmingTask.assigned_to_user_id || me?.user_id, confirmAmount, `Task: ${confirmingTask.title}`);
    setConfirmingTask(null);
    if (loadTasks) await loadTasks();
  }

  async function handleEarn(e) {
    e.preventDefault();
    if (!earnUserId) return;
    await rw.earnTokens(Number(earnUserId), earnAmount, earnNote);
    setEarnUserId(''); setEarnAmount(1); setEarnNote('');
  }

  // -- No currency setup --
  if (!rw.currency && !isChild) {
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        <div className="glass settings-section rewards-setup">
          <h3 className="rewards-setup-title">{t(messages, 'module.rewards.currency_setup')}</h3>
          <div className="rewards-setup-grid">
            {CURRENCY_PRESETS.map(p => (
              <button key={p.name} className="glass-sm rewards-setup-option" disabled={creatingCurrency} onClick={async () => {
                if (creatingCurrency) return;
                setCreatingCurrency(true);
                await rw.createCurrency(p.name, p.icon);
                setCreatingCurrency(false);
              }}>
                <p.Icon size={24} style={{ color: p.color, flexShrink: 0 }} />
                <div className="rewards-setup-option-name">{p.name}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!rw.currency && isChild) {
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        <div className="rewards-empty">{t(messages, 'module.rewards.no_currency')}</div>
      </div>
    );
  }

  // -- Child view --
  if (isChild) {
    const myTasks = rewardTasks.filter(tk => tk.assigned_to_user_id === me?.user_id);
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        {rw.myBalance && (
          <div className="glass glow-purple rewards-hero">
            <div className="rewards-hero-value"><CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {rw.myBalance.balance}</div>
            <div className="rewards-hero-label">{rw.currency.name}</div>
            {rw.myBalance.pending > 0 && <div className="rewards-hero-pending">{t(messages, 'module.rewards.pending').replace('{count}', rw.myBalance.pending)}</div>}
          </div>
        )}
        {(() => {
          const unaffordable = rw.catalog
            .filter(r => r.is_active && (!rw.myBalance || rw.myBalance.balance < r.cost))
            .sort((a, b) => a.cost - b.cost);
          const target = unaffordable[0];
          if (!target || !rw.myBalance) return null;
          const pct = Math.min(100, Math.round((rw.myBalance.balance / target.cost) * 100));
          const remaining = target.cost - rw.myBalance.balance;
          return (
            <div className="rewards-progress">
              <div className="rewards-progress-label">
                {t(messages, 'module.rewards.progress_toward').replace('{name}', target.name)}
              </div>
              <div className="rewards-progress-bar">
                <div className="rewards-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="rewards-progress-info">
                <span>{rw.myBalance.balance} / {target.cost} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
                <span>{t(messages, 'module.rewards.progress_remaining').replace('{count}', remaining)}</span>
              </div>
            </div>
          );
        })()}
        {myTasks.length > 0 && (
          <>
            <h3 className="rewards-section-title">{t(messages, 'module.rewards.tasks_with_reward')}</h3>
            {myTasks.map(tk => (
              <div key={tk.id} className="glass-sm rewards-row rewards-row-task">
                <CheckSquare size={14} style={{ color: 'var(--amethyst)' }} />
                <span className="rewards-row-title">{tk.title}</span>
                <span className="rewards-row-value">+{tk.token_reward_amount} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
              </div>
            ))}
          </>
        )}
        <h3 className="rewards-section-title">{t(messages, 'module.rewards.catalog')}</h3>
        {rw.catalog.filter(r => r.is_active).length === 0 && <div className="rewards-empty">{t(messages, 'module.rewards.no_rewards')}</div>}
        <div className="settings-grid">
          {rw.catalog.filter(r => r.is_active).map(r => {
            const canAfford = rw.myBalance && rw.myBalance.balance >= r.cost;
            return (
              <div key={r.id} className={`glass-sm settings-section rewards-catalog-item${canAfford ? '' : ' rewards-catalog-item-locked'}`}>
                <Award size={18} style={{ color: 'var(--amethyst)', flexShrink: 0 }} />
                <div className="rewards-row-title">
                  <div className="rewards-balance-card-name">{r.name}</div>
                  <div className="rewards-row-meta">{r.cost} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></div>
                </div>
                <button className="btn-sm" disabled={!canAfford} onClick={() => rw.redeem(r)}>{t(messages, 'module.rewards.redeem')}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // -- Adult view --
  return (
    <div className="view-content">
      <div className="view-header">
        <h1><Gift size={22} /> {t(messages, 'module.rewards.name')} <span className="rewards-header-currency"><CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {rw.currency.name}</span></h1>
      </div>

      {/* Tabs - history demoted to link */}
      <div className="rewards-tabs">
        {['overview', 'catalog'].map(k => (
          <button key={k} className={`rewards-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {t(messages, `module.rewards.tab_${k}`)}
            {k === 'overview' && rw.pendingCount > 0 && <span className="rewards-tab-badge">{rw.pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          {/* Balances */}
          <h3 className="rewards-section-title">{t(messages, 'module.rewards.balances_title')}</h3>
          <div className="rewards-balances">
            {rw.balances.map(b => {
              const member = members.find(m => m.user_id === b.user_id);
              return (
                <div key={b.user_id} className="glass-sm rewards-balance-card">
                  {member?.profile_image ? (
                    <img src={member.profile_image} alt="" className="rewards-balance-card-avatar" />
                  ) : (
                    <div className="sidebar-user-avatar rewards-balance-card-avatar-fallback">{(b.display_name || '?')[0].toUpperCase()}</div>
                  )}
                  <div>
                    <div className="rewards-balance-card-name">{b.display_name}</div>
                    <div className="rewards-balance-card-value"><CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {b.balance}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tasks with token rewards */}
          {rewardTasks.length > 0 && (
            <>
              <h3 className="rewards-section-title">{t(messages, 'module.rewards.tasks_with_reward')}</h3>
              {rewardTasks.map(tk => {
                const assignee = members.find(m => m.user_id === tk.assigned_to_user_id);
                const isConfirming = confirmingTask?.id === tk.id;
                return (
                  <div key={tk.id}>
                    <div className={`glass-sm rewards-row rewards-row-task${isConfirming ? ' rewards-row-top' : ''}`}>
                      <button className="btn-ghost rewards-action" onClick={() => { setConfirmingTask(isConfirming ? null : tk); setConfirmAmount(tk.token_reward_amount); }}>
                        <CheckSquare size={16} style={{ color: isConfirming ? 'var(--success)' : 'var(--amethyst)' }} />
                      </button>
                      <span className="rewards-row-title">{tk.title}</span>
                      {assignee && <span className="rewards-row-meta">{assignee.display_name}</span>}
                      <span className="rewards-row-value">+{tk.token_reward_amount} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
                    </div>
                    {isConfirming && (
                      <div className="glass-sm rewards-row rewards-row-bottom">
                        <span className="rewards-row-meta">{assignee?.display_name || '?'}</span>
                        <input type="number" className="form-input rewards-earn-amount" min={1} value={confirmAmount} onChange={e => setConfirmAmount(Number(e.target.value))} />
                        <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} />
                        <button className="btn-sm" onClick={handleEarnForTask}><Check size={14} /></button>
                        <button className="btn-ghost rewards-action" onClick={() => setConfirmingTask(null)}><X size={14} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Quick earn */}
          <h3 className="rewards-section-title">{t(messages, 'module.rewards.earn_quick')}</h3>
          <form onSubmit={handleEarn} className="glass-sm settings-section rewards-earn-form">
            <select className="form-input rewards-earn-select" value={earnUserId} onChange={e => setEarnUserId(e.target.value)} required>
              <option value="">{t(messages, 'module.rewards.earn_member')}</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
            <input className="form-input rewards-earn-amount" type="number" min={1} value={earnAmount} onChange={e => setEarnAmount(Number(e.target.value))} />
            <input className="form-input rewards-earn-note" value={earnNote} onChange={e => setEarnNote(e.target.value)} placeholder={t(messages, 'module.rewards.earn_note')} />
            <button className="btn-sm" type="submit"><Plus size={14} /> {t(messages, 'module.rewards.earn_tokens')}</button>
          </form>

          {/* Pending confirmations */}
          {rw.pendingTxns.length > 0 && (
            <>
              <h3 className="rewards-section-title">{t(messages, 'module.rewards.txn_pending')} ({rw.pendingCount})</h3>
              {rw.pendingTxns.map(tx => {
                const memberName = members.find(m => m.user_id === tx.user_id)?.display_name || '?';
                return (
                  <div key={tx.id} className="glass-sm rewards-row rewards-row-pending">
                    <Award size={14} style={{ color: 'var(--warning)' }} />
                    <span className="rewards-row-title">{memberName}: {tx.kind === 'earn' ? '+' : '-'}{tx.amount} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /> {tx.note && `(${tx.note})`}</span>
                    <button className="btn-ghost rewards-action rewards-action-confirm" onClick={() => rw.confirmTxn(tx.id)}><Check size={16} /></button>
                    <button className="btn-ghost rewards-action rewards-action-reject" onClick={() => rw.rejectTxn(tx.id)}><X size={16} /></button>
                  </div>
                );
              })}
            </>
          )}

          {/* History link */}
          <div className="rewards-history-link">
            <button className="btn-ghost" onClick={() => setTab('history')}>
              <Clock size={13} />
              {t(messages, 'module.rewards.history_link')}
            </button>
          </div>
        </>
      )}

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <>
          <h3 className="rewards-section-title">{t(messages, 'module.rewards.earning_rules')}</h3>
          {rw.rules.length === 0 && <div className="rewards-empty">{t(messages, 'module.rewards.no_rules')}</div>}
          {rw.rules.map(r => (
            <div key={r.id} className="glass-sm rewards-row rewards-row-earn">
              <Star size={14} style={{ color: 'var(--amethyst)' }} />
              <span className="rewards-row-title">{r.name}</span>
              <span className="rewards-row-value">+{r.amount} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
              <button className="btn-ghost rewards-action rewards-action-delete" onClick={() => rw.deleteRule(r.id)}><X size={14} /></button>
            </div>
          ))}
          <form onSubmit={async (e) => { e.preventDefault(); await rw.createRule(ruleName, ruleAmount); setRuleName(''); setRuleAmount(1); }} className="rewards-add-form">
            <input className="form-input rewards-add-name" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder={t(messages, 'module.rewards.rule_name')} required />
            <input className="form-input rewards-add-amount" type="number" min={1} value={ruleAmount} onChange={e => setRuleAmount(Number(e.target.value))} />
            <button className="btn-sm" type="submit"><Plus size={14} /></button>
          </form>

          <h3 className="rewards-section-title">{t(messages, 'module.rewards.catalog')}</h3>
          {rw.catalog.length === 0 && <div className="rewards-empty">{t(messages, 'module.rewards.no_rewards')}</div>}
          {rw.catalog.map(r => (
            <div key={r.id} className="glass-sm rewards-row rewards-row-spend">
              <Award size={14} style={{ color: 'var(--amethyst)' }} />
              <span className="rewards-row-title">{r.name}</span>
              <span className="rewards-row-value">{r.cost} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
              <button className="btn-ghost rewards-action rewards-action-delete" onClick={() => rw.deleteReward(r.id)}><X size={14} /></button>
            </div>
          ))}
          <form onSubmit={async (e) => { e.preventDefault(); await rw.createReward(rewardName, rewardCost, rewardIcon || null); setRewardName(''); setRewardCost(5); setRewardIcon(''); }} className="rewards-add-form">
            <input className="form-input rewards-add-name" value={rewardName} onChange={e => setRewardName(e.target.value)} placeholder={t(messages, 'module.rewards.reward_name')} required />
            <input className="form-input rewards-add-amount" type="number" min={1} value={rewardCost} onChange={e => setRewardCost(Number(e.target.value))} />
            <button className="btn-sm" type="submit"><Plus size={14} /></button>
          </form>
        </>
      )}

      {/* History Tab (hidden, accessible via link) */}
      {tab === 'history' && (
        <>
          <button className="btn-ghost rewards-history-back" onClick={() => setTab('overview')}>&larr; {t(messages, 'module.rewards.tab_overview')}</button>
          {rw.transactions.map(tx => {
            const memberName = members.find(m => m.user_id === tx.user_id)?.display_name || '?';
            const date = parseDate(tx.created_at).toLocaleDateString();
            return (
              <div key={tx.id} className="glass-sm rewards-row rewards-history-row">
                {tx.kind === 'earn' ? <ArrowUpCircle size={14} style={{ color: 'var(--success)' }} /> : <ArrowDownCircle size={14} style={{ color: 'var(--danger)' }} />}
                <span className="rewards-history-date">{date}</span>
                <span className="rewards-history-member">{memberName}</span>
                <span className="rewards-row-title">{tx.note || tx.kind}</span>
                <span className="rewards-row-value">{tx.kind === 'earn' ? '+' : '-'}{tx.amount} <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} /></span>
                <span className={`rewards-history-status rewards-history-status-${tx.status}`}>{tx.status}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
