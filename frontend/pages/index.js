import dynamic from 'next/dynamic';
import { useApp } from '../contexts/AppContext';
import AuthPage from '../components/AuthPage';
import AppShell from '../components/AppShell';

// Needed once per installation, so it stays out of the first bundle.
const SetupWizard = dynamic(() => import('../components/SetupWizard'));

export default function Home() {
  const { loggedIn, needsSetup, loading, localeReady } = useApp();

  if (!localeReady) return null;
  if (loggedIn) return <AppShell />;
  if (loading) return null;
  if (needsSetup) return <SetupWizard />;
  return <AuthPage />;
}
