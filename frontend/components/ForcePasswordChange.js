import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorField, errorText, meetsPasswordRule } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function ForcePasswordChange() {
  const { messages, me, setMe } = useApp();
  const { success: toastSuccess } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInvalidField('');
    if (!meetsPasswordRule(newPassword)) {
      fail(t(messages, 'password_hint'), 'new_password');
      return;
    }
    setSubmitting(true);
    let result;
    try {
      result = await api.apiChangePassword(oldPassword, newPassword);
    } catch {
      // A network failure never resolves; re-enable the button and say why nothing happened.
      result = { ok: false };
    }
    const { ok, data } = result;
    if (!ok) {
      fail(errorText(data?.detail, t(messages, 'toast.password_change_failed'), messages), errorField(data?.detail));
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    toastSuccess(t(messages, 'password_changed'));
    setMe({ ...me, must_change_password: false });
  }

  // Show the error; one tied to a field also marks that field and focuses it.
  function fail(text, field = '') {
    setError(text);
    setInvalidField(field);
    if (field) document.getElementById(`force-${field}`)?.focus();
  }

  // The field's hint, plus the form error while that error is about this field.
  const describedBy = (field, hintId) => [hintId, invalidField === field && 'force-password-error'].filter(Boolean).join(' ') || undefined;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="glass" style={{ padding: 'var(--space-lg)', maxWidth: 420, width: '100%' }}>
        <h2 style={{ marginBottom: 'var(--space-sm)', fontSize: '1.2rem' }}>{t(messages, 'force_change_password_title')}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
          {t(messages, 'force_change_password_desc')}
        </p>
        {error && <p id="force-password-error" style={{ color: 'var(--danger)', fontSize: '0.88rem', marginBottom: 'var(--space-sm)' }}>{error}</p>}
        {success ? (
          <p style={{ color: 'var(--success)', fontSize: '0.92rem' }}>{t(messages, 'password_changed')}</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <div className="form-field">
              <label htmlFor="force-old_password">{t(messages, 'old_password')}</label>
              <input
                id="force-old_password"
                className="form-input"
                type="password"
                value={oldPassword}
                onChange={(e) => { setOldPassword(e.target.value); if (invalidField === 'old_password') setInvalidField(''); }}
                aria-invalid={invalidField === 'old_password'}
                aria-describedby={describedBy('old_password')}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-field">
              <label htmlFor="force-new_password">{t(messages, 'new_password')}</label>
              <input
                id="force-new_password"
                className="form-input"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); if (invalidField === 'new_password') setInvalidField(''); }}
                aria-invalid={invalidField === 'new_password'}
                aria-describedby={describedBy('new_password', 'force-password-hint')}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <span id="force-password-hint" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t(messages, 'password_hint')}</span>
            </div>
            <button type="submit" className="btn-primary" disabled={submitting || !oldPassword || !newPassword}>
              {t(messages, 'change_password')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
