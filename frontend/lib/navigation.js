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
  CalendarRange,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Sun,
  Users,
  UtensilsCrossed,
} from 'lucide-react';

// Settings and admin live in the account menu behind the avatar;
// notifications behind the bell.
export const PINNED_NAV_KEYS = new Set(['settings', 'admin']);
export const ACCOUNT_NAV_KEYS = ['settings', 'admin'];

// Tribu 2.0 (docs/tribu-2-design.md): four areas of daily life. The phone's
// tab bar shows them around the "+" button; a group opens the page used
// last, and the pages of a group switch with the chips below the header.
export const NAV_GROUPS = [
  { key: 'today', labelKey: 'nav.group.today', fallback: 'Today', itemKeys: ['dashboard'] },
  { key: 'plan', labelKey: 'nav.group.plan', fallback: 'Plan', itemKeys: ['calendar', 'meal_plans', 'recipes', 'school_timetables', 'weekly_plan'] },
  { key: 'lists', labelKey: 'nav.group.lists', fallback: 'Lists', itemKeys: ['shopping', 'tasks', 'templates'] },
  { key: 'family', labelKey: 'module.responsive.group_family', fallback: 'Family', itemKeys: ['family', 'contacts', 'rewards', 'gifts'], pinned: 'family' },
];

// Pages without a place in the navigation, opened from another page; they
// count as that page for the navigation (activity lives in the family hub).
export const NAV_SUBPAGES = { activity: 'family' };

export function navKeyOf(key) {
  return NAV_SUBPAGES[key] || key;
}

export function navGroupOf(key) {
  const navKey = navKeyOf(key);
  return NAV_GROUPS.find((group) => group.itemKeys.includes(navKey)) || null;
}

export const NAV_ITEM_META = {
  dashboard: { icon: Sun, labelKey: 'nav.group.today' },
  family: { icon: Users, labelKey: 'family.overview' },
  activity: { icon: Activity, labelKey: 'activity' },
  calendar: { icon: CalendarDays, labelKey: 'calendar' },
  weekly_plan: { icon: CalendarRange, labelKey: 'module.weekly_plan.title', adultOnly: true },
  shopping: { icon: ShoppingCart, labelKey: 'module.shopping.name' },
  tasks: { icon: CheckSquare, labelKey: 'module.tasks.name' },
  templates: { icon: ClipboardList, labelKey: 'module.templates.name', adultOnly: true, hideInDemo: true },
  meal_plans: { icon: UtensilsCrossed, labelKey: 'module.meal_plans.name' },
  school_timetables: { icon: GraduationCap, labelKey: 'module.school_timetables.name', hideInDemo: true, adultOnly: true },
  recipes: { icon: BookOpen, labelKey: 'module.recipes.name', hideInDemo: true },
  rewards: { icon: Gift, labelKey: 'module.rewards.name' },
  gifts: { icon: Sparkles, labelKey: 'module.gifts.name', adultOnly: true, hideInDemo: true },
  contacts: { icon: BookUser, labelKey: 'contacts' },
  notifications: { icon: Bell, labelKey: 'notifications' },
  settings: { icon: Settings, labelKey: 'settings' },
  admin: { icon: Shield, labelKey: 'admin_layout_title', adminOnly: true },
};

// Areas a family may hide (Tribu 2.0, R4), in navigation order; the
// server keeps the same list (OPTIONAL_AREAS).
export const OPTIONAL_AREAS = ['weekly_plan', 'meal_plans', 'recipes', 'school_timetables', 'templates', 'rewards', 'gifts'];

// The same empty list every render, so hooks do not rerun without a family.
export const NO_HIDDEN_AREAS = Object.freeze([]);

export function isNavItemVisible(key, { isAdmin = false, isChild = false, demoMode = false, hiddenAreas = NO_HIDDEN_AREAS } = {}) {
  const meta = NAV_ITEM_META[key];
  if (!meta) return false;
  if (hiddenAreas.includes(key)) return false;
  if (meta.adminOnly && !isAdmin) return false;
  if (meta.adultOnly && isChild) return false;
  if (meta.hideInDemo && demoMode) return false;
  return true;
}
