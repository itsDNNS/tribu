import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../lib/api';
import { localeForLang, startOfWeek, weekStartIndex } from '../lib/dates';
import { alternateFromFor, formatDutyTime, isoDate, isWeekA, orderedWeekdays, weekdayName } from '../lib/duties';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import ConfirmDialog from './ConfirmDialog';
import MemberAvatar from './MemberAvatar';
import BottomSheet from './responsive/BottomSheet';
import RewardsDialog from './rewards/RewardsDialog';

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function Person({ userId, members, messages }) {
  const member = members.find((m) => m.user_id === userId);
  if (!member) return <span className="duty-person muted">{t(messages, 'module.duties.nobody')}</span>;
  return (
    <span className="duty-person">
      <MemberAvatar member={member} index={members.indexOf(member)} size={22} />
      {member.display_name}
    </span>
  );
}

const asId = (value) => (value ? Number(value) : null);
const asOption = (value) => (value ? String(value) : '');

// Create or change a duty: title, optional time, per weekday whether it
// happens and who does it, and optionally a second person for every other week.
function DutyDialog({ duty, members, messages, locale, firstDay, onClose, onSaved }) {
  const titleRef = useRef(null);
  const [title, setTitle] = useState(duty.title || '');
  const [time, setTime] = useState(duty.due_time ? duty.due_time.slice(0, 5) : '');
  const [days, setDays] = useState(() => Object.fromEntries((duty.slots || []).map((slot) => [
    slot.weekday, { a: asOption(slot.assigned_to_user_id), b: asOption(slot.alternate_assigned_to_user_id) },
  ])));
  const [alternate, setAlternate] = useState(Boolean(duty.alternate_from));
  const [thisWeekIsA, setThisWeekIsA] = useState(() => (duty.alternate_from ? isWeekA(duty.alternate_from) : true));
  const [saving, setSaving] = useState(false);
  const { error: toastError } = useToast();

  const submit = async () => {
    if (saving) return;
    const slots = Object.entries(days).map(([weekday, people]) => ({
      weekday: Number(weekday),
      assigned_to_user_id: asId(people.a),
      // Week-B people stay stored while alternating is off, ready to come back.
      alternate_assigned_to_user_id: asId(people.b),
    }));
    if (!slots.length) {
      toastError(t(messages, 'module.duties.pick_a_day'));
      return;
    }
    // Keep the stored anchor while the weeks stay as they were.
    const keepAnchor = duty.alternate_from && isWeekA(duty.alternate_from) === thisWeekIsA;
    const alternateFrom = alternate ? (keepAnchor ? duty.alternate_from : alternateFromFor(thisWeekIsA)) : null;
    setSaving(true);
    const payload = { title, due_time: time || null, slots, alternate_from: alternateFrom };
    const res = duty.id ? await api.apiUpdateDuty(duty.id, payload) : await api.apiCreateDuty({ ...payload, family_id: duty.family_id });
    setSaving(false);
    if (!res.ok) {
      toastError(errorText(res.data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    onSaved();
  };

  const personSelect = (weekday, key, label) => (
    <select
      className="form-input"
      aria-label={label}
      value={days[weekday][key]}
      onChange={(e) => setDays((current) => ({ ...current, [weekday]: { ...current[weekday], [key]: e.target.value } }))}
    >
      <option value="">{t(messages, 'module.duties.nobody')}</option>
      {members.map((m) => <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>)}
    </select>
  );

  return (
    <RewardsDialog
      id="duty"
      title={t(messages, duty.id ? 'module.duties.edit' : 'module.duties.new')}
      closeLabel={t(messages, 'module.tasks.cancel')}
      onClose={onClose}
      onSubmit={submit}
      initialFocusRef={titleRef}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t(messages, 'module.tasks.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{t(messages, 'module.tasks.save')}</button>
        </>
      )}
    >
      <div className="rewards-field">
        <label htmlFor="duty-title">{t(messages, 'module.duties.what')}</label>
        <input
          ref={titleRef}
          id="duty-title"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={240}
        />
      </div>
      <div className="rewards-field">
        <label htmlFor="duty-time">{t(messages, 'module.duties.time')}</label>
        <input id="duty-time" className="form-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <span className="rewards-field-hint">{t(messages, 'module.duties.time_hint')}</span>
      </div>
      <div className="rewards-field">
        <label className="duty-day-toggle">
          <input type="checkbox" checked={alternate} onChange={(e) => setAlternate(e.target.checked)} />
          {t(messages, 'module.duties.alternate')}
        </label>
        {alternate && (
          <label className="duty-this-week">
            <span>{t(messages, 'module.duties.this_week_is')}</span>
            <select className="form-input" value={thisWeekIsA ? 'a' : 'b'} onChange={(e) => setThisWeekIsA(e.target.value === 'a')}>
              <option value="a">{t(messages, 'module.duties.week_a')}</option>
              <option value="b">{t(messages, 'module.duties.week_b')}</option>
            </select>
          </label>
        )}
      </div>
      <fieldset className="rewards-field">
        <legend>{t(messages, 'module.duties.days')}</legend>
        {alternate && (
          <div className="duty-day-row duty-alternate" aria-hidden="true">
            <span />
            <span className="rewards-field-hint">{t(messages, 'module.duties.week_a')}</span>
            <span className="rewards-field-hint">{t(messages, 'module.duties.week_b')}</span>
          </div>
        )}
        {orderedWeekdays(firstDay).map((weekday) => {
          const on = weekday in days;
          const name = weekdayName(weekday, locale, 'long');
          const who = t(messages, 'module.duties.who_on_weekday').replace('{weekday}', name);
          return (
            <div key={weekday} className={`duty-day-row${alternate ? ' duty-alternate' : ''}`}>
              <label className="duty-day-toggle">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setDays((current) => {
                    const next = { ...current };
                    if (on) delete next[weekday];
                    else next[weekday] = { a: '', b: '' };
                    return next;
                  })}
                />
                {name}
              </label>
              {on && personSelect(weekday, 'a', alternate ? `${who} (${t(messages, 'module.duties.week_a')})` : who)}
              {on && alternate && personSelect(weekday, 'b', `${who} (${t(messages, 'module.duties.week_b')})`)}
            </div>
          );
        })}
      </fieldset>
    </RewardsDialog>
  );
}

export default function DutiesView() {
  const { familyId, members, messages, lang, isChild, weekStart, timeFormat, loadTasks } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const canEdit = !isChild;
  const locale = localeForLang(lang);
  const firstDay = weekStartIndex(weekStart);
  const [weekOf, setWeekOf] = useState(() => startOfWeek(new Date(), firstDay));
  const [duties, setDuties] = useState(null);
  const [week, setWeek] = useState([]);
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const startIso = isoDate(weekOf);
  const todayIso = isoDate(new Date());
  const shownWeek = useRef(startIso);
  shownWeek.current = startIso;

  useEffect(() => { setWeekOf(startOfWeek(new Date(), firstDay)); }, [firstDay]);

  const reload = useCallback(async () => {
    if (!familyId) return;
    const [list, days] = await Promise.all([api.apiListDuties(familyId), api.apiGetDutyWeek(familyId, startIso)]);
    if (list.ok) setDuties(list.data);
    else toastError(t(messages, 'toast.error'));
    // Paging quickly can bring an earlier week's answer in last.
    if (days.ok && shownWeek.current === startIso) setWeek(days.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, startIso]);

  useEffect(() => { reload(); }, [reload]);

  const afterChange = async (res, doneKey) => {
    if (!res.ok) {
      toastError(errorText(res.data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    if (doneKey) toastSuccess(t(messages, doneKey));
    await reload();
    loadTasks();
  };

  const choose = async (occ, change) => {
    setPicking(null);
    const res = change === 'reset'
      ? await api.apiResetDutyDate(occ.duty_id, occ.date)
      : await api.apiSetDutyDate(occ.duty_id, occ.date, change);
    afterChange(res, 'module.duties.date_saved');
  };

  const dayLabel = (date) => date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDate = (date) => date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const weekRange = `${shortDate(weekOf)} – ${shortDate(addDays(weekOf, 6))}`;

  return (
    <div className="tasks-page tasks-v2 duties-page">
      {editing && (
        <DutyDialog
          duty={editing}
          members={members}
          messages={messages}
          locale={locale}
          firstDay={firstDay}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); afterChange({ ok: true }, 'module.duties.saved'); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t(messages, 'module.duties.delete')}
          message={t(messages, 'module.duties.delete_confirm').replace('{title}', deleting.title)}
          confirmLabel={t(messages, 'module.duties.delete')}
          confirmDanger
          messages={messages}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const duty = deleting;
            setDeleting(null);
            afterChange(await api.apiDeleteDuty(duty.id), 'module.duties.deleted');
          }}
        />
      )}
      {picking && (
        <BottomSheet title={`${picking.title} · ${dayLabel(new Date(`${picking.date}T00:00:00`))}`} messages={messages} onClose={() => setPicking(null)} className="task-actions-sheet">
          <p className="task-actions-label">{t(messages, 'module.duties.who_does_it')}</p>
          <div className="task-actions-list">
            {members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className="task-action"
                aria-pressed={!picking.skipped && picking.assigned_to_user_id === m.user_id}
                onClick={() => choose(picking, { assigned_to_user_id: m.user_id })}
              >
                <MemberAvatar member={m} index={members.indexOf(m)} size={22} />
                {m.display_name}
                {!picking.skipped && picking.assigned_to_user_id === m.user_id && <Check size={16} aria-hidden="true" className="duty-current" />}
              </button>
            ))}
          </div>
          <div className="task-actions-list">
            {!picking.skipped && (
              <button type="button" className="task-action" onClick={() => choose(picking, { skipped: true })}>
                <X size={18} aria-hidden="true" />
                {t(messages, 'module.duties.skip_date')}
              </button>
            )}
            {picking.is_exception && (
              <button type="button" className="task-action" onClick={() => choose(picking, 'reset')}>
                <ChevronLeft size={18} aria-hidden="true" />
                {t(messages, 'module.duties.back_to_usual')}
              </button>
            )}
          </div>
        </BottomSheet>
      )}

      <header className="list-header">
        <h1>{t(messages, 'module.duties.name')}</h1>
        {canEdit && (
          <button className="tasks-new-btn" type="button" onClick={() => setEditing({ family_id: familyId })}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.duties.new')}
          </button>
        )}
      </header>

      {duties === null ? null : duties.length === 0 ? (
        <p className="tasks-empty">{t(messages, 'module.duties.empty')}</p>
      ) : (
        <>
          <div className="duty-week-nav">
            <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.weekly_plan.previous_week')} onClick={() => setWeekOf(addDays(weekOf, -7))}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`${weekRange}, ${t(messages, 'module.weekly_plan.this_week')}`}
              onClick={() => setWeekOf(startOfWeek(new Date(), firstDay))}
            >
              {weekRange}
            </button>
            <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.weekly_plan.next_week')} onClick={() => setWeekOf(addDays(weekOf, 7))}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          {Array.from({ length: 7 }, (_, i) => addDays(weekOf, i)).map((day) => {
            const iso = isoDate(day);
            const items = week.filter((occ) => occ.date === iso);
            if (!items.length) return null;
            const label = dayLabel(day);
            return (
              <section key={iso} className="task-group" aria-label={label}>
                <h2 className="task-group-head"><span>{label}</span></h2>
                <ul className="task-list">
                  {items.map((occ) => {
                    const content = (
                      <>
                        <span className="duty-when">{formatDutyTime(occ.due_time, locale, timeFormat) || t(messages, 'module.duties.whole_day')}</span>
                        <span className={`task-row-title${occ.skipped ? ' duty-skipped' : ''}`}>{occ.title}</span>
                        {occ.skipped
                          ? <span className="duty-badge">{t(messages, 'module.duties.skipped')}</span>
                          : <Person userId={occ.assigned_to_user_id} members={members} messages={messages} />}
                        {occ.is_exception && !occ.skipped && <span className="duty-badge">{t(messages, 'module.duties.changed')}</span>}
                        {occ.task_status === 'done' && <Check size={16} aria-label={t(messages, 'module.tasks.done')} />}
                      </>
                    );
                    return (
                      <li key={`${occ.duty_id}-${occ.date}`} className="duty-row">
                        {canEdit && iso >= todayIso ? (
                          <button
                            type="button"
                            className="duty-row-main"
                            aria-label={t(messages, 'module.duties.change_date').replace('{title}', occ.title).replace('{date}', label)}
                            onClick={() => setPicking(occ)}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="duty-row-main">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section className="task-group" aria-label={t(messages, 'module.duties.all')}>
            <h2 className="task-group-head"><span>{t(messages, 'module.duties.all')}</span></h2>
            <ul className="task-list">
              {duties.map((duty) => (
                <li key={duty.id} className="duty-row">
                  <div className="duty-row-main">
                    <span className="duty-when">{formatDutyTime(duty.due_time, locale, timeFormat) || t(messages, 'module.duties.whole_day')}</span>
                    <span className="task-row-title">{duty.title}</span>
                    <span className="duty-pattern">
                      {orderedWeekdays(firstDay)
                        .map((weekday) => duty.slots.find((slot) => slot.weekday === weekday))
                        .filter(Boolean)
                        .map((slot) => {
                          const name = (uid) => members.find((m) => m.user_id === uid)?.display_name || t(messages, 'module.duties.nobody');
                          const people = duty.alternate_from
                            ? `${name(slot.assigned_to_user_id)}/${name(slot.alternate_assigned_to_user_id)}`
                            : name(slot.assigned_to_user_id);
                          return `${weekdayName(slot.weekday, locale)} ${people}`;
                        })
                        .join(' · ')}
                    </span>
                  </div>
                  {canEdit && (
                    <>
                      <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.duties.edit_named').replace('{title}', duty.title)} onClick={() => setEditing(duty)}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.duties.delete_named').replace('{title}', duty.title)} onClick={() => setDeleting(duty)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

