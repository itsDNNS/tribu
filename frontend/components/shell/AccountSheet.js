import { LogOut, Moon } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import MemberAvatar from '../MemberAvatar';
import BottomSheet from '../responsive/BottomSheet';
import { plannerText } from '../responsive/PlannerUI';

// Behind the avatar (Tribu 2.0, R2): who is signed in, the family, settings,
// admin, dark mode and signing out.
export default function AccountSheet({ items, activeView, navigate, onClose }) {
  const app = useApp();
  const { messages, theme, setTheme, me, members = [], profileImage, families = [], familyId, logout } = app;
  const own = members.find((member) => member.user_id === me?.user_id)
    || { display_name: me?.display_name, profile_image: profileImage };
  const currentFamily = families.find((family) => String(family.family_id) === String(familyId));
  const isDark = theme !== 'light';

  return (
    <BottomSheet title={t(messages, 'nav.account_menu')} messages={messages} onClose={onClose} className="account-sheet">
      <div className="ui-more-account account-sheet-person">
        <MemberAvatar member={own} size={40} />
        <div className="ui-more-account-text">
          <strong>{me?.display_name}</strong>
          {families.length > 1 ? (
            <select
              aria-label={plannerText(messages, 'family_filter')}
              value={familyId}
              onChange={(event) => app.switchFamily(event.target.value)}
            >
              {families.map((family) => (
                <option key={family.family_id} value={family.family_id}>{family.family_name}</option>
              ))}
            </select>
          ) : (
            currentFamily && <small>{currentFamily.family_name}</small>
          )}
        </div>
      </div>

      <div className="ui-more-system">
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`ui-more-row${activeView === item.key ? ' current' : ''}`}
            aria-current={activeView === item.key ? 'page' : undefined}
            onClick={() => {
              onClose();
              navigate(item.key);
            }}
          >
            <item.icon size={19} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
        {typeof setTheme === 'function' && (
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            className="ui-more-row"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            <Moon size={19} aria-hidden="true" />
            <span>{plannerText(messages, 'dark_mode')}</span>
            <span className={`ui-more-switch${isDark ? ' on' : ''}`} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="ui-more-row" onClick={logout}>
          <LogOut size={19} aria-hidden="true" />
          <span>{t(messages, 'aria.logout')}</span>
        </button>
      </div>
    </BottomSheet>
  );
}
