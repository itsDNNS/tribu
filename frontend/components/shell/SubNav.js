import { useEffect, useRef } from 'react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';

// The pages of the open area on phones (Plan: calendar, meals, recipes …),
// below the header. Wide screens show them in the sidebar.
export default function SubNav({ group, items, activeView, navigate }) {
  const { messages } = useApp();
  const ref = useRef(null);
  // Keep the open page's chip in view.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeView]);
  if (!group || items.length < 2) return null;
  return (
    <nav ref={ref} className="app-subnav" aria-label={t(messages, 'nav.sub_navigation').replace('{group}', group.label)}>
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={`app-subnav-chip${activeView === item.key ? ' active' : ''}`}
          aria-current={activeView === item.key ? 'page' : undefined}
          onClick={() => navigate(item.key)}
        >
          {item.label}
          {item.badge > 0 && <span className="app-subnav-count">{item.badge > 99 ? '99+' : item.badge}</span>}
        </button>
      ))}
    </nav>
  );
}
