import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cake, Copy, Plus, Search, UserPlus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { announce } from '../lib/announce';
import * as api from '../lib/api';
import { localeForLang } from '../lib/dates';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { useHandoff } from '../lib/viewHandoff';
import ContactDetail from './contacts/ContactDetail';
import ContactFormModal, { draftFrom, draftPayload, emptyDraft } from './contacts/ContactFormModal';
import DuplicatesDialog from './contacts/DuplicatesDialog';
import {
  avatarColor,
  birthdayDate,
  birthdayPeople,
  channels,
  groupByLetter,
  groupByMonth,
  initials,
  matchesQuery,
  monthName,
  turningAge,
  upcoming,
} from './contacts/contactUtils';

// Contacts and their birthdays in one place (#512 follow-up): coming
// birthdays on top, then everyone, or everyone with a birthday by month.
// Wide screens show the list and the chosen contact side by side.
export default function ContactsView() {
  const {
    contacts,
    setContacts,
    familyId,
    messages,
    loadContacts,
    loadBirthdays,
    loadDashboard,
    demoMode,
    setActiveView,
    isChild,
    lang,
    members,
  } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const locale = localeForLang(lang);
  const canEdit = !isChild;
  // Today and the week at a glance open the birthdays directly.
  const wantedTab = useHandoff('tribu_contacts_tab');
  const [filter, setFilter] = useState(() => (wantedTab === 'birthdays' ? 'birthdays' : 'all'));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDuplicates = useCallback(async () => {
    if (demoMode || !canEdit || !familyId) return;
    const { ok, data } = await api.apiGetContactDuplicates(Number(familyId));
    if (ok && Array.isArray(data)) setDuplicates(data);
  }, [demoMode, canEdit, familyId]);

  useEffect(() => { loadDuplicates(); }, [loadDuplicates, contacts]);

  const refresh = useCallback(async () => {
    await Promise.all([loadContacts(), loadBirthdays(), loadDashboard()]);
  }, [loadContacts, loadBirthdays, loadDashboard]);

  const visible = useMemo(() => (contacts || []).filter((contact) => matchesQuery(contact, query)), [contacts, query]);
  const people = useMemo(() => birthdayPeople({ contacts: contacts || [], members: members || [] }), [contacts, members]);
  const coming = useMemo(() => upcoming(people), [people]);
  const selected = (contacts || []).find((contact) => contact.id === selectedId) || null;

  function openCreate() {
    setDraft(emptyDraft());
    setForm({ editing: null });
  }

  function openEdit(contact) {
    setDraft(draftFrom(contact));
    setForm({ editing: contact });
  }

  async function save(event) {
    event.preventDefault();
    const { payload, error } = draftPayload(draft);
    if (error) return toastError(t(messages, error));
    const editing = form?.editing;
    if (demoMode) {
      if (editing) setContacts((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...payload } : c)));
      else setContacts((prev) => [...prev, { id: Date.now(), family_id: Number(familyId), ...payload }]);
    } else {
      const { ok, data } = editing
        ? await api.apiUpdateContact(editing.id, payload)
        : await api.apiCreateContact({ family_id: Number(familyId), ...payload });
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await refresh();
      if (!editing && data?.id) setSelectedId(data.id);
    }
    setForm(null);
    const msg = t(messages, editing ? 'module.contacts.updated' : 'module.contacts.created');
    toastSuccess(msg);
    announce(msg);
  }

  async function remove() {
    const contact = form?.editing;
    if (!contact) return;
    if (demoMode) {
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    } else {
      const { ok } = await api.apiDeleteContact(contact.id);
      if (!ok) return toastError(t(messages, 'toast.error'));
      await refresh();
    }
    setForm(null);
    if (selectedId === contact.id) setSelectedId(null);
    const msg = t(messages, 'module.contacts.deleted');
    toastSuccess(msg);
    announce(msg);
  }

  async function merge(keepId, mergeIds) {
    setBusy(true);
    const { ok, data } = await api.apiMergeContacts(Number(familyId), keepId, mergeIds);
    setBusy(false);
    if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
    await refresh();
    setSelectedId(keepId);
    const msg = t(messages, 'module.contacts.merged');
    toastSuccess(msg);
    announce(msg);
  }

  async function dismiss(group) {
    setBusy(true);
    const { ok } = await api.apiDismissContactDuplicates(Number(familyId), group.contact_ids);
    setBusy(false);
    if (!ok) return toastError(t(messages, 'toast.error'));
    setDuplicates((prev) => prev.filter((g) => g !== group));
  }

  // On phones the chosen contact replaces the list; start at its top.
  useEffect(() => {
    if (selectedId != null && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 999px)').matches) {
      window.scrollTo({ top: 0 });
    }
  }, [selectedId]);

  useEffect(() => {
    if (showDuplicates && duplicates.length === 0) setShowDuplicates(false);
  }, [showDuplicates, duplicates.length]);

  const birthdayList = filter === 'birthdays'
    ? groupByMonth(people.filter((person) => (person.contact ? matchesQuery(person.contact, query) : matchesQuery({ full_name: person.name }, query))))
    : [];

  const renderRow = (contact, extra) => {
    const { emails, phones } = channels(contact);
    const sub = phones[0] || emails[0] || contact.organization || '';
    return (
      <li key={contact.id}>
        <button
          type="button"
          className={`contact-row${contact.id === selectedId ? ' selected' : ''}`}
          aria-current={contact.id === selectedId ? 'true' : undefined}
          onClick={() => setSelectedId(contact.id)}
        >
          <span className="contact-list-avatar" style={{ background: avatarColor(contact.full_name) }} aria-hidden="true">
            {initials(contact.full_name)}
          </span>
          <span className="contact-row-text">
            <span className="contact-row-name">{contact.full_name}</span>
            {(extra || sub) && <span className="contact-row-sub">{extra || sub}</span>}
          </span>
          {!extra && contact.birthday_month && contact.birthday_day && (
            <Cake size={14} className="contact-row-icon" aria-label={t(messages, 'module.contacts.form.birthday')} />
          )}
        </button>
      </li>
    );
  };

  return (
    <div className={`contacts-page${selected ? ' has-selection' : ''}`}>
      <header className="list-header contacts-header">
        <h1>{t(messages, 'contacts')}</h1>
        {canEdit && (
          <button type="button" className="list-header-action contacts-add-btn" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" /> {t(messages, 'module.contacts.add')}
          </button>
        )}
      </header>

      {coming.length > 0 && (
        <section className="contacts-upcoming" aria-labelledby="contacts-upcoming-title">
          <h2 id="contacts-upcoming-title" className="contacts-section-title">{t(messages, 'module.contacts.upcoming')}</h2>
          <ul className="contacts-upcoming-list">
            {coming.map((person) => {
              const turns = turningAge(person.year, person.month, person.day);
              const content = (
                <>
                  <span className="contact-list-avatar" style={{ background: person.color || avatarColor(person.name) }} aria-hidden="true">
                    {initials(person.name)}
                  </span>
                  <span className="contacts-upcoming-text">
                    <span className="contacts-upcoming-name">{person.name}</span>
                    <span className="contacts-upcoming-date">
                      {birthdayDate(person.month, person.day, locale)}
                      {turns !== null && ` · ${t(messages, 'module.contacts.turns').replace('{age}', turns)}`}
                    </span>
                  </span>
                  <span className={`contacts-upcoming-when${person.days === 0 ? ' today' : ''}`}>
                    {person.days === 0 ? t(messages, 'module.birthdays.today') : t(messages, 'module.birthdays.days_until').replace('{days}', person.days)}
                  </span>
                </>
              );
              return (
                <li key={person.key}>
                  {person.contact ? (
                    <button type="button" className="contacts-upcoming-card" onClick={() => { setFilter('all'); setSelectedId(person.contact.id); }}>
                      {content}
                    </button>
                  ) : (
                    <div className="contacts-upcoming-card member" title={t(messages, 'module.birthdays.member_tag')}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {canEdit && duplicates.length > 0 && (
        <div className="contacts-duplicates-banner" role="status">
          <Copy size={16} aria-hidden="true" />
          <span>{t(messages, 'module.contacts.duplicates').replace('{count}', duplicates.length)}</span>
          <button type="button" className="btn-secondary" onClick={() => setShowDuplicates(true)}>
            {t(messages, 'module.contacts.review')}
          </button>
        </div>
      )}

      <div className="contacts-layout">
        <div className="contacts-list-pane">
          <div className="contacts-toolbar">
            <label className="contacts-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(messages, 'module.contacts.search')}
                aria-label={t(messages, 'module.contacts.search')}
              />
            </label>
            <div className="contacts-filter" role="group" aria-label={t(messages, 'contacts')}>
              {[['all', 'contacts_tab_contacts'], ['birthdays', 'contacts_tab_birthdays']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`contacts-filter-chip${filter === key ? ' active' : ''}`}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {key === 'birthdays' && <Cake size={14} aria-hidden="true" />}
                  {t(messages, label)}
                </button>
              ))}
            </div>
          </div>

          {filter === 'all' ? (
            visible.length > 0 ? (
              groupByLetter(visible, locale).map(([letter, group]) => (
                <section key={letter} className="contacts-group" aria-label={letter}>
                  <h3 className="contacts-section-letter">{letter}</h3>
                  <ul className="contacts-list">{group.map((contact) => renderRow(contact))}</ul>
                </section>
              ))
            ) : (contacts || []).length > 0 ? (
              <p className="contacts-empty-text contacts-no-match">{t(messages, 'module.contacts.no_match')}</p>
            ) : (
              <div className="contacts-empty">
                <div className="contacts-empty-text">{t(messages, 'module.contacts.no_contacts')}</div>
                {!demoMode && canEdit && (
                  <div className="contacts-empty-actions">
                    <button type="button" className="btn-primary" onClick={openCreate}>
                      <Plus size={15} /> {t(messages, 'module.contacts.add')}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setActiveView('settings')}>
                      <UserPlus size={15} /> {t(messages, 'module.contacts.import_cta')}
                    </button>
                  </div>
                )}
              </div>
            )
          ) : birthdayList.length > 0 ? (
            birthdayList.map(([month, group]) => (
              <section key={month} className="contacts-group" aria-label={monthName(month, locale)}>
                <h3 className="contacts-section-letter">{monthName(month, locale)}</h3>
                <ul className="contacts-list">
                  {group.map((person) => {
                    const when = `${birthdayDate(person.month, person.day, locale)}${person.year ? ` ${person.year}` : ''}`;
                    return person.contact ? renderRow(person.contact, when) : (
                      <li key={person.key}>
                        <div className="contact-row member">
                          <span className="contact-list-avatar" style={{ background: person.color || avatarColor(person.name) }} aria-hidden="true">
                            {initials(person.name)}
                          </span>
                          <span className="contact-row-text">
                            <span className="contact-row-name">{person.name} <span className="contact-row-tag">{t(messages, 'module.birthdays.member_tag')}</span></span>
                            <span className="contact-row-sub">{when}</span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <div className="contacts-empty">
              <div className="contacts-empty-text">{t(messages, 'module.birthdays.no_birthdays')}</div>
              <div className="contacts-empty-hint">{t(messages, 'module.birthdays.member_hint')}</div>
            </div>
          )}
        </div>

        <div className="contacts-detail-pane-wrap">
          {selected ? (
            <ContactDetail
              contact={selected}
              messages={messages}
              locale={locale}
              canEdit={canEdit}
              onEdit={openEdit}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <p className="contacts-select-hint">{t(messages, 'module.contacts.select_hint')}</p>
          )}
        </div>
      </div>

      {form && (
        <ContactFormModal
          editing={form.editing}
          draft={draft}
          setDraft={setDraft}
          onSubmit={save}
          onDelete={remove}
          onClose={() => setForm(null)}
          messages={messages}
          locale={locale}
        />
      )}

      {showDuplicates && (
        <DuplicatesDialog
          groups={duplicates}
          contacts={contacts || []}
          messages={messages}
          locale={locale}
          busy={busy}
          onMerge={merge}
          onDismiss={dismiss}
          onClose={() => setShowDuplicates(false)}
        />
      )}
    </div>
  );
}
