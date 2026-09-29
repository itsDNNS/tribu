import { useCallback, useState } from 'react';
import * as api from '../lib/api';
import { catalogProduct } from '../components/shopping/catalog';

// Creates what the capture sheet recognised (lib/capture/parseCapture.js):
// events, tasks, shopping items and notes, then refreshes what changed.
export function useCaptureCreate({
  familyId, lang, shoppingLists = [], loadTasks, loadEvents, loadDashboard, loadShoppingLists, loadQuickCaptureInbox, loadActivity,
}) {
  const [busy, setBusy] = useState(false);

  const createOne = useCallback(async (entry) => {
    const family_id = Number(familyId);
    const date = entry.date || null;
    if (entry.kind === 'event') {
      const day = date || new Date().toLocaleDateString('en-CA');
      const timed = Boolean(entry.time);
      return api.apiCreateEvent({
        family_id,
        title: entry.title,
        starts_at: `${day}T${timed ? entry.time : '00:00'}:00`,
        ends_at: timed ? `${day}T${entry.endTime || entry.time}:00` : null,
        all_day: !timed,
        recurrence: entry.recurrence || null,
        assigned_to: entry.assignees?.length ? entry.assignees : null,
      });
    }
    if (entry.kind === 'task') {
      return api.apiCreateTask({
        family_id,
        title: entry.title,
        priority: 'normal',
        due_date: date ? `${date}T${entry.time || '00:00'}:00` : null,
        due_is_date: Boolean(date) && !entry.time,
        recurrence: entry.recurrence || null,
        assigned_to_user_id: entry.assignees?.[0] ?? null,
      });
    }
    if (entry.kind === 'shopping') {
      const list = shoppingLists[0];
      const product = catalogProduct(entry.title, lang);
      if (!list) {
        return api.apiCreateQuickCapture({ family_id, text: entry.text || entry.title, destination: 'shopping' });
      }
      return api.apiAddShoppingItem(list.id, {
        name: product?.name || entry.title,
        spec: entry.spec || `${product?.qty || 1}${product?.unit ? ` ${product.unit}` : ''}`,
        category: product?.category || 'Sonstiges',
      });
    }
    return api.apiCreateQuickCapture({ family_id, text: entry.text || entry.title, destination: 'inbox' });
  }, [familyId, lang, shoppingLists]);

  // Answers how many entries were created and which ones failed.
  const create = useCallback(async (entries) => {
    setBusy(true);
    try {
      const results = await Promise.all(entries.map((entry) => createOne(entry).then((r) => Boolean(r?.ok)).catch(() => false)));
      const kinds = new Set(entries.filter((_, index) => results[index]).map((entry) => entry.kind));
      await Promise.allSettled([
        kinds.has('task') ? loadTasks?.(familyId) : null,
        kinds.has('event') ? loadEvents?.(familyId) : null,
        kinds.has('shopping') ? loadShoppingLists?.(familyId) : null,
        kinds.has('note') ? loadQuickCaptureInbox?.(familyId) : null,
        kinds.size ? loadDashboard?.(familyId) : null,
        kinds.size ? loadActivity?.(familyId) : null,
      ]);
      return {
        created: results.filter(Boolean).length,
        failed: entries.filter((_, index) => !results[index]),
      };
    } finally {
      setBusy(false);
    }
  }, [createOne, familyId, loadTasks, loadEvents, loadShoppingLists, loadQuickCaptureInbox, loadDashboard, loadActivity]);

  return { busy, create };
}
