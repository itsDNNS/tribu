import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';
import { useWebSocket } from './useWebSocket';

export function useShopping() {
  const {
    shoppingLists, setShoppingLists, familyId, messages,
    loadShoppingLists, demoMode,
  } = useApp();
  const { error: toastError } = useToast();

  const [activeListId, setActiveListId] = useState(null);
  const [items, setItems] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSpec, setNewItemSpec] = useState('');
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
            ? { ...l, item_count: (l.item_count || 0) + 1 }
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
    const payload = { name: newItemName.trim(), spec: newItemSpec.trim() || null };
    if (demoMode) {
      const newItem = {
        id: Date.now(),
        list_id: activeListId,
        ...payload,
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
    itemInputRef.current?.focus();
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
    showCreateList, setShowCreateList,
    templates,
    itemInputRef,
    createList, deleteList,
    addItem, toggleItem, deleteItem, clearChecked,
    createTemplate, updateTemplate, deleteTemplate, applyTemplate, loadTemplates,
    wsConnected,
  };
}
