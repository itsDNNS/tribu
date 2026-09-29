// What the timetable shows first (Tribu 2.0): today, and the period that is
// running right now.

function minutes(value) {
  const [hours, mins] = String(value || '').slice(0, 5).split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
}

// The position of the period (lesson or break) running at `now`, or null.
export function currentPeriodPosition(periods, now) {
  const at = now.getHours() * 60 + now.getMinutes();
  const period = (periods || []).find((entry) => {
    const start = minutes(entry.start_time);
    const end = minutes(entry.end_time);
    return start !== null && end !== null && start <= at && at < end;
  });
  return period ? Number(period.position) : null;
}

// Today when it is a school day of the plan, otherwise its first day
// (Monday after a weekend).
export function openingWeekday(weekdays, now) {
  const today = now.getDay() === 0 ? 7 : now.getDay();
  return weekdays.includes(today) ? today : weekdays[0];
}

// Today's weekday (Monday 1 … Saturday 6) when the plan has it, else null.
export function schoolToday(weekdays, now) {
  const today = now.getDay() === 0 ? 7 : now.getDay();
  return weekdays.includes(today) ? today : null;
}
