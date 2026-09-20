import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';
import { useWebSocket } from './useWebSocket';
import { compareCheckedItems } from '../lib/shoppingPresentation';

export function formatShoppingItemName(value) {
  const cleaned = value.trim();
  if (!cleaned) return cleaned;
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function cleanOptionalText(value) {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function caseFold(value) {
  return value.trim().normalize('NFKC').toLocaleLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ');
}

function sameItemName(left, right) {
  return caseFold(left) === caseFold(right);
}

function parseQuantity(value) {
  const cleaned = cleanOptionalText(value);
  if (cleaned == null) return null;
  const match = cleaned.match(/^((?:\d+(?:[.,]\d+)?|[.,]\d+))\s*([^\d.,].*)?$/u);
  if (!match) return null;
  const amount = match[1].replace(',', '.');
  const [whole, fraction = ''] = amount.split('.');
  const unit = cleanOptionalText(match[2]);
  return {
    coefficient: BigInt(`${whole || '0'}${fraction}`),
    scale: fraction.length,
    unit: unit == null ? null : caseFold(unit.replace(/\s+/g, ' ')),
    displayUnit: unit == null ? null : unit.replace(/\s+/g, ' '),
  };
}

function formatQuantity(quantity, displayUnit = quantity.displayUnit) {
  let digits = quantity.coefficient.toString();
  if (quantity.scale) {
    digits = digits.padStart(quantity.scale + 1, '0');
    digits = `${digits.slice(0, -quantity.scale)}.${digits.slice(-quantity.scale)}`;
    digits = digits.replace(/0+$/, '').replace(/\.$/, '');
  }
  return displayUnit ? `${digits} ${displayUnit}` : digits;
}

function normalizeSpec(value) {
  const cleaned = cleanOptionalText(value);
  const quantity = parseQuantity(cleaned);
  return quantity ? formatQuantity(quantity) : cleaned;
}

export function shoppingSpecsAreCompatible(left, right) {
  const leftClean = cleanOptionalText(left);
  const rightClean = cleanOptionalText(right);
  if (leftClean == null || rightClean == null) return true;
  const leftQuantity = parseQuantity(leftClean);
  const rightQuantity = parseQuantity(rightClean);
  if (leftQuantity || rightQuantity) {
    return Boolean(leftQuantity && rightQuantity && leftQuantity.unit === rightQuantity.unit);
  }
  return caseFold(leftClean) === caseFold(rightClean);
}

function mergeActiveSpec(existing, incoming) {
  const existingClean = cleanOptionalText(existing);
  const incomingClean = cleanOptionalText(incoming);
  if (existingClean == null) return normalizeSpec(incomingClean);
  if (incomingClean == null) return existingClean;
  const left = parseQuantity(existingClean);
  const right = parseQuantity(incomingClean);
  if (!left || !right) return existingClean;
  const scale = Math.max(left.scale, right.scale);
  const coefficient = (
    left.coefficient * (10n ** BigInt(scale - left.scale))
    + right.coefficient * (10n ** BigInt(scale - right.scale))
  );
  return formatQuantity({ ...left, coefficient, scale }, left.displayUnit || right.displayUnit);
}

export function findReusableCheckedItem(items, payload) {
  const itemName = formatShoppingItemName(payload.name);
  const itemSpec = cleanOptionalText(payload.spec);
  return items.find((item) => (
    item.checked && !item.archived
    && sameItemName(item.name, itemName)
    && shoppingSpecsAreCompatible(item.spec, itemSpec)
  )) || null;
}

export function predictShoppingItemTransition(items, payload) {
  const itemName = formatShoppingItemName(payload.name);
  const itemSpec = cleanOptionalText(payload.spec);
  const candidates = [...items.filter((item) => !item.checked && !item.archived), ...items.filter((item) => item.checked && !item.archived)];
  const item = candidates.find((candidate) => (
    sameItemName(candidate.name, itemName)
    && shoppingSpecsAreCompatible(candidate.spec, itemSpec)
  ));
  if (!item) return null;
  return {
    item,
    action: item.checked ? 'restored' : 'merged',
    spec: item.checked
      ? (itemSpec == null ? cleanOptionalText(item.spec) : normalizeSpec(itemSpec))
      : mergeActiveSpec(item.spec, itemSpec),
  };
}

export function useShopping() {
  const {
    shoppingLists, setShoppingLists, familyId, messages,
    demoMode, isMobile, isChild, me,
  } = useApp();
  const { error: toastError } = useToast();

  const [activeListId, setActiveListId] = useState(null);
  const [items, setItems] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSpec, setNewItemSpec] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [showCreateList, setShowCreateList] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [storeLinks, setStoreLinks] = useState([]);
  const itemInputRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [undoState, setUndoState] = useState(null);
  const [pendingItemIds, setPendingItemIds] = useState(new Set());
  const pending = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const scope = useRef(null);
  const itemsRef = useRef(items);
  const revision = useRef(0);
  const readSequence = useRef(0);
  const listReadSequence = useRef(0);
  if (!scope.current || scope.current.familyId !== familyId || scope.current.listId !== activeListId || scope.current.userId !== me?.id) {
    scope.current = { familyId, listId: activeListId, userId: me?.id };
  }
  itemsRef.current = items;
  const currentScope = scope.current;
  const isCurrent = useCallback(() => mounted.current && scope.current === currentScope, [currentScope]);
  const sameStatus = (item, expected) => item && !item.archived && item.list_id === expected.list_id
    && item.checked === expected.checked && (item.checked_at || null) === (expected.checked_at || null);
  const undo = undoState?.scope === currentScope && sameStatus(items.find((item) => item.id === undoState.id), undoState)
    ? undoState : null;

  const loadShoppingLists = useCallback(async () => {
    if (!familyId || demoMode || !isCurrent()) return;
    const requestScope = scope.current;
    const sequence = ++listReadSequence.current;
    const version = revision.current;
    const { ok, data } = await api.apiGetShoppingLists(familyId);
    if (ok && isCurrent() && scope.current === requestScope && listReadSequence.current === sequence && revision.current === version) setShoppingLists(data);
  }, [familyId, demoMode, setShoppingLists, isCurrent]);

  useEffect(() => {
    setUndoState(null);
    pending.current.clear();
    setPendingItemIds(new Set());
    setItems([]);
    setNewListName('');
    setNewItemName('');
    setNewItemSpec('');
    setNewItemCategory('');
    setShowCreateList(false);
  }, [familyId, activeListId, me?.id]);

  useEffect(() => { setCategories([]); }, [familyId]);

  useEffect(() => {
    if (!undoState) return;
    const timer = setTimeout(() => setUndoState(null), 6000);
    return () => clearTimeout(timer);
  }, [undoState]);

  useEffect(() => {
    let cancelled = false;
    if (!familyId || demoMode) { setCategories([]); return; }
    api.apiGetShoppingCategories(familyId).then(({ ok, data }) => {
      if (!cancelled && ok) setCategories(data);
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode, shoppingLists, templates]);


  const handleWsMessage = useCallback((msg) => {
    if (!isCurrent()) return;
    if (msg.list && Number(msg.list.family_id) !== Number(familyId)) return;
    if (msg.item && msg.item.list_id !== scope.current.listId) return;
    revision.current += 1;
    const operation = pending.current.get(msg.item?.id || msg.item_id);
    if (operation) {
      if (msg.type === 'item_updated') operation.observed = msg.item;
      if (msg.type === 'item_deleted') operation.deleted = true;
    }
    if (msg.type === 'items_cleared') pending.current.forEach((entry) => { entry.invalidated = true; });
    setUndoState((previous) => {
      if (!previous) return null;
      if (msg.type === 'items_cleared' || (msg.type === 'item_deleted' && msg.item_id === previous.id)) return null;
      if (msg.type === 'item_updated' && msg.item.id === previous.id && !sameStatus(msg.item, previous)) return null;
      return previous;
    });
    switch (msg.type) {
      case 'item_added':
        setItems((prev) => {
          if (prev.some((i) => i.id === msg.item.id)) return prev;
          return [...prev, msg.item];
        });
        setShoppingLists((prev) =>
          prev.map((l) => l.id === msg.item.list_id
            ? {
                ...l,
                item_count: (l.item_count || 0) + 1,
                checked_count: (l.checked_count || 0) + (msg.item.checked ? 1 : 0),
              }
            : l
          ),
        );
        break;

      case 'item_updated':
        setItems((prev) => prev.map((i) => i.id === msg.item.id ? msg.item : i));
        setShoppingLists((prev) =>
          prev.map((l) => {
            if (l.id !== msg.item.list_id) return l;
            return l;
          }),
        );
        loadShoppingLists();
        break;

      case 'item_deleted':
        setItems((prev) => {
          const item = prev.find((i) => i.id === msg.item_id);
          if (!item) return prev;
          return prev.filter((i) => i.id !== msg.item_id);
        });
        loadShoppingLists();
        break;

      case 'items_cleared':
        setItems((prev) => prev.filter((i) => !i.checked || i.archived));
        loadShoppingLists();
        break;

      case 'list_created':
        setShoppingLists((prev) => {
          if (prev.some((l) => l.id === msg.list.id)) return prev;
          return [...prev, msg.list];
        });
        break;

      case 'list_updated':
        setShoppingLists((prev) => prev.map((l) => l.id === msg.list.id ? msg.list : l));
        break;

      case 'list_deleted':
        setShoppingLists((prev) => prev.filter((l) => l.id !== msg.list_id));
        break;
    }
  }, [setShoppingLists, loadShoppingLists, isCurrent, familyId]);

  const { connected: wsConnected } = useWebSocket(activeListId, {
    onMessage: handleWsMessage,
    enabled: !demoMode && !!activeListId,
  });


  useEffect(() => {
    if (shoppingLists.length > 0 && !shoppingLists.find((l) => l.id === activeListId)) {
      setActiveListId(shoppingLists[0].id);
    }
    if (shoppingLists.length === 0) {
      setActiveListId(null);
      setItems([]);
    }
  }, [shoppingLists, activeListId]);

  useEffect(() => {
    let cancelled = false;
    setTemplates([]);
    if (!familyId || demoMode) return;
    api.apiGetShoppingTemplates(familyId).then(({ ok, data }) => {
      if (!cancelled && ok) setTemplates(data);
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode]);

  useEffect(() => {
    let cancelled = false;
    setStoreLinks([]);
    if (!familyId || demoMode || isChild) return;
    api.apiGetShoppingStoreLinks(familyId).then(({ ok, data }) => {
      if (!cancelled && ok) setStoreLinks(data || []);
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode, isChild]);

  const loadTemplates = useCallback(async () => {
    if (!familyId || demoMode || !isCurrent()) return;
    const { ok, data } = await api.apiGetShoppingTemplates(familyId);
    if (ok && isCurrent()) setTemplates(data);
  }, [familyId, demoMode, isCurrent]);

  useEffect(() => {
    let cancelled = false;
    const requestScope = scope.current;
    const version = revision.current;
    const sequence = ++readSequence.current;
    const selectedList = shoppingLists.find((list) => list.id === activeListId);
    if (!activeListId || (selectedList?.family_id != null && Number(selectedList.family_id) !== Number(familyId))) {
      setItems([]);
      return;
    }
    if (demoMode) {
      const list = shoppingLists.find((l) => l.id === activeListId);
      if (list?.items) setItems(list.items);
      return;
    }
    api.apiGetShoppingItems(activeListId, true).then(({ ok, data }) => {
      if (!cancelled && ok && mounted.current && scope.current === requestScope && revision.current === version && readSequence.current === sequence) {
        setItems(data);
        setUndoState((previous) => previous && sameStatus(data.find((item) => item.id === previous.id), previous) ? previous : null);
      }
    });
    return () => { cancelled = true; };
  }, [activeListId, familyId, demoMode, shoppingLists]);

  const activeList = useMemo(
    () => shoppingLists.find((l) => l.id === activeListId) || null,
    [shoppingLists, activeListId],
  );

  const uncheckedItems = useMemo(() => items.filter((i) => !i.checked && !i.archived), [items]);
  const checkedItems = useMemo(() => items.filter((i) => i.checked && !i.archived).sort(compareCheckedItems), [items]);

  const reloadItems = useCallback(async () => {
    if (!activeListId || demoMode || !isCurrent()) return;
    const requestScope = scope.current;
    const version = revision.current;
    const sequence = ++readSequence.current;
    const { ok, data } = await api.apiGetShoppingItems(activeListId, true);
    if (ok && mounted.current && scope.current === requestScope && revision.current === version && readSequence.current === sequence) {
      setItems(data);
      setUndoState((previous) => previous && sameStatus(data.find((item) => item.id === previous.id), previous) ? previous : null);
    }
  }, [activeListId, demoMode, isCurrent]);


  async function createList(e) {
    if (!isCurrent() || isChild) return false;
    e.preventDefault();
    if (!newListName.trim()) return;
    if (demoMode) {
      const newList = {
        id: Date.now(),
        family_id: Number(familyId),
        name: newListName.trim(),
        created_by_user_id: 1,
        created_at: new Date().toISOString(),
        item_count: 0,
        checked_count: 0,
        items: [],
      };
      setShoppingLists((prev) => [...prev, newList]);
      setActiveListId(newList.id);
    } else {
      const { ok, data } = await api.apiCreateShoppingList({ family_id: Number(familyId), name: newListName.trim() });
      if (!isCurrent()) return false;
      if (!ok) { toastError(t(messages, 'toast.error')); return false; }
      setShoppingLists((prev) => {
        if (prev.some((l) => l.id === data.id)) return prev;
        return [...prev, data];
      });
      setActiveListId(data.id);
    }
    setNewListName('');
    setShowCreateList(false);
    return true;
  }

  async function renameList(id, name) {
    if (!isCurrent() || isChild) return false;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (demoMode) {
      setShoppingLists(prev => prev.map(list => list.id === id ? {...list, name:trimmedName} : list));
      return true;
    }
    const { ok, data } = await api.apiUpdateShoppingList(id, { name: trimmedName });
    if (!isCurrent()) return false;
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      await loadShoppingLists();
      return;
    }
    setShoppingLists((prev) => prev.map((l) => l.id === id ? { ...l, ...data } : l));
  }

  async function deleteList(id) {
    if (!isCurrent() || isChild) return false;
    if (demoMode) {
      setShoppingLists((prev) => prev.filter((l) => l.id !== id));
    } else {
      const { ok } = await api.apiDeleteShoppingList(id);
      if (!isCurrent()) return false;
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        return false;
      }
      setShoppingLists(prev => prev.filter(list => list.id !== id));
    }
    return true;
  }


  async function addItem(e, draft) {
    if (!isCurrent() || isChild) return false;
    e.preventDefault();
    if (!(draft?.name ?? newItemName).trim() || !activeListId) return false;
    const payload = {
      name: formatShoppingItemName(draft?.name ?? newItemName),
      spec: cleanOptionalText(draft?.spec ?? newItemSpec),
      category: cleanOptionalText(draft?.category ?? newItemCategory),
      ...Object.fromEntries(["notes", "photo", "priority"].filter(key => draft && key in draft).map(key => [key, draft[key]])),
    };
    const targetId = Number(draft?.list_id || activeListId);
    if (targetId !== Number(activeListId)) {
      if (!shoppingLists.some(list => Number(list.id) === targetId)) return false;
      if (demoMode) {
        const target = shoppingLists.find(list => Number(list.id) === targetId);
        const transition = predictShoppingItemTransition(target.items || [], payload);
        const entry = {...(transition?.item || {}), ...payload, id:transition?.item.id || Date.now(),
          list_id:targetId, spec:transition?.spec || payload.spec, checked:false, archived:false, checked_at:null,
          created_at:transition?.item.created_at || new Date().toISOString()};
        const nextItems = transition ? target.items.map(item => item.id === entry.id ? entry : item) : [...(target.items || []), entry];
        setShoppingLists(previous => previous.map(list => Number(list.id) === targetId ? {...list,items:nextItems,
          item_count:nextItems.filter(item=>!item.archived).length,checked_count:nextItems.filter(item=>item.checked&&!item.archived).length} : list));
        return true;
      }
      const {ok} = await api.apiAddShoppingItem(targetId, payload);
      if (!isCurrent()) return false;
      if (!ok) { toastError(t(messages, 'toast.error')); return false; }
      await loadShoppingLists();
      return true;
    }
    const predictedTransition = predictShoppingItemTransition(items, payload);
    if (demoMode) {
      if (predictedTransition) {
        const mergedPayload = {
          ...payload,
          name: payload.name,
          spec: predictedTransition.spec,
          category: payload.category || predictedTransition.item.category || null,
          checked: false,
          archived: false,
          checked_at: null,
        };
        setItems((prev) => prev.map((item) => item.id === predictedTransition.item.id
          ? { ...item, ...mergedPayload }
          : item));
        setShoppingLists((prev) =>
          prev.map((l) => l.id === activeListId
            ? {
                ...l,
                item_count: (l.item_count || 0) + (predictedTransition.item.archived ? 1 : 0),
                checked_count: predictedTransition.action === 'restored' && !predictedTransition.item.archived
                  ? Math.max((l.checked_count || 0) - 1, 0)
                  : (l.checked_count || 0),
                items: (l.items || []).map((item) => item.id === predictedTransition.item.id
                  ? { ...item, ...mergedPayload }
                  : item),
              }
            : l
          ),
        );
      } else {
        const newItem = {
          id: Date.now(),
          list_id: activeListId,
          ...payload,
          spec: normalizeSpec(payload.spec),
          checked: false,
          checked_at: null,
          added_by_user_id: 1,
          created_at: new Date().toISOString(),
        };
        setItems((prev) => [...prev, newItem]);
        setShoppingLists((prev) =>
          prev.map((l) => l.id === activeListId
            ? { ...l, item_count: l.item_count + 1, items: [...(l.items || []), newItem] }
            : l
          ),
        );
      }
    } else {
      const { ok } = await api.apiAddShoppingItem(activeListId, payload);
      if (!isCurrent()) return false;
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        await reloadItems();
        await loadShoppingLists();
        return false;
      } else {
        await reloadItems();
        await loadShoppingLists();
      }
    }
    if (!isCurrent()) return false;
    setNewItemName('');
    setNewItemSpec('');
    setNewItemCategory('');
    if (!isMobile) itemInputRef.current?.focus();
    return true;
  }

  async function changeChecked(item, checked, offerUndo) {
    const requestScope = scope.current;
    if (!isCurrent() || item.archived || pending.current.has(item.id) || item.list_id !== requestScope.listId) return;
    const operation = { scope: requestScope };
    pending.current.set(item.id, operation);
    setPendingItemIds(new Set(pending.current.keys()));
    setUndoState(null);
    revision.current += 1;
    const optimistic = { ...item, checked, checked_at: checked ? new Date().toISOString() : null };
    setItems((previous) => previous.map((entry) => entry.id === item.id ? optimistic : entry));
    try {
      const result = await (demoMode ? { ok: true, data: optimistic } : api.apiUpdateShoppingItem(item.id, {
        checked,
        expected_state: { list_id: item.list_id, checked: item.checked, checked_at: item.checked_at || null },
      }));
      if (!mounted.current || scope.current !== requestScope) return;
      if (!result.ok) throw new Error('Status update failed');
      const confirmed = operation.observed || result.data;
      if (!operation.deleted && !operation.invalidated) {
        setItems((previous) => previous.map((entry) => entry.id === item.id ? confirmed : entry));
        if (offerUndo && sameStatus(confirmed, result.data)) {
          setUndoState({ ...confirmed, scope: requestScope });
        }
      }
      if (demoMode) {
        setShoppingLists((previous) => previous.map((list) => list.id === requestScope.listId ? {
          ...list,
          checked_count: (list.checked_count || 0) + (checked ? 1 : -1),
          items: (list.items || []).map((entry) => entry.id === item.id ? confirmed : entry),
        } : list));
      }
    } catch {
      if (!mounted.current || scope.current !== requestScope) return;
      toastError(t(messages, 'toast.error'));
      setItems((previous) => previous.map((entry) => entry.id === item.id ? (operation.observed || item) : entry));
    } finally {
      if (pending.current.get(item.id) === operation) pending.current.delete(item.id);
      if (mounted.current && scope.current === requestScope) {
        setPendingItemIds(new Set(pending.current.keys()));
        if (!demoMode) {
          try {
            await reloadItems();
            if (mounted.current && scope.current === requestScope) await loadShoppingLists();
          } catch {
            if (mounted.current && scope.current === requestScope) toastError(t(messages, 'toast.error'));
          }
        }
      }
    }
  }

  async function toggleItem(id, currentChecked) {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item || item.checked !== currentChecked) return;
    return changeChecked(item, !currentChecked, true);
  }

  async function undoToggle() {
    if (!undo || undo.scope !== scope.current) return;
    const item = itemsRef.current.find((entry) => entry.id === undo.id);
    if (!sameStatus(item, undo)) { setUndoState(null); return; }
    return changeChecked(item, !undo.checked, false);
  }

  async function editItem(id, payload) {
    if (!isCurrent() || isChild) return false;
    const itemName = 'name' in payload ? formatShoppingItemName(payload.name || '') : undefined;
    if ('name' in payload && !itemName) return false;
    const targetId = Number(payload.list_id);
    const isMove = Boolean(targetId && targetId !== Number(activeListId));
    const item = items.find((i) => i.id === id);
    const cleanedPayload = {
      ...('name' in payload ? {name: itemName} : {}),
      ...('spec' in payload ? {spec: cleanOptionalText(payload.spec)} : {}),
      ...('category' in payload ? {category: cleanOptionalText(payload.category)} : {}),
      ...Object.fromEntries(["notes", "photo", "priority"].filter(key => key in payload).map(key => [key, payload[key]])),
      ...(isMove ? { list_id: targetId } : {}),
    };
    if (!item || (isMove && !shoppingLists.some(list => list.id === targetId))) return false;
    if (!demoMode) {
      revision.current += 1;
      const {ok} = await api.apiUpdateShoppingItem(id, cleanedPayload);
      if (!isCurrent()) return false;
      revision.current += 1;
      if (!ok) { toastError(t(messages, 'toast.error')); return false; }
      await reloadItems();
      await loadShoppingLists();
      return true;
    }
    if (isMove) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setShoppingLists((prev) => prev.map((l) => {
        if (l.id === activeListId) {
          return {
            ...l,
            item_count: Math.max((l.item_count || 0) - 1, 0),
            checked_count: item?.checked ? Math.max((l.checked_count || 0) - 1, 0) : l.checked_count,
            items: (l.items || []).filter((i) => i.id !== id),
          };
        }
        if (l.id === targetId) {
          return {
            ...l,
            item_count: (l.item_count || 0) + 1,
            checked_count: item?.checked ? (l.checked_count || 0) + 1 : l.checked_count,
            items: [...(l.items || []), { ...item, ...cleanedPayload, list_id: targetId }],
          };
        }
        return l;
      }));
    } else {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...cleanedPayload } : i));
      setShoppingLists((prev) => prev.map((l) => l.id === activeListId
        ? { ...l, items: (l.items || []).map((i) => i.id === id ? { ...i, ...cleanedPayload } : i) }
        : l));
    }
    return true;
  }

  async function moveItem(id, targetListId) {
    return editItem(id, {list_id: Number(targetListId)});
  }

  async function deleteItem(id) {
    if (!isCurrent() || isChild) return false;
    if (demoMode) {
      const item = items.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setShoppingLists((prev) =>
        prev.map((l) => l.id === activeListId
          ? {
              ...l,
              item_count: l.item_count - 1,
              checked_count: item?.checked ? l.checked_count - 1 : l.checked_count,
              items: (l.items || []).filter((i) => i.id !== id),
            }
          : l
        ),
      );
    } else {
      revision.current += 1;
      const { ok } = await api.apiDeleteShoppingItem(id);
      if (!isCurrent()) return false;
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        return false;
      } else {
        await reloadItems();
        await loadShoppingLists();
      }
    }
  }

  async function createTemplate(payload) {
    if (!isCurrent() || isChild) return false;
    if (!payload.name?.trim()) return;
    if (demoMode) {
      const template = {
        id: Date.now(),
        family_id: Number(familyId),
        name: payload.name.trim(),
        items: payload.items || [],
        item_count: (payload.items || []).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTemplates((prev) => [...prev, template]);
      return;
    }
    const { ok, data } = await api.apiCreateShoppingTemplate({
      family_id: Number(familyId),
      name: payload.name.trim(),
      items: payload.items || [],
    });
    if (!isCurrent()) return false;
    if (!ok) { toastError(t(messages, 'toast.error')); return false; }
    setTemplates((prev) => [...prev.filter((tpl) => tpl.id !== data.id), data]);
  }

  async function updateTemplate(templateId, payload) {
    if (!isCurrent() || isChild) return false;
    if (!payload.name?.trim()) return;
    if (demoMode) {
      setTemplates((prev) => prev.map((tpl) => tpl.id === templateId ? {
        ...tpl,
        name: payload.name.trim(),
        items: payload.items || [],
        item_count: (payload.items || []).length,
        updated_at: new Date().toISOString(),
      } : tpl));
      return;
    }
    const { ok, data } = await api.apiUpdateShoppingTemplate(templateId, {
      name: payload.name.trim(),
      items: payload.items || [],
    });
    if (!isCurrent()) return false;
    if (!ok) { toastError(t(messages, 'toast.error')); return false; }
    setTemplates((prev) => prev.map((tpl) => tpl.id === templateId ? data : tpl));
  }

  async function deleteTemplate(templateId) {
    if (!isCurrent() || isChild) return false;
    if (demoMode) {
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== templateId));
      return;
    }
    const previous = templates;
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== templateId));
    const { ok } = await api.apiDeleteShoppingTemplate(templateId);
    if (!isCurrent()) return false;
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      setTemplates(previous);
      return false;
    }
  }

  async function applyTemplate(templateId) {
    if (!isCurrent() || isChild) return false;
    if (!activeListId) return;
    if (demoMode) {
      const template = templates.find((tpl) => tpl.id === templateId);
      const newItems = (template?.items || []).map((item, idx) => ({
        id: Date.now() + idx,
        list_id: activeListId,
        name: item.name,
        spec: item.spec || null,
        category: item.category || null,
        checked: false,
        checked_at: null,
        added_by_user_id: 1,
        created_at: new Date().toISOString(),
      }));
      setItems((prev) => [...prev, ...newItems]);
      setShoppingLists((prev) => prev.map((list) => list.id === activeListId
        ? { ...list, item_count: list.item_count + newItems.length, items: [...(list.items || []), ...newItems] }
        : list));
      return;
    }
    const { ok } = await api.apiApplyShoppingTemplate(templateId, { list_id: activeListId });
    if (!isCurrent()) return false;
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      return false;
    }
    await reloadItems();
    await loadShoppingLists();
  }

  async function clearChecked() {
    if (!isCurrent() || isChild) return false;
    if (!activeListId) return;
    if (demoMode) {
      setItems((prev) => prev.filter((i) => !i.checked || i.archived));
      setShoppingLists((prev) =>
        prev.map((l) => l.id === activeListId
          ? { ...l, item_count: l.item_count - l.checked_count, checked_count: 0, items: (l.items || []).filter((i) => !i.checked || i.archived) }
          : l
        ),
      );
    } else {
      revision.current += 1;
      const { ok } = await api.apiClearCheckedItems(activeListId);
      if (!isCurrent()) return false;
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        return false;
      } else {
        await reloadItems();
        await loadShoppingLists();
      }
    }
  }

  async function updateListDetails(payload) {
    if (!isCurrent() || isChild) return false;
    if (demoMode) {
      setShoppingLists(previous => previous.map(list => list.id === activeListId ? { ...list, ...payload } : list));
      return true;
    }
    const {ok, data} = await api.apiUpdateShoppingList(activeListId, payload);
    if (!isCurrent()) return false;
    if (!ok) { toastError(t(messages, 'toast.error')); return false; }
    setShoppingLists(previous => previous.map(list => list.id === activeListId ? data : list));
    return true;
  }

  async function completeTrip() {
    if (!isCurrent() || isChild) return false;
    if (!activeListId) return false;
    revision.current += 1;
    if (demoMode) {
      const archive = item => item.checked ? {...item, archived:true} : item;
      setItems(previous => previous.map(archive));
      setShoppingLists(previous => previous.map(list => list.id === activeListId ? {
        ...list, items:(list.items || []).map(archive), item_count:uncheckedItems.length, checked_count:0
      } : list));
      setUndoState(null);
      return true;
    }
    const {ok} = await api.apiCompleteShoppingTrip(activeListId);
    if (!isCurrent()) return false;
    if (!ok) { toastError(t(messages, 'toast.error')); return false; }
    setUndoState(null);
    await reloadItems();
    await loadShoppingLists();
    return true;
  }

  async function restoreItem(id) {
    if (!isCurrent() || isChild) return false;
    const item = items.find(entry => entry.id === id && entry.list_id === activeListId && entry.checked);
    if (!item) return false;
    if (demoMode) {
      const restore = entry => entry.id === id ? {...entry, checked:false, archived:false, checked_at:null} : entry;
      setItems(previous => previous.map(restore));
      setShoppingLists(previous => previous.map(list => list.id === activeListId ? {...list,
        items:(list.items || []).map(restore), item_count:(list.item_count || 0) + (item.archived ? 1 : 0),
        checked_count:Math.max(0, (list.checked_count || 0) - (item.archived ? 0 : 1))} : list));
      return true;
    }
    revision.current += 1;
    const {ok} = await api.apiUpdateShoppingItem(id, {checked:false});
    if (!isCurrent()) return false;
    if (!ok) { toastError(t(messages, 'toast.error')); return false; }
    await reloadItems();
    await loadShoppingLists();
    return true;
  }

  async function addRecipeIngredients(recipeId, names) {
    if (!isCurrent() || isChild || !activeListId) return false;
    const {ok} = await api.apiAddRecipeIngredientsToShopping(recipeId, activeListId, names);
    if (!isCurrent()) return false;
    if (!ok) { toastError(t(messages, 'toast.error')); return false; }
    await reloadItems();
    await loadShoppingLists();
    return true;
  }

  return {
    shoppingLists,
    activeListId, setActiveListId,
    activeList,
    items, uncheckedItems, checkedItems, categories, undo, undoToggle, pendingItemIds,
    newListName, setNewListName,
    newItemName, setNewItemName,
    newItemSpec, setNewItemSpec,
    newItemCategory, setNewItemCategory,
    showCreateList, setShowCreateList,
    templates, storeLinks,
    itemInputRef,
    createList, renameList, deleteList,
    addProduct: draft => addItem({preventDefault() {}}, draft),
    updateListDetails, completeTrip, restoreItem, addRecipeIngredients, reloadItems,
    addItem, toggleItem, editItem, moveItem, deleteItem, clearChecked,
    createTemplate, updateTemplate, deleteTemplate, applyTemplate, loadTemplates,
    wsConnected,
  };
}
