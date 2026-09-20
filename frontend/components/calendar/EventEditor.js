import { useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import CalendarDialog from './CalendarDialog';
import MemberAvatar from '../MemberAvatar';
import { RECURRENCE_OPTIONS } from './CalendarHelpers';
import { CALENDAR_EVENT_ICON_OPTIONS } from '../../lib/calendar-icons';
import { t } from '../../lib/i18n';
import { retargetCreateDraft } from './draftDates';

export const CALENDAR_COLORS = ['#79529e', '#759c5d', '#d8a245', '#71a4dc', '#b98aa1', '#d67e70'];

export default function EventEditor({ cal, editing, members, messages, onClose, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const copy = key => t(messages, `module.calendar.mockup.${key}`);
  const field = name => {
    const key = editing ? `edit${name[0].toUpperCase()}${name.slice(1)}` : name;
    return [cal[key], cal[`set${key[0].toUpperCase()}${key.slice(1)}`]];
  };
  const [title, setTitle] = field('title');
  const [startsAt, setStartsAt] = field('startsAt');
  const [endsAt, setEndsAt] = field('endsAt');
  const [location, setLocation] = field('location');
  const [description, setDescription] = field('description');
  const [assigned, setAssigned] = field('assignedTo');
  const [color, setColor] = field('color');
  const [recurrence, setRecurrence] = field('recurrence');
  const [recurrenceEnd, setRecurrenceEnd] = field('recurrenceEnd');
  const [icon, setIcon] = field('icon');
  const [allDay, setAllDay] = field('allDay');
  const date = startsAt?.slice(0, 10) || '';
  const endDate = endsAt?.slice(0, 10) || date;
  const [advanced, setAdvanced] = useState(Boolean(recurrence || icon || allDay || (date && endDate !== date)));
  const changeDate = value => {
    const shifted = retargetCreateDraft(new Date(`${value}T12:00:00`), startsAt, endsAt);
    setStartsAt(shifted.startsAt);
    setEndsAt(shifted.endsAt);
  };
  const submit = async e => {
    e.preventDefault();
    if (pending.current) return;
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) { setError(copy('invalid_time')); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const saved = await (editing ? cal.saveEdit(e) : cal.createEvent(e));
      if (saved) onClose(); else setError(t(messages, 'toast.error'));
    } catch { setError(t(messages, 'toast.error')); }
    finally { pending.current = false; setBusy(false); }
  };
  const toggleMember = id => setAssigned(previous => {
    const current = previous.includes('all') ? members.map(m => Number(m.user_id)) : previous.map(Number);
    return current.includes(Number(id)) ? current.filter(v => v !== Number(id)) : [...current, Number(id)];
  });
  return <CalendarDialog title={editing ? t(messages, 'module.calendar.edit_event') : cal.duplicateSource ? t(messages, 'module.calendar.duplicate_event') : copy('new_moment')} messages={messages} busy={busy} onClose={onClose} actions={<>
    {editing && <button type="button" className="tc-btn danger left" disabled={busy} onClick={onDelete}><Trash2 size={15} />{copy('remove')}</button>}
    <button type="button" className="tc-btn" disabled={busy} onClick={onClose}>{t(messages, 'cancel')}</button><button type="submit" form="calendar-event-form" className="tc-btn primary" disabled={busy}><Check size={15} />{t(messages, 'save')}</button>
  </>}>
    <form id="calendar-event-form" onSubmit={submit}>
      <fieldset className="tc-form-grid" disabled={busy}>
        {editing && cal.editingEvent?.is_recurring && <p className="tc-form-hint full">{t(messages, 'module.calendar.edit_recurring_warning')}</p>}
        {cal.duplicateSource && !editing && <p className="tc-form-hint full">{t(messages, 'module.calendar.duplicating_hint').replace('{title}', cal.duplicateSource.title)}</p>}
        <label className="tc-field full">{copy('title_label')}<input autoFocus required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder={copy('title_placeholder')} /></label>
        <label className="tc-field full">{copy('date')}<input type="date" required value={date} onChange={e => { if (e.target.value) changeDate(e.target.value); }} /></label>
        <label className="tc-field">{copy('from')}<input type="time" required value={startsAt?.slice(11,16) || ''} onChange={e => setStartsAt(`${date}T${e.target.value}`)} /></label>
        <label className="tc-field">{copy('until')}<input type="time" value={endsAt?.slice(11,16) || ''} onChange={e => setEndsAt(e.target.value ? `${endDate}T${e.target.value}` : '')} /></label>
        <div className="tc-field full"><span>{copy('people')}</span><div className="tc-people">{members.map(member => <label key={member.user_id}><input type="checkbox" checked={assigned.includes('all') || assigned.map(Number).includes(Number(member.user_id))} onChange={() => toggleMember(member.user_id)} /><MemberAvatar member={member} size={22} /><span>{member.display_name}</span></label>)}</div></div>
        <label className="tc-field full">{copy('location')}<input value={location} onChange={e => setLocation(e.target.value)} placeholder={copy('optional')} maxLength={180} /></label>
        <div className="tc-field full"><span>{copy('color')}</span><div className="tc-colors">{[...new Set([...CALENDAR_COLORS, ...(color && !CALENDAR_COLORS.includes(color) ? [color] : [])])].map(c => <button type="button" key={c} aria-label={c} aria-pressed={color === c} style={{ '--swatch': c }} onClick={() => setColor(c)} />)}<button type="button" className="tc-color-none" aria-label={t(messages, 'module.calendar.color_none')} aria-pressed={!color} onClick={() => setColor('')} /></div></div>
        <label className="tc-field full">{copy('notes')}<textarea aria-label={copy('notes')} rows={4} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <details className="tc-advanced full" open={advanced} onToggle={e => setAdvanced(e.currentTarget.open)}><summary>{copy('advanced')}</summary><div className="tc-form-grid">
          <label className="tc-field full">{copy('end_date')}<input type="date" value={endDate} min={date} onChange={e => setEndsAt(`${e.target.value}T${endsAt?.slice(11,16) || '15:00'}`)} /></label>
          <label className="tc-check full"><input type="checkbox" checked={allDay} disabled={editing} onChange={e => setAllDay(e.target.checked)} />{t(messages, 'all_day')}</label>
          <label className="tc-check full"><input type="checkbox" checked={assigned.includes('all')} onChange={e => setAssigned(e.target.checked ? ['all'] : [])} />{copy('all_members')}</label>
          <label className="tc-field full">{t(messages, 'module.calendar.recurring')}<select aria-label={t(messages, 'module.calendar.recurring')} value={recurrence} onChange={e => setRecurrence(e.target.value)}>{RECURRENCE_OPTIONS.map(o => <option value={o.value} key={o.value}>{t(messages, o.key)}</option>)}</select></label>
          {recurrence && <label className="tc-field full">{t(messages, 'module.calendar.repeat_until')}<input type="date" value={recurrenceEnd} onChange={e => setRecurrenceEnd(e.target.value)} /></label>}
          <label className="tc-field full">{t(messages, 'module.calendar.icon')}<select aria-label={t(messages, 'module.calendar.icon')} value={icon} onChange={e => setIcon(e.target.value)}><option value="">{t(messages, 'module.calendar.icon_none')}</option>{CALENDAR_EVENT_ICON_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.emoji} {o.label}</option>)}</select></label>
        </div></details>
        {error && <p role="alert" className="tc-error full">{error}</p>}
      </fieldset>
    </form>
  </CalendarDialog>;
}
