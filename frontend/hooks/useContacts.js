import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

export function useContacts() {
  const { contacts, setContacts, familyId, messages, loadContacts, loadDashboard, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactBirthdayMonth, setContactBirthdayMonth] = useState('');
  const [contactBirthdayDay, setContactBirthdayDay] = useState('');

  function resetForm() {
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setContactBirthdayMonth('');
    setContactBirthdayDay('');
    setEditingContact(null);
    setShowForm(false);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(contact) {
    setEditingContact(contact);
    setContactName(contact.full_name || '');
    setContactEmail(contact.email || '');
    setContactPhone(contact.phone || '');
    setContactBirthdayMonth(contact.birthday_month ? String(contact.birthday_month) : '');
    setContactBirthdayDay(contact.birthday_day ? String(contact.birthday_day) : '');
    setShowForm(true);
  }

  async function createContact(e) {
    e.preventDefault();
    if (!contactName.trim()) {
      toastError(t(messages, 'module.contacts.name_required'));
      return;
    }
    const payload = {
      family_id: Number(familyId),
      full_name: contactName.trim(),
      email: contactEmail.trim() || null,
      phone: contactPhone.trim() || null,
      birthday_month: contactBirthdayMonth ? Number(contactBirthdayMonth) : null,
      birthday_day: contactBirthdayDay ? Number(contactBirthdayDay) : null,
    };
    if (demoMode) {
      const newContact = { id: Date.now(), ...payload };
      setContacts((prev) => [...prev, newContact].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de')));
    } else {
      const { ok, data } = await api.apiCreateContact(payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error')));
      await loadContacts();
      await loadDashboard();
    }
    resetForm();
    const msg = t(messages, 'module.contacts.created');
    toastSuccess(msg);
    announce(msg);
  }

  async function updateContact(e) {
    e.preventDefault();
    if (!editingContact) return;
    if (!contactName.trim()) {
      toastError(t(messages, 'module.contacts.name_required'));
      return;
    }
    const payload = {
      full_name: contactName.trim(),
      email: contactEmail.trim() || null,
      phone: contactPhone.trim() || null,
      birthday_month: contactBirthdayMonth ? Number(contactBirthdayMonth) : null,
      birthday_day: contactBirthdayDay ? Number(contactBirthdayDay) : null,
    };
    if (demoMode) {
      setContacts((prev) =>
        prev.map((c) => c.id === editingContact.id ? { ...c, ...payload } : c)
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de'))
      );
    } else {
      const { ok, data } = await api.apiUpdateContact(editingContact.id, payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error')));
      await loadContacts();
      await loadDashboard();
    }
    resetForm();
    const msg = t(messages, 'module.contacts.updated');
    toastSuccess(msg);
    announce(msg);
  }

  async function deleteContact(contact) {
    if (demoMode) {
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    } else {
      const { ok } = await api.apiDeleteContact(contact.id);
      if (!ok) return toastError(t(messages, 'toast.error'));
      await loadContacts();
      await loadDashboard();
    }
    resetForm();
    const msg = t(messages, 'module.contacts.deleted');
    toastSuccess(msg);
    announce(msg);
  }

  return {
    contacts,
    showForm, setShowForm,
    editingContact,
    contactName, setContactName,
    contactEmail, setContactEmail,
    contactPhone, setContactPhone,
    contactBirthdayMonth, setContactBirthdayMonth,
    contactBirthdayDay, setContactBirthdayDay,
    openCreate, openEdit, resetForm,
    createContact, updateContact, deleteContact,
  };
}
