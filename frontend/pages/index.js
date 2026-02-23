import { useApp } from '../contexts/AppContext';
import AuthPage from '../components/AuthPage';
import AppShell from '../components/AppShell';

export default function Home() {
  const { loggedIn } = useApp();

  if (!loggedIn) return <AuthPage />;
  return <AppShell />;
}
