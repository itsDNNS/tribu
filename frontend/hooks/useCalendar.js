import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText, toIsoOrNull } from '../lib/helpers';
import * as api from '../lib/api';

export function useCalendar() {
  const { events, familyId, loadEvents, loadDashboard } = useApp();

  const [calendarView, setCalendarView] = useState('month');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMsg, setCalendarMsg] = useState('');

  // Event form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [allDay, setAllDay] = useState(false);

  // Birthday form
  const [birthdayName, setBirthdayName] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');

  const monthLabel = useMemo(
    () => calendarMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    [calendarMonth],
  );

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const d = selectedDate.getDate();
    return events.filter((ev) => {
      const dt = new Date(ev.starts_at);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }, [events, selectedDate]);

  const monthCells = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;

    const eventCount = {};
    for (const ev of events) {
      const d = new Date(ev.starts_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        eventCount[day] = (eventCount[day] || 0) + 1;
      }
    }

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d += 1) cells.push({ day: d, count: eventCount[d] || 0 });
    while (cells.length % 7 !== 0) cells.push({ empty: true });
    return cells;
  }, [calendarMonth, events]);

  const weekInfo = useMemo(() => {
    const ref = selectedDate || new Date();
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

    const weekEvents = events.filter((ev) => {
      const dt = new Date(ev.starts_at);
      return dt >= weekStart && dt < weekEnd;
    });

    return { weekStart, weekEnd, weekNumber, weekEvents };
  }, [events, selectedDate]);

  async function createEvent(e) {
    e.preventDefault();
    const payload = {
      family_id: Number(familyId), title, description: description || null,
      starts_at: toIsoOrNull(startsAt), ends_at: toIsoOrNull(endsAt), all_day: allDay,
    };
    const { ok, data } = await api.apiCreateEvent(payload);
    if (!ok) return setCalendarMsg(errorText(data?.detail, 'Event erstellen fehlgeschlagen'));
    setTitle(''); setDescription(''); setStartsAt(''); setEndsAt(''); setAllDay(false);
    await Promise.all([loadEvents(), loadDashboard()]);
    setCalendarMsg('Event erstellt');
  }

  async function addBirthday(e) {
    e.preventDefault();
    const { ok, data } = await api.apiAddBirthday({
      family_id: Number(familyId), person_name: birthdayName,
      month: Number(birthdayMonth), day: Number(birthdayDay),
    });
    if (!ok) return setCalendarMsg(errorText(data?.detail, 'Geburtstag konnte nicht gespeichert werden'));
    setBirthdayName(''); setBirthdayMonth(''); setBirthdayDay('');
    await loadDashboard();
  }

  return {
    calendarView, setCalendarView,
    calendarMonth, setCalendarMonth,
    selectedDate, setSelectedDate,
    calendarMsg, setCalendarMsg,
    title, setTitle,
    description, setDescription,
    startsAt, setStartsAt,
    endsAt, setEndsAt,
    allDay, setAllDay,
    birthdayName, setBirthdayName,
    birthdayMonth, setBirthdayMonth,
    birthdayDay, setBirthdayDay,
    monthLabel, selectedDayEvents, monthCells, weekInfo,
    createEvent, addBirthday,
  };
}
