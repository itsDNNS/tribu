import { useState, useEffect } from 'react';
import { Navigation, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { useApp, DEFAULT_NAV_ORDER } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import { isNavItemVisible, NAV_GROUPS, NAV_ITEM_META } from '../../lib/navigation';
import * as api from '../../lib/api';

// The order of the areas within each group of the navigation.
function groupedOrder(order, context) {
  const rank = new Map(order.map((key, index) => [key, index]));
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      keys: group.itemKeys
        .filter((key) => key !== group.pinned && isNavItemVisible(key, context))
        .sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999)),
    }))
    .filter((group) => group.keys.length > 1);
}

export default function NavigationTab() {
  const { messages, isAdmin, isChild, demoMode, navOrder, setNavOrder } = useApp();
  const context = { isAdmin, isChild, demoMode };
  const [groups, setGroups] = useState(() => groupedOrder(navOrder, context));
  const [navSaved, setNavSaved] = useState(false);

  useEffect(() => { setGroups(groupedOrder(navOrder, context)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [navOrder, isAdmin, isChild, demoMode]);

  function moveNavItem(groupKey, index, direction) {
    setGroups((current) => current.map((group) => {
      if (group.key !== groupKey) return group;
      const keys = [...group.keys];
      const target = index + direction;
      if (target < 0 || target >= keys.length) return group;
      [keys[index], keys[target]] = [keys[target], keys[index]];
      return { ...group, keys };
    }));
  }

  async function handleSaveNavOrder() {
    const ordered = groups.flatMap((group) => group.keys);
    const fullOrder = [...ordered, ...DEFAULT_NAV_ORDER.filter((key) => !ordered.includes(key))];
    if (demoMode) {
      setNavOrder(fullOrder);
    } else {
      const res = await api.apiUpdateNavOrder(fullOrder);
      if (!res.ok) return;
      setNavOrder(fullOrder);
    }
    setNavSaved(true);
    setTimeout(() => setNavSaved(false), 2000);
  }

  function handleResetNavOrder() {
    setGroups(groupedOrder(DEFAULT_NAV_ORDER, context));
    if (demoMode) {
      setNavOrder(DEFAULT_NAV_ORDER);
    }
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><Navigation size={16} /> {t(messages, 'nav_order_title')}</div>
        <p className="set-nav-desc">
          {t(messages, 'settings.navigation_desc')}
        </p>
        {groups.map((group) => (
          <div className="set-nav-group" key={group.key} role="group" aria-labelledby={`set-nav-${group.key}`}>
            <div className="set-nav-group-title" id={`set-nav-${group.key}`}>{t(messages, group.labelKey, group.fallback)}</div>
            <div className="set-nav-list">
              {group.keys.map((key, i) => {
                const meta = NAV_ITEM_META[key];
                const Icon = meta.icon;
                const label = t(messages, meta.labelKey);
                return (
                  <div key={key} className="set-nav-item">
                    <Icon size={18} className="set-nav-item-icon" aria-hidden="true" />
                    <span className="set-nav-item-label">{label}</span>
                    <button
                      className="btn-ghost set-nav-btn"
                      onClick={() => moveNavItem(group.key, i, -1)}
                      disabled={i === 0}
                      aria-label={t(messages, 'settings.navigation_up').replace('{name}', label)}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="btn-ghost set-nav-btn"
                      onClick={() => moveNavItem(group.key, i, 1)}
                      disabled={i === group.keys.length - 1}
                      aria-label={t(messages, 'settings.navigation_down').replace('{name}', label)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="set-nav-actions">
          <button className="btn-sm" onClick={handleSaveNavOrder}>
            {navSaved ? <><Check size={14} /> {t(messages, 'nav_saved')}</> : t(messages, 'nav_save')}
          </button>
          <button className="btn-ghost" onClick={handleResetNavOrder}>
            {t(messages, 'nav_reset')}
          </button>
        </div>
      </div>
    </div>
  );
}
