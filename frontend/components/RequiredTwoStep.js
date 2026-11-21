import { Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import TwoStepSection from './settings/TwoStepSection';

// Shown instead of the app while the admin requires two-step sign-in and this
// account hasn't set it up; the backend lets the session reach only the setup.
export default function RequiredTwoStep() {
  const { messages, logout } = useApp();
  return (
    <div className="auth-page">
      <main id="main-content" className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo"><Users size={32} color="white" aria-hidden="true" /></div>
          <h1>Tribu</h1>
        </div>
        <div className="auth-card glass glow-purple" data-testid="required-two-step">
          <p style={{ marginBottom: 16 }}>{t(messages, 'two_step.required_desc')}</p>
          <TwoStepSection onEnabled={() => window.location.reload()} />
          <button type="button" className="btn-ghost" style={{ marginTop: 12 }} onClick={logout}>{t(messages, 'logout')}</button>
        </div>
      </main>
    </div>
  );
}
