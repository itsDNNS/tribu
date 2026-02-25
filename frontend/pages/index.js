import { useApp } from '../contexts/AppContext';
import AuthPage from '../components/AuthPage';
import AppShell from '../components/AppShell';
import SetupWizard from '../components/SetupWizard';

export default function Home() {
  const { loggedIn, needsSetup, loading } = useApp();

  if (loggedIn) return <AppShell />;
  if (loading) return null;
  if (needsSetup) return <SetupWizard />;
  return <AuthPage />;
}
