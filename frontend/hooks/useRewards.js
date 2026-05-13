import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import { errorText } from '../lib/helpers';
import * as api from '../lib/api';

const DEMO_REWARDS = {
  en: {
    currency: 'Stars',
    rules: ['Set the table', 'Homework done', 'Tidy room'],
    rewards: ['Movie night choice', 'Extra story time', 'Family ice cream'],
    notes: ['Room reset', 'Homework checked'],
  },
  de: {
    currency: 'Sterne',
    rules: ['Tisch decken', 'Hausaufgaben erledigt', 'Zimmer aufräumen'],
    rewards: ['Filmabend aussuchen', 'Extra Vorlesezeit', 'Familieneis'],
    notes: ['Zimmer aufgeräumt', 'Hausaufgaben geprüft'],
  },
};

function demoCopy(lang) {
  return DEMO_REWARDS[lang] || DEMO_REWARDS.en;
}

export function useRewards() {
  const { familyId, me, demoMode, messages, members = [], lang } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [currency, setCurrency] = useState(null);
  const [balances, setBalances] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (demoMode) {
      const copy = demoCopy(lang);
      const childMembers = members.filter((member) => !member.is_adult);
      const [firstChild, secondChild] = childMembers;
      setCurrency({ id: 1, family_id: Number(familyId) || 1, name: copy.currency, icon: 'star' });
      setBalances(childMembers.map((member, index) => ({
        user_id: member.user_id,
        display_name: member.display_name,
        balance: index === 0 ? 8 : 5,
        pending: index === 0 ? 1 : 0,
      })));
      setCatalog([
        { id: 1, family_id: Number(familyId) || 1, currency_id: 1, name: copy.rewards[0], cost: 6, icon: 'trophy', is_active: true },
        { id: 2, family_id: Number(familyId) || 1, currency_id: 1, name: copy.rewards[1], cost: 4, icon: 'heart', is_active: true },
        { id: 3, family_id: Number(familyId) || 1, currency_id: 1, name: copy.rewards[2], cost: 10, icon: 'gem', is_active: true },
      ]);
      setRules([
        { id: 1, family_id: Number(familyId) || 1, currency_id: 1, name: copy.rules[0], amount: 1, requires_confirmation: false, is_active: true },
        { id: 2, family_id: Number(familyId) || 1, currency_id: 1, name: copy.rules[1], amount: 2, requires_confirmation: true, is_active: true },
        { id: 3, family_id: Number(familyId) || 1, currency_id: 1, name: copy.rules[2], amount: 1, requires_confirmation: false, is_active: true },
      ]);
      setTransactions([
        {
          id: 1,
          family_id: Number(familyId) || 1,
          currency_id: 1,
          user_id: firstChild?.user_id || me?.user_id,
          kind: 'earn',
          amount: 1,
          note: copy.notes[0],
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          family_id: Number(familyId) || 1,
          currency_id: 1,
          user_id: secondChild?.user_id || firstChild?.user_id || me?.user_id,
          kind: 'earn',
          amount: 2,
          note: copy.notes[1],
          status: 'confirmed',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ].filter((txn) => txn.user_id));
      setLoading(false);
      return;
    }
    setLoading(true);
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
    setLoading(false);
  }, [familyId, demoMode, members, me?.user_id, lang]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const myBalance = balances.find(b => b.user_id === me?.user_id);
  const pendingTxns = transactions.filter(tx => tx.status === 'pending');
  const pendingCount = pendingTxns.length;

  /** Show a translated error toast from an API response detail. */
  function showError(detail) {
    toastError(errorText(detail, t(messages, 'toast.error'), messages));
  }

  async function earnTokens(userId, amount, note, ruleId) {
    if (!currency) return;
    if (demoMode) {
      const numericAmount = Number(amount) || 0;
      setBalances((prev) => prev.map((balance) => (
        String(balance.user_id) === String(userId)
          ? { ...balance, balance: balance.balance + numericAmount }
          : balance
      )));
      setTransactions((prev) => [{
        id: Date.now(),
        family_id: Number(familyId) || 1,
        currency_id: currency.id,
        user_id: userId,
        kind: 'earn',
        amount: numericAmount,
        note: note || null,
        source_rule_id: ruleId || null,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      }, ...prev]);
      toastSuccess(t(messages, 'module.rewards.toast.earned'));
      return;
    }
    const { ok, data } = await api.apiEarnTokens({ family_id: Number(familyId), currency_id: currency.id, target_user_id: userId, amount, note: note || null, source_rule_id: ruleId || null });
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.earned'));
    await loadAll();
  }

  async function redeem(reward) {
    if (demoMode) {
      const userId = me?.user_id;
      if (!userId) return;
      setBalances((prev) => prev.map((balance) => (
        String(balance.user_id) === String(userId)
          ? { ...balance, balance: Math.max(0, balance.balance - reward.cost) }
          : balance
      )));
      setTransactions((prev) => [{
        id: Date.now(),
        family_id: Number(familyId) || 1,
        currency_id: currency?.id,
        user_id: userId,
        kind: 'redeem',
        amount: reward.cost,
        note: reward.name,
        source_reward_id: reward.id,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      }, ...prev]);
      toastSuccess(t(messages, 'module.rewards.toast.redeemed'));
      return;
    }
    const { ok, data } = await api.apiRedeemReward({ family_id: Number(familyId), reward_id: reward.id });
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.redeemed'));
    await loadAll();
  }

  async function confirmTxn(id) {
    if (demoMode) {
      const txn = transactions.find((item) => item.id === id);
      setTransactions((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'confirmed' } : item)));
      if (txn?.kind === 'earn') {
        setBalances((prev) => prev.map((balance) => (
          String(balance.user_id) === String(txn.user_id)
            ? { ...balance, balance: balance.balance + txn.amount, pending: Math.max(0, (balance.pending || 0) - 1) }
            : balance
        )));
      }
      toastSuccess(t(messages, 'module.rewards.toast.confirmed'));
      return;
    }
    const { ok, data } = await api.apiConfirmTransaction(id);
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.confirmed'));
    await loadAll();
  }

  async function rejectTxn(id) {
    if (demoMode) {
      const txn = transactions.find((item) => item.id === id);
      setTransactions((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'rejected' } : item)));
      if (txn) {
        setBalances((prev) => prev.map((balance) => (
          String(balance.user_id) === String(txn.user_id)
            ? { ...balance, pending: Math.max(0, (balance.pending || 0) - 1) }
            : balance
        )));
      }
      toastSuccess(t(messages, 'module.rewards.toast.rejected'));
      return;
    }
    const { ok, data } = await api.apiRejectTransaction(id);
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.rejected'));
    await loadAll();
  }

  async function createRule(name, amount) {
    if (!currency) return;
    if (demoMode) {
      setRules((prev) => [...prev, { id: Date.now(), family_id: Number(familyId) || 1, currency_id: currency.id, name, amount, requires_confirmation: false, is_active: true }]);
      return;
    }
    const { ok, data } = await api.apiCreateEarningRule({ family_id: Number(familyId), currency_id: currency.id, name, amount });
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function deleteRule(id) {
    if (demoMode) {
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      return;
    }
    const { ok, data } = await api.apiDeleteEarningRule(id);
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function createReward(name, cost, icon) {
    if (!currency) return;
    if (demoMode) {
      setCatalog((prev) => [...prev, { id: Date.now(), family_id: Number(familyId) || 1, currency_id: currency.id, name, cost, icon, is_active: true }]);
      return;
    }
    const { ok, data } = await api.apiCreateReward({ family_id: Number(familyId), currency_id: currency.id, name, cost, icon });
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function deleteReward(id) {
    if (demoMode) {
      setCatalog((prev) => prev.filter((reward) => reward.id !== id));
      return;
    }
    const { ok, data } = await api.apiDeleteReward(id);
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function createCurrency(name, icon) {
    if (demoMode) {
      setCurrency({ id: 1, family_id: Number(familyId) || 1, name, icon });
      return true;
    }
    const { ok, data } = await api.apiCreateRewardCurrency({ family_id: Number(familyId), name, icon });
    if (!ok) { showError(data?.detail); return false; }
    await loadAll();
    return true;
  }

  return {
    currency, balances, catalog, rules, transactions, loading,
    myBalance, pendingTxns, pendingCount,
    earnTokens, redeem, confirmTxn, rejectTxn,
    createRule, deleteRule, createReward, deleteReward,
    createCurrency, loadAll,
  };
}
