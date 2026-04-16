import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

export const GIFT_STATUSES = ['idea', 'ordered', 'purchased', 'gifted'];
export const GIFT_OCCASIONS = ['birthday', 'christmas', 'easter', 'other'];

const EMPTY_FORM = {
  title: '',
  description: '',
  url: '',
  for_user_id: '',
  for_person_name: '',
  occasion: '',
  occasion_date: '',
  status: 'idea',
  notes: '',
  price_eur: '',
};

function priceToCents(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function useGifts() {
  const { familyId, messages, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('');
  const [includeGifted, setIncludeGifted] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const loadGifts = useCallback(async (fid = familyId) => {
    if (!fid || demoMode) {
      setGifts([]);
      return;
    }
    setLoading(true);
    const { ok, data } = await api.apiGetGifts(fid, {
      status: statusFilter || null,
      forUserId: recipientFilter ? Number(recipientFilter) : null,
      includeGifted,
    });
    if (ok && data?.items) setGifts(data.items);
    setLoading(false);
  }, [familyId, demoMode, statusFilter, recipientFilter, includeGifted]);

  useEffect(() => {
    loadGifts();
  }, [loadGifts]);

  const filteredGifts = useMemo(() => gifts, [gifts]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }, []);

  const populateForm = useCallback((gift) => {
    setEditingId(gift.id);
    setForm({
      title: gift.title || '',
      description: gift.description || '',
      url: gift.url || '',
      for_user_id: gift.for_user_id ? String(gift.for_user_id) : '',
      for_person_name: gift.for_person_name || '',
      occasion: gift.occasion || '',
      occasion_date: gift.occasion_date || '',
      status: gift.status || 'idea',
      notes: gift.notes || '',
      price_eur: gift.current_price_cents != null ? (gift.current_price_cents / 100).toFixed(2) : '',
    });
  }, []);

  async function submitGift(e) {
    e.preventDefault();
    if (demoMode) {
      toastError(t(messages, 'module.gifts.demo_blocked'));
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      url: form.url.trim() || null,
      for_user_id: form.for_user_id ? Number(form.for_user_id) : null,
      for_person_name: form.for_person_name.trim() || null,
      occasion: form.occasion || null,
      occasion_date: form.occasion_date || null,
      status: form.status,
      notes: form.notes.trim() || null,
      current_price_cents: priceToCents(form.price_eur),
    };

    if (editingId) {
      const { ok, data } = await api.apiUpdateGift(editingId, payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      toastSuccess(t(messages, 'module.gifts.updated'));
      announce(t(messages, 'module.gifts.updated'));
    } else {
      const { ok, data } = await api.apiCreateGift({ family_id: Number(familyId), ...payload });
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      toastSuccess(t(messages, 'module.gifts.created'));
      announce(t(messages, 'module.gifts.created'));
    }
    resetForm();
    await loadGifts();
  }

  async function updateStatus(giftId, status) {
    const { ok, data } = await api.apiUpdateGift(giftId, { status });
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    await loadGifts();
  }

  async function deleteGift(giftId) {
    const { ok, data } = await api.apiDeleteGift(giftId);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    toastSuccess(t(messages, 'module.gifts.deleted'));
    announce(t(messages, 'module.gifts.deleted'));
    await loadGifts();
  }

  return {
    gifts: filteredGifts,
    loading,
    statusFilter, setStatusFilter,
    recipientFilter, setRecipientFilter,
    includeGifted, setIncludeGifted,
    form, setForm,
    editingId,
    submitGift,
    updateStatus,
    deleteGift,
    populateForm,
    resetForm,
    reload: loadGifts,
  };
}
