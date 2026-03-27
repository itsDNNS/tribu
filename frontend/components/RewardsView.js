import { useCallback, useEffect, useState } from 'react';
import { Gift, Plus, Star, Check, X, Award, ArrowUpCircle, ArrowDownCircle, Gem, Zap, Heart, Trophy } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import { errorText } from '../lib/helpers';
import * as api from '../lib/api';

export default function RewardsView() {
  const { familyId, messages, members, me, isChild, isAdmin, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [currency, setCurrency] = useState(null);
  const [balances, setBalances] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState('overview');

  // Form state
  const [currName, setCurrName] = useState('Stars');
  const [currIcon, setCurrIcon] = useState('⭐');
  const [ruleName, setRuleName] = useState('');
  const [ruleAmount, setRuleAmount] = useState(1);
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState(5);
  const [rewardIcon, setRewardIcon] = useState('🎁');
  const [earnUserId, setEarnUserId] = useState('');
  const [earnAmount, setEarnAmount] = useState(1);
  const [earnNote, setEarnNote] = useState('');
  const [creatingCurrency, setCreatingCurrency] = useState(false);

  const loadAll = useCallback(async () => {
    if (demoMode) return;
    const [cRes, bRes, catRes, rRes, tRes] = await Promise.all([
      api.apiGetRewardCurrency(familyId),
      api.apiGetRewardBalances(familyId),
      api.apiGetRewardCatalog(familyId),
      api.apiGetEarningRules(familyId),
      api.apiGetRewardTransactions(familyId, null, 50, 0),
    ]);
    if (cRes.ok) setCurrency(cRes.data);
    if (bRes.ok) setBalances(bRes.data?.balances || []);
    if (catRes.ok) setCatalog(catRes.data);
    if (rRes.ok) setRules(rRes.data);
    if (tRes.ok) setTransactions(tRes.data?.items || []);
  }, [familyId, demoMode]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const myBalance = balances.find(b => b.user_id === me?.user_id);

  // ── Actions ──

  async function createCurrency(e) {
    e.preventDefault();
    const { ok, data } = await api.apiCreateRewardCurrency({ family_id: Number(familyId), name: currName, icon: currIcon });
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    await loadAll();
  }

  async function createRule(e) {
    e.preventDefault();
    if (!currency) return;
    const { ok, data } = await api.apiCreateEarningRule({ family_id: Number(familyId), currency_id: currency.id, name: ruleName, amount: ruleAmount });
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    setRuleName(''); setRuleAmount(1);
    await loadAll();
  }

  async function createReward(e) {
    e.preventDefault();
    if (!currency) return;
    const { ok, data } = await api.apiCreateReward({ family_id: Number(familyId), currency_id: currency.id, name: rewardName, cost: rewardCost, icon: rewardIcon });
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    setRewardName(''); setRewardCost(5); setRewardIcon('🎁');
    await loadAll();
  }

  async function earnTokens(e) {
    e.preventDefault();
    if (!currency || !earnUserId) return;
    const { ok, data } = await api.apiEarnTokens({ family_id: Number(familyId), currency_id: currency.id, target_user_id: Number(earnUserId), amount: earnAmount, note: earnNote || null });
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    setEarnUserId(''); setEarnAmount(1); setEarnNote('');
    toastSuccess(t(messages, 'module.rewards.toast.earned'));
    await loadAll();
  }

  async function redeem(reward) {
    const { ok, data } = await api.apiRedeemReward({ family_id: Number(familyId), reward_id: reward.id });
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    toastSuccess(t(messages, 'module.rewards.toast.redeemed'));
    await loadAll();
  }

  async function confirmTxn(id) {
    const { ok, data } = await api.apiConfirmTransaction(id);
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    toastSuccess(t(messages, 'module.rewards.toast.confirmed'));
    await loadAll();
  }

  async function rejectTxn(id) {
    const { ok, data } = await api.apiRejectTransaction(id);
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    toastSuccess(t(messages, 'module.rewards.toast.rejected'));
    await loadAll();
  }

  async function deleteRule(id) {
    const { ok, data } = await api.apiDeleteEarningRule(id);
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    await loadAll();
  }

  async function deleteReward(id) {
    const { ok, data } = await api.apiDeleteReward(id);
    if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
    await loadAll();
  }

  const CURRENCY_PRESETS = [
    { name: 'Stars', icon: '⭐', Icon: Star, color: '#f59e0b' },
    { name: 'Gems', icon: '💎', Icon: Gem, color: '#7c3aed' },
    { name: 'Hearts', icon: '❤️', Icon: Heart, color: '#f43f5e' },
    { name: 'Bolts', icon: '⚡', Icon: Zap, color: '#06b6d4' },
    { name: 'Trophies', icon: '🏆', Icon: Trophy, color: '#f59e0b' },
  ];

  // ── No currency setup ──
  if (!currency && !isChild) {
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
                const { ok, data } = await api.apiCreateRewardCurrency({ family_id: Number(familyId), name: p.name, icon: p.icon });
                setCreatingCurrency(false);
                if (!ok) return toastError(errorText(data?.detail, 'Error', messages));
                await loadAll();
              }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', cursor: 'pointer', borderRadius: 10, textAlign: 'left', opacity: creatingCurrency ? 0.5 : 1 }}>
                <p.Icon size={24} style={{ color: p.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.icon} {p.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currency && isChild) {
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '3em' }}>{t(messages, 'module.rewards.no_currency')}</p>
      </div>
    );
  }

  // ── Child view ──
  if (isChild) {
    return (
      <div className="view-content">
        <div className="view-header"><h1><Gift size={22} /> {t(messages, 'module.rewards.name')}</h1></div>
        {myBalance && (
          <div className="glass glow-purple" style={{ textAlign: 'center', padding: 32, marginBottom: 24, borderRadius: 16 }}>
            <div style={{ fontSize: '3rem', fontWeight: 700 }}>{currency.icon} {myBalance.balance}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>{currency.name}</div>
            {myBalance.pending > 0 && <div style={{ color: 'var(--warning)', fontSize: '0.78rem', marginTop: 4 }}>{t(messages, 'module.rewards.pending').replace('{count}', myBalance.pending)}</div>}
          </div>
        )}
        <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.catalog')}</h3>
        <div className="settings-grid">
          {catalog.filter(r => r.is_active).map(r => {
            const canAfford = myBalance && myBalance.balance >= r.cost;
            return (
              <div key={r.id} className="glass-sm settings-section" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: canAfford ? 1 : 0.5 }}>
                <span style={{ fontSize: '1.5rem' }}>{r.icon || '🎁'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.cost} {currency.icon}</div>
                </div>
                <button className="btn-sm" disabled={!canAfford} onClick={() => redeem(r)}>{t(messages, 'module.rewards.redeem')}</button>
              </div>
            );
          })}
        </div>
        <h3 style={{ margin: '16px 0 8px' }}>{t(messages, 'module.rewards.transactions')}</h3>
        {transactions.slice(0, 20).map(tx => (
          <div key={tx.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.82rem', alignItems: 'center' }}>
            {tx.kind === 'earn' ? <ArrowUpCircle size={14} style={{ color: 'var(--success)' }} /> : <ArrowDownCircle size={14} style={{ color: 'var(--danger)' }} />}
            <span style={{ flex: 1 }}>{tx.note || tx.kind}</span>
            <span style={{ fontWeight: 600 }}>{tx.kind === 'earn' ? '+' : '-'}{tx.amount} {currency.icon}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tx.status}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── Adult view ──
  const pendingTxns = transactions.filter(tx => tx.status === 'pending');

  return (
    <div className="view-content">
      <div className="view-header">
        <h1><Gift size={22} /> {t(messages, 'module.rewards.name')} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{currency.icon} {currency.name}</span></h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['overview', 'catalog', 'history'].map(k => (
          <button key={k} className={`btn-ghost${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}
            style={{ padding: '6px 14px', borderRadius: 8, background: tab === k ? 'var(--amethyst)' : undefined, color: tab === k ? '#fff' : undefined }}>
            {t(messages, `module.rewards.tab_${k}`)}
            {k === 'overview' && pendingTxns.length > 0 && <span style={{ marginLeft: 6, background: 'var(--warning)', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: '0.7rem' }}>{pendingTxns.length}</span>}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.balances_title')}</h3>
          <div className="settings-grid">
            {balances.map(b => (
              <div key={b.user_id} className="glass-sm settings-section" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="sidebar-user-avatar">{(b.display_name || '?')[0].toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{b.display_name}</div>
                  {b.pending > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>{t(messages, 'module.rewards.pending').replace('{count}', b.pending)}</div>}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{currency.icon} {b.balance}</div>
              </div>
            ))}
          </div>

          {/* Award tokens */}
          <h3 style={{ margin: '16px 0 8px' }}>{t(messages, 'module.rewards.earn_tokens')}</h3>
          <form onSubmit={earnTokens} className="glass-sm settings-section" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <select className="form-input" value={earnUserId} onChange={e => setEarnUserId(e.target.value)} required style={{ flex: 1, minWidth: 120 }}>
              <option value="">{t(messages, 'module.rewards.earn_member')}</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </select>
            <input className="form-input" type="number" min={1} value={earnAmount} onChange={e => setEarnAmount(Number(e.target.value))} style={{ width: 70 }} />
            <input className="form-input" value={earnNote} onChange={e => setEarnNote(e.target.value)} placeholder={t(messages, 'module.rewards.earn_note')} style={{ flex: 2, minWidth: 120 }} />
            <button className="btn-sm" type="submit"><Plus size={14} /> {t(messages, 'module.rewards.earn_tokens')}</button>
          </form>

          {/* Pending confirmations */}
          {pendingTxns.length > 0 && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>{t(messages, 'module.rewards.txn_pending')} ({pendingTxns.length})</h3>
              {pendingTxns.map(tx => {
                const memberName = members.find(m => m.user_id === tx.user_id)?.display_name || '?';
                return (
                  <div key={tx.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.82rem', alignItems: 'center' }}>
                    <Award size={14} style={{ color: 'var(--warning)' }} />
                    <span style={{ flex: 1 }}>{memberName}: {tx.kind === 'earn' ? '+' : '-'}{tx.amount} {currency.icon} {tx.note && `(${tx.note})`}</span>
                    <button className="btn-ghost" onClick={() => confirmTxn(tx.id)} style={{ color: 'var(--success)', padding: 4 }}><Check size={16} /></button>
                    <button className="btn-ghost" onClick={() => rejectTxn(tx.id)} style={{ color: 'var(--danger)', padding: 4 }}><X size={16} /></button>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <>
          <h3 style={{ marginBottom: 8 }}>{t(messages, 'module.rewards.earning_rules')}</h3>
          {rules.map(r => (
            <div key={r.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.85rem', alignItems: 'center' }}>
              <Star size={14} style={{ color: 'var(--amethyst)' }} />
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontWeight: 600 }}>+{r.amount} {currency.icon}</span>
              <button className="btn-ghost" onClick={() => deleteRule(r.id)} style={{ color: 'var(--danger)', padding: 4 }}><X size={14} /></button>
            </div>
          ))}
          <form onSubmit={createRule} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="form-input" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder={t(messages, 'module.rewards.rule_name')} required style={{ flex: 1 }} />
            <input className="form-input" type="number" min={1} value={ruleAmount} onChange={e => setRuleAmount(Number(e.target.value))} style={{ width: 70 }} />
            <button className="btn-sm" type="submit"><Plus size={14} /></button>
          </form>

          <h3 style={{ margin: '20px 0 8px' }}>{t(messages, 'module.rewards.catalog')}</h3>
          {catalog.map(r => (
            <div key={r.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.85rem', alignItems: 'center' }}>
              <span style={{ fontSize: '1.2rem' }}>{r.icon || '🎁'}</span>
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ fontWeight: 600 }}>{r.cost} {currency.icon}</span>
              <button className="btn-ghost" onClick={() => deleteReward(r.id)} style={{ color: 'var(--danger)', padding: 4 }}><X size={14} /></button>
            </div>
          ))}
          <form onSubmit={createReward} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="form-input" value={rewardIcon} onChange={e => setRewardIcon(e.target.value)} maxLength={10} style={{ width: 50, textAlign: 'center' }} />
            <input className="form-input" value={rewardName} onChange={e => setRewardName(e.target.value)} placeholder={t(messages, 'module.rewards.reward_name')} required style={{ flex: 1 }} />
            <input className="form-input" type="number" min={1} value={rewardCost} onChange={e => setRewardCost(Number(e.target.value))} style={{ width: 70 }} />
            <button className="btn-sm" type="submit"><Plus size={14} /></button>
          </form>
        </>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <>
          {transactions.map(tx => {
            const memberName = members.find(m => m.user_id === tx.user_id)?.display_name || '?';
            const date = new Date(tx.created_at).toLocaleDateString();
            return (
              <div key={tx.id} className="glass-sm" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 4, borderRadius: 8, fontSize: '0.82rem', alignItems: 'center' }}>
                {tx.kind === 'earn' ? <ArrowUpCircle size={14} style={{ color: 'var(--success)' }} /> : <ArrowDownCircle size={14} style={{ color: 'var(--danger)' }} />}
                <span style={{ color: 'var(--text-muted)', minWidth: 70 }}>{date}</span>
                <span style={{ minWidth: 80 }}>{memberName}</span>
                <span style={{ flex: 1 }}>{tx.note || tx.kind}</span>
                <span style={{ fontWeight: 600 }}>{tx.kind === 'earn' ? '+' : '-'}{tx.amount} {currency.icon}</span>
                <span style={{ fontSize: '0.7rem', color: tx.status === 'pending' ? 'var(--warning)' : tx.status === 'confirmed' ? 'var(--success)' : 'var(--danger)' }}>{tx.status}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
