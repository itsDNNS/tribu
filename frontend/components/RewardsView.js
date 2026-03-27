import { useState } from 'react';
import { Gift, Plus, Star, Check, X, Award, ArrowUpCircle, ArrowDownCircle, Gem, Zap, Heart, Trophy, Clock, CheckSquare } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { useRewards } from '../hooks/useRewards';
import { t } from '../lib/i18n';
import { errorText, parseUtc } from '../lib/helpers';
import * as api from '../lib/api';

const CURRENCY_PRESETS = [
  { name: 'Stars', icon: '⭐', Icon: Star, color: '#f59e0b' },
  { name: 'Gems', icon: '💎', Icon: Gem, color: '#7c3aed' },
  { name: 'Hearts', icon: '❤️', Icon: Heart, color: '#f43f5e' },
  { name: 'Bolts', icon: '⚡', Icon: Zap, color: '#06b6d4' },
  { name: 'Trophies', icon: '🏆', Icon: Trophy, color: '#f59e0b' },
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

  // ── No currency setup ──
  if (!rw.currency && !isChild) {
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        <div className="glass settings-section" style={{ maxWidth: 460, margin: '2em auto', padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>{t(messages, 'module.rewards.currency_setup')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {CURRENCY_PRESETS.map(p => (
              <button key={p.name} className="glass-sm" disabled={creatingCurrency} onClick={async () => {
                if (creatingCurrency) return;
                setCreatingCurrency(true);
                await rw.createCurrency(p.name, p.icon);
                setCreatingCurrency(false);
              }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', cursor: 'pointer', borderRadius: 10, textAlign: 'left', opacity: creatingCurrency ? 0.5 : 1 }}>
                <p.Icon size={24} style={{ color: p.color, flexShrink: 0 }} />
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.icon} {p.name}</div>
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
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '3em' }}>{t(messages, 'module.rewards.no_currency')}</p>
      </div>
    );
  }

  // ── Child view ──
  if (isChild) {
    const myTasks = rewardTasks.filter(tk => tk.assigned_to_user_id === me?.user_id);
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        {rw.myBalance && (
          <div className="glass glow-purple" style={{ textAlign: 'center', padding: 32, marginBottom: 24, borderRadius: 16 }}>
            <div style={{ fontSize: '3rem', fontWeight: 700 }}>{rw.currency.icon} {rw.myBalance.balance}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>{rw.currency.name}</div>
            {rw.myBalance.pending > 0 && <div style={{ color: 'var(--warning)', fontSize: '0.78rem', marginTop: 4 }}>{t(messages, 'module.rewards.pending').replace('{count}', rw.myBalance.pending)}</div>}
          </div>
        )}
        {myTasks.length > 0 && (
          <>
            <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.tasks_with_reward')}</h3>
            {myTasks.map(tk => (
              <div key={tk.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.85rem', alignItems: 'center' }}>
                <CheckSquare size={14} style={{ color: 'var(--amethyst)' }} />
                <span style={{ flex: 1 }}>{tk.title}</span>
                <span style={{ fontWeight: 600 }}>+{tk.token_reward_amount} {rw.currency.icon}</span>
              </div>
            ))}
          </>
        )}
        <h3 style={{ margin: '16px 0 8px' }}>{t(messages, 'module.rewards.catalog')}</h3>
        <div className="settings-grid">
          {rw.catalog.filter(r => r.is_active).map(r => {
            const canAfford = rw.myBalance && rw.myBalance.balance >= r.cost;
            return (
              <div key={r.id} className="glass-sm settings-section" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: canAfford ? 1 : 0.5 }}>
                <Award size={18} style={{ color: 'var(--amethyst)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.cost} {rw.currency.icon}</div>
                </div>
                <button className="btn-sm" disabled={!canAfford} onClick={() => rw.redeem(r)}>{t(messages, 'module.rewards.redeem')}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Adult view ──
  return (
    <div className="view-content">
      <div className="view-header">
        <h1><Gift size={22} /> {t(messages, 'module.rewards.name')} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{rw.currency.icon} {rw.currency.name}</span></h1>
      </div>

      {/* Tabs - history demoted to link */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['overview', 'catalog'].map(k => (
          <button key={k} className="btn-ghost" onClick={() => setTab(k)}
            style={{ padding: '6px 14px', borderRadius: 8, background: tab === k ? 'var(--amethyst)' : undefined, color: tab === k ? '#fff' : undefined }}>
            {t(messages, `module.rewards.tab_${k}`)}
            {k === 'overview' && rw.pendingCount > 0 && <span style={{ marginLeft: 6, background: 'var(--warning)', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: '0.7rem' }}>{rw.pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          {/* Balances */}
          <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.balances_title')}</h3>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
            {rw.balances.map(b => {
              const member = members.find(m => m.user_id === b.user_id);
              return (
                <div key={b.user_id} className="glass-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, minWidth: 160, flexShrink: 0 }}>
                  {member?.profile_image ? (
                    <img src={member.profile_image} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div className="sidebar-user-avatar" style={{ width: 28, height: 28, borderRadius: '50%', fontSize: '0.7rem' }}>{(b.display_name || '?')[0].toUpperCase()}</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>{b.display_name}</div>
                    <div style={{ fontWeight: 700 }}>{rw.currency.icon} {b.balance}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tasks with token rewards */}
          {rewardTasks.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.tasks_with_reward')}</h3>
              {rewardTasks.map(tk => {
                const assignee = members.find(m => m.user_id === tk.assigned_to_user_id);
                const isConfirming = confirmingTask?.id === tk.id;
                return (
                  <div key={tk.id}>
                    <div className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: isConfirming ? 0 : 4, borderRadius: isConfirming ? '8px 8px 0 0' : 8, fontSize: '0.85rem', alignItems: 'center' }}>
                      <button className="btn-ghost" onClick={() => { setConfirmingTask(isConfirming ? null : tk); setConfirmAmount(tk.token_reward_amount); }} style={{ padding: 2 }}>
                        <CheckSquare size={16} style={{ color: isConfirming ? 'var(--success)' : 'var(--amethyst)' }} />
                      </button>
                      <span style={{ flex: 1 }}>{tk.title}</span>
                      {assignee && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{assignee.display_name}</span>}
                      <span style={{ fontWeight: 600 }}>+{tk.token_reward_amount} {rw.currency.icon}</span>
                    </div>
                    {isConfirming && (
                      <div className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: '0 0 8px 8px', borderTop: '1px solid var(--glass-border)', alignItems: 'center', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{assignee?.display_name || '?'}</span>
                        <input type="number" className="form-input" min={1} value={confirmAmount} onChange={e => setConfirmAmount(Number(e.target.value))} style={{ width: 60, padding: '4px 8px' }} />
                        <span>{rw.currency.icon}</span>
                        <button className="btn-sm" onClick={handleEarnForTask}><Check size={14} /></button>
                        <button className="btn-ghost" onClick={() => setConfirmingTask(null)} style={{ padding: 2 }}><X size={14} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Quick earn */}
          <h3 style={{ margin: '16px 0 8px' }}>{t(messages, 'module.rewards.earn_quick')}</h3>
          <form onSubmit={handleEarn} className="glass-sm settings-section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <select className="form-input" value={earnUserId} onChange={e => setEarnUserId(e.target.value)} required style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t(messages, 'module.rewards.earn_member')}</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
            <input className="form-input" type="number" min={1} value={earnAmount} onChange={e => setEarnAmount(Number(e.target.value))} style={{ width: 70 }} />
            <input className="form-input" value={earnNote} onChange={e => setEarnNote(e.target.value)} placeholder={t(messages, 'module.rewards.earn_note')} style={{ flex: 2, minWidth: 120 }} />
            <button className="btn-sm" type="submit"><Plus size={14} /> {t(messages, 'module.rewards.earn_tokens')}</button>
          </form>

          {/* Pending confirmations */}
          {rw.pendingTxns.length > 0 && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>{t(messages, 'module.rewards.txn_pending')} ({rw.pendingCount})</h3>
              {rw.pendingTxns.map(tx => {
                const memberName = members.find(m => m.user_id === tx.user_id)?.display_name || '?';
                return (
                  <div key={tx.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.82rem', alignItems: 'center' }}>
                    <Award size={14} style={{ color: 'var(--warning)' }} />
                    <span style={{ flex: 1 }}>{memberName}: {tx.kind === 'earn' ? '+' : '-'}{tx.amount} {rw.currency.icon} {tx.note && `(${tx.note})`}</span>
                    <button className="btn-ghost" onClick={() => rw.confirmTxn(tx.id)} style={{ color: 'var(--success)', padding: 4 }}><Check size={16} /></button>
                    <button className="btn-ghost" onClick={() => rw.rejectTxn(tx.id)} style={{ color: 'var(--danger)', padding: 4 }}><X size={16} /></button>
                  </div>
                );
              })}
            </>
          )}

          {/* History link */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button className="btn-ghost" onClick={() => setTab('history')} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {t(messages, 'module.rewards.history_link')}
            </button>
          </div>
        </>
      )}

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <>
          <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.earning_rules')}</h3>
          {rw.rules.map(r => (
            <div key={r.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.85rem', alignItems: 'center' }}>
              <Star size={14} style={{ color: 'var(--amethyst)' }} />
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontWeight: 600 }}>+{r.amount} {rw.currency.icon}</span>
              <button className="btn-ghost" onClick={() => rw.deleteRule(r.id)} style={{ color: 'var(--danger)', padding: 4 }}><X size={14} /></button>
            </div>
          ))}
          <form onSubmit={async (e) => { e.preventDefault(); await rw.createRule(ruleName, ruleAmount); setRuleName(''); setRuleAmount(1); }} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="form-input" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder={t(messages, 'module.rewards.rule_name')} required style={{ flex: 1 }} />
            <input className="form-input" type="number" min={1} value={ruleAmount} onChange={e => setRuleAmount(Number(e.target.value))} style={{ width: 70 }} />
            <button className="btn-sm" type="submit"><Plus size={14} /></button>
          </form>

          <h3 style={{ margin: '20px 0 8px' }}>{t(messages, 'module.rewards.catalog')}</h3>
          {rw.catalog.map(r => (
            <div key={r.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.85rem', alignItems: 'center' }}>
              <Award size={14} style={{ color: 'var(--amethyst)' }} />
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontWeight: 600 }}>{r.cost} {rw.currency.icon}</span>
              <button className="btn-ghost" onClick={() => rw.deleteReward(r.id)} style={{ color: 'var(--danger)', padding: 4 }}><X size={14} /></button>
            </div>
          ))}
          <form onSubmit={async (e) => { e.preventDefault(); await rw.createReward(rewardName, rewardCost, rewardIcon || null); setRewardName(''); setRewardCost(5); setRewardIcon(''); }} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="form-input" value={rewardName} onChange={e => setRewardName(e.target.value)} placeholder={t(messages, 'module.rewards.reward_name')} required style={{ flex: 1 }} />
            <input className="form-input" type="number" min={1} value={rewardCost} onChange={e => setRewardCost(Number(e.target.value))} style={{ width: 70 }} />
            <button className="btn-sm" type="submit"><Plus size={14} /></button>
          </form>
        </>
      )}

      {/* History Tab (hidden, accessible via link) */}
      {tab === 'history' && (
        <>
          <button className="btn-ghost" onClick={() => setTab('overview')} style={{ marginBottom: 12, fontSize: '0.82rem' }}>&larr; {t(messages, 'module.rewards.tab_overview')}</button>
          {rw.transactions.map(tx => {
            const memberName = members.find(m => m.user_id === tx.user_id)?.display_name || '?';
            const date = parseUtc(tx.created_at).toLocaleDateString();
            return (
              <div key={tx.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.82rem', alignItems: 'center' }}>
                {tx.kind === 'earn' ? <ArrowUpCircle size={14} style={{ color: 'var(--success)' }} /> : <ArrowDownCircle size={14} style={{ color: 'var(--danger)' }} />}
                <span style={{ color: 'var(--text-muted)', minWidth: 70 }}>{date}</span>
                <span style={{ minWidth: 80 }}>{memberName}</span>
                <span style={{ flex: 1 }}>{tx.note || tx.kind}</span>
                <span style={{ fontWeight: 600 }}>{tx.kind === 'earn' ? '+' : '-'}{tx.amount} {rw.currency.icon}</span>
                <span style={{ fontSize: '0.7rem', color: tx.status === 'pending' ? 'var(--warning)' : tx.status === 'confirmed' ? 'var(--success)' : 'var(--danger)' }}>{tx.status}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
