import { useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

// Top of the Sign-in tab. Instance admin only: the backend refuses everyone else, and then this stays hidden.
export default function TwoStepPolicy() {
  const { messages } = useApp();
  const { error: toastError } = useToast();
  const [required, setRequired] = useState(null);

  useEffect(() => {
    api.apiGetMfaPolicy().then(({ ok, data }) => { if (ok) setRequired(data.required); });
  }, []);

  if (required === null) return null;

  async function toggle(e) {
    const { ok, data } = await api.apiSetMfaPolicy(e.target.checked);
    if (ok) setRequired(data.required);
    else toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
  }

  return (
    <div className="sso-checkbox-field" data-testid="two-step-policy">
      <div className="adm-field-title">{t(messages, 'two_step.title')}</div>
      <label className="set-checkbox-label">
        <input type="checkbox" checked={required} onChange={toggle} />
        {t(messages, 'two_step.require_label')}
      </label>
      <small className="sso-hint">{t(messages, 'two_step.require_hint')}</small>
    </div>
  );
}
