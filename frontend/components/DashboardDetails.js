import { Children } from 'react';
import { ArrowRight, CalendarDays, Sun, Heart, Sprout } from 'lucide-react';
import { t } from '../lib/i18n';
import { parseDate } from '../lib/helpers';

export function DashboardBadge({ icon: Icon = CalendarDays, tone = 'purple' }) {
  return <span className={`dashboard-badge dashboard-badge-${tone}`} aria-hidden="true"><Icon size={20} strokeWidth={1.65} /></span>;
}

export function DashboardDateTile({ value, locale, month = false }) {
  const date = parseDate(value);
  if (!date) return null;
  return <span className="dashboard-date-tile">
    <span>{date.toLocaleDateString(locale, { weekday: 'short' }).replace(/\.$/, '')}</span>
    <strong>{date.getDate()}.</strong>
    {month && <span>{date.toLocaleDateString(locale, { month: 'short' })}</span>}
  </span>;
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

export function DashboardFooter({ messages }) {
  return <div className="dashboard-footer-note">
    <Sprout size={24} strokeWidth={1.5} aria-hidden="true" />
    <span className="dashboard-handwritten">„{t(messages, 'module.dashboard.footer_note')}“</span>
    <img src="/illustrations/family-footer.svg" className="dashboard-footer-landscape" alt="" />
    <span className="dashboard-footer-brand">Tribu<small>Family OS</small></span>
  </div>;
}

export function DashboardMotto({ messages, sidebar = false }) {
  return <div className={sidebar ? 'sidebar-family-note' : 'dashboard-handwritten quick-capture-motto'}>
    {t(messages, sidebar ? 'module.dashboard.family_note' : 'module.dashboard.day_note')} <Heart size={10} fill="currentColor" aria-hidden="true" />
  </div>;
}

// Keep keyboard and screen-reader navigation aligned with the saved visual order.
export function DashboardModules({ children }) {
  const modules = Children.toArray(children).sort((a, b) =>
    (a.props.style?.order ?? Infinity) - (b.props.style?.order ?? Infinity));
  return <div className="bento-grid">{modules}</div>;
}
