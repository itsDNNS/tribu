import { ArrowRight, CalendarDays } from 'lucide-react';

export function DashboardBadge({ icon: Icon = CalendarDays, tone = 'purple' }) {
  return <span className={`dashboard-badge dashboard-badge-${tone}`} aria-hidden="true"><Icon size={20} strokeWidth={1.65} /></span>;
}

export function DashboardCardHeading({ icon, tone, title, action, onClick }) {
  return <div className="bento-card-header">
    <h2 className="bento-card-title"><DashboardBadge icon={icon} tone={tone} />{title}</h2>
    {onClick && <button type="button" className="dashboard-card-link" onClick={onClick}>{action}<ArrowRight size={12} aria-hidden="true" /></button>}
  </div>;
}

