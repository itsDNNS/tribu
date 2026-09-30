import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import { errorText } from '../lib/helpers';
import * as api from '../lib/api';

const DEMO_REWARDS = {
  en: {
    presets: [['Set the table', 1], ['Helped without being asked', 0], ['Homework done', 2]],
    wishes: [['Movie night choice', 12, 'film'], ['Ice cream', 5, 'icecream'], ['Stay up 30 minutes longer', 8, 'moon'], ['New book', 20, 'book']],
    familyGoal: ['Zoo trip', 40, 'ferris'],
    achieved: ['Pizza night', 15, 'pizza'],
    praise: ['Tidied up the living room without being asked', 'Thanks for the pancakes!', 'Took the night shift'],
    notes: ['Room reset', 'Homework checked'],
  },
  de: {
    presets: [['Tisch gedeckt', 1], ['Ungefragt geholfen', 0], ['Hausaufgaben erledigt', 2]],
    wishes: [['Filmabend aussuchen', 12, 'film'], ['Eis essen', 5, 'icecream'], ['30 Minuten länger aufbleiben', 8, 'moon'], ['Neues Buch', 20, 'book']],
    familyGoal: ['Ausflug in den Zoo', 40, 'ferris'],
    achieved: ['Pizzaabend', 15, 'pizza'],
    praise: ['Ohne Aufforderung das Wohnzimmer aufgeräumt', 'Danke für die Pfannkuchen!', 'Die Nachtschicht übernommen'],
    notes: ['Zimmer aufgeräumt', 'Hausaufgaben geprüft'],
  },
};

function demoCopy(lang) {
  return DEMO_REWARDS[lang] || DEMO_REWARDS.en;
}

function isoAgo(hours) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

// A family in the middle of things: two children saving for their own
// wishes, everyone putting stars into a zoo trip, a wish waiting for a yes.
function demoState(copy, members, familyId, me) {
  const fid = Number(familyId) || 1;
  const adults = members.filter((member) => member.is_adult);
  const kids = members.filter((member) => !member.is_adult);
  const [firstKid, secondKid] = kids;
  const [firstAdult, secondAdult] = adults;
  const wishes = copy.wishes.map(([name, cost, icon], index) => ({
    id: index + 1, family_id: fid, currency_id: 1, name, cost, icon, kind: 'personal', is_active: true, progress: 0, contributions: [],
  }));
  const contributions = [
    firstAdult && { user_id: firstAdult.user_id, amount: 10 },
    secondAdult && { user_id: secondAdult.user_id, amount: 6 },
    firstKid && { user_id: firstKid.user_id, amount: 8 },
    secondKid && { user_id: secondKid.user_id, amount: 4 },
  ].filter(Boolean);
  const familyGoal = {
    id: 10, family_id: fid, currency_id: 1, name: copy.familyGoal[0], cost: copy.familyGoal[1], icon: copy.familyGoal[2],
    kind: 'family', is_active: true, progress: contributions.reduce((sum, item) => sum + item.amount, 0), contributions,
  };
  const achieved = {
    id: 11, family_id: fid, currency_id: 1, name: copy.achieved[0], cost: copy.achieved[1], icon: copy.achieved[2],
    kind: 'family', is_active: false, achieved_at: isoAgo(24 * 9), progress: copy.achieved[1], contributions: [],
  };
  const balanceOf = (member, index) => {
    if (member === firstKid) return { balance: 9, goal: 1 };
    if (member === secondKid) return { balance: 4, goal: 2 };
    return { balance: index === 0 ? 6 : 3, goal: null };
  };
  const balances = members.map((member, index) => {
    const { balance, goal } = balanceOf(member, index);
    return { user_id: member.user_id, display_name: member.display_name, balance, pending: member === secondKid ? 2 : 0, goal_reward_id: goal };
  });
  const from = (member) => member?.user_id || me?.user_id;
  const praise = [
    firstKid && { id: 1, family_id: fid, from_user_id: from(firstAdult), to_user_id: firstKid.user_id, message: copy.praise[0], amount: 2, created_at: isoAgo(3) },
    firstAdult && { id: 2, family_id: fid, from_user_id: from(firstKid || secondAdult), to_user_id: firstAdult.user_id, message: copy.praise[1], amount: 0, created_at: isoAgo(20) },
    secondAdult && { id: 3, family_id: fid, from_user_id: from(firstAdult), to_user_id: secondAdult.user_id, message: copy.praise[2], amount: 1, created_at: isoAgo(30) },
  ].filter(Boolean);
  const transactions = [
    secondKid && { id: 1, family_id: fid, currency_id: 1, user_id: secondKid.user_id, kind: 'earn', amount: 2, note: copy.notes[1], status: 'pending', created_at: isoAgo(2) },
    firstKid && { id: 2, family_id: fid, currency_id: 1, user_id: firstKid.user_id, kind: 'redeem', amount: 5, note: copy.wishes[1][0], source_reward_id: 2, status: 'pending', created_at: isoAgo(1) },
    firstKid && { id: 3, family_id: fid, currency_id: 1, user_id: firstKid.user_id, kind: 'earn', amount: 2, note: copy.praise[0], status: 'confirmed', created_at: isoAgo(3) },
    secondKid && { id: 4, family_id: fid, currency_id: 1, user_id: secondKid.user_id, kind: 'redeem', amount: 8, note: copy.wishes[2][0], source_reward_id: 3, status: 'confirmed', fulfilled_at: null, created_at: isoAgo(26) },
    firstKid && { id: 5, family_id: fid, currency_id: 1, user_id: firstKid.user_id, kind: 'give', amount: 8, note: copy.familyGoal[0], source_reward_id: 10, status: 'confirmed', created_at: isoAgo(28) },
    secondKid && { id: 6, family_id: fid, currency_id: 1, user_id: secondKid.user_id, kind: 'earn', amount: 1, note: copy.notes[0], status: 'confirmed', created_at: isoAgo(50) },
  ].filter(Boolean);
  return {
    currency: { id: 1, family_id: fid, name: '', icon: 'star' },
    balances,
    catalog: [...wishes, familyGoal, achieved],
    rules: copy.presets.map(([name, amount], index) => ({ id: index + 1, family_id: fid, currency_id: 1, name, amount, require_confirmation: false })),
    transactions,
    praise,
  };
}

export function useRewards() {
  const { familyId, me, demoMode, messages, members = [], lang, isChild } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [currency, setCurrency] = useState(null);
  const [balances, setBalances] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [praise, setPraise] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (demoMode) {
      const state = demoState(demoCopy(lang), members, familyId, me);
      setCurrency(state.currency);
      setBalances(state.balances);
      setCatalog(state.catalog);
      setRules(state.rules);
      setTransactions(state.transactions);
      setPraise(state.praise);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Without a network the rewards keep what they last showed.
    const failed = { ok: false };
    const [cRes, bRes, catRes, rRes, tRes, pRes] = await Promise.all([
      api.apiGetRewardCurrency(familyId),
      api.apiGetRewardBalances(familyId),
      api.apiGetRewardCatalog(familyId),
      api.apiGetEarningRules(familyId),
      api.apiGetRewardTransactions(familyId, null, 50, 0),
      api.apiGetPraise(familyId),
    ].map((load) => load.catch(() => failed)));
    if (cRes.ok) setCurrency(cRes.data);
    if (bRes.ok) setBalances(bRes.data?.balances || []);
    if (catRes.ok) setCatalog(catRes.data);
    if (rRes.ok) setRules(rRes.data);
    if (tRes.ok) setTransactions(tRes.data?.items || []);
    if (pRes.ok) setPraise(Array.isArray(pRes.data) ? pRes.data : []);
    setLoading(false);
  }, [familyId, demoMode, members, me, lang]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const myBalance = balances.find((b) => b.user_id === me?.user_id);
  const pendingTxns = transactions.filter((tx) => tx.status === 'pending');
  const pendingCount = isChild ? 0 : pendingTxns.length;

  function showError(detail) {
    toastError(errorText(detail, t(messages, 'toast.error'), messages));
  }

  // Each change reloads what the server knows; the demo edits its own copy.
  async function run(call, successKey, demoChange) {
    if (demoMode) {
      demoChange?.();
      if (successKey) toastSuccess(t(messages, successKey));
      return true;
    }
    const { ok, data } = await call();
    if (!ok) { showError(data?.detail); return false; }
    if (successKey) toastSuccess(t(messages, successKey));
    await loadAll();
    return true;
  }

  const fid = Number(familyId);
  const adjustBalance = (userId, delta) => setBalances((prev) => prev.map((item) => (
    String(item.user_id) === String(userId) ? { ...item, balance: item.balance + delta } : item
  )));
  const addTxn = (txn) => setTransactions((prev) => [{ id: Date.now(), family_id: fid, currency_id: 1, created_at: new Date().toISOString(), ...txn }, ...prev]);

  function sendPraise({ toUserId, message, amount }) {
    return run(
      () => api.apiCreatePraise({ family_id: fid, to_user_id: Number(toUserId), message, amount: Number(amount) || 0 }),
      'module.rewards.toast.praised',
      () => {
        setPraise((prev) => [{ id: Date.now(), family_id: fid, from_user_id: me?.user_id, to_user_id: Number(toUserId), message, amount: Number(amount) || 0, created_at: new Date().toISOString() }, ...prev]);
        if (amount > 0) {
          adjustBalance(toUserId, Number(amount));
          addTxn({ user_id: Number(toUserId), kind: 'earn', amount: Number(amount), note: message, status: 'confirmed' });
        }
      },
    );
  }

  function deletePraise(item) {
    return run(() => api.apiDeletePraise(item.id), null, () => {
      setPraise((prev) => prev.filter((entry) => entry.id !== item.id));
      if (item.amount > 0) adjustBalance(item.to_user_id, -item.amount);
    });
  }

  function setGoal(rewardId) {
    return run(() => api.apiSetRewardGoal(fid, rewardId), rewardId ? 'module.rewards.toast.goal_set' : null, () => {
      setBalances((prev) => prev.map((item) => (item.user_id === me?.user_id ? { ...item, goal_reward_id: rewardId } : item)));
    });
  }

  function giveToGoal(reward, amount) {
    return run(() => api.apiGiveToFamilyGoal(reward.id, fid, amount), 'module.rewards.toast.given', () => {
      const given = Math.min(amount, reward.cost - (reward.progress || 0), myBalance?.balance || 0);
      adjustBalance(me?.user_id, -given);
      setCatalog((prev) => prev.map((item) => {
        if (item.id !== reward.id) return item;
        const mine = (item.contributions || []).find((share) => share.user_id === me?.user_id);
        const contributions = mine
          ? item.contributions.map((share) => (share.user_id === me?.user_id ? { ...share, amount: share.amount + given } : share))
          : [...(item.contributions || []), { user_id: me?.user_id, amount: given }];
        return { ...item, progress: (item.progress || 0) + given, contributions };
      }));
      addTxn({ user_id: me?.user_id, kind: 'give', amount: given, note: reward.name, source_reward_id: reward.id, status: 'confirmed' });
    });
  }

  function achieveGoal(reward) {
    return run(() => api.apiAchieveFamilyGoal(reward.id, fid), 'module.rewards.toast.achieved', () => {
      setCatalog((prev) => prev.map((item) => (item.id === reward.id ? { ...item, achieved_at: new Date().toISOString(), is_active: false } : item)));
    });
  }

  function redeem(reward) {
    return run(() => api.apiRedeemReward({ family_id: fid, reward_id: reward.id }), 'module.rewards.toast.requested', () => {
      addTxn({ user_id: me?.user_id, kind: 'redeem', amount: reward.cost, note: reward.name, source_reward_id: reward.id, status: 'pending' });
    });
  }

  function confirmTxn(id) {
    return run(() => api.apiConfirmTransaction(id), 'module.rewards.toast.confirmed', () => {
      const txn = transactions.find((item) => item.id === id);
      setTransactions((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'confirmed', fulfilled_at: null } : item)));
      if (txn?.kind === 'earn') adjustBalance(txn.user_id, txn.amount);
      if (txn?.kind === 'redeem') adjustBalance(txn.user_id, -txn.amount);
    });
  }

  function rejectTxn(id) {
    return run(() => api.apiRejectTransaction(id), 'module.rewards.toast.rejected', () => {
      setTransactions((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'rejected' } : item)));
    });
  }

  function fulfillTxn(id) {
    return run(() => api.apiFulfillTransaction(id), 'module.rewards.toast.fulfilled', () => {
      setTransactions((prev) => prev.map((item) => (item.id === id ? { ...item, fulfilled_at: new Date().toISOString() } : item)));
    });
  }

  function createRule(name, amount) {
    return run(() => api.apiCreateEarningRule({ family_id: fid, currency_id: currency?.id, name, amount: Number(amount) || 0 }), null, () => {
      setRules((prev) => [...prev, { id: Date.now(), family_id: fid, currency_id: 1, name, amount: Number(amount) || 0 }]);
    });
  }

  function deleteRule(id) {
    return run(() => api.apiDeleteEarningRule(id), null, () => setRules((prev) => prev.filter((rule) => rule.id !== id)));
  }

  function saveReward(reward, fields) {
    if (reward) {
      return run(() => api.apiUpdateReward(reward.id, fields), 'module.rewards.toast.saved', () => {
        setCatalog((prev) => prev.map((item) => (item.id === reward.id ? { ...item, ...fields } : item)));
      });
    }
    return run(() => api.apiCreateReward({ family_id: fid, currency_id: currency?.id, ...fields }), 'module.rewards.toast.saved', () => {
      setCatalog((prev) => [...prev, { id: Date.now(), family_id: fid, currency_id: 1, is_active: true, progress: 0, contributions: [], ...fields }]);
    });
  }

  function deleteReward(id) {
    return run(() => api.apiDeleteReward(id), null, () => setCatalog((prev) => prev.filter((reward) => reward.id !== id)));
  }

  function updateCurrency(fields) {
    return run(() => api.apiUpdateRewardCurrency(currency.id, fields), 'module.rewards.toast.saved', () => {
      setCurrency((prev) => ({ ...prev, ...fields }));
    });
  }

  return {
    currency, balances, catalog, rules, transactions, praise, loading,
    myBalance, pendingTxns, pendingCount,
    sendPraise, deletePraise, setGoal, giveToGoal, achieveGoal,
    redeem, confirmTxn, rejectTxn, fulfillTxn,
    createRule, deleteRule, saveReward, deleteReward, updateCurrency, loadAll,
  };
}
