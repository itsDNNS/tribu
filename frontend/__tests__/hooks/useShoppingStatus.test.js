import { act, renderHook, waitFor } from '@testing-library/react';
import { useShopping } from '../../hooks/useShopping';
import * as api from '../../lib/api';
let mockApp;
let mockWs;
const mockError = jest.fn();
jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ error: mockError }) }));
jest.mock('../../hooks/useWebSocket', () => ({ useWebSocket: (_id, options) => { mockWs = options.onMessage; return { connected: true }; } }));
jest.mock('../../lib/api');
const original = { id: 1, list_id: 10, name: 'Milk', checked: false, checked_at: null };
let serverItems;
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks();
  serverItems = [{ ...original }];
  mockApp = { familyId: 1, shoppingLists: [{ id: 10 }, { id: 20 }], setShoppingLists: jest.fn(), loadShoppingLists: jest.fn(), messages: {}, demoMode: false };
  api.apiGetShoppingItems.mockImplementation(async (id) => ({ ok: true, data: serverItems.filter((item) => item.list_id === id) }));
  api.apiGetShoppingLists.mockImplementation(async () => ({ ok: true, data: mockApp.shoppingLists }));
  api.apiGetShoppingTemplates.mockResolvedValue({ ok: true, data: [] });
  api.apiGetShoppingStoreLinks.mockResolvedValue({ ok: true, data: [] });
  api.apiGetShoppingCategories.mockResolvedValue({ ok: true, data: ['Dairy'] });
  api.apiUpdateShoppingItem.mockImplementation(async (id, payload) => {
    const item = { ...serverItems.find((entry) => entry.id === id), checked: payload.checked, checked_at: payload.checked ? '2026-09-19T12:00:00' : null };
    serverItems = serverItems.map((entry) => entry.id === id ? item : entry);
    return { ok: true, data: item };
  });
});
async function setup() {
  const hook = renderHook(() => useShopping());
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  return hook;
}

test('successful check and uncheck offer conditional Undo; repeated taps send one request', async () => {
  const { result } = await setup();
  await act(async () => { await Promise.all([result.current.toggleItem(1, false), result.current.toggleItem(1, false)]); });
  expect(api.apiUpdateShoppingItem).toHaveBeenCalledTimes(1);
  expect(result.current.undo).toMatchObject({ id: 1, checked: true });
  await act(async () => { await result.current.undoToggle(); });
  expect(api.apiUpdateShoppingItem).toHaveBeenLastCalledWith(1, { checked: false, expected_state: { list_id: 10, checked: true, checked_at: '2026-09-19T12:00:00' } });
  expect(result.current.checkedItems).toHaveLength(0);
  expect(result.current.undo).toBeNull();
  await act(async () => { await result.current.toggleItem(1, false); });
  await act(async () => { await result.current.toggleItem(1, true); });
  expect(result.current.undo).toMatchObject({ checked: false });
  await act(async () => { await result.current.undoToggle(); });
  expect(result.current.checkedItems).toHaveLength(1);
});

test.each(['list', 'family'])('late status response and old Undo cannot modify a switched %s', async (kind) => {
  const { result, rerender } = await setup();
  const response = deferred();
  api.apiUpdateShoppingItem.mockReturnValueOnce(response.promise);
  let operation;
  act(() => { operation = result.current.toggleItem(1, false); });
  if (kind === 'list') act(() => result.current.setActiveListId(20));
  else { mockApp = { ...mockApp, familyId: 2, shoppingLists: [{ id: 20 }] }; rerender(); }
  await waitFor(() => expect(result.current.items).toEqual([]));
  await act(async () => { response.resolve({ ok: true, data: { ...original, checked: true } }); await operation; });
  expect(result.current.items).toEqual([]);
  expect(result.current.undo).toBeNull();
});

test.each(['item_updated', 'item_deleted', 'items_cleared'])('realtime %s invalidates Undo', async (type) => {
  const { result } = await setup();
  await act(async () => { await result.current.toggleItem(1, false); });
  expect(result.current.undo).not.toBeNull();
  act(() => mockWs({ type, item: type === 'item_updated' ? { ...original } : undefined, item_id: 1 }));
  expect(result.current.undo).toBeNull();
  await act(async () => { await result.current.undoToggle(); });
  expect(api.apiUpdateShoppingItem).toHaveBeenCalledTimes(1);
});

test('failed mutation rolls back, reports failure and never offers Undo', async () => {
  const { result } = await setup();
  api.apiUpdateShoppingItem.mockResolvedValueOnce({ ok: false });
  await act(async () => { await result.current.toggleItem(1, false); });
  expect(result.current.items[0].checked).toBe(false);
  expect(result.current.undo).toBeNull();
  expect(mockError).toHaveBeenCalledTimes(1);
});

test('checked order updates immediately and through realtime; stale reload cannot overwrite realtime', async () => {
  const { result } = await setup();
  act(() => mockWs({ type: 'item_added', item: { ...original, id: 2, checked: true, checked_at: '2026-09-18T12:00:00' } }));
  const response = deferred();
  api.apiUpdateShoppingItem.mockReturnValueOnce(response.promise);
  let operation;
  act(() => { operation = result.current.toggleItem(1, false); });
  expect(result.current.checkedItems.map((item) => item.id)).toEqual([1, 2]);
  const concurrent = { ...original, checked: true, checked_at: '2026-09-20T12:00:00' };
  serverItems = [concurrent];
  act(() => mockWs({ type: 'item_updated', item: concurrent }));
  await act(async () => { response.resolve({ ok: true, data: { ...original, checked: true, checked_at: '2026-09-19T12:00:00' } }); await operation; });
  expect(result.current.items[0]).toEqual(concurrent);
  expect(result.current.undo).toBeNull();
});

test('a delayed reload cannot overwrite a newer realtime update', async () => {
  const { result } = await setup();
  const reload = deferred();
  api.apiGetShoppingItems.mockReturnValueOnce(reload.promise);
  let operation;
  act(() => { operation = result.current.toggleItem(1, false); });
  await waitFor(() => expect(api.apiGetShoppingItems).toHaveBeenCalledTimes(2));
  const newer = { ...original, checked: true, checked_at: '2026-09-20T12:00:00' };
  act(() => mockWs({ type: 'item_updated', item: newer }));
  await act(async () => { reload.resolve({ ok: true, data: [original] }); await operation; });
  expect(result.current.items[0]).toEqual(newer);
  expect(result.current.undo).toBeNull();
});

test('a response after unmount does not reload or modify shared family lists', async () => {
  const { result, unmount } = await setup();
  const response = deferred();
  api.apiUpdateShoppingItem.mockReturnValueOnce(response.promise);
  let operation;
  act(() => { operation = result.current.toggleItem(1, false); });
  unmount();
  await act(async () => { response.resolve({ ok: true, data: { ...original, checked: true } }); await operation; });
  expect(api.apiGetShoppingLists).not.toHaveBeenCalled();
  expect(mockApp.setShoppingLists).not.toHaveBeenCalled();
});

test('an already captured Undo cannot run after switching family', async () => {
  const { result, rerender } = await setup();
  await act(async () => { await result.current.toggleItem(1, false); });
  const previousUndo = result.current.undoToggle;
  mockApp = { ...mockApp, familyId: 2, shoppingLists: [{ id: 20 }] };
  rerender();
  await act(async () => { await previousUndo(); });
  expect(api.apiUpdateShoppingItem).toHaveBeenCalledTimes(1);
});

test('a delayed list summary cannot overwrite a newly selected family', async () => {
  const { result, rerender } = await setup();
  const lists = deferred();
  api.apiGetShoppingLists.mockReturnValueOnce(lists.promise);
  let operation;
  act(() => { operation = result.current.toggleItem(1, false); });
  await waitFor(() => expect(api.apiGetShoppingLists).toHaveBeenCalledTimes(1));
  mockApp = { ...mockApp, familyId: 2, shoppingLists: [{ id: 20 }] };
  rerender();
  await act(async () => { lists.resolve({ ok: true, data: [{ id: 10 }] }); await operation; });
  expect(mockApp.setShoppingLists).not.toHaveBeenCalled();
});

test('archived purchases stay out of live sections and reappear after a successful complete request', async () => {
  const { result } = await setup();
  await act(async () => { await result.current.toggleItem(1, false); });
  api.apiCompleteShoppingTrip.mockImplementation(async () => {
    serverItems = serverItems.map(item => ({...item, archived:true}));
    return {ok:true,data:serverItems};
  });
  await act(async () => { await result.current.completeTrip(); });
  expect(result.current.checkedItems).toHaveLength(0);
  expect(result.current.uncheckedItems).toHaveLength(0);
  expect(result.current.items[0]).toMatchObject({id:1,archived:true,checked:true});
  expect(result.current.undo).toBeNull();
});

test('failed completion preserves the basket and its Undo', async () => {
  const { result } = await setup();
  await act(async () => { await result.current.toggleItem(1, false); });
  api.apiCompleteShoppingTrip.mockResolvedValue({ok:false});
  await act(async () => { expect(await result.current.completeTrip()).toBe(false); });
  expect(result.current.checkedItems).toHaveLength(1);
  expect(result.current.undo).not.toBeNull();
});

test('a completion response from a previous list cannot replace the new list contents', async () => {
  const { result } = await setup();
  const response = deferred();api.apiCompleteShoppingTrip.mockReturnValue(response.promise);
  let operation;act(() => { operation=result.current.completeTrip(); });
  act(() => result.current.setActiveListId(20));
  await waitFor(() => expect(result.current.items).toEqual([]));
  await act(async()=>{response.resolve({ok:true});await operation;});
  expect(result.current.items).toEqual([]);
});
