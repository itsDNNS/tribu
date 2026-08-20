import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';
import { useWebSocket } from './useWebSocket';

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
    item.checked
    && sameItemName(item.name, itemName)
    && shoppingSpecsAreCompatible(item.spec, itemSpec)
  )) || null;
}

export function predictShoppingItemTransition(items, payload) {
  const itemName = formatShoppingItemName(payload.name);
  const itemSpec = cleanOptionalText(payload.spec);
  const candidates = [...items.filter((item) => !item.checked), ...items.filter((item) => item.checked)];
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
    loadShoppingLists, demoMode, isMobile,
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
  const itemInputRef = useRef(null);


  const handleWsMessage = useCallback((msg) => {
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
        setItems((prev) => prev.filter((i) => !i.checked));
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
  }, [setShoppingLists, loadShoppingLists]);

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
    if (!familyId || demoMode) { setTemplates([]); return; }
    api.apiGetShoppingTemplates(familyId).then(({ ok, data }) => {
      if (ok) setTemplates(data);
    });
  }, [familyId, demoMode]);

  const loadTemplates = useCallback(async () => {
    if (!familyId || demoMode) return;
    const { ok, data } = await api.apiGetShoppingTemplates(familyId);
    if (ok) setTemplates(data);
  }, [familyId, demoMode]);

  useEffect(() => {
    if (!activeListId) { setItems([]); return; }
    if (demoMode) {
      const list = shoppingLists.find((l) => l.id === activeListId);
      if (list?.items) setItems(list.items);
      return;
    }
    api.apiGetShoppingItems(activeListId).then(({ ok, data }) => {
      if (ok) setItems(data);
    });
  }, [activeListId, demoMode, shoppingLists]);

  const activeList = useMemo(
    () => shoppingLists.find((l) => l.id === activeListId) || null,
    [shoppingLists, activeListId],
  );

  const uncheckedItems = useMemo(() => items.filter((i) => !i.checked), [items]);
  const checkedItems = useMemo(() => items.filter((i) => i.checked), [items]);

  const reloadItems = useCallback(async () => {
    if (!activeListId || demoMode) return;
    const { ok, data } = await api.apiGetShoppingItems(activeListId);
    if (ok) setItems(data);
  }, [activeListId, demoMode]);


  async function createList(e) {
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
      if (!ok) return toastError(t(messages, 'toast.error'));
      setShoppingLists((prev) => {
        if (prev.some((l) => l.id === data.id)) return prev;
        return [...prev, data];
      });
      setActiveListId(data.id);
    }
    setNewListName('');
    setShowCreateList(false);
  }

  async function renameList(id, name) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const previousLists = shoppingLists;
    setShoppingLists((prev) => prev.map((l) => l.id === id ? { ...l, name: trimmedName } : l));
    if (demoMode) return;
    const { ok, data } = await api.apiUpdateShoppingList(id, { name: trimmedName });
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      setShoppingLists(previousLists);
      await loadShoppingLists();
      return;
    }
    setShoppingLists((prev) => prev.map((l) => l.id === id ? { ...l, ...data } : l));
  }

  async function deleteList(id) {
    if (demoMode) {
      setShoppingLists((prev) => prev.filter((l) => l.id !== id));
    } else {
      setShoppingLists((prev) => prev.filter((l) => l.id !== id));
      const { ok } = await api.apiDeleteShoppingList(id);
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        await loadShoppingLists();
      }
    }
  }


  async function addItem(e) {
    e.preventDefault();
    if (!newItemName.trim() || !activeListId) return;
    const payload = {
      name: formatShoppingItemName(newItemName),
      spec: cleanOptionalText(newItemSpec),
      category: cleanOptionalText(newItemCategory),
    };
    const predictedTransition = predictShoppingItemTransition(items, payload);
    if (demoMode) {
      if (predictedTransition) {
        const mergedPayload = {
          name: payload.name,
          spec: predictedTransition.spec,
          category: payload.category || predictedTransition.item.category || null,
          checked: false,
          checked_at: null,
        };
        setItems((prev) => prev.map((item) => item.id === predictedTransition.item.id
          ? { ...item, ...mergedPayload }
          : item));
        setShoppingLists((prev) =>
          prev.map((l) => l.id === activeListId
            ? {
                ...l,
                checked_count: predictedTransition.action === 'restored'
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
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        await reloadItems();
        await loadShoppingLists();
      } else if (!wsConnected) {
        await reloadItems();
        await loadShoppingLists();
      }
    }
    setNewItemName('');
    setNewItemSpec('');
    setNewItemCategory('');
    if (!isMobile) itemInputRef.current?.focus();
  }

  async function toggleItem(id, currentChecked) {
    if (demoMode) {
      setItems((prev) =>
        prev.map((i) => i.id === id ? { ...i, checked: !currentChecked, checked_at: !currentChecked ? new Date().toISOString() : null } : i),
      );
      const delta = currentChecked ? -1 : 1;
      setShoppingLists((prev) =>
        prev.map((l) => l.id === activeListId
          ? { ...l, checked_count: l.checked_count + delta, items: (l.items || []).map((i) => i.id === id ? { ...i, checked: !currentChecked } : i) }
          : l
        ),
      );
    } else {
      setItems((prev) =>
        prev.map((i) => i.id === id ? { ...i, checked: !currentChecked, checked_at: !currentChecked ? new Date().toISOString() : null } : i),
      );
      const { ok } = await api.apiUpdateShoppingItem(id, { checked: !currentChecked });
      if (!ok || !wsConnected) {
        await reloadItems();
        await loadShoppingLists();
      }
    }
  }

  async function editItem(id, payload) {
    const itemName = formatShoppingItemName(payload.name || '');
    if (!itemName) return;
    const targetId = Number(payload.list_id);
    const isMove = Boolean(targetId && targetId !== Number(activeListId));
    const item = items.find((i) => i.id === id);
    const cleanedPayload = {
      name: itemName,
      spec: cleanOptionalText(payload.spec),
      category: cleanOptionalText(payload.category),
      ...(isMove ? { list_id: targetId } : {}),
    };
    const previousItems = items;
    const previousLists = shoppingLists;
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
    if (demoMode) return;
    const { ok } = await api.apiUpdateShoppingItem(id, cleanedPayload);
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      setItems(previousItems);
      setShoppingLists(previousLists);
      await reloadItems();
      return;
    }
    if (isMove || !wsConnected) {
      await reloadItems();
      await loadShoppingLists();
    }
  }

  async function moveItem(id, targetListId) {
    const targetId = Number(targetListId);
    if (!targetId || targetId === Number(activeListId)) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const previousItems = items;
    const previousLists = shoppingLists;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setShoppingLists((prev) => prev.map((l) => {
      if (l.id === activeListId) {
        return {
          ...l,
          item_count: Math.max((l.item_count || 0) - 1, 0),
          checked_count: item.checked ? Math.max((l.checked_count || 0) - 1, 0) : l.checked_count,
          items: (l.items || []).filter((i) => i.id !== id),
        };
      }
      if (l.id === targetId) {
        return {
          ...l,
          item_count: (l.item_count || 0) + 1,
          checked_count: item.checked ? (l.checked_count || 0) + 1 : l.checked_count,
          items: [...(l.items || []), { ...item, list_id: targetId }],
        };
      }
      return l;
    }));
    if (demoMode) return;
    const { ok } = await api.apiUpdateShoppingItem(id, { list_id: targetId });
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      setItems(previousItems);
      setShoppingLists(previousLists);
      return;
    }
    await loadShoppingLists();
  }

  async function deleteItem(id) {
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
      const prevItems = items;
      setItems((prev) => prev.filter((i) => i.id !== id));
      const { ok } = await api.apiDeleteShoppingItem(id);
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        setItems(prevItems);
      } else if (!wsConnected) {
        await reloadItems();
        await loadShoppingLists();
      }
    }
  }

  async function createTemplate(payload) {
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
    if (!ok) return toastError(t(messages, 'toast.error'));
    setTemplates((prev) => [...prev.filter((tpl) => tpl.id !== data.id), data]);
  }

  async function updateTemplate(templateId, payload) {
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
    if (!ok) return toastError(t(messages, 'toast.error'));
    setTemplates((prev) => prev.map((tpl) => tpl.id === templateId ? data : tpl));
  }

  async function deleteTemplate(templateId) {
    if (demoMode) {
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== templateId));
      return;
    }
    const previous = templates;
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== templateId));
    const { ok } = await api.apiDeleteShoppingTemplate(templateId);
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      setTemplates(previous);
    }
  }

  async function applyTemplate(templateId) {
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
    if (!ok) {
      toastError(t(messages, 'toast.error'));
      return;
    }
    await reloadItems();
    await loadShoppingLists();
  }

  async function clearChecked() {
    if (!activeListId) return;
    if (demoMode) {
      setItems((prev) => prev.filter((i) => !i.checked));
      setShoppingLists((prev) =>
        prev.map((l) => l.id === activeListId
          ? { ...l, item_count: l.item_count - l.checked_count, checked_count: 0, items: (l.items || []).filter((i) => !i.checked) }
          : l
        ),
      );
    } else {
      const prevItems = items;
      setItems((prev) => prev.filter((i) => !i.checked));
      const { ok } = await api.apiClearCheckedItems(activeListId);
      if (!ok) {
        toastError(t(messages, 'toast.error'));
        setItems(prevItems);
      } else if (!wsConnected) {
        await reloadItems();
        await loadShoppingLists();
      }
    }
  }

  return {
    shoppingLists,
    activeListId, setActiveListId,
    activeList,
    items, uncheckedItems, checkedItems,
    newListName, setNewListName,
    newItemName, setNewItemName,
    newItemSpec, setNewItemSpec,
    newItemCategory, setNewItemCategory,
    showCreateList, setShowCreateList,
    templates,
    itemInputRef,
    createList, renameList, deleteList,
    addItem, toggleItem, editItem, moveItem, deleteItem, clearChecked,
    createTemplate, updateTemplate, deleteTemplate, applyTemplate, loadTemplates,
    wsConnected,
  };
}
