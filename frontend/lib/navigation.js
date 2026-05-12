import {
  Bell,
  Activity,
  BookUser,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Gift,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

export const PINNED_NAV_KEYS = new Set(['settings', 'admin']);
export const MOBILE_PRIMARY_NAV_KEYS = ['dashboard', 'calendar', 'tasks', 'shopping'];

export const NAV_GROUPS = [
  { key: 'today', labelKey: 'nav.group.today', fallback: 'Today', itemKeys: ['dashboard'] },
  { key: 'plan', labelKey: 'nav.group.plan', fallback: 'Plan', itemKeys: ['calendar', 'templates'] },
  { key: 'lists', labelKey: 'nav.group.lists', fallback: 'Lists', itemKeys: ['tasks', 'shopping', 'meal_plans', 'recipes'] },
  { key: 'people', labelKey: 'nav.group.people', fallback: 'People', itemKeys: ['contacts'] },
  { key: 'household', labelKey: 'nav.group.household', fallback: 'Household', itemKeys: ['rewards', 'school_timetables', 'gifts'] },
  { key: 'system', labelKey: 'nav.group.system', fallback: 'More / System', itemKeys: ['activity', 'notifications', 'settings', 'admin'] },
];

export const NAV_ITEM_META = {
  dashboard: { icon: LayoutDashboard, labelKey: 'dashboard', mobileLabel: 'Home' },
  activity: { icon: Activity, labelKey: 'activity' },
  calendar: { icon: CalendarDays, labelKey: 'calendar', mobileLabel: 'Plan' },
  shopping: { icon: ShoppingCart, labelKey: 'module.shopping.name' },
  tasks: { icon: CheckSquare, labelKey: 'module.tasks.name' },
  templates: { icon: ClipboardList, labelKey: 'module.templates.name', adultOnly: true, hideInDemo: true },
  meal_plans: { icon: UtensilsCrossed, labelKey: 'module.meal_plans.name', hideInDemo: true },
  school_timetables: { icon: GraduationCap, labelKey: 'module.school_timetables.name', hideInDemo: true, adultOnly: true },
  recipes: { icon: BookOpen, labelKey: 'module.recipes.name', hideInDemo: true },
  rewards: { icon: Gift, labelKey: 'module.rewards.name' },
  gifts: { icon: Sparkles, labelKey: 'module.gifts.name', adultOnly: true, hideInDemo: true },
  contacts: { icon: BookUser, labelKey: 'contacts' },
  notifications: { icon: Bell, labelKey: 'notifications' },
  settings: { icon: Settings, labelKey: 'settings' },
  admin: { icon: Shield, labelKey: 'admin', adminOnly: true },
};

export function isNavItemVisible(key, { isAdmin = false, isChild = false, demoMode = false } = {}) {
  const meta = NAV_ITEM_META[key];
  if (!meta) return false;
  if (meta.adminOnly && !isAdmin) return false;
  if (meta.adultOnly && isChild) return false;
  if (meta.hideInDemo && demoMode) return false;
  return true;
}
