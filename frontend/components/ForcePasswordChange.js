import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function ForcePasswordChange() {
  const { messages, me, setMe } = useApp();
  const { success: toastSuccess } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { ok, data } = await api.apiChangePassword(oldPassword, newPassword);
    if (!ok) {
      setError(errorText(data?.detail, 'Failed'));
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    toastSuccess(t(messages, 'password_changed'));
    setMe({ ...me, must_change_password: false });
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="glass" style={{ padding: 'var(--space-lg)', maxWidth: 420, width: '100%' }}>
        <h2 style={{ marginBottom: 'var(--space-sm)', fontSize: '1.2rem' }}>{t(messages, 'force_change_password_title')}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
          {t(messages, 'force_change_password_desc')}
        </p>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.88rem', marginBottom: 'var(--space-sm)' }}>{error}</p>}
        {success ? (
          <p style={{ color: 'var(--success)', fontSize: '0.92rem' }}>{t(messages, 'password_changed')}</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <div className="form-field">
              <label>{t(messages, 'old_password')}</label>
              <input
                className="form-input"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-field">
              <label>{t(messages, 'new_password')}</label>
              <input
                className="form-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t(messages, 'password_hint')}</span>
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
