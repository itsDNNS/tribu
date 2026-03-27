import { useState, useEffect } from 'react';
import { Navigation, ChevronUp, ChevronDown, Check, CalendarDays, CheckSquare, LayoutDashboard, BookUser, ShoppingCart, Bell } from 'lucide-react';
import { useApp, DEFAULT_NAV_ORDER } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

const NAV_ITEM_META = {
  dashboard: { icon: LayoutDashboard, labelKey: 'dashboard' },
  calendar: { icon: CalendarDays, labelKey: 'calendar' },
  shopping: { icon: ShoppingCart, labelKey: 'module.shopping.name' },
  tasks: { icon: CheckSquare, labelKey: 'module.tasks.name' },
  contacts: { icon: BookUser, labelKey: 'contacts' },
  notifications: { icon: Bell, labelKey: 'notifications' },
};

const PINNED_KEYS = new Set(['settings', 'admin']);

export default function NavigationTab() {
  const { messages, isAdmin, demoMode, navOrder, setNavOrder } = useApp();
  const [localNavOrder, setLocalNavOrder] = useState(() => navOrder.filter(k => !PINNED_KEYS.has(k)));
  const [navSaved, setNavSaved] = useState(false);

  useEffect(() => { setLocalNavOrder(navOrder.filter(k => !PINNED_KEYS.has(k))); }, [navOrder]);

  function moveNavItem(index, direction) {
    const newOrder = [...localNavOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setLocalNavOrder(newOrder);
  }

  async function handleSaveNavOrder() {
    const fullOrder = [...localNavOrder, 'settings', 'admin'];
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
    const sortable = DEFAULT_NAV_ORDER.filter(k => !PINNED_KEYS.has(k));
    setLocalNavOrder(sortable);
    if (demoMode) {
      setNavOrder(DEFAULT_NAV_ORDER);
    }
  }

  return (
    <div className="settings-grid stagger">
      <div className="settings-section glass">
        <div className="settings-section-title"><Navigation size={16} /> {t(messages, 'nav_order_title')}</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
          {t(messages, 'nav_order_desc')}
        </p>
        <div style={{ display: 'grid', gap: '2px' }}>
          {localNavOrder.map((key, i) => {
            const meta = NAV_ITEM_META[key];
            if (!meta) return null;
            if (key === 'admin' && !isAdmin) return null;
            const Icon = meta.icon;
            const isVisible = localNavOrder.length > 5 ? i < 4 : i < 5;
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${isVisible ? 'var(--amethyst)' : 'transparent'}`,
                  background: isVisible ? 'rgba(124, 58, 237, 0.04)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{t(messages, meta.labelKey)}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                  {isVisible ? t(messages, 'nav_visible') : t(messages, 'nav_overflow')}
                </span>
                <button
                  className="btn-ghost"
                  style={{ padding: '4px 6px', minHeight: 32, border: 'none', background: 'none' }}
                  onClick={() => moveNavItem(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${t(messages, meta.labelKey)} up`}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="btn-ghost"
                  style={{ padding: '4px 6px', minHeight: 32, border: 'none', background: 'none' }}
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
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
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
