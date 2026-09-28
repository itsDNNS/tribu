import { CalendarDays, ListChecks, Plus, Sun, Users } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useVisualViewport } from '../../hooks/useResponsiveUI';
import { t } from '../../lib/i18n';
import { navKeyOf } from '../../lib/navigation';
import { plannerText } from './PlannerUI';
import AccountSheet from '../shell/AccountSheet';
import NewSheet from './NewSheet';
import SuggestSheet from './SuggestSheet';

function MobileBadge({ count }) {
  return count > 0 ? (
    <span className="ui-count-badge" aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  ) : null;
}

const TAB_ICONS = { today: Sun, plan: CalendarDays, lists: ListChecks, family: Users };

// The phone's tab bar (Tribu 2.0, R1): Today · Plan · + · Lists · Family,
// plus the sheets it and the header open. Children's "+" suggests (E5).
export default function ResponsiveUI({
  groups,
  openGroup,
  accountItems,
  navigate,
  onCreate,
  sheet,
  setSheet,
  createKind = null,
}) {
  const app = useApp();
  const { activeView, messages, isChild } = app;
  useVisualViewport();
  const tabs = [
    ...groups.slice(0, 2).map((group) => ({ group })),
    { key: 'new' },
    ...groups.slice(2).map((group) => ({ group })),
  ];
  return (
    <>
      <nav
        hidden={!app.isMobile}
        className="bottom-nav ui-bottom-nav"
        aria-label={t(messages, 'aria.bottom_navigation')}
      >
        {tabs.map(({ key, group }) => {
          if (key === 'new') {
            const name = plannerText(messages, 'new');
            return (
              <button
                type="button"
                key="new"
                className={`ui-nav-button ui-nav-new${sheet === 'new' ? ' active' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={sheet === 'new'}
                onClick={() => setSheet('new')}
              >
                <span className="ui-nav-plus"><Plus size={21} /></span>
                <span>{name}</span>
              </button>
            );
          }
          const Icon = TAB_ICONS[group.key] || Sun;
          const current = group.items.some((item) => item.key === navKeyOf(activeView));
          const count = group.items.reduce((sum, item) => sum + (item.key === 'shopping' ? item.badge || 0 : 0), 0);
          return (
            <button
              type="button"
              key={group.key}
              className={`ui-nav-button${current ? ' active' : ''}`}
              aria-current={current ? 'page' : undefined}
              aria-description={count > 0 ? `${group.items.find((item) => item.key === 'shopping')?.label}: ${count}` : undefined}
              onClick={() => openGroup(group)}
            >
              <span className="ui-nav-icon">
                <Icon size={21} />
                <MobileBadge count={count} />
              </span>
              <span>{group.label}</span>
            </button>
          );
        })}
      </nav>
      {sheet === 'account' && (
        <AccountSheet
          items={accountItems}
          activeView={activeView}
          navigate={navigate}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'new' && isChild && <SuggestSheet onClose={() => setSheet(null)} />}
      {sheet === 'new' && !isChild && (
        <NewSheet
          onClose={() => setSheet(null)}
          onCreate={onCreate}
          defaultKind={createKind || { shopping: 'shopping', calendar: 'event' }[activeView] || 'task'}
        />
      )}
    </>
  );
}
