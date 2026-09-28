import { useEffect, useMemo, useState } from 'react';
import { Cake, ChevronRight, Gift, Plus } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';
import { useRewards } from '../../hooks/useRewards';
import { apiGetEvents, apiGetGifts } from '../../lib/api';
import { CurrencyIcon } from '../../lib/currency-icons';
import { buildFamily } from '../../lib/family/buildFamily';
import { t } from '../../lib/i18n';
import { getMemberColor } from '../../lib/member-colors';
import HouseholdActivityFeed from '../HouseholdActivityFeed';
import MemberAvatar from '../MemberAvatar';

function clock(time, locale, timeFormat) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(locale, {
    hour: timeFormat === '12h' ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

function count(messages, key, value) {
  return t(messages, value === 1 ? `${key}_one` : key).replace('{count}', value);
}

function remember(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* private mode */ }
}

function Person({ member, index, person, members, ctx }) {
  const { messages, locale, timeFormat, currency, setActiveView } = ctx;
  const name = member.display_name?.split(' ')[0] || member.display_name;
  const color = getMemberColor(member, index);
  const next = person.next;
  const open = () => {
    remember('tribu_today_member', String(member.user_id));
    setActiveView('dashboard');
  };
  return (
    <li>
      <button
        type="button"
        className="family-person"
        style={{ '--person-color': color }}
        onClick={open}
        aria-label={t(messages, 'family.open_day').replace('{name}', name)}
      >
        <MemberAvatar member={member} index={members.indexOf(member)} size={44} />
        <span className="family-person-text">
          <strong>{name}</strong>
          <span className="family-person-next">
            {next ? (
              <>
                {next.time && <em>{clock(next.time, locale, timeFormat)}</em>}
                {next.title}
              </>
            ) : t(messages, 'family.nothing_left')}
            {person.later > 0 && <small>{t(messages, 'family.later').replace('{count}', person.later)}</small>}
          </span>
          {(person.openTasks > 0 || (person.points !== null && member.is_adult === false)) && (
            <span className="family-person-meta">
              {person.openTasks > 0 && <span>{count(messages, 'family.open_tasks', person.openTasks)}</span>}
              {person.points !== null && currency && member.is_adult === false && (
                <span className="family-person-points">
                  <CurrencyIcon icon={currency.icon} size={13} />
                  {person.points} {currency.name}
                </span>
              )}
            </span>
          )}
          {person.goal && (
            <span className="family-person-goal">
              <span className="family-progress" aria-hidden="true">
                <span style={{ width: `${Math.round(person.goal.progress * 100)}%` }} />
              </span>
              <small>
                {person.goal.reached
                  ? t(messages, 'family.goal_reached').replace('{reward}', person.goal.name)
                  : t(messages, 'family.goal').replace('{count}', person.goal.cost - person.points).replace('{reward}', person.goal.name)}
              </small>
            </span>
          )}
        </span>
        <ChevronRight size={18} className="family-person-chevron" aria-hidden="true" />
      </button>
    </li>
  );
}

function BirthdayRow({ birthday, ctx }) {
  const { messages, locale, canGift, setActiveView } = ctx;
  const when = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(birthday.daysUntil, 'day');
  const [year, month, day] = birthday.date.split('-').map(Number);
  const date = new Date(year, month - 1, day).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  const openGifts = () => {
    remember('tribu_gifts_focus', JSON.stringify({
      name: birthday.name, memberId: birthday.memberId, date: birthday.date, add: birthday.giftIdeas === 0,
    }));
    setActiveView('gifts');
  };
  return (
    <li className="family-birthday">
      <span className="family-birthday-icon" aria-hidden="true"><Cake size={17} /></span>
      <span className="family-birthday-text">
        <strong>{birthday.name}</strong>
        <small>{when} · {date}</small>
      </span>
      {canGift && (
        <button type="button" className={`family-birthday-gifts${birthday.giftIdeas ? '' : ' add'}`} onClick={openGifts}>
          {birthday.giftIdeas ? <Gift size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          {birthday.giftIdeas
            ? count(messages, 'family.gift_ideas', birthday.giftIdeas)
            : t(messages, 'family.gift_add')}
        </button>
      )}
    </li>
  );
}

// The family hub (Tribu 2.0, F1–F4): everyone's day at a glance, the
// birthdays ahead with their gift ideas and what happened lately.
export default function FamilyHub() {
  const {
    members = [], tasks = [], birthdays = [], activity = [], familyId, messages, lang, timeFormat,
    isChild, demoMode, setActiveView, events = [],
  } = useApp();
  const rewards = useRewards();
  const now = useCurrentMinute();
  const locale = lang || 'en';
  const today = now.toLocaleDateString('en-CA');
  const [dayEvents, setDayEvents] = useState({ key: null, items: [] });
  const [gifts, setGifts] = useState([]);
  const canGift = !isChild && !demoMode;
  const key = `${familyId}:${today}`;

  useEffect(() => {
    if (!familyId || demoMode) return undefined;
    let cancelled = false;
    const [year, month, day] = today.split('-').map(Number);
    apiGetEvents(familyId, new Date(year, month - 1, day).toISOString(), new Date(year, month - 1, day + 1).toISOString())
      .then((res) => {
        if (!cancelled && res?.ok && Array.isArray(res.data)) setDayEvents({ key, items: res.data });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [familyId, demoMode, today, key, events]);

  useEffect(() => {
    if (!familyId || !canGift) return undefined;
    let cancelled = false;
    apiGetGifts(familyId, { includeGifted: false })
      .then((res) => { if (!cancelled && res?.ok) setGifts(res.data?.items || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [familyId, canGift]);

  const hub = useMemo(() => buildFamily({
    now,
    events: demoMode ? events : dayEvents.key === key ? dayEvents.items : [],
    tasks,
    members,
    balances: rewards.currency ? rewards.balances : null,
    rewards: rewards.catalog || [],
    birthdays,
    gifts,
  }), [now, demoMode, events, dayEvents, key, tasks, members, rewards.currency, rewards.balances, rewards.catalog, birthdays, gifts]);

  const ctx = { messages, locale, timeFormat, currency: rewards.currency, setActiveView, canGift };

  return (
    <div className="family-hub">
      <header className="list-header family-hub-header">
        <h1>{t(messages, 'module.responsive.group_family')}</h1>
      </header>

      <section className="family-section" aria-labelledby="family-today-title">
        <h2 id="family-today-title" className="today-section-title">{t(messages, 'module.today.title')}</h2>
        <ul className="family-people">
          {members.map((member, index) => (
            <Person
              key={member.user_id}
              member={member}
              index={index}
              person={hub.people[index]}
              members={members}
              ctx={ctx}
            />
          ))}
        </ul>
      </section>

      <div className="family-columns">
        <section className="family-section" aria-labelledby="family-birthdays-title">
          <h2 id="family-birthdays-title" className="today-section-title">{t(messages, 'contacts_tab_birthdays')}</h2>
          {hub.birthdays.length > 0 ? (
            <ul className="family-birthdays">
              {hub.birthdays.map((birthday) => (
                <BirthdayRow key={`${birthday.name}-${birthday.date}`} birthday={birthday} ctx={ctx} />
              ))}
            </ul>
          ) : (
            <p className="family-empty">{t(messages, 'family.birthdays_empty')}</p>
          )}
        </section>

        <section className="family-section family-activity" aria-labelledby="family-activity-title">
          <div className="family-section-head">
            <h2 id="family-activity-title" className="today-section-title">{t(messages, 'module.dashboard.activity_title')}</h2>
            {activity.length > 0 && (
              <button type="button" className="family-link" onClick={() => setActiveView('activity')}>
                {t(messages, 'family.activity_all')}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <HouseholdActivityFeed activity={activity} messages={messages} lang={lang} limit={5} dashboard bare />
        </section>
      </div>
    </div>
  );
}
