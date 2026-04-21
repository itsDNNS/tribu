import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t(messages, 'password_mismatch'));
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
      setError(msg);
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
          <label className="set-label">{t(messages, 'old_password')}</label>
          <input
            className="form-input"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="set-field-group">
          <label className="set-label">{t(messages, 'new_password')}</label>
          <input
            className="form-input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="set-field-hint">{t(messages, 'password_hint')}</span>
        </div>
        <div className="set-field-group">
          <label className="set-label">{t(messages, 'confirm_password')}</label>
          <input
            className="form-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {error && <div className="set-password-error">{error}</div>}
        <button type="submit" className="btn-primary" disabled={disabled}>
          {t(messages, 'change_password')}
        </button>
      </form>
    </div>
  );
}
