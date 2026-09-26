import { useEffect, useMemo, useState } from 'react';
import { Bell, LayoutGrid, LogOut, Moon, Search } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import { localeForLang } from '../../lib/dates';
import { MEAL_SLOTS } from '../../lib/meal-plans';
import { apiListMealPlans } from '../../lib/api';
import {
  MOBILE_BOTTOM_NAV_KEYS,
  MOBILE_MORE_GROUPS,
  MOBILE_SYSTEM_NAV_KEYS,
} from '../../lib/navigation';
import MemberAvatar from '../MemberAvatar';
import { plannerText } from './PlannerUI';
import BottomSheet from './BottomSheet';

const TONES = {
  weekly_plan: 'blue',
  templates: 'blue',
  school_timetables: 'blue',
  tasks: 'green',
  meal_plans: 'amber',
  recipes: 'amber',
  contacts: 'purple',
  rewards: 'rose',
  gifts: 'rose',
  activity: 'purple',
};

function Badge({ count }) {
  return count > 0 ? (
    <span className="ui-count-badge" aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  ) : null;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase();
}

// Today's next planned meal, loaded when the sheet opens (demo mode uses context data).
function useTodayMeal() {
  const { familyId, demoMode, mealPlans = [] } = useApp();
  const today = isoDate(new Date());
  const [meals, setMeals] = useState([]);
  useEffect(() => {
    if (demoMode || !familyId) return undefined;
    let cancelled = false;
    apiListMealPlans(familyId, today, today)
      .then((res) => {
        if (!cancelled && res?.ok && Array.isArray(res.data) && res.data.length) setMeals(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyId, demoMode, today]);
  const todays = demoMode ? mealPlans.filter((meal) => meal.plan_date === today) : meals;
  const hour = new Date().getHours();
  const currentSlot = hour < 10 ? 0 : hour < 15 ? 1 : 2;
  const upcoming = todays
    .filter((meal) => MEAL_SLOTS.indexOf(meal.slot) >= currentSlot)
    .sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
  return upcoming[0]?.meal_name || null;
}

function useAreaHints() {
  const { messages, tasks = [], summary, lang } = useApp();
  const mealName = useTodayMeal();
  return useMemo(() => {
    const hints = {};
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    let overdue = 0;
    let dueToday = 0;
    for (const task of tasks) {
      if (task.status !== 'open' || !task.due_date) continue;
      const due = new Date(task.due_date);
      if (due < startOfToday) overdue += 1;
      else if (due < endOfToday) dueToday += 1;
    }
    if (overdue) hints.tasks = plannerText(messages, 'overdue').replace('{count}', overdue);
    else if (dueToday) hints.tasks = plannerText(messages, 'due_today').replace('{count}', dueToday);
    if (mealName) hints.meal_plans = plannerText(messages, 'meal_today').replace('{meal}', mealName);
    const birthday = Array.isArray(summary?.upcoming_birthdays) ? summary.upcoming_birthdays[0] : null;
    if (birthday && birthday.days_until <= 14) {
      const when = new Intl.RelativeTimeFormat(localeForLang(lang), { numeric: 'auto' }).format(birthday.days_until, 'day');
      hints.contacts = `${String(birthday.person_name).split(' ')[0]} · ${when}`;
    }
    return hints;
  }, [messages, tasks, summary, lang, mealName]);
}

export default function MoreSheet({ items, activeView, navigate, onClose, onNotifications, onLayout, onSearchAll }) {
  const app = useApp();
  const { messages, theme, setTheme, me, members = [], profileImage, families = [], familyId, unreadCount, showNotificationBadge = true } = app;
  const [query, setQuery] = useState('');
  const hints = useAreaHints();
  const notificationCount = showNotificationBadge ? unreadCount : 0;

  const go = (key) => {
    onClose();
    navigate(key);
  };

  const areaItems = items.filter((item) => !MOBILE_BOTTOM_NAV_KEYS.has(item.key) && !MOBILE_SYSTEM_NAV_KEYS.has(item.key));
  // Notifications open the panel and stay available even if a saved nav order omits them.
  const systemItems = [
    { key: 'notifications', icon: Bell, label: t(messages, 'notifications') },
    ...['settings', 'admin'].map((key) => items.find((item) => item.key === key)).filter(Boolean),
  ];
  const grouped = new Set(MOBILE_MORE_GROUPS.flatMap((group) => group.itemKeys));
  const groups = MOBILE_MORE_GROUPS.map((group, index) => ({
    key: group.key,
    label: t(messages, group.labelKey),
    items: [
      ...areaItems.filter((item) => group.itemKeys.includes(item.key)),
      // Areas without a mobile group land in the last one instead of disappearing.
      ...(index === MOBILE_MORE_GROUPS.length - 1 ? areaItems.filter((item) => !grouped.has(item.key)) : []),
    ],
  })).filter((group) => group.items.length > 0);

  const needle = normalize(query.trim());
  const matches = (label) => normalize(label).includes(needle);
  const searching = needle.length > 0;
  const foundAreas = searching ? areaItems.filter((item) => matches(item.label)) : [];
  const isDark = theme !== 'light';
  const themeLabel = plannerText(messages, 'dark_mode');
  const layoutVisible = onLayout && (!searching || matches(onLayout.label));
  const themeVisible = !searching || matches(themeLabel);
  const visibleSystemItems = searching ? systemItems.filter((item) => matches(item.label)) : systemItems;
  const nothingFound = searching && !foundAreas.length && !visibleSystemItems.length && !layoutVisible && !themeVisible;

  const ownMember = members.find((m) => m.user_id === me?.user_id) || { display_name: me?.display_name, profile_image: profileImage };
  const currentFamily = families.find((f) => String(f.family_id) === String(familyId));

  const tile = (item) => {
    const hint = hints[item.key];
    const description = [item.badge > 0 ? `${item.label}: ${item.badge}` : null, hint].filter(Boolean).join(', ');
    return (
      <button
        type="button"
        key={item.key}
        className={`ui-bottom-sheet-tile${activeView === item.key ? ' current' : ''}`}
        aria-current={activeView === item.key ? 'page' : undefined}
        aria-description={description || undefined}
        onClick={() => go(item.key)}
      >
        <span className={`ui-bottom-sheet-icon tone-${TONES[item.key] || 'purple'}`}>
          <item.icon size={22} aria-hidden="true" />
          <Badge count={item.badge} />
        </span>
        <strong>{item.label}</strong>
        {hint && <small aria-hidden="true">{hint}</small>}
      </button>
    );
  };

  return (
    <BottomSheet title={plannerText(messages, 'more')} messages={messages} onClose={onClose} className="ui-more-sheet" keepHeight>
      <label className="ui-more-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          enterKeyHint="search"
          value={query}
          placeholder={plannerText(messages, 'find_area')}
          aria-label={plannerText(messages, 'find_area')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (foundAreas.length === 1) go(foundAreas[0].key);
            else if (query.trim()) onSearchAll(query.trim());
          }}
        />
      </label>

      {searching ? (
        foundAreas.length > 0 && <div className="ui-bottom-sheet-grid">{foundAreas.map(tile)}</div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="ui-more-group" aria-labelledby={`ui-more-${group.key}`}>
            <h3 id={`ui-more-${group.key}`}>{group.label}</h3>
            <div className="ui-bottom-sheet-grid">{group.items.map(tile)}</div>
          </section>
        ))
      )}

      {nothingFound && <p className="ui-more-empty">{plannerText(messages, 'no_area')}</p>}

      {(visibleSystemItems.length > 0 || layoutVisible || themeVisible) && (
        <div className="ui-more-system">
          {visibleSystemItems.map((item) => {
            const isNotifications = item.key === 'notifications';
            const count = isNotifications ? notificationCount : item.badge;
            return (
              <button
                type="button"
                key={item.key}
                className={`ui-more-row${isNotifications ? ' wide' : ''}${activeView === item.key ? ' current' : ''}`}
                aria-current={activeView === item.key ? 'page' : undefined}
                aria-description={count > 0 ? (isNotifications ? `${count} ${t(messages, 'notifications_unread')}` : `${item.label}: ${count}`) : undefined}
                onClick={() => {
                  if (!isNotifications) return go(item.key);
                  onClose();
                  onNotifications();
                }}
              >
                <item.icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
                <Badge count={count} />
              </button>
            );
          })}
          {themeVisible && (
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              className="ui-more-row"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              <Moon size={19} aria-hidden="true" />
              <span>{themeLabel}</span>
              <span className={`ui-more-switch${isDark ? ' on' : ''}`} aria-hidden="true" />
            </button>
          )}
          {layoutVisible && (
            <button
              type="button"
              className="ui-more-row mobile-dashboard-layout-btn"
              onClick={() => {
                onClose();
                onLayout.onClick();
              }}
            >
              <LayoutGrid size={19} aria-hidden="true" />
              <span>{onLayout.label}</span>
            </button>
          )}
        </div>
      )}

      {searching && (
        <button type="button" className="ui-more-search-all" onClick={() => onSearchAll(query.trim())}>
          <Search size={16} aria-hidden="true" />
          <span>{plannerText(messages, 'search_everything').replace('{query}', query.trim())}</span>
        </button>
      )}

      {!searching && (
        <div className="ui-more-account">
          <MemberAvatar member={ownMember} size={36} />
          <div className="ui-more-account-text">
            <strong>{me?.display_name}</strong>
            {families.length > 1 ? (
              <select
                aria-label={plannerText(messages, 'family_filter')}
                value={familyId}
                onChange={(e) => app.switchFamily(e.target.value)}
              >
                {families.map((f) => (
                  <option key={f.family_id} value={f.family_id}>
                    {f.family_name}
                  </option>
                ))}
              </select>
            ) : (
              currentFamily && <small>{currentFamily.family_name}</small>
            )}
          </div>
          <button type="button" className="ui-more-logout" onClick={app.logout} aria-label={t(messages, 'aria.logout')}>
            <LogOut size={19} aria-hidden="true" />
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
