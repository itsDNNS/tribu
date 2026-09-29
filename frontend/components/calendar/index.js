import { usePlannerLayout } from '../../hooks/useResponsiveUI';
import {
  AgendaDay,
  EventCard,
  EmptyDay,
  CompactMonth,
  DayStrip,
  addDays,
  plannerText,
} from '../responsive/PlannerUI';
import { calendarEventColors } from '../../lib/calendar-colors';
import { useEffect, useRef, useState } from 'react';
import {
  Cake,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Copy,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCalendar } from '../../hooks/useCalendar';
import { t, tc } from '../../lib/i18n';
import { parseDate } from '../../lib/helpers';
import { localeForLang } from '../../lib/dates';
import { eventOccursOn } from '../../lib/calendar-dates';
import { getMemberColor } from '../../lib/member-colors';
import { getCalendarEventIcon } from '../../lib/calendar-icons';
import MemberAvatar from '../MemberAvatar';
import { weekStartIndex } from '../../lib/dates';
import CalendarDialog from './CalendarDialog';
import EventEditor from './EventEditor';
import { calendarEventStyle } from '../../lib/calendar-colors';
import EventDetails, { calendarDateKey as dateKey, isReadonlyEvent as readonly } from './EventDetails';
export { retargetCreateDraft } from './draftDates';


export default function CalendarView(props) {
  const {
    familyId,
    messages,
    lang,
    isChild,
    members = [],
    timeFormat,
    weekStart,
    me,
  } = useApp();
  const cal = useCalendar();
  const { ref: plannerRef, compact } = usePlannerLayout();
  // Phones (Tribu 2.0, K1): the agenda under a week strip; the month opens
  // by pulling the strip down or with its toggle.
  const [monthOpen, setMonthOpen] = useState(false);
  const phoneDefault = useRef(false);
  const stripDrag = useRef(null);
  const selected = cal.selectedDate || new Date();
  const selectDate = (date) => {
    cal.setSelectedDate(date);
    cal.setCalendarMonth(date);
    cal.setWeekAnchor?.(date);
  };
  const [modal, setModal] = useState(null);
  const [memberFilter, setMemberFilter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deletePending = useRef(false);
  const locale = localeForLang(lang);
  const copy = (key) => t(messages, `module.calendar.mockup.${key}`);
  const close = () => {
    setModal(null);
    cal.cancelEdit();
    cal.cancelDuplicate();
    setError('');
  };
  useEffect(() => {
    setModal(null);
    setMemberFilter(null);
    cal.cancelEdit();
    cal.cancelDuplicate();
  }, [familyId]);
  useEffect(() => {
    if (!compact || phoneDefault.current) return;
    phoneDefault.current = true;
    if (cal.calendarView !== 'agenda') cal.setCalendarView('agenda');
  }, [compact]);
  const today = new Date();
  const matches = (event) =>
    memberFilter == null ||
    event.assigned_to === 'all' ||
    (Array.isArray(event.assigned_to) &&
      event.assigned_to.map(String).includes(String(memberFilter))) ||
    event.id?.toString().startsWith(`birthday-member-${memberFilter}-`);
  const allEvents = cal.allEvents;
  const eventsOn = (date) =>
    allEvents
      .filter((ev) => {
        return eventOccursOn(ev, date) && matches(ev);
      })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const time = (value) => {
    const date = parseDate(value);
    return date
      ? date.toLocaleTimeString(locale, {
          hour: timeFormat === '12h' ? 'numeric' : '2-digit',
          minute: '2-digit',
          hour12: timeFormat === '12h',
        })
      : '';
  };
  const participants = (event) =>
    event.assigned_to === 'all'
      ? members
      : members.filter(
          (m) =>
            Array.isArray(event.assigned_to) &&
            event.assigned_to.map(String).includes(String(m.user_id)),
        );
  const openDay = (date) => {
    cal.setSelectedDate(date);
    if (!compact) setModal({ kind: 'day', date });
  };
  const create = (date = cal.selectedDate || today) => {
    cal.cancelEdit();
    cal.cancelDuplicate();
    cal.setSelectedDate(date);
    cal.setStartsAt(`${dateKey(date)}T14:00`);
    cal.setEndsAt(`${dateKey(date)}T15:00`);
    cal.setColor('');
    cal.setAssignedTo(
      memberFilter != null
        ? [Number(memberFilter)]
        : me?.user_id
          ? [Number(me.user_id)]
          : [],
    );
    setModal({ kind: 'create' });
  };
  useEffect(() => {
    if (props.createRequest?.kind === 'event' && !isChild) {
      create();
      props.onCreateHandled?.();
    }
  }, [props.createRequest?.id]);
  const edit = (event) => {
    if (isChild || readonly(event)) return;
    cal.startEdit(event);
    setModal({ kind: 'edit', event });
  };
  const duplicate = (event) => {
    cal.startDuplicate(event);
    setModal({ kind: 'create' });
  };
  const remove = async (occurrence) => {
    if (deletePending.current) return;
    deletePending.current = true;
    setBusy(true);
    setError('');
    try {
      if (await cal.performDelete(modal.event.id, occurrence)) close();
      else setError(t(messages, 'toast.error'));
    } catch {
      setError(t(messages, 'toast.error'));
    } finally {
      deletePending.current = false;
      setBusy(false);
    }
  };
  const first = new Date(
    cal.calendarMonth.getFullYear(),
    cal.calendarMonth.getMonth(),
    1,
  );
  const offset = (first.getDay() - (weekStart === 'sunday' ? 0 : 1) + 7) % 7;
  const days = Array.from(
    {
      length:
        Math.ceil(
          (offset +
            new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) /
            7,
        ) * 7,
    },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i),
  );
  const weekdayDates = days.slice(0, 7);
  const monthMode = cal.calendarView === 'month';
  const toggleMonth = (open) => {
    setMonthOpen(open);
    cal.setCalendarView(open ? 'month' : 'agenda');
  };
  const navigate = (direction) => {
    if (compact && !monthOpen) selectDate(addDays(selected, direction * 7));
    else if (cal.calendarView === 'agenda')
      selectDate(addDays(selected, direction * 14));
    else if (monthMode) {
      const target = new Date(
        first.getFullYear(),
        first.getMonth() + direction,
        1,
      );
      target.setDate(
        Math.min(
          selected.getDate(),
          new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
        ),
      );
      selectDate(target);
    } else {
      cal.setSelectedDate(addDays(selected, direction * 7));
      direction < 0 ? cal.prevWeek() : cal.nextWeek();
    }
  };
  const agendaDay = (date, condensed = false) => (
    <AgendaDay
      key={dateKey(date)}
      date={date}
      locale={locale}
      messages={messages}
      count={eventsOn(date).length}
      onAdd={isChild ? null : create}
      condensed={condensed}
    >
      {eventsOn(date).length ? (
        eventsOn(date).map((event) => (
          <EventCard
            key={`${event.id}:${event.starts_at}`}
            event={event}
            members={members}
            participants={participants}
            time={time}
            messages={messages}
            onOpen={(event) => setModal({ kind: 'event', event })}
          />
        ))
      ) : (
        <EmptyDay
          messages={messages}
          condensed={condensed}
          onAdd={isChild ? null : () => create(date)}
        />
      )}
    </AgendaDay>
  );
  const eventButton = (event) => {
    const category = getCalendarEventIcon(event.icon);
    return (
      <button
        type="button"
        key={`${event.id}:${event.starts_at}`}
        className="tc-calendar-event"
        style={calendarEventStyle(event, members)}
        onClick={() => setModal({ kind: 'event', event })}
        title={`${event.title} · ${time(event.starts_at)}`}
      >
        {event._isBirthday ? (
          <Cake size={11} aria-label={t(messages, 'upcoming_birthdays_4w')} />
        ) : (
          <b>
            {event.all_day ? t(messages, 'all_day') : time(event.starts_at)}
          </b>
        )}
        {category && <span aria-label={category.label}>{category.emoji} </span>}
        {event.title}
      </button>
    );
  };
  const selectedEvent = modal?.event;
  return (
    <div
      ref={plannerRef}
      className="calendar-page dashboard-today-page tc-page ui-planner"
      data-density={compact ? 'compact' : 'wide'}
    >
      {/* Tribu 2.0 (K4): a plain title; new events come from the global "+". */}
      <header className="list-header tc-list-header">
        <h1>{t(messages, 'calendar')}</h1>
      </header>
      <div className="tc-toolbar">
        <div className="tc-date-nav">
          <button
            className="tc-icon"
            aria-label={t(
              messages,
              monthMode && !(compact && !monthOpen) ? 'aria.previous_month' : 'aria.previous_week',
            )}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="ui-date-label"
            aria-live="polite"
            aria-label={plannerText(messages, 'choose_date')}
            onClick={() => setModal({ kind: 'date', date: dateKey(selected) })}
          >
            {compact && !monthOpen
              ? selected.toLocaleDateString(locale, {
                  month: 'long',
                  year: 'numeric',
                })
              : cal.calendarView === 'agenda'
              ? selected.toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'long',
                })
              : monthMode
                ? cal.calendarMonth.toLocaleDateString(locale, {
                    month: 'long',
                    year: 'numeric',
                  })
                : `${cal.weekInfo.weekStart.toLocaleDateString(locale, { day: 'numeric' })} – ${new Date(cal.weekInfo.weekEnd.getTime() - 1).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`}
          </button>
          <button
            className="tc-icon"
            aria-label={t(
              messages,
              monthMode && !(compact && !monthOpen) ? 'aria.next_month' : 'aria.next_week',
            )}
            onClick={() => navigate(1)}
          >
            <ChevronRight size={16} />
          </button>
          <button
            className="tc-btn small"
            onClick={() => {
              cal.setCalendarMonth(new Date());
              cal.setSelectedDate(new Date());
              cal.goToCurrentWeek();
            }}
          >
            {t(messages, 'module.calendar.today')}
          </button>
        </div>
        {!compact && (
          <div className="ui-planner-controls">
            <div className="tc-segmented">
              {['month', 'week', 'agenda'].map((mode) => (
                <button
                  key={mode}
                  aria-pressed={cal.calendarView === mode}
                  onClick={() => cal.setCalendarView(mode)}
                >
                  {mode === 'agenda'
                    ? plannerText(messages, 'agenda')
                    : t(messages, `module.calendar.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {members.length > 1 && (
        <div className="person-filter" role="group" aria-label={plannerText(messages, 'family_filter')}>
          {[
            { key: null, label: t(messages, 'module.tasks.all') },
            ...members.map((member) => ({
              key: String(member.user_id),
              label: member.display_name?.split(' ')[0],
              member,
            })),
          ].map((filter) => (
            <button
              key={filter.key ?? 'all'}
              type="button"
              className={`person-filter-chip${memberFilter === filter.key ? ' active' : ''}`}
              aria-pressed={memberFilter === filter.key}
              onClick={() => setMemberFilter(filter.key)}
            >
              {filter.member && (
                <MemberAvatar
                  member={filter.member}
                  index={members.indexOf(filter.member)}
                  size={22}
                />
              )}
              {filter.label}
            </button>
          ))}
        </div>
      )}
      {cal.rangeLoading && <p role="status">{copy('loading')}</p>}
      {cal.rangeError && (
        <p role="alert">
          {copy('load_error')}{' '}
          <button className="tc-btn" onClick={cal.loadEventsForRange}>
            {copy('retry')}
          </button>
        </p>
      )}
      {!cal.rangeError &&
        (compact ? (
          <>
            <div
              className={`ui-phone-strip${monthOpen ? ' month' : ''}`}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse') return;
                stripDrag.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={(e) => {
                const start = stripDrag.current;
                stripDrag.current = null;
                if (!start) return;
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) {
                  toggleMonth(dy > 0);
                } else if (!monthOpen && Math.abs(dx) > 50) {
                  selectDate(addDays(selected, dx < 0 ? 7 : -7));
                }
              }}
              onPointerCancel={() => {
                stripDrag.current = null;
              }}
            >
              {monthOpen ? (
                <CompactMonth
                  month={cal.calendarMonth}
                  selected={selected}
                  onSelect={selectDate}
                  eventsOn={eventsOn}
                  members={members}
                  locale={locale}
                  messages={messages}
                  weekStart={weekStart}
                />
              ) : (
                <DayStrip
                  days={Array.from({ length: 7 }, (_, i) =>
                    addDays(
                      selected,
                      i - ((selected.getDay() - weekStartIndex(weekStart) + 7) % 7),
                    ),
                  )}
                  selected={selected}
                  onSelect={selectDate}
                  locale={locale}
                  messages={messages}
                  colors={(date) =>
                    eventsOn(date).flatMap((event) =>
                      calendarEventColors(event, members),
                    )
                  }
                />
              )}
              <button
                type="button"
                className="ui-strip-toggle"
                aria-expanded={monthOpen}
                onClick={() => toggleMonth(!monthOpen)}
              >
                <ChevronDown size={16} aria-hidden="true" />
                {t(messages, monthOpen ? 'module.calendar.week' : 'module.calendar.month')}
              </button>
            </div>
          <div className="ui-agenda-list">
            {Array.from({ length: cal.agendaDays || 14 }, (_, i) =>
              addDays(selected, i),
            )
              .filter((date) => eventsOn(date).length)
              .map((date) => agendaDay(date, true))}
            {!Array.from(
              { length: cal.agendaDays || 14 },
              (_, i) => eventsOn(addDays(selected, i)).length,
            ).some(Boolean) && (
              <EmptyDay
                messages={messages}
                onAdd={isChild ? null : () => create(selected)}
              />
            )}
            <button
              className="tc-btn"
              disabled={cal.rangeLoading}
              onClick={() => cal.setAgendaDays((count) => count + 14)}
            >
              {plannerText(messages, 'load_more')}
            </button>
          </div>
          </>
        ) : cal.calendarView === 'agenda' ? (
          <div className="ui-agenda-list">
            {Array.from({ length: cal.agendaDays || 14 }, (_, i) =>
              addDays(selected, i),
            )
              .filter((date) => eventsOn(date).length)
              .map((date) => agendaDay(date, true))}
            {!Array.from(
              { length: cal.agendaDays || 14 },
              (_, i) => eventsOn(addDays(selected, i)).length,
            ).some(Boolean) && (
              <EmptyDay
                messages={messages}
                onAdd={isChild ? null : () => create(selected)}
              />
            )}
            <button
              className="tc-btn"
              disabled={cal.rangeLoading}
              onClick={() => cal.setAgendaDays((count) => count + 14)}
            >
              {plannerText(messages, 'load_more')}
            </button>
          </div>
        ) : monthMode ? (
          <section
            className="tc-calendar-shell"
            aria-label={t(messages, 'calendar')}
          >
            <div className="tc-calendar-grid">
              {weekdayDates.map((date) => (
                <div key={dateKey(date)} className="tc-weekday">
                  {date.toLocaleDateString(locale, { weekday: 'long' })}
                </div>
              ))}
              {days.map((date) => {
                const events = eventsOn(date);
                return (
                  <div
                    key={dateKey(date)}
                    className={`tc-calendar-day${date.getMonth() !== first.getMonth() ? ' outside' : ''}${dateKey(date) === dateKey(today) ? ' today' : ''}${dateKey(date) === dateKey(selected) ? ' selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="tc-day-number"
                      aria-label={date.toLocaleDateString(locale, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      aria-current={
                        dateKey(date) === dateKey(today) ? 'date' : undefined
                      }
                      data-date={dateKey(date)}
                      onKeyDown={(e) => {
                        const delta = {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -7,
                          ArrowDown: 7,
                        }[e.key];
                        if (delta == null) return;
                        e.preventDefault();
                        const next = addDays(date, delta);
                        selectDate(next);
                        requestAnimationFrame(() =>
                          plannerRef.current
                            ?.querySelector(`[data-date="${dateKey(next)}"]`)
                            ?.focus(),
                        );
                      }}
                      onClick={() => openDay(date)}
                    >
                      {date.getDate()}
                    </button>
                    {events.slice(0, 3).map(eventButton)}
                    {events.length > 3 && (
                      <button
                        className="tc-calendar-more"
                        onClick={() => openDay(date)}
                      >
                        {copy('more').replace('{count}', events.length - 3)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <footer className="ui-month-caption">
              <span>
                ● &nbsp;
                {tc(
                    messages,
                    'module.responsive.month_count',
                    allEvents.filter(
                      (event) =>
                        matches(event) &&
                        days.some(
                          (date) =>
                            date.getMonth() === first.getMonth() &&
                            eventOccursOn(event, date),
                        ),
                    ).length,
                  )
                  .replace(
                    '{month}',
                    first.toLocaleDateString(locale, { month: 'long' }),
                  )}
              </span>
              <span>{plannerText(messages, 'arrow_hint')}</span>
            </footer>
          </section>
        ) : (
          <div className="tc-week-scroll">
            <div className="tc-week-grid">
              {cal.weekInfo.days.map(({ date, dayEvents }) => (
                <section key={dateKey(date)} className="tc-week-column">
                  <header
                    className={`tc-week-heading${dateKey(date) === dateKey(today) ? ' today' : ''}`}
                  >
                    <span>
                      {date.toLocaleDateString(locale, { weekday: 'long' })}
                    </span>
                    <strong>{date.getDate()}.</strong>
                    <span>
                      {date.toLocaleDateString(locale, { month: 'long' })}
                    </span>
                    {!isChild && (
                      <button
                        className="tc-icon bare"
                        aria-label={`${t(messages, 'create_event')}: ${date.toLocaleDateString(locale)}`}
                        onClick={() => create(date)}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </header>
                  <div className="tc-week-items">
                    {dayEvents.filter(matches).length ? (
                      dayEvents.filter(matches).map((event) => (
                        <button
                          className="tc-week-item"
                          key={`${event.id}:${event.starts_at}`}
                          style={calendarEventStyle(event, members)}
                          onClick={() => setModal({ kind: 'event', event })}
                        >
                          <span>
                            {event.all_day
                              ? t(messages, 'all_day')
                              : `${time(event.starts_at)}${event.ends_at ? ' – ' + time(event.ends_at) : ''}`}
                          </span>
                          <strong>
                            {event._isBirthday && <Cake size={12} />}{' '}
                            {event.title}
                          </strong>
                          <span>
                            {participants(event)
                              .map((m) => m.display_name)
                              .join(', ')}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="tc-week-free">
                        {copy(cal.rangeLoading ? 'loading' : 'free')}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ))}
      <div className="tc-family-filters" aria-label={copy('people')}>
        {members.map((member, index) => (
          <button
            key={member.user_id}
            aria-pressed={String(memberFilter) === String(member.user_id)}
            onClick={() =>
              setMemberFilter((current) =>
                String(current) === String(member.user_id)
                  ? null
                  : member.user_id,
              )
            }
          >
            <span style={{ background: getMemberColor(member, index) }} />
            {member.display_name}
          </button>
        ))}
      </div>
      {modal?.kind === 'date' && (
        <CalendarDialog
          title={plannerText(messages, 'choose_date')}
          messages={messages}
          onClose={close}
          actions={
            <button
              type="submit"
              form="planner-jump"
              className="tc-btn primary"
            >
              {t(messages, 'save')}
            </button>
          }
        >
          <form
            id="planner-jump"
            onSubmit={(e) => {
              e.preventDefault();
              selectDate(new Date(modal.date + 'T12:00:00'));
              close();
            }}
          >
            <label className="tc-field">
              {plannerText(messages, 'choose_date')}
              <input
                type="date"
                required
                value={modal.date}
                onChange={(e) => setModal({ ...modal, date: e.target.value })}
              />
            </label>
          </form>
        </CalendarDialog>
      )}
      {modal?.kind === 'day' && (
        <CalendarDialog
          title={modal.date.toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          messages={messages}
          onClose={close}
          actions={
            <>
              <button className="tc-btn" onClick={close}>
                {t(messages, 'close')}
              </button>
              {!isChild && (
                <button
                  className="tc-btn primary"
                  onClick={() => create(modal.date)}
                >
                  <Plus size={15} />
                  {t(messages, 'create_event')}
                </button>
              )}
            </>
          }
        >
          <div className="tc-day-events">
            {eventsOn(modal.date).length ? (
              eventsOn(modal.date).map((event) => (
                <button
                  className="tc-day-event"
                  key={`${event.id}:${event.starts_at}`}
                  onClick={() => setModal({ kind: 'event', event })}
                >
                  <span
                    className="tc-event-dot"
                    style={calendarEventStyle(event, members)}
                  />
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {event.all_day
                        ? t(messages, 'all_day')
                        : time(event.starts_at)}
                      {event.location ? ' · ' + event.location : ''}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="tc-empty">
                <CalendarDays size={30} />
                <h3>{copy(cal.rangeLoading ? 'loading' : 'empty_day')}</h3>
                {!cal.rangeLoading && <p>{copy('empty_hint')}</p>}
              </div>
            )}
          </div>
        </CalendarDialog>
      )}
      {modal?.kind === 'event' && (
        <CalendarDialog
          title={copy('moment')}
          messages={messages}
          onClose={close}
          actions={
            <>
              {!isChild && !selectedEvent._isBirthday && (
                <button
                  className="tc-btn left"
                  onClick={() => duplicate(selectedEvent)}
                >
                  <Copy size={15} />
                  {t(messages, 'module.calendar.duplicate_event')}
                </button>
              )}
              {!isChild && !readonly(selectedEvent) ? (
                <button
                  className="tc-btn primary"
                  onClick={() => edit(selectedEvent)}
                >
                  <Pencil size={15} />
                  {copy('edit')}
                </button>
              ) : (
                <button className="tc-btn" onClick={close}>
                  {t(messages, 'close')}
                </button>
              )}
              {!isChild &&
                !selectedEvent._isBirthday &&
                readonly(selectedEvent) && (
                  <button
                    className="tc-btn danger"
                    onClick={() =>
                      setModal({ kind: 'delete', event: selectedEvent })
                    }
                  >
                    <Trash2 size={15} />
                    {copy('remove')}
                  </button>
                )}
            </>
          }
        >
          <EventDetails
            event={selectedEvent}
            members={members}
            messages={messages}
            locale={locale}
            timeFormat={timeFormat}
          />
        </CalendarDialog>
      )}
      {(modal?.kind === 'create' || modal?.kind === 'edit') && (
        <EventEditor
          key={modal.kind + String(selectedEvent?.id || '')}
          cal={cal}
          editing={modal.kind === 'edit'}
          members={members}
          messages={messages}
          locale={locale}
          onClose={close}
          onDelete={() => {
            setModal({ kind: 'delete', event: selectedEvent });
            cal.cancelEdit();
          }}
        />
      )}
      {modal?.kind === 'delete' && (
        <CalendarDialog
          title={
            selectedEvent.is_recurring
              ? t(messages, 'module.calendar.delete_recurring_question')
              : copy('delete')
          }
          messages={messages}
          busy={busy}
          onClose={close}
          actions={
            <>
              <button className="tc-btn" disabled={busy} onClick={close}>
                {t(messages, 'cancel')}
              </button>
              {selectedEvent.is_recurring && (
                <button
                  className="tc-btn danger"
                  disabled={busy}
                  onClick={() =>
                    remove(
                      selectedEvent.occurrence_date ||
                        dateKey(parseDate(selectedEvent.starts_at)),
                    )
                  }
                >
                  {t(messages, 'module.calendar.delete_this_only')}
                </button>
              )}
              <button
                className="tc-btn danger"
                disabled={busy}
                onClick={() => remove(null)}
              >
                {selectedEvent.is_recurring
                  ? t(messages, 'module.calendar.delete_all')
                  : copy('remove')}
              </button>
            </>
          }
        >
          <h3 className="tc-detail-title">{selectedEvent.title}</h3>
          <p>{copy('delete_hint')}</p>
          {error && (
            <p role="alert" className="tc-error">
              {error}
            </p>
          )}
        </CalendarDialog>
      )}
    </div>
  );
}
