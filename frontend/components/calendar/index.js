import { useEffect, useRef, useState } from 'react';
import { Cake, CalendarDays, ChevronLeft, ChevronRight, Plus, Pencil, Copy, MapPin, Users, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCalendar } from '../../hooks/useCalendar';
import { t } from '../../lib/i18n';
import { parseDate } from '../../lib/helpers';
import { getMemberColor } from '../../lib/member-colors';
import { getCalendarEventIcon } from '../../lib/calendar-icons';
import MemberAvatar from '../MemberAvatar';
import CalendarDialog from './CalendarDialog';
import EventEditor, { CALENDAR_COLORS } from './EventEditor';
import CalendarTopbar from './CalendarTopbar';
import { mapsLinksForLocation } from './CalendarHelpers';
export { retargetCreateDraft } from './draftDates';

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const readonly = event => event._isBirthday || ['import','subscription'].includes(event.source_type);

export default function CalendarView(props) {
  const { familyId, messages, lang, isChild, members = [], timeFormat, weekStart, me } = useApp();
  const cal = useCalendar();
  const [modal, setModal] = useState(null);
  const [memberFilter, setMemberFilter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deletePending = useRef(false);
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const copy = key => t(messages, `module.calendar.mockup.${key}`);
  const close = () => { setModal(null); cal.cancelEdit(); cal.cancelDuplicate(); setError(''); };
  useEffect(() => { setModal(null); setMemberFilter(null); cal.cancelEdit(); cal.cancelDuplicate(); }, [familyId]);
  const today = new Date();
  const matches = event => memberFilter == null || event.assigned_to === 'all' || (Array.isArray(event.assigned_to) && event.assigned_to.map(String).includes(String(memberFilter))) || event.id?.toString().startsWith(`birthday-member-${memberFilter}-`);
  const allEvents = cal.allEvents || cal.monthCells.flatMap(c => c.events || []);
  const eventsOn = date => allEvents.filter(ev => {
    const when = parseDate(ev.starts_at);
    return when && dateKey(when) === dateKey(date) && matches(ev);
  }).sort((a,b) => new Date(a.starts_at) - new Date(b.starts_at));
  const time = value => {
    const date = parseDate(value);
    return date ? date.toLocaleTimeString(locale, {hour:timeFormat==='12h'?'numeric':'2-digit', minute:'2-digit', hour12:timeFormat==='12h'}) : '';
  };
  const participants = event => event.assigned_to === 'all' ? members : members.filter(m => Array.isArray(event.assigned_to) && event.assigned_to.map(String).includes(String(m.user_id)));
  const openDay = date => { cal.setSelectedDate(date); setModal({kind:'day', date}); };
  const create = (date = cal.selectedDate || today) => {
    cal.cancelEdit(); cal.cancelDuplicate();
    cal.setSelectedDate(date); cal.setStartsAt(`${dateKey(date)}T14:00`); cal.setEndsAt(`${dateKey(date)}T15:00`);
    cal.setColor(CALENDAR_COLORS[0]);
    cal.setAssignedTo(memberFilter != null ? [Number(memberFilter)] : me?.user_id ? [Number(me.user_id)] : []);
    setModal({kind:'create'});
  };
  const edit = event => { if (isChild || readonly(event)) return; cal.startEdit(event); setModal({kind:'edit', event}); };
  const duplicate = event => { cal.startDuplicate(event); setModal({kind:'create'}); };
  const remove = async occurrence => {
    if (deletePending.current) return;
    deletePending.current = true; setBusy(true); setError('');
    try { if (await cal.performDelete(modal.event.id, occurrence)) close(); else setError(t(messages,'toast.error')); }
    catch { setError(t(messages,'toast.error')); }
    finally { deletePending.current = false; setBusy(false); }
  };
  const first = new Date(cal.calendarMonth.getFullYear(), cal.calendarMonth.getMonth(), 1);
  const offset = (first.getDay() - (weekStart === 'sunday' ? 0 : 1) + 7) % 7;
  const days = Array.from({length:42},(_,i) => new Date(first.getFullYear(), first.getMonth(), 1-offset+i));
  const weekdayDates = days.slice(0,7);
  const monthMode = cal.calendarView === 'month';
  const navigate = direction => {
    if (monthMode) cal.setCalendarMonth(new Date(first.getFullYear(),first.getMonth()+direction,1));
    else direction < 0 ? cal.prevWeek() : cal.nextWeek();
  };
  const eventButton = event => {
    const category = getCalendarEventIcon(event.icon);
    return <button type="button" key={`${event.id}:${event.starts_at}`} className="tc-calendar-event" style={{'--event-color':event.color || CALENDAR_COLORS[0]}} onClick={()=>setModal({kind:'event',event})} title={`${event.title} · ${time(event.starts_at)}`}>
      {event._isBirthday ? <Cake size={11} aria-label={t(messages,'upcoming_birthdays_4w')} /> : <b>{event.all_day ? t(messages,'all_day') : time(event.starts_at)}</b>}{category && <span aria-label={category.label}>{category.emoji} </span>}{event.title}
    </button>;
  };
  const selectedEvent = modal?.event;
  const mapLinks = selectedEvent ? mapsLinksForLocation(selectedEvent.location) : null;
  return <div className="calendar-page dashboard-today-page tc-page">
    <CalendarTopbar {...props} />
    <header className="tc-view-header"><div><div className="tc-eyebrow">{t(messages,'calendar')}</div><h1>{copy('heading')}</h1><p>{copy('subtitle')}</p></div>{!isChild && <button className="tc-btn primary" onClick={()=>create()}><Plus size={15} />{t(messages,'create_event')}</button>}</header>
    <div className="tc-toolbar"><div className="tc-date-nav"><button className="tc-icon" aria-label={t(messages,monthMode?'aria.previous_month':'aria.previous_week')} onClick={()=>navigate(-1)}><ChevronLeft size={16}/></button><strong aria-live="polite">{monthMode ? cal.calendarMonth.toLocaleDateString(locale,{month:'long',year:'numeric'}) : `${cal.weekInfo.weekStart.toLocaleDateString(locale,{day:'numeric',month:'short'})} – ${new Date(cal.weekInfo.weekEnd.getTime()-1).toLocaleDateString(locale,{day:'numeric',month:'short'})}`}</strong><button className="tc-icon" aria-label={t(messages,monthMode?'aria.next_month':'aria.next_week')} onClick={()=>navigate(1)}><ChevronRight size={16}/></button><button className="tc-btn small" onClick={()=>{cal.setCalendarMonth(new Date());cal.setSelectedDate(new Date());cal.goToCurrentWeek();}}>{t(messages,'module.calendar.today')}</button></div><div className="tc-segmented">{['month','week'].map(mode=><button key={mode} aria-pressed={cal.calendarView===mode} onClick={()=>cal.setCalendarView(mode)}>{t(messages,`module.calendar.${mode}`)}</button>)}</div></div>
    {monthMode ? <section className="tc-calendar-shell" aria-label={t(messages,'calendar')}><div className="tc-calendar-grid">
      {weekdayDates.map(date=><div key={dateKey(date)} className="tc-weekday">{date.toLocaleDateString(locale,{weekday:'long'})}</div>)}
      {days.map(date=>{ const events=eventsOn(date); return <div key={dateKey(date)} className={`tc-calendar-day${date.getMonth()!==first.getMonth()?' outside':''}${dateKey(date)===dateKey(today)?' today':''}`}>
        <button type="button" className="tc-day-number" aria-label={date.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'})} aria-current={dateKey(date)===dateKey(today)?'date':undefined} onClick={()=>openDay(date)}>{date.getDate()}</button>
        {events.slice(0,3).map(eventButton)}{events.length>3 && <button className="tc-calendar-more" onClick={()=>openDay(date)}>{copy('more').replace('{count}',events.length-3)}</button>}
      </div>})}
    </div></section> : <div className="tc-week-scroll"><div className="tc-week-grid">{cal.weekInfo.days.map(({date,dayEvents})=><section key={dateKey(date)} className="tc-week-column"><header className={`tc-week-heading${dateKey(date)===dateKey(today)?' today':''}`}><span>{date.toLocaleDateString(locale,{weekday:'long'})}</span><strong>{date.getDate()}.</strong><span>{date.toLocaleDateString(locale,{month:'long'})}</span>{!isChild && <button className="tc-icon bare" aria-label={`${t(messages,'create_event')}: ${date.toLocaleDateString(locale)}`} onClick={()=>create(date)}><Plus size={14}/></button>}</header><div className="tc-week-items">{dayEvents.filter(matches).length ? dayEvents.filter(matches).map(event=><button className="tc-week-item" key={`${event.id}:${event.starts_at}`} style={{borderColor:event.color || CALENDAR_COLORS[0]}} onClick={()=>setModal({kind:'event',event})}><span>{event.all_day ? t(messages,'all_day') : `${time(event.starts_at)}${event.ends_at?' – '+time(event.ends_at):''}`}</span><strong>{event._isBirthday && <Cake size={12}/>} {event.title}</strong><span>{participants(event).map(m=>m.display_name).join(', ')}</span></button>):<div className="tc-week-free">{copy('free')}</div>}</div></section>)}</div></div>}
    <div className="tc-family-filters" aria-label={copy('people')}>{members.map((member,index)=><button key={member.user_id} aria-pressed={String(memberFilter)===String(member.user_id)} onClick={()=>setMemberFilter(current=>String(current)===String(member.user_id)?null:member.user_id)}><span style={{background:getMemberColor(member,index)}}/>{member.display_name}</button>)}</div>
    {modal?.kind==='day' && <CalendarDialog title={modal.date.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long'})} messages={messages} onClose={close} actions={<><button className="tc-btn" onClick={close}>{t(messages,'close')}</button>{!isChild && <button className="tc-btn primary" onClick={()=>create(modal.date)}><Plus size={15}/>{t(messages,'create_event')}</button>}</>}><div className="tc-day-events">{eventsOn(modal.date).length?eventsOn(modal.date).map(event=><button className="tc-day-event" key={`${event.id}:${event.starts_at}`} onClick={()=>setModal({kind:'event',event})}><span className="tc-event-dot" style={{background:event.color || CALENDAR_COLORS[0]}}/><div><strong>{event.title}</strong><span>{event.all_day?t(messages,'all_day'):time(event.starts_at)}{event.location?' · '+event.location:''}</span></div></button>):<div className="tc-empty"><CalendarDays size={30}/><h3>{copy('empty_day')}</h3><p>{copy('empty_hint')}</p></div>}</div></CalendarDialog>}
    {modal?.kind==='event' && <CalendarDialog title={copy('moment')} messages={messages} onClose={close} actions={<>{!isChild && !selectedEvent._isBirthday && <button className="tc-btn left" onClick={()=>duplicate(selectedEvent)}><Copy size={15}/>{t(messages,'module.calendar.duplicate_event')}</button>}{!isChild && !readonly(selectedEvent) ? <button className="tc-btn primary" onClick={()=>edit(selectedEvent)}><Pencil size={15}/>{copy('edit')}</button>:<button className="tc-btn" onClick={close}>{t(messages,'close')}</button>}{!isChild && !selectedEvent._isBirthday && readonly(selectedEvent) && <button className="tc-btn danger" onClick={()=>setModal({kind:'delete',event:selectedEvent})}><Trash2 size={15}/>{copy('remove')}</button>}</>}>
      <h3 className="tc-detail-title">{selectedEvent.title}</h3><div className="tc-detail-line"><CalendarDays size={20}/><div><strong>{parseDate(selectedEvent.starts_at)?.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong><p>{selectedEvent.all_day?t(messages,'all_day'):time(selectedEvent.starts_at)}{selectedEvent.ends_at?` – ${dateKey(parseDate(selectedEvent.ends_at))!==dateKey(parseDate(selectedEvent.starts_at)) ? parseDate(selectedEvent.ends_at).toLocaleDateString(locale)+' ' : ''}${time(selectedEvent.ends_at)}`:''}</p></div></div>
      <div className="tc-detail-line"><Users size={20}/><div className="tc-people">{participants(selectedEvent).length?participants(selectedEvent).map(member=><span key={member.user_id}><MemberAvatar member={member} size={24}/>{member.display_name}</span>):copy('all_members')}</div></div>
      {selectedEvent.location && <div className="tc-detail-line"><MapPin size={20}/><div>{selectedEvent.location}{mapLinks && <p><a href={mapLinks.google} target="_blank" rel="noreferrer">{t(messages,'module.calendar.open_google_maps')}</a> · <a href={mapLinks.openStreetMap} target="_blank" rel="noreferrer">{t(messages,'module.calendar.open_openstreetmap')}</a></p>}</div></div>}
      {selectedEvent.description && <p className="tc-detail-description">{selectedEvent.description}</p>}{readonly(selectedEvent) && !selectedEvent._isBirthday && <p className="tc-form-hint">{t(messages,'module.calendar.source_readonly_hint')}</p>}
    </CalendarDialog>}
    {(modal?.kind==='create' || modal?.kind==='edit') && <EventEditor key={modal.kind+String(selectedEvent?.id || '')} cal={cal} editing={modal.kind==='edit'} members={members} messages={messages} onClose={close} onDelete={()=>{setModal({kind:'delete',event:selectedEvent});cal.cancelEdit();}} />}
    {modal?.kind==='delete' && <CalendarDialog title={selectedEvent.is_recurring?t(messages,'module.calendar.delete_recurring_question'):copy('delete')} messages={messages} busy={busy} onClose={close} actions={<><button className="tc-btn" disabled={busy} onClick={close}>{t(messages,'cancel')}</button>{selectedEvent.is_recurring && <button className="tc-btn danger" disabled={busy} onClick={()=>remove(selectedEvent.occurrence_date || dateKey(parseDate(selectedEvent.starts_at)))}>{t(messages,'module.calendar.delete_this_only')}</button>}<button className="tc-btn danger" disabled={busy} onClick={()=>remove(null)}>{selectedEvent.is_recurring?t(messages,'module.calendar.delete_all'):copy('remove')}</button></>}><h3 className="tc-detail-title">{selectedEvent.title}</h3><p>{copy('delete_hint')}</p>{error && <p role="alert" className="tc-error">{error}</p>}</CalendarDialog>}
  </div>;
}
