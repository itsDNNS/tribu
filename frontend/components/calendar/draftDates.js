function dateInputForDay(date, currentValue = '') {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const currentTime = String(currentValue || '').match(/T(\d{2}:\d{2})/)?.[1] || '09:00';
  return `${y}-${m}-${d}T${currentTime}`;
}

export function retargetCreateDraft(date, startsAt, endsAt) {
  const startMatch = String(startsAt || '').match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (!startMatch) {
    return { startsAt: dateInputForDay(date, startsAt), endsAt };
  }

  const sourceDayUtc = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]));
  const targetDayUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDelta = Math.round((targetDayUtc - sourceDayUtc) / (24 * 60 * 60 * 1000));
  const shift = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(T.*)$/);
    if (!match) return value;
    const shifted = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    shifted.setDate(shifted.getDate() + dayDelta);
    const y = shifted.getFullYear();
    const m = String(shifted.getMonth() + 1).padStart(2, '0');
    const d = String(shifted.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}${match[4]}`;
  };

  return { startsAt: shift(startsAt), endsAt: shift(endsAt) };
}
