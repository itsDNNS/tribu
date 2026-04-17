import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import { errorText } from '../lib/helpers';
import * as api from '../lib/api';

export function useRewards() {
  const { familyId, me, demoMode, messages } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [currency, setCurrency] = useState(null);
  const [balances, setBalances] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (demoMode) { setLoading(false); return; }
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
  }, [familyId, demoMode]);

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
    const { ok, data } = await api.apiEarnTokens({ family_id: Number(familyId), currency_id: currency.id, target_user_id: userId, amount, note: note || null, source_rule_id: ruleId || null });
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.earned'));
    await loadAll();
  }

  async function redeem(reward) {
    const { ok, data } = await api.apiRedeemReward({ family_id: Number(familyId), reward_id: reward.id });
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.redeemed'));
    await loadAll();
  }

  async function confirmTxn(id) {
    const { ok, data } = await api.apiConfirmTransaction(id);
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.confirmed'));
    await loadAll();
  }

  async function rejectTxn(id) {
    const { ok, data } = await api.apiRejectTransaction(id);
    if (!ok) return showError(data?.detail);
    toastSuccess(t(messages, 'module.rewards.toast.rejected'));
    await loadAll();
  }

  async function createRule(name, amount) {
    if (!currency) return;
    const { ok, data } = await api.apiCreateEarningRule({ family_id: Number(familyId), currency_id: currency.id, name, amount });
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function deleteRule(id) {
    const { ok, data } = await api.apiDeleteEarningRule(id);
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function createReward(name, cost, icon) {
    if (!currency) return;
    const { ok, data } = await api.apiCreateReward({ family_id: Number(familyId), currency_id: currency.id, name, cost, icon });
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function deleteReward(id) {
    const { ok, data } = await api.apiDeleteReward(id);
    if (!ok) return showError(data?.detail);
    await loadAll();
  }

  async function createCurrency(name, icon) {
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
