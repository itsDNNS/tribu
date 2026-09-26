import { useCallback, useState } from 'react';
import { apiCreateQuickCapture } from '../lib/api';

// Saves quick-capture text to a destination and refreshes the data that destination affects.
export function useQuickCapture({ familyId, loadQuickCaptureInbox, loadTasks, loadShoppingLists, loadActivity }) {
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (destination) => {
    await Promise.allSettled([
      loadQuickCaptureInbox?.(familyId),
      destination === 'task' ? loadTasks?.(familyId) : Promise.resolve(),
      destination === 'shopping' ? loadShoppingLists?.(familyId) : Promise.resolve(),
      destination !== 'inbox' ? loadActivity?.(familyId) : Promise.resolve(),
    ]);
  }, [familyId, loadQuickCaptureInbox, loadTasks, loadShoppingLists, loadActivity]);

  // onSaved runs before the refresh so the input can clear immediately.
  const capture = useCallback(async (text, destination, onSaved) => {
    setBusy(true);
    try {
      const result = await apiCreateQuickCapture({ family_id: familyId, text, destination });
      if (result.ok) {
        onSaved?.();
        await refresh(destination);
      }
      return result.ok;
    } finally {
      setBusy(false);
    }
  }, [familyId, refresh]);

  return { busy, capture, refresh };
}
