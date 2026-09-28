import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import { NAV_ITEM_META, OPTIONAL_AREAS } from '../../lib/navigation';

// One switch per optional area (Tribu 2.0, R4): on shows the area, off
// hides it from navigation, search and "+" for the whole family.
export default function AreaSwitches({ hidden, onChange, disabled = false }) {
  const { messages } = useApp();
  return (
    <ul className="area-switches">
      {OPTIONAL_AREAS.map((key) => {
        const meta = NAV_ITEM_META[key];
        const Icon = meta.icon;
        const label = t(messages, meta.labelKey);
        const shown = !hidden.includes(key);
        return (
          <li key={key} className="area-switch">
            <Icon size={18} aria-hidden="true" />
            <span className="area-switch-label">{label}</span>
            <button
              type="button"
              role="switch"
              className="ms-switch"
              aria-label={label}
              aria-checked={shown}
              disabled={disabled}
              onClick={() => onChange(shown ? [...hidden, key] : hidden.filter((item) => item !== key))}
            >
              <span />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
