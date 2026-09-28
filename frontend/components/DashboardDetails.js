import { ArrowRight, CalendarDays, Sun, Heart } from 'lucide-react';
import { t } from '../lib/i18n';

export function DashboardBadge({ icon: Icon = CalendarDays, tone = 'purple' }) {
  return <span className={`dashboard-badge dashboard-badge-${tone}`} aria-hidden="true"><Icon size={20} strokeWidth={1.65} /></span>;
}

export function DashboardCardHeading({ icon, tone, title, action, onClick }) {
  return <div className="bento-card-header">
    <h2 className="bento-card-title"><DashboardBadge icon={icon} tone={tone} />{title}</h2>
    {onClick && <button type="button" className="dashboard-card-link" onClick={onClick}>{action}<ArrowRight size={12} aria-hidden="true" /></button>}
  </div>;
}

export function DashboardWelcome({ messages }) {
  return <span className="dashboard-handwritten dashboard-welcome">{t(messages, 'module.dashboard.welcome_note')}<Sun size={23} strokeWidth={1.2} aria-hidden="true" /></span>;
}

export function DashboardMotto({ messages }) {
  return <div className="sidebar-family-note">
    {t(messages, 'module.dashboard.family_note')} <Heart size={10} fill="currentColor" aria-hidden="true" />
  </div>;
}

// Keep keyboard and screen-reader navigation aligned with the saved visual order.
