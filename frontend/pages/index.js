import dynamic from 'next/dynamic';
import { useApp } from '../contexts/AppContext';
import AuthPage from '../components/AuthPage';
import AppShell from '../components/AppShell';
import RequiredTwoStep from '../components/RequiredTwoStep';

// Needed once per installation, so it stays out of the first bundle.
const SetupWizard = dynamic(() => import('../components/SetupWizard'));

export default function Home() {
  const { loggedIn, needsSetup, loading, localeReady, me } = useApp();

  if (!localeReady) return null;
  if (me?.mfa_setup_required) return <RequiredTwoStep />;
  if (loggedIn) return <AppShell />;
  if (loading) return null;
  if (needsSetup) return <SetupWizard />;
  return <AuthPage />;
}
