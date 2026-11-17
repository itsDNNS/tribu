import { forwardRef, useEffect, useId, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { t } from '../../lib/i18n';
import { isSeriesEvent } from '../../lib/reminderMute';

// "My reminder" in an event's details: anyone who would be reminded can
// take themselves off it and back on, also without edit rights. A single
// event has one switch; an occurrence of a series offers this one or all
// of them. Only reminders change, not who takes part. The ref is the
// section, so a link can bring it into view and focus its choice.
const EventReminderControl = forwardRef(function EventReminderControl(
  { event, messages, onChange },
  ref,
) {
  const [state, setState] = useState(event.reminder_muted || null);
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const seriesHintId = useId();
  const name = useId();
  useEffect(() => setState(event.reminder_muted || null), [event.reminder_muted]);
  const series = isSeriesEvent(event);
  const copy = (key) => t(messages, `module.calendar.reminder_mute.${key}`);

  const choose = async (next) => {
    if (busy || next === state) return;
    const previous = state;
    setState(next);
    setBusy(true);
    try {
      const saved = await onChange(next);
      setState(saved === undefined ? previous : saved);
    } finally {
      setBusy(false);
    }
  };

  // From "all repetitions off", "On" and "Off for this one" both bring the
  // other repetitions back (there is no "all but this one"); say so first.
  const seriesMuted = series && state === 'series';
  const Icon = state ? BellOff : Bell;
  return (
    // data-no-autofocus: opening an event does not land on this choice.
    <div ref={ref} className="tc-detail-line tc-reminder" aria-busy={busy || undefined} data-no-autofocus="">
      <Icon size={20} aria-hidden="true" />
      <div>
        {series ? (
          <fieldset
            className="tc-reminder-choice"
            aria-describedby={seriesMuted ? `${hintId} ${seriesHintId}` : hintId}
          >
            <legend>{copy('title')}</legend>
            {[
              [null, 'on'],
              ['occurrence', 'off_occurrence'],
              ['series', 'off_series'],
            ].map(([value, label]) => (
              <label key={label} className="tc-check">
                <input
                  type="radio"
                  name={name}
                  checked={state === value}
                  onChange={() => choose(value)}
                />
                {copy(label)}
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="tc-check tc-reminder-switch">
            <input
              type="checkbox"
              role="switch"
              checked={!state}
              aria-describedby={hintId}
              onChange={(e) => choose(e.target.checked ? null : 'series')}
            />
            {copy('remind_me')}
          </label>
        )}
        <p id={hintId} className="tc-remind-hint">
          {copy('hint')}
        </p>
        {seriesMuted && (
          <p id={seriesHintId} className="tc-remind-hint">
            {copy('series_hint')}
          </p>
        )}
      </div>
    </div>
  );
});

export default EventReminderControl;
