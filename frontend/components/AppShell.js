import { CalendarDays, CheckSquare, LayoutDashboard, Settings, Shield, BookUser } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import { navBtn, styles } from '../lib/styles';
import DashboardView from './DashboardView';
import CalendarView from './CalendarView';
import ContactsView from './ContactsView';
import TasksView from './TasksView';
import SettingsView from './SettingsView';
import AdminView from './AdminView';

const views = {
  dashboard: DashboardView,
  calendar: CalendarView,
  contacts: ContactsView,
  tasks: TasksView,
  settings: SettingsView,
  admin: AdminView,
};

export default function AppShell() {
  const { activeView, setActiveView, isMobile, isAdmin, tokens, messages, ui, me, profileImage, logout } = useApp();

  const ActiveComponent = views[activeView] || DashboardView;

  return (
    <main style={{ ...styles.page, background: tokens.bg, color: tokens.text }}>
      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? '1fr' : '240px 1fr' }}>
        {!isMobile && (
          <aside style={{ ...styles.sidebar, background: tokens.sidebar, borderColor: tokens.border, color: tokens.text }}>
            <h2 style={{ marginTop: 0 }}>{t(messages, 'app_name')}</h2>
            <button style={navBtn(activeView === 'dashboard', tokens)} onClick={() => setActiveView('dashboard')}><LayoutDashboard size={16} /> {t(messages, 'dashboard')}</button>
            <button style={navBtn(activeView === 'calendar', tokens)} onClick={() => setActiveView('calendar')}><CalendarDays size={16} /> {t(messages, 'calendar')}</button>
            <button style={navBtn(activeView === 'contacts', tokens)} onClick={() => setActiveView('contacts')}><BookUser size={16} /> {t(messages, 'contacts')}</button>
            <button style={navBtn(activeView === 'tasks', tokens)} onClick={() => setActiveView('tasks')}><CheckSquare size={16} /> {t(messages, 'module.tasks.name')}</button>
            <button style={navBtn(activeView === 'settings', tokens)} onClick={() => setActiveView('settings')}><Settings size={16} /> {t(messages, 'settings')}</button>
            {isAdmin && <button style={navBtn(activeView === 'admin', tokens)} onClick={() => setActiveView('admin')}><Shield size={16} /> {t(messages, 'admin')}</button>}
            <div style={{ marginTop: 'auto' }}><button style={ui.secondaryBtn} onClick={logout}>{t(messages, 'logout')}</button></div>
          </aside>
        )}

        <section style={{ ...styles.content, paddingBottom: isMobile ? 86 : 0 }}>
          {isMobile && (
            <div style={{ ...ui.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={profileImage || 'https://placehold.co/40x40?text=U'} alt="Profil" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                <div>
                  <strong>{t(messages, 'app_name')}</strong>
                  <div style={{ fontSize: 12, color: tokens.muted }}>{me?.display_name || ''}</div>
                </div>
              </div>
              <button style={ui.secondaryBtn} onClick={logout}>{t(messages, 'logout')}</button>
            </div>
          )}

          <ActiveComponent />
        </section>
      </div>

      {isMobile && (
        <nav style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 10,
          display: 'grid',
          gridTemplateColumns: isAdmin ? 'repeat(6, 1fr)' : 'repeat(5, 1fr)',
          gap: 8,
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 14,
          padding: 8,
          zIndex: 50,
        }}>
          <button style={navBtn(activeView === 'dashboard', tokens)} onClick={() => setActiveView('dashboard')}><LayoutDashboard size={16} /></button>
          <button style={navBtn(activeView === 'calendar', tokens)} onClick={() => setActiveView('calendar')}><CalendarDays size={16} /></button>
          <button style={navBtn(activeView === 'contacts', tokens)} onClick={() => setActiveView('contacts')}><BookUser size={16} /></button>
          <button style={navBtn(activeView === 'tasks', tokens)} onClick={() => setActiveView('tasks')}><CheckSquare size={16} /></button>
          <button style={navBtn(activeView === 'settings', tokens)} onClick={() => setActiveView('settings')}><Settings size={16} /></button>
          {isAdmin && <button style={navBtn(activeView === 'admin', tokens)} onClick={() => setActiveView('admin')}><Shield size={16} /></button>}
        </nav>
      )}
    </main>
  );
}
