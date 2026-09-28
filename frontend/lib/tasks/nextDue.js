// When a recurring task comes back after it is done (Tribu 2.0, T7). Mirrors
// the backend's _compute_next_due: the next date counts from the due date,
// or from now when the task had none.
const FIRST_WEEKDAYS = {
  monthly_first_monday: 1,
  monthly_first_tuesday: 2,
  monthly_first_wednesday: 3,
  monthly_first_thursday: 4,
  monthly_first_friday: 5,
  monthly_first_saturday: 6,
  monthly_first_sunday: 0,
};

function parseLocal(value) {
  if (!value) return null;
  const [datePart, timePart = '00:00:00'] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0] = timePart.split(':').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hour, minute);
}

function addMonths(date, count) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  // As dateutil's relativedelta: the 31st becomes the month's last day.
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

export function nextDueDate(dueDate, recurrence, now = new Date()) {
  if (!recurrence) return null;
  const base = parseLocal(dueDate) || new Date(now);
  const next = new Date(base);
  if (recurrence === 'daily') next.setDate(next.getDate() + 1);
  else if (recurrence === 'weekly') next.setDate(next.getDate() + 7);
  else if (recurrence === 'monthly') return addMonths(base, 1);
  else if (recurrence === 'yearly') return addMonths(base, 12);
  else if (recurrence in FIRST_WEEKDAYS) {
    const first = new Date(base.getFullYear(), base.getMonth() + 1, 1, base.getHours(), base.getMinutes());
    first.setDate(1 + ((FIRST_WEEKDAYS[recurrence] - first.getDay() + 7) % 7));
    return first;
  } else return null;
  return next;
}
