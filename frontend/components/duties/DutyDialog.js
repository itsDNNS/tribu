import { useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../lib/api';
import { alternateFromFor, dayTimes, formatDutyTime, isWeekA, orderedWeekdays, weekdayName } from '../../lib/duties';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import RewardsDialog from '../rewards/RewardsDialog';

const asId = (value) => (value ? Number(value) : null);
const asOption = (value) => (value ? String(value) : '');

// Create or change a duty: title, optional time, per weekday whether it
// happens and who does it, and optionally a second person for every other week.
export default function DutyDialog({ duty, members, messages, locale, firstDay, timeFormat, onClose, onSaved }) {
  const titleRef = useRef(null);
  const [title, setTitle] = useState(duty.title || '');
  const [time, setTime] = useState(duty.due_time ? duty.due_time.slice(0, 5) : '');
  const [days, setDays] = useState(() => Object.fromEntries((duty.slots || []).map((slot) => [
    slot.weekday, {
      a: asOption(slot.assigned_to_user_id),
      b: asOption(slot.alternate_assigned_to_user_id),
      time: slot.due_time ? slot.due_time.slice(0, 5) : '',
    },
  ])));
  // Weekdays whose own time field is open (it may still be empty while typing).
  const [timeOpen, setTimeOpen] = useState(() => new Set(
    (duty.slots || []).filter((slot) => slot.due_time).map((slot) => slot.weekday),
  ));
  const [alternate, setAlternate] = useState(Boolean(duty.alternate_from));
  const [thisWeekIsA, setThisWeekIsA] = useState(() => (duty.alternate_from ? isWeekA(duty.alternate_from) : true));
  const [saving, setSaving] = useState(false);
  const { error: toastError } = useToast();

  const submit = async () => {
    if (saving) return;
    const ownTimes = dayTimes(days, timeOpen, time);
    const slots = Object.entries(days).map(([weekday, people]) => ({
      weekday: Number(weekday),
      assigned_to_user_id: asId(people.a),
      // Week-B people stay stored while alternating is off, ready to come back.
      alternate_assigned_to_user_id: asId(people.b),
      due_time: ownTimes[weekday],
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

  const setDayTime = (weekday, value) => setDays((current) => ({ ...current, [weekday]: { ...current[weekday], time: value } }));
  const closeDayTime = (weekday) => setTimeOpen((current) => {
    const next = new Set(current);
    next.delete(weekday);
    return next;
  });

  // The usual time shows as a quiet button; tapping it gives that day a time of its own.
  const dayTime = (weekday, name) => {
    const label = t(messages, 'module.duties.day_time').replace('{weekday}', name);
    if (!timeOpen.has(weekday)) {
      const usual = formatDutyTime(time ? `${time}:00` : null, locale, timeFormat) || t(messages, 'module.duties.whole_day');
      return (
        <button
          type="button"
          className="duty-day-time-usual"
          aria-label={`${label}: ${usual}`}
          aria-describedby="duty-day-time-hint"
          onClick={() => {
            setDayTime(weekday, time);
            setTimeOpen((current) => new Set(current).add(weekday));
          }}
        >
          <Clock size={13} aria-hidden="true" />
          {usual}
        </button>
      );
    }
    return (
      <input
        type="time"
        className="form-input duty-day-time"
        aria-label={label}
        value={days[weekday].time}
        // Opened from the usual time, so focus it right away.
        autoFocus={!days[weekday].time || days[weekday].time === time}
        onChange={(e) => setDayTime(weekday, e.target.value)}
        onBlur={(e) => { if (!e.target.value || e.target.value === time) closeDayTime(weekday); }}
      />
    );
  };

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
            <span className="rewards-field-hint duty-day-time-header">{t(messages, 'module.duties.time')}</span>
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
                  onChange={() => {
                    if (on) closeDayTime(weekday);
                    setDays((current) => {
                      const next = { ...current };
                      if (on) delete next[weekday];
                      else next[weekday] = { a: '', b: '', time: '' };
                      return next;
                    });
                  }}
                />
                {name}
              </label>
              {on && personSelect(weekday, 'a', alternate ? `${who} (${t(messages, 'module.duties.week_a')})` : who)}
              {on && alternate && personSelect(weekday, 'b', `${who} (${t(messages, 'module.duties.week_b')})`)}
              {on && dayTime(weekday, name)}
            </div>
          );
        })}
        <span id="duty-day-time-hint" className="rewards-field-hint">{t(messages, 'module.duties.day_time_hint')}</span>
      </fieldset>
    </RewardsDialog>
  );
}
