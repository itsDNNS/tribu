import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorField, errorText, meetsPasswordRule } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

export default function SecuritySection() {
  const { messages } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const id = useId();
  const fieldId = (field) => `${id}-${field}`;

  // Show the error; one tied to a field also marks that field and focuses it.
  function fail(text, field = '') {
    setError(text);
    setInvalidField(field);
    if (field) document.getElementById(fieldId(field))?.focus();
  }

  // The field's hint, plus the form error while that error is about this field.
  const describedBy = (field, hint) => [hint && fieldId('hint'), invalidField === field && fieldId('error')].filter(Boolean).join(' ') || undefined;

  const fieldProps = (field, value, setValue, hint = false) => ({
    id: fieldId(field),
    value,
    onChange: (e) => { setValue(e.target.value); if (invalidField === field) setInvalidField(''); },
    'aria-invalid': invalidField === field,
    'aria-describedby': describedBy(field, hint),
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInvalidField('');

    if (newPassword !== confirmPassword) {
      fail(t(messages, 'password_mismatch'), 'confirm_password');
      return;
    }
    if (!meetsPasswordRule(newPassword)) {
      fail(t(messages, 'password_hint'), 'new_password');
      return;
    }

    setSubmitting(true);
    let result;
    try {
      result = await api.apiChangePassword(oldPassword, newPassword);
    } catch (err) {
      // Network, CORS, or offline errors never resolve with ok/data.
      // Surface a generic failure so the button re-enables and the user
      // sees why nothing happened.
      const msg = t(messages, 'toast.password_change_failed');
      setError(msg);
      toastError(msg);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);

    const { ok, data } = result;
    if (!ok) {
      const msg = errorText(data?.detail, t(messages, 'toast.password_change_failed'), messages);
      fail(msg, errorField(data?.detail));
      toastError(msg);
      return;
    }

    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toastSuccess(t(messages, 'password_changed'));
  }

  const disabled = submitting || !oldPassword || !newPassword || !confirmPassword;

  return (
    <div className="settings-section">
      <div className="settings-section-title"><Lock size={16} /> {t(messages, 'security')}</div>
      <p className="set-section-desc">{t(messages, 'security_desc')}</p>
      <form onSubmit={handleSubmit} className="set-password-form">
        <div className="set-field-group">
          <label className="set-label" htmlFor={fieldId('old_password')}>{t(messages, 'old_password')}</label>
          <input
            className="form-input"
            type="password"
            {...fieldProps('old_password', oldPassword, setOldPassword)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="set-field-group">
          <label className="set-label" htmlFor={fieldId('new_password')}>{t(messages, 'new_password')}</label>
          <input
            className="form-input"
            type="password"
            {...fieldProps('new_password', newPassword, setNewPassword, true)}
            autoComplete="new-password"
            required
          />
          <span id={fieldId('hint')} className="set-field-hint">{t(messages, 'password_hint')}</span>
        </div>
        <div className="set-field-group">
          <label className="set-label" htmlFor={fieldId('confirm_password')}>{t(messages, 'confirm_password')}</label>
          <input
            className="form-input"
            type="password"
            {...fieldProps('confirm_password', confirmPassword, setConfirmPassword)}
            autoComplete="new-password"
            required
          />
        </div>
        {error && <div id={fieldId('error')} className="set-password-error">{error}</div>}
        <button type="submit" className="btn-primary" disabled={disabled}>
          {t(messages, 'change_password')}
        </button>
      </form>
    </div>
  );
}
