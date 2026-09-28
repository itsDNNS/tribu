import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import { OPTIONAL_AREAS, NO_HIDDEN_AREAS } from '../../lib/navigation';
import * as api from '../../lib/api';
import AreaSwitches from './AreaSwitches';

// Settings › Family › Areas: which optional areas the family uses.
export default function AreasTab() {
  const { messages, familyId, hiddenAreas = NO_HIDDEN_AREAS, setHiddenAreas } = useApp();
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(false);

  async function change(next) {
    const ordered = OPTIONAL_AREAS.filter((key) => next.includes(key));
    const previous = hiddenAreas;
    setHiddenAreas(ordered);
    setBusy(true);
    const { ok, data } = await api.apiSetFamilyAreas(familyId, ordered);
    setBusy(false);
    if (!ok) {
      setHiddenAreas(previous);
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
    }
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><LayoutGrid size={16} /> {t(messages, 'settings.areas')}</div>
        <p className="set-nav-desc">{t(messages, 'settings.areas_intro')}</p>
        <AreaSwitches hidden={hiddenAreas} onChange={change} disabled={busy} />
      </div>
    </div>
  );
}
