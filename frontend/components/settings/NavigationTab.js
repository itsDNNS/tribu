import { useState, useEffect } from 'react';
import { Navigation, ChevronUp, ChevronDown, Check, CalendarDays, CheckSquare, LayoutDashboard, BookUser, ShoppingCart, Bell, Sparkles } from 'lucide-react';
import { useApp, DEFAULT_NAV_ORDER } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

const NAV_ITEM_META = {
  dashboard: { icon: LayoutDashboard, labelKey: 'dashboard' },
  calendar: { icon: CalendarDays, labelKey: 'calendar' },
  shopping: { icon: ShoppingCart, labelKey: 'module.shopping.name' },
  tasks: { icon: CheckSquare, labelKey: 'module.tasks.name' },
  gifts: { icon: Sparkles, labelKey: 'module.gifts.name', adultOnly: true, hideInDemo: true },
  contacts: { icon: BookUser, labelKey: 'contacts' },
  notifications: { icon: Bell, labelKey: 'notifications' },
};

const PINNED_KEYS = new Set(['settings', 'admin']);

export default function NavigationTab() {
  const { messages, isAdmin, isChild, demoMode, navOrder, setNavOrder } = useApp();
  const filterHidden = (keys) => keys.filter((k) => {
    if (PINNED_KEYS.has(k)) return false;
    const meta = NAV_ITEM_META[k];
    if (!meta) return true;
    if (meta.adultOnly && isChild) return false;
    if (meta.hideInDemo && demoMode) return false;
    return true;
  });
  const [localNavOrder, setLocalNavOrder] = useState(() => filterHidden(navOrder));
  const [navSaved, setNavSaved] = useState(false);

  useEffect(() => { setLocalNavOrder(filterHidden(navOrder)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [navOrder, isChild, demoMode]);

  function moveNavItem(index, direction) {
    const newOrder = [...localNavOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setLocalNavOrder(newOrder);
  }

  async function handleSaveNavOrder() {
    const fullOrder = [...localNavOrder, 'settings', ...(isAdmin ? ['admin'] : [])];
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
    setLocalNavOrder(filterHidden(DEFAULT_NAV_ORDER));
    if (demoMode) {
      setNavOrder(DEFAULT_NAV_ORDER);
    }
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><Navigation size={16} /> {t(messages, 'nav_order_title')}</div>
        <p className="set-nav-desc">
          {t(messages, 'nav_order_desc')}
        </p>
        <div className="set-nav-list">
          {localNavOrder.map((key, i) => {
            const meta = NAV_ITEM_META[key];
            if (!meta) return null;
            if (key === 'admin' && !isAdmin) return null;
            const Icon = meta.icon;
            const isVisible = localNavOrder.length > 5 ? i < 4 : i < 5;
            return (
              <div
                key={key}
                className="set-nav-item"
                style={{
                  borderLeft: `3px solid ${isVisible ? 'var(--amethyst)' : 'transparent'}`,
                  background: isVisible ? 'rgba(124, 58, 237, 0.04)' : 'transparent',
                }}
              >
                <Icon size={18} className="set-nav-item-icon" aria-hidden="true" />
                <span className="set-nav-item-label">{t(messages, meta.labelKey)}</span>
                <span className="set-nav-item-badge">
                  {isVisible ? t(messages, 'nav_visible') : t(messages, 'nav_overflow')}
                </span>
                <button
                  className="btn-ghost set-nav-btn"
                  onClick={() => moveNavItem(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${t(messages, meta.labelKey)} up`}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="btn-ghost set-nav-btn"
                  onClick={() => moveNavItem(i, 1)}
                  disabled={i === localNavOrder.length - 1}
                  aria-label={`Move ${t(messages, meta.labelKey)} down`}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            );
          })}
        </div>
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
