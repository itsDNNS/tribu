import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import TodayView from '../today/TodayView';
import NotificationCenter from '../NotificationCenter';

// Today opens first and stays in the first bundle (as does the notification panel);
// every other area loads on demand.
const loaders = {
  family: () => import('../family/FamilyHub'),
  activity: () => import('../ActivityView'),
  calendar: () => import('../calendar'),
  shopping: () => import('../ShoppingView'),
  contacts: () => import('../ContactsView'),
  tasks: () => import('../TasksView'),
  duties: () => import('../DutiesView'),
  templates: () => import('../TemplatesView'),
  rewards: () => import('../RewardsView'),
  gifts: () => import('../GiftsView'),
  meal_plans: () => import('../MealPlansView'),
  school_timetables: () => import('../SchoolTimetablesView'),
  recipes: () => import('../RecipesView'),
  settings: () => import('../settings'),
  admin: () => import('../admin'),
  weekly_plan: () => import('../WeeklyPlanView'),
};

export function ViewLoading({ error, retry }) {
  const { messages } = useApp();
  // A page that could not be fetched (offline before it was ever opened) loads once the network is back.
  useEffect(() => {
    if (!error) return undefined;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [error, retry]);
  if (error) {
    return (
      <div className="view-loading" role="alert">
        <p>{t(messages, 'view_load_error')}</p>
        <button type="button" className="btn-ghost" onClick={retry}>{t(messages, 'view_load_retry')}</button>
      </div>
    );
  }
  return (
    <div className="view-loading" role="status" aria-label={t(messages, 'loading')} aria-busy="true">
      <div className="skeleton skeleton-text lg" />
      <div className="skeleton skeleton-text sm" />
      <div className="skeleton skeleton-card" />
    </div>
  );
}

export const views = {
  dashboard: TodayView,
  notifications: NotificationCenter,
  ...Object.fromEntries(Object.entries(loaders).map(([key, load]) => [key, dynamic(load, { loading: ViewLoading })])),
};

// Fetches the other areas once the browser is idle, so switching stays instant and works offline later.
export function prefetchViewsWhenIdle() {
  const prefetch = () => Object.values(loaders).forEach((load) => load().catch(() => {}));
  // Safari has no requestIdleCallback.
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(prefetch, 2000);
  return () => window.clearTimeout(id);
}
