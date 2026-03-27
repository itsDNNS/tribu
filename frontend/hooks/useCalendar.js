import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText, toIsoOrNull, parseUtc } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

export function useCalendar() {
  const { events, setEvents, familyId, loadEvents, loadDashboard, demoMode, summary, setSummary, lang, messages, members } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [calendarView, setCalendarViewRaw] = useState('month');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());

  // Event form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [recurrence, setRecurrence] = useState('');
  const [recurrenceEnd, setRecurrenceEnd] = useState('');

  // Assigned members
  const [assignedTo, setAssignedTo] = useState([]);

  // Color and category
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('');

  // Delete confirmation for recurring events
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Birthday form
  const [birthdayName, setBirthdayName] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');

  const locale = lang === 'de' ? 'de-DE' : 'en-US';

  const setCalendarView = useCallback((view) => {
    if (view === 'week') {
      setWeekAnchor(selectedDate ? new Date(selectedDate) : new Date());
    }
    setCalendarViewRaw(view);
  }, [selectedDate]);

  const monthLabel = useMemo(
    () => calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    [calendarMonth, locale],
  );

  // Range-based event loading when month changes (non-demo)
  const loadEventsForRange = useCallback(async () => {
    if (demoMode) return;
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const rangeStart = new Date(y, m, -7);
    const rangeEnd = new Date(y, m + 1, 8);
    const { ok, data } = await api.apiGetEvents(
      familyId,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    );
    if (ok) setEvents(data);
  }, [calendarMonth, familyId, demoMode, setEvents]);

  useEffect(() => {
    if (!familyId || demoMode) return;
    loadEventsForRange();
  }, [calendarMonth, familyId, demoMode, loadEventsForRange]);

  // Sync calendarMonth when weekAnchor crosses month boundary (to load events)
  useEffect(() => {
    if (calendarView !== 'week') return;
    setCalendarMonth((prev) => {
      const y = weekAnchor.getFullYear();
      const m = weekAnchor.getMonth();
      if (prev.getFullYear() !== y || prev.getMonth() !== m) {
        return new Date(y, m, 1);
      }
      return prev;
    });
  }, [weekAnchor, calendarView]);

  // Merge real events with synthetic member birthday events for the viewed year
  const allEvents = useMemo(() => {
    const birthdayEvents = [];
    const viewYear = calendarMonth.getFullYear();
    for (const m of members) {
      if (!m.date_of_birth) continue;
      const [y, mo, d] = m.date_of_birth.split('-').map(Number);
      const age = viewYear - y;
      const startsAt = new Date(viewYear, mo - 1, d, 0, 0, 0).toISOString();
      birthdayEvents.push({
        id: `bday-${m.user_id}-${viewYear}`,
        title: m.display_name + (age > 0 ? ` (${age})` : ''),
        starts_at: startsAt,
        ends_at: null,
        all_day: true,
        color: '#f43f5e',
        is_recurring: false,
        _isBirthday: true,
      });
    }
    return [...events, ...birthdayEvents];
  }, [events, members, calendarMonth]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const d = selectedDate.getDate();
    return allEvents.filter((ev) => {
      const dt = parseUtc(ev.starts_at);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }, [allEvents, selectedDate]);

  const monthCells = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;

    const dayEvents = {};
    for (const ev of allEvents) {
      const d = parseUtc(ev.starts_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        if (!dayEvents[day]) dayEvents[day] = [];
        dayEvents[day].push(ev);
      }
    }

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d += 1) cells.push({ day: d, count: (dayEvents[d] || []).length, events: dayEvents[d] || [] });
    while (cells.length % 7 !== 0) cells.push({ empty: true });
    return cells;
  }, [calendarMonth, allEvents]);

  const weekInfo = useMemo(() => {
    const ref = weekAnchor;
    const current = new Date(ref);
    const day = (current.getDay() + 6) % 7;
    const weekStart = new Date(current);
    weekStart.setDate(current.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const firstThursday = new Date(current.getFullYear(), 0, 4);
    const firstThursdayDay = (firstThursday.getDay() + 6) % 7;
    const firstWeekStart = new Date(firstThursday);
    firstWeekStart.setDate(firstThursday.getDate() - firstThursdayDay);
    firstWeekStart.setHours(0, 0, 0, 0);

    const diffMs = weekStart - firstWeekStart;
    const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

    const weekEvents = allEvents.filter((ev) => {
      const dt = parseUtc(ev.starts_at);
      return dt >= weekStart && dt < weekEnd;
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dayEvents = allEvents.filter((ev) => {
        const dt = parseUtc(ev.starts_at);
        return dt.getFullYear() === date.getFullYear() && dt.getMonth() === date.getMonth() && dt.getDate() === date.getDate();
      }).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      days.push({ date, dayEvents });
    }

    return { weekStart, weekEnd, weekNumber, weekEvents, days };
  }, [allEvents, weekAnchor]);

  const prevWeek = useCallback(() => {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const nextWeek = useCallback(() => {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekAnchor(new Date());
  }, []);

  async function createEvent(e) {
    e.preventDefault();
    const assignedPayload = assignedTo.includes('all') ? 'all' : assignedTo.length > 0 ? assignedTo.map(Number) : null;
    const payload = {
      family_id: Number(familyId), title, description: description || null,
      starts_at: toIsoOrNull(startsAt), ends_at: toIsoOrNull(endsAt), all_day: allDay,
      recurrence: recurrence || null,
      recurrence_end: recurrenceEnd ? new Date(recurrenceEnd).toISOString() : null,
      assigned_to: assignedPayload,
      color: color || null,
      category: category || null,
    };
    if (demoMode) {
      const newEvent = { id: Date.now(), ...payload, is_recurring: !!recurrence, occurrence_date: null };
      setEvents((prev) => [...prev, newEvent]);
      setSummary((prev) => ({
        ...prev,
        next_events: [...(prev.next_events || []), newEvent]
          .filter((ev) => parseUtc(ev.starts_at) >= new Date())
          .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
          .slice(0, 5),
      }));
    } else {
      const { ok, data } = await api.apiCreateEvent(payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await Promise.all([loadEventsForRange(), loadDashboard()]);
    }
    setTitle(''); setDescription(''); setStartsAt(''); setEndsAt(''); setAllDay(false);
    setRecurrence(''); setRecurrenceEnd(''); setAssignedTo([]); setColor(''); setCategory('');
    const msg = t(messages, 'toast.event_created');
    toastSuccess(msg);
    announce(msg);
  }

  async function deleteEvent(ev) {
    if (ev._isBirthday) return;
    if (ev.is_recurring) {
      setDeleteConfirm(ev);
      return;
    }
    await performDelete(ev.id, null);
  }

  async function performDelete(eventId, occurrenceDate) {
    if (demoMode) {
      if (occurrenceDate) {
        setEvents((prev) => prev.filter((ev) => !(ev.id === eventId && ev.occurrence_date === occurrenceDate)));
      } else {
        setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      }
      setSummary((prev) => ({
        ...prev,
        next_events: (prev.next_events || []).filter((ev) => {
          if (occurrenceDate) return !(ev.id === eventId && ev.occurrence_date === occurrenceDate);
          return ev.id !== eventId;
        }),
      }));
    } else {
      const { ok, data } = await api.apiDeleteEvent(eventId, occurrenceDate);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await Promise.all([loadEventsForRange(), loadDashboard()]);
    }
    setDeleteConfirm(null);
    const msg = t(messages, 'toast.event_deleted');
    toastSuccess(msg);
    announce(msg);
  }

  async function addBirthday(e) {
    e.preventDefault();
    if (demoMode) {
      const bMonth = Number(birthdayMonth);
      const bDay = Number(birthdayDay);
      const now = new Date();
      let bDate = new Date(now.getFullYear(), bMonth - 1, bDay);
      if (bDate < now) bDate = new Date(now.getFullYear() + 1, bMonth - 1, bDay);
      const daysUntil = Math.round((bDate - now) / (1000 * 60 * 60 * 24));
      setSummary((prev) => ({
        ...prev,
        upcoming_birthdays: [...(prev.upcoming_birthdays || []), {
          person_name: birthdayName,
          occurs_on: bDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
          days_until: daysUntil,
          month: bMonth,
          day: bDay,
        }].sort((a, b) => a.days_until - b.days_until),
      }));
    } else {
      const { ok, data } = await api.apiAddBirthday({
        family_id: Number(familyId), person_name: birthdayName,
        month: Number(birthdayMonth), day: Number(birthdayDay),
      });
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await loadDashboard();
    }
    setBirthdayName(''); setBirthdayMonth(''); setBirthdayDay('');
  }

  return {
    calendarView, setCalendarView,
    calendarMonth, setCalendarMonth,
    selectedDate, setSelectedDate,
    title, setTitle,
    description, setDescription,
    startsAt, setStartsAt,
    endsAt, setEndsAt,
    allDay, setAllDay,
    recurrence, setRecurrence,
    recurrenceEnd, setRecurrenceEnd,
    assignedTo, setAssignedTo,
    color, setColor,
    category, setCategory,
    deleteConfirm, setDeleteConfirm,
    birthdayName, setBirthdayName,
    birthdayMonth, setBirthdayMonth,
    birthdayDay, setBirthdayDay,
    monthLabel, selectedDayEvents, monthCells, weekInfo,
    prevWeek, nextWeek, goToCurrentWeek,
    createEvent, deleteEvent, performDelete, addBirthday, loadEventsForRange,
  };
}
