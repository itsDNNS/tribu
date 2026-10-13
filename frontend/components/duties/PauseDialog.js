import { useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../lib/api';
import { isoDate } from '../../lib/duties';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import RewardsDialog from '../rewards/RewardsDialog';

// Pause a duty for a while, for example during school holidays.
export default function PauseDialog({ duty, messages, onClose, onSaved }) {
  const startRef = useRef(null);
  const today = isoDate(new Date());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const { error: toastError } = useToast();

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const res = await api.apiCreateDutyPause(duty.id, { start, end });
    setSaving(false);
    if (!res.ok) {
      toastError(errorText(res.data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    onSaved();
  };

  return (
    <RewardsDialog
      id="duty-pause"
      title={t(messages, 'module.duties.pause_named').replace('{title}', duty.title)}
      closeLabel={t(messages, 'module.tasks.cancel')}
      onClose={onClose}
      onSubmit={submit}
      initialFocusRef={startRef}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t(messages, 'module.tasks.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{t(messages, 'module.tasks.save')}</button>
        </>
      )}
    >
      <div className="duty-pause-dates">
        <div className="rewards-field">
          <label htmlFor="duty-pause-start">{t(messages, 'module.duties.pause_from')}</label>
          <input ref={startRef} id="duty-pause-start" className="form-input" type="date" value={start} required
            onChange={(e) => {
              const value = e.target.value;
              setStart(value);
              // A pause may have begun already, but it has to last until today at least.
              const earliestEnd = value > today ? value : today;
              if (!end || end < earliestEnd) setEnd(earliestEnd);
            }} />
        </div>
        <div className="rewards-field">
          <label htmlFor="duty-pause-end">{t(messages, 'module.duties.pause_to')}</label>
          <input id="duty-pause-end" className="form-input" type="date" value={end} min={start > today ? start : today} required
            onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <p className="rewards-field-hint">{t(messages, 'module.duties.pause_hint')}</p>
    </RewardsDialog>
  );
}
