import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export function useShopping() {
  const {
    shoppingLists, setShoppingLists, familyId, members, messages,
    loadShoppingLists, demoMode,
  } = useApp();

  const [activeListId, setActiveListId] = useState(null);
  const [items, setItems] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemSpec, setNewItemSpec] = useState('');
  const [showCreateList, setShowCreateList] = useState(false);
  const itemInputRef = useRef(null);

  // Auto-select first list when lists change
  useEffect(() => {
    if (shoppingLists.length > 0 && !shoppingLists.find((l) => l.id === activeListId)) {
      setActiveListId(shoppingLists[0].id);
    }
    if (shoppingLists.length === 0) {
      setActiveListId(null);
      setItems([]);
    }
  }, [shoppingLists, activeListId]);

  // Load items when active list changes
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
      if (!ok) return;
      await loadShoppingLists();
      setActiveListId(data.id);
    }
    setNewListName('');
    setShowCreateList(false);
  }

  async function deleteList(id) {
    if (!confirm(t(messages, 'module.shopping.delete_list_confirm'))) return;
    if (demoMode) {
      setShoppingLists((prev) => prev.filter((l) => l.id !== id));
    } else {
      await api.apiDeleteShoppingList(id);
      await loadShoppingLists();
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
      await api.apiAddShoppingItem(activeListId, payload);
      await reloadItems();
      await loadShoppingLists();
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
      await api.apiUpdateShoppingItem(id, { checked: !currentChecked });
      await reloadItems();
      await loadShoppingLists();
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
      await api.apiDeleteShoppingItem(id);
      await reloadItems();
      await loadShoppingLists();
    }
  }

  async function clearChecked() {
    if (!activeListId) return;
    if (!confirm(t(messages, 'module.shopping.clear_checked_confirm'))) return;
    if (demoMode) {
      setItems((prev) => prev.filter((i) => !i.checked));
      setShoppingLists((prev) =>
        prev.map((l) => l.id === activeListId
          ? { ...l, item_count: l.item_count - l.checked_count, checked_count: 0, items: (l.items || []).filter((i) => !i.checked) }
          : l
        ),
      );
    } else {
      await api.apiClearCheckedItems(activeListId);
      await reloadItems();
      await loadShoppingLists();
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
    itemInputRef,
    createList, deleteList,
    addItem, toggleItem, deleteItem, clearChecked,
  };
}
