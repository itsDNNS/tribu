import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

// Sentinel returned by parseYearInput when the user typed something
// non-integer. Distinct from null (deliberately empty) so callers can
// abort instead of silently sending null to the backend.
const INVALID_YEAR = Symbol('invalid-year');

function parseYearInput(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed === '') return null;
  // type="number" inputs still let exotic strings through ("e5", "1.5",
  // "1e3"), so parse strictly and reject anything that is not a clean
  // integer. Range validation stays on the server.
  if (!/^-?\d+$/.test(trimmed)) return INVALID_YEAR;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) return INVALID_YEAR;
  return parsed;
}

export function useBirthdays() {
  const { birthdays, setBirthdays, familyId, messages, loadBirthdays, loadDashboard, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(null);
  const [personName, setPersonName] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');
  const [birthdayYear, setBirthdayYear] = useState('');

  function resetForm() {
    setPersonName('');
    setBirthdayMonth('');
    setBirthdayDay('');
    setBirthdayYear('');
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
    setBirthdayYear(birthday.year ? String(birthday.year) : '');
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
    const parsedYear = parseYearInput(birthdayYear);
    if (parsedYear === INVALID_YEAR) {
      toastError(t(messages, 'module.birthdays.year_invalid'));
      return;
    }
    const payload = {
      family_id: Number(familyId),
      person_name: personName.trim(),
      month: Number(birthdayMonth),
      day: Number(birthdayDay),
      year: parsedYear,
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
    const parsedYear = parseYearInput(birthdayYear);
    if (parsedYear === INVALID_YEAR) {
      toastError(t(messages, 'module.birthdays.year_invalid'));
      return;
    }
    // Always send year so the PATCH knows the user's explicit choice
    // (including clearing a previously-set year).
    const payload = {
      person_name: personName.trim(),
      month: Number(birthdayMonth),
      day: Number(birthdayDay),
      year: parsedYear,
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
    birthdayYear, setBirthdayYear,
    openCreate, openEdit, resetForm,
    createBirthday, updateBirthday, deleteBirthday,
  };
}

/**
 * Merge the standalone FamilyBirthday rows and any family members with
 * a stored date_of_birth into a single list for the Birthdays tab.
 * Entries are sorted by month then day. No cross-source deduplication
 * is performed: a family member named Max and a separate friend named
 * Max with the same birthday are both legitimate, and there is no
 * link field on FamilyBirthday that would mark one as the member's
 * own row. If an admin imported the same person twice they can
 * remove the duplicate standalone entry.
 *
 * Member entries are marked with `_isMember: true` and only carry the
 * fields the renderer actually needs (`_memberColor`, `_memberId`).
 * Their birthday is not editable here because the source of truth for
 * `date_of_birth` lives in Account settings and the admin panel.
 */
export function buildBirthdayList({ birthdays = [], members = [] } = {}) {
  const items = [];

  for (const b of birthdays) {
    if (!b?.person_name || !b?.month || !b?.day) continue;
    items.push({ ...b });
  }

  for (const member of members) {
    if (!member?.date_of_birth) continue;
    const match = String(member.date_of_birth).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!month || !day) continue;
    items.push({
      id: `member-${member.user_id}`,
      person_name: member.display_name || '',
      month,
      day,
      year,
      _isMember: true,
      _memberId: member.user_id,
      _memberColor: member.color || null,
    });
  }

  return items.sort((a, b) => a.month - b.month || a.day - b.day);
}

/**
 * Age a person will reach (or already has reached) on their birthday in
 * the given reference year. Returns null when the birth year is unknown
 * or the person has not been born yet relative to the reference date.
 */
export function birthdayAge(birthday, referenceDate = new Date()) {
  if (!birthday || !birthday.year) return null;
  const year = Number(birthday.year);
  if (!Number.isFinite(year) || year < 1900) return null;
  const month = Number(birthday.month);
  const day = Number(birthday.day);
  const refYear = referenceDate.getFullYear();
  let age = refYear - year;
  const alreadyThisYear =
    referenceDate.getMonth() + 1 > month ||
    (referenceDate.getMonth() + 1 === month && referenceDate.getDate() >= day);
  if (!alreadyThisYear) age -= 1;
  return age >= 0 ? age : null;
}
