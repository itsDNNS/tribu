import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Cake, ChevronRight, Gift, Heart, Lightbulb, Lock, Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useGifts } from '../hooks/useGifts';
import { localeForLang } from '../lib/dates';
import { peekHandOff, takeHandOff } from '../lib/handoff';
import { t, tc } from '../lib/i18n';
import { getMemberColor } from '../lib/member-colors';
import { buildPeople, canDeleteGift, daysBetween, isoDate, recipientKey, recipientLinks, startOfToday } from '../lib/gifts';
import ConfirmDialog from './ConfirmDialog';
import GiftDialog, { BudgetDialog } from './gifts/GiftDialog';
import { GiftCard, OccasionCard, PersonAvatar, occasionLabel, relativeDays } from './gifts/parts';
import { SectionTitle } from './rewards/parts';

/**
 * Gifts around people and occasions. Everyone in the family takes part:
 * ideas stay hidden from the person they are for, wishes are visible to
 * all, and "I'll take care of it" keeps two people from buying the same.
 */
export default function GiftsView() {
  const { messages, members = [], contacts = [], birthdays = [], me, lang } = useApp();
  const gifts = useGifts();
  const locale = localeForLang(lang);
  const [tab, setTab] = useState('occasions');
  const [personKey, setPersonKey] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const today = startOfToday();
  const meId = me?.user_id;
  const { isAdult } = gifts;

  const links = useMemo(() => recipientLinks(contacts, members), [contacts, members]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const indexOf = (member) => Math.max(0, members.indexOf(member));
  const colorOfKey = (key) => {
    const member = key?.startsWith('u:') ? memberById.get(Number(key.slice(2))) : null;
    return member ? getMemberColor(member, indexOf(member)) : 'var(--accent-amber)';
  };
  const nameOfKey = (key) => {
    if (!key) return '';
    if (key.startsWith('u:')) return memberById.get(Number(key.slice(2)))?.display_name || '';
    if (key.startsWith('c:')) return contactById.get(Number(key.slice(2)))?.full_name || '';
    return '';
  };
  const recipientOf = (gift) => {
    const key = recipientKey(gift, links);
    if (!key) return null;
    const member = key.startsWith('u:') ? memberById.get(Number(key.slice(2))) : null;
    return { member, index: member ? indexOf(member) : 0, name: member?.display_name || nameOfKey(key) || gift.for_person_name || '' };
  };

  const people = useMemo(
    () => buildPeople({ gifts: gifts.gifts, members, birthdays, contacts, meId, today }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gifts.gifts, members, birthdays, contacts, meId],
  );

  function openAdd({ kind = 'idea', occasion = null, recipient = '', name = '', date = '', occasionName = '' } = {}) {
    const initial = { kind };
    if (occasionName) initial.occasion = occasionName;
    if (occasion) {
      initial.occasion = occasion.occasion;
      initial.occasion_date = occasion.date;
      if (occasion.recipient_key?.startsWith('u:') || occasion.recipient_key?.startsWith('c:')) initial.recipient = occasion.recipient_key;
      else if (occasion.recipient_key?.startsWith('n:')) {
        initial.recipient = 'name';
        initial.for_person_name = occasion.person_name || '';
      }
    }
    if (recipient) initial.recipient = recipient;
    if (name) {
      initial.recipient = 'name';
      initial.for_person_name = name;
    }
    if (date) initial.occasion_date = date;
    if (kind === 'wish' && (!isAdult || !initial.recipient)) initial.recipient = `u:${meId}`;
    if (kind === 'idea' && initial.recipient === `u:${meId}`) initial.kind = 'wish';
    setDialog({ type: 'gift', initial });
  }

  // The family hub opens someone's gifts or a new idea for their birthday.
  const [focus] = useState(() => peekHandOff('gifts_focus') || null);
  useEffect(() => {
    takeHandOff('gifts_focus');
    if (!focus) return;
    const key = focus.memberId ? `u:${focus.memberId}` : `n:${String(focus.name || '').trim().toLocaleLowerCase()}`;
    if (focus.add) {
      openAdd({
        kind: focus.memberId === meId ? 'wish' : 'idea',
        recipient: focus.memberId ? key : '',
        name: focus.memberId ? '' : focus.name,
        date: focus.date,
        occasionName: focus.date ? 'birthday' : '',
      });
    } else if (focus.memberId === meId) {
      setTab('mine');
    } else {
      setTab('people');
      setPersonKey(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const askDelete = (gift) => setConfirm({
    title: t(messages, gift.kind === 'wish' ? 'module.gifts.delete_wish_title' : 'module.gifts.delete_title'),
    message: t(messages, 'module.gifts.delete_confirm').replace('{title}', gift.title),
    action: async () => {
      const ok = await gifts.remove(gift);
      setConfirm(null);
      if (ok) setDialog(null);
    },
  });

  const ctx = {
    messages, locale, meId, isAdult, memberById, indexOf, gifts, giftsById: gifts.giftsById,
    colorOfKey, nameOfKey, recipientOf,
    onEdit: (gift) => setDialog({ type: 'gift', gift }),
    onDelete: askDelete,
    onAdd: openAdd,
    onBudget: (occasion) => setDialog({ type: 'budget', occasion }),
  };

  const openWishCount = gifts.myWishes.filter((gift) => gift.status !== 'gifted').length;
  const tabs = [
    ['occasions', t(messages, 'module.gifts.tab_occasions'), 0],
    ['people', t(messages, 'module.gifts.tab_people'), 0],
    ['mine', t(messages, 'module.gifts.tab_mine'), openWishCount],
  ];

  return (
    <div className="gifts-page">
      <header className="list-header gifts-header">
        <h1>{t(messages, 'module.gifts.name')}</h1>
        <div className="gifts-header-actions">
          <button type="button" className="btn-secondary gifts-header-btn" onClick={() => openAdd({ kind: 'wish' })}>
            <Heart size={16} aria-hidden="true" /> {t(messages, 'module.gifts.add_wish')}
          </button>
          <button type="button" className="list-header-action" onClick={() => openAdd({ kind: 'idea' })}>
            <Plus size={17} aria-hidden="true" /> {t(messages, 'module.gifts.add_idea')}
          </button>
        </div>
      </header>

      <div className="rewards-tabs" role="tablist" aria-label={t(messages, 'module.gifts.name')}>
        {tabs.map(([key, label, badge]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`rewards-tab${tab === key ? ' active' : ''}`}
            onClick={() => { setTab(key); if (key !== 'people') setPersonKey(null); }}
          >
            {label}
            {badge > 0 && <span className="gifts-tab-count">{badge}</span>}
          </button>
        ))}
      </div>

      {gifts.loading ? (
        <section className="rewards-card">
          <div className="skeleton skeleton-text rewards-widget-skeleton-line" />
          <div className="skeleton skeleton-text rewards-widget-skeleton-line short" />
        </section>
      ) : (
        <>
          {tab === 'occasions' && <Occasions occasions={gifts.occasions} ctx={ctx} />}
          {tab === 'people' && (
            personKey
              ? <PersonPage person={people.find((item) => item.key === personKey)} personKey={personKey} ctx={ctx} onBack={() => setPersonKey(null)} today={today} />
              : <People people={people} ctx={ctx} onOpen={setPersonKey} today={today} />
          )}
          {tab === 'mine' && <MyWishes wishes={gifts.myWishes} ctx={ctx} />}
        </>
      )}

      {dialog?.type === 'gift' && (
        <GiftDialog
          messages={messages}
          members={members}
          contacts={contacts}
          birthdays={birthdays}
          me={me}
          isAdult={isAdult}
          gift={dialog.gift}
          initial={dialog.initial}
          onSave={gifts.save}
          onDelete={dialog.gift && canDeleteGift(dialog.gift, meId, isAdult) ? askDelete : null}
          onPreview={gifts.preview}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'budget' && (
        <BudgetDialog
          messages={messages}
          occasion={dialog.occasion}
          title={dialog.occasion.recipient_key === 'family'
            ? occasionLabel(messages, dialog.occasion.occasion)
            : (nameOfKey(dialog.occasion.recipient_key) || dialog.occasion.person_name || '')}
          onSave={gifts.setBudget}
          onClose={() => setDialog(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmDanger
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
          messages={messages}
        />
      )}
    </div>
  );
}

/* ── Occasions ─────────────────────────────────────────────── */

function Occasions({ occasions, ctx }) {
  const { messages, onAdd } = ctx;
  if (occasions.length === 0) {
    return (
      <div className="gifts-empty">
        <span className="gifts-empty-icon"><Gift size={30} aria-hidden="true" /></span>
        <h2>{t(messages, 'module.gifts.occasions_empty_title')}</h2>
        <p>{t(messages, 'module.gifts.occasions_empty')}</p>
        <button type="button" className="btn-primary gifts-add-small" onClick={() => onAdd({ kind: 'idea' })}>
          <Plus size={15} aria-hidden="true" /> {t(messages, 'module.gifts.add_idea')}
        </button>
      </div>
    );
  }
  const [next, ...rest] = occasions;
  return (
    <div className="gifts-occasions">
      <OccasionCard occasion={next} ctx={ctx} featured />
      {rest.length > 0 && (
        <section className="rewards-section" aria-labelledby="gifts-later-title">
          <SectionTitle><span id="gifts-later-title">{t(messages, 'module.gifts.later')}</span></SectionTitle>
          <div className="gifts-occasion-grid">
            {rest.map((occasion) => <OccasionCard key={occasion.key} occasion={occasion} ctx={ctx} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── People ────────────────────────────────────────────────── */

function People({ people, ctx, onOpen, today }) {
  const { messages, locale, indexOf, colorOfKey } = ctx;
  if (people.length === 0) {
    return <p className="rewards-empty-note">{t(messages, 'module.gifts.people_empty')}</p>;
  }
  return (
    <div className="gifts-people">
      {people.map((person) => {
        const name = person.key === 'none' ? t(messages, 'module.gifts.no_recipient') : person.name;
        const open = person.ideas.length + person.wishes.length;
        return (
          <button
            key={person.key}
            type="button"
            className="gifts-person"
            style={{ '--person-color': colorOfKey(person.key) }}
            onClick={() => onOpen(person.key)}
          >
            <PersonAvatar member={person.member} name={name} index={person.member ? indexOf(person.member) : 0} size={44} />
            <span className="gifts-person-copy">
              <strong>{name}</strong>
              {person.nextBirthday && (
                <small><Cake size={12} aria-hidden="true" /> {relativeDays(daysBetween(today, person.nextBirthday), locale)}</small>
              )}
              <span className="gifts-person-counts">
                {person.wishes.length > 0 && <span className="wish"><Heart size={12} aria-hidden="true" /> {person.wishes.length}</span>}
                {person.ideas.length > 0 && <span className="idea"><Lightbulb size={12} aria-hidden="true" /> {person.ideas.length}</span>}
                {open === 0 && <span className="none">{t(messages, 'module.gifts.nothing_planned')}</span>}
              </span>
            </span>
            <ChevronRight size={18} className="gifts-person-chevron" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function PersonPage({ person, personKey, ctx, onBack, today }) {
  const { messages, locale, memberById, indexOf, colorOfKey, nameOfKey, onAdd, isAdult } = ctx;
  const member = personKey.startsWith('u:') ? memberById.get(Number(personKey.slice(2))) : null;
  const name = person?.name || member?.display_name || nameOfKey(personKey) || '';
  const entry = person || { ideas: [], wishes: [], gifted: [], nextBirthday: null };
  const first = name.split(' ')[0];
  const addFor = (kind) => {
    const date = entry.nextBirthday ? isoDate(entry.nextBirthday) : '';
    if (personKey.startsWith('n:')) onAdd({ kind, name, date });
    else onAdd({ kind, recipient: personKey === 'none' ? '' : personKey, date });
  };
  return (
    <div className="gifts-person-page" style={{ '--person-color': colorOfKey(personKey) }}>
      <button type="button" className="btn-ghost gifts-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> {t(messages, 'module.gifts.all_people')}
      </button>
      <section className="gifts-person-hero">
        <PersonAvatar member={member} name={name} index={member ? indexOf(member) : 0} size={64} />
        <div className="gifts-person-hero-copy">
          <h2>{personKey === 'none' ? t(messages, 'module.gifts.no_recipient') : name}</h2>
          {entry.nextBirthday && (
            <p><Cake size={14} aria-hidden="true" /> {t(messages, 'module.gifts.birthday_on')
              .replace('{date}', entry.nextBirthday.toLocaleDateString(locale, { day: 'numeric', month: 'long' }))
              .replace('{when}', relativeDays(daysBetween(today, entry.nextBirthday), locale))}</p>
          )}
          <p className="gifts-person-secret"><Lock size={13} aria-hidden="true" /> {t(messages, 'module.gifts.person_secret').replace('{name}', first)}</p>
        </div>
        <div className="gifts-person-hero-actions">
          {personKey !== 'none' && isAdult && (
            <button type="button" className="btn-secondary gifts-add-small" onClick={() => addFor('wish')}>
              <Heart size={15} aria-hidden="true" /> {t(messages, 'module.gifts.add_wish_for')}
            </button>
          )}
          <button type="button" className="btn-primary gifts-add-small" onClick={() => addFor('idea')}>
            <Plus size={15} aria-hidden="true" /> {t(messages, 'module.gifts.add_idea')}
          </button>
        </div>
      </section>

      <section className="rewards-section" aria-labelledby="gifts-person-wishes">
        <SectionTitle><span id="gifts-person-wishes">{t(messages, 'module.gifts.wishes_of').replace('{name}', first)}</span></SectionTitle>
        {entry.wishes.length === 0
          ? <p className="rewards-empty-note">{t(messages, 'module.gifts.no_wishes').replace('{name}', first)}</p>
          : <div className="gifts-grid">{entry.wishes.map((gift) => <GiftCard key={gift.id} gift={gift} ctx={ctx} />)}</div>}
      </section>

      <section className="rewards-section" aria-labelledby="gifts-person-ideas">
        <SectionTitle><span id="gifts-person-ideas">{t(messages, 'module.gifts.ideas')}</span></SectionTitle>
        {entry.ideas.length === 0
          ? <p className="rewards-empty-note">{t(messages, 'module.gifts.no_ideas')}</p>
          : <div className="gifts-grid">{entry.ideas.map((gift) => <GiftCard key={gift.id} gift={gift} ctx={ctx} />)}</div>}
      </section>

      {entry.gifted.length > 0 && (
        <section className="rewards-section" aria-labelledby="gifts-person-given">
          <SectionTitle><span id="gifts-person-given">{t(messages, 'module.gifts.already_given')}</span></SectionTitle>
          <ul className="gifts-given">
            {entry.gifted.map((gift) => (
              <li key={gift.id}>
                <Gift size={14} aria-hidden="true" />
                <strong>{gift.title}</strong>
                {gift.occasion && <span>{occasionLabel(messages, gift.occasion)}{gift.occasion_date ? ` ${gift.occasion_date.slice(0, 4)}` : ''}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ── My wishes ─────────────────────────────────────────────── */

function MyWishes({ wishes, ctx }) {
  const { messages, onAdd } = ctx;
  const open = wishes.filter((gift) => gift.status !== 'gifted');
  const received = wishes.filter((gift) => gift.status === 'gifted');
  return (
    <div className="gifts-mine">
      <section className="gifts-mine-intro">
        <span className="gifts-mine-icon"><Heart size={26} aria-hidden="true" /></span>
        <div>
          <h2>{t(messages, 'module.gifts.mine_title')}</h2>
          <p>{t(messages, 'module.gifts.mine_hint')}</p>
        </div>
        <button type="button" className="btn-primary gifts-add-small" onClick={() => onAdd({ kind: 'wish' })}>
          <Plus size={15} aria-hidden="true" /> {t(messages, 'module.gifts.add_wish')}
        </button>
      </section>
      {open.length === 0
        ? <p className="rewards-empty-note">{t(messages, 'module.gifts.mine_empty')}</p>
        : <div className="gifts-grid">{open.map((gift) => <GiftCard key={gift.id} gift={gift} ctx={ctx} />)}</div>}
      {received.length > 0 && (
        <section className="rewards-section" aria-labelledby="gifts-received-title">
          <SectionTitle><span id="gifts-received-title">{tc(messages, 'module.gifts.received', received.length)}</span></SectionTitle>
          <div className="gifts-grid">{received.map((gift) => <GiftCard key={gift.id} gift={gift} ctx={ctx} />)}</div>
        </section>
      )}
    </div>
  );
}
