import { useEffect, useState } from 'react';
import { Hand } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';

const STORAGE_KEY = 'tribu_seen_hints';

function seenHints() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function markHintSeen(id) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...seenHints(), id])]));
  } catch { /* private mode */ }
}

// A tip shown once per device until someone closes it, for gestures that are
// easy to miss (Tribu 2.0, L7/D7). `touchOnly` keeps swipe tips away from
// mouse users, who get hover menus instead.
export default function OnceHint({ id, text, touchOnly = false }) {
  const { messages } = useApp();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    setVisible(!seenHints().includes(id) && (!touchOnly || touch));
  }, [id, touchOnly]);
  if (!visible) return null;
  return (
    <div className="once-hint" role="note">
      <Hand size={18} aria-hidden="true" />
      <p>{text}</p>
      <button
        type="button"
        onClick={() => {
          markHintSeen(id);
          setVisible(false);
        }}
      >
        {t(messages, 'module.hints.got_it')}
      </button>
    </div>
  );
}
