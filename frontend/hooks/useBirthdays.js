import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

export function useBirthdays() {
  const { birthdays, setBirthdays, familyId, messages, loadBirthdays, loadDashboard, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(null);
  const [personName, setPersonName] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');

  function resetForm() {
    setPersonName('');
    setBirthdayMonth('');
    setBirthdayDay('');
    setEditingBirthday(null);
    setShowForm(false);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(birthday) {
    setEditingBirthday(birthday);
    setPersonName(birthday.person_name || '');
    setBirthdayMonth(String(birthday.month));
    setBirthdayDay(String(birthday.day));
    setShowForm(true);
  }

  async function createBirthday(e) {
    e.preventDefault();
    if (!personName.trim()) {
      toastError(t(messages, 'module.birthdays.name_required'));
      return;
    }
    if (!birthdayMonth || !birthdayDay) {
      toastError(t(messages, 'module.birthdays.date_required'));
      return;
    }
    const payload = {
      family_id: Number(familyId),
      person_name: personName.trim(),
      month: Number(birthdayMonth),
      day: Number(birthdayDay),
    };
    if (demoMode) {
      const newBirthday = { id: Date.now(), ...payload };
      setBirthdays((prev) => [...prev, newBirthday].sort((a, b) => a.month - b.month || a.day - b.day));
    } else {
      const { ok, data } = await api.apiAddBirthday(payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await loadBirthdays();
      await loadDashboard();
    }
    resetForm();
    const msg = t(messages, 'module.birthdays.created');
    toastSuccess(msg);
    announce(msg);
  }

  async function updateBirthday(e) {
    e.preventDefault();
    if (!editingBirthday) return;
    if (!personName.trim()) {
      toastError(t(messages, 'module.birthdays.name_required'));
      return;
    }
    if (!birthdayMonth || !birthdayDay) {
      toastError(t(messages, 'module.birthdays.date_required'));
      return;
    }
    const payload = {
      person_name: personName.trim(),
      month: Number(birthdayMonth),
      day: Number(birthdayDay),
    };
    if (demoMode) {
      setBirthdays((prev) =>
        prev.map((b) => b.id === editingBirthday.id ? { ...b, ...payload } : b)
          .sort((a, b) => a.month - b.month || a.day - b.day)
      );
    } else {
      const { ok, data } = await api.apiUpdateBirthday(editingBirthday.id, payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await loadBirthdays();
      await loadDashboard();
    }
    resetForm();
    const msg = t(messages, 'module.birthdays.updated');
    toastSuccess(msg);
    announce(msg);
  }

  async function deleteBirthday(birthday) {
    if (demoMode) {
      setBirthdays((prev) => prev.filter((b) => b.id !== birthday.id));
    } else {
      const { ok } = await api.apiDeleteBirthday(birthday.id);
      if (!ok) return toastError(t(messages, 'toast.error'));
      await loadBirthdays();
      await loadDashboard();
    }
    resetForm();
    const msg = t(messages, 'module.birthdays.deleted');
    toastSuccess(msg);
    announce(msg);
  }

  return {
    birthdays,
    showForm, setShowForm,
    editingBirthday,
    personName, setPersonName,
    birthdayMonth, setBirthdayMonth,
    birthdayDay, setBirthdayDay,
    openCreate, openEdit, resetForm,
    createBirthday, updateBirthday, deleteBirthday,
  };
}
