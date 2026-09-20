import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShoppingView from '../../components/ShoppingView';
import { buildMessages } from '../../lib/i18n';
let mockApp, mockShopping;
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockApp
}));
jest.mock('../../hooks/useShopping', () => ({
  useShopping: () => mockShopping
}));
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn()
  })
}));
jest.mock('../../components/FamilyTopbar', () => () => null);
jest.mock('../../lib/api');
const api = require('../../lib/api');
const apple = {
  id: 1,
  list_id: 10,
  name: 'Äpfel',
  spec: '1 kg',
  category: 'Obst & Gemüse',
  checked: false,
  notes: 'Elstar'
};
const milk = {
  id: 2,
  list_id: 10,
  name: 'Milch',
  spec: '2 l',
  category: 'Kühlregal',
  checked: false,
  priority: 'urgent'
};
function setup(overrides = {}, app = {}) {
  mockApp = {
    members: [],
    messages: buildMessages('de'),
    demoMode: true,
    familyId: 1,
    me: {
      id: 1
    },
    isChild: false,
    ...app
  };
  mockShopping = {
    shoppingLists: [{
      id: 10,
      name: 'Wocheneinkauf'
    }, {
      id: 20,
      name: 'Drogerie'
    }],
    activeListId: 10,
    activeList: {
      id: 10,
      name: 'Wocheneinkauf'
    },
    items: [apple, milk],
    uncheckedItems: [apple, milk],
    checkedItems: [],
    categories: [],
    templates: [],
    storeLinks: [],
    itemInputRef: {
      current: null
    },
    pendingItemIds: new Set(),
    newListName: '',
    ...Object.fromEntries(['setActiveListId', 'setNewListName', 'createList', 'updateListDetails', 'addProduct', 'toggleItem', 'editItem', 'deleteItem', 'deleteList', 'completeTrip', 'restoreItem', 'addRecipeIngredients', 'undoToggle', 'createTemplate', 'updateTemplate', 'deleteTemplate', 'applyTemplate', 'reloadItems'].map(key => [key, jest.fn().mockResolvedValue(true)])),
    ...overrides
  };
  return render(<ShoppingView />);
}
beforeEach(() => {
  api.apiListRecipes.mockResolvedValue({
    ok: true,
    data: []
  });
  api.apiListMealPlans.mockResolvedValue({
    ok: true,
    data: []
  });
  window.PointerEvent = MouseEvent;
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
const dialog = () => within(screen.getByRole('dialog'));
test('renders the mockup tiles, department groups and real progress', () => {
  setup();
  expect(screen.getByRole('heading', {
    name: 'Für alles, was euch fehlt.'
  })).toBeVisible();
  expect(screen.getByRole('region', {
    name: 'Obst & Gemüse'
  })).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(screen.getByRole('checkbox', {
    name: /^Äpfel,/
  })).not.toBeChecked();
});
test('tile text checks an item while its three-dot control opens details', () => {
  setup();
  fireEvent.click(screen.getByRole('checkbox', {
    name: /^Äpfel,/
  }));
  expect(mockShopping.toggleItem).toHaveBeenCalledWith(1, false);
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Milch'
  }));
  expect(dialog().getByLabelText('Details für die Familie')).toBeVisible();
  expect(mockShopping.toggleItem).toHaveBeenCalledTimes(1);
});
test('search parses quantity and submits the product without losing its category', async () => {
  setup();
  const search = screen.getByRole('combobox', {
    name: 'Artikel suchen oder mit Menge hinzufügen'
  });
  fireEvent.change(search, {
    target: {
      value: '2 kg Äpfel'
    }
  });
  fireEvent.submit(search.closest('form'));
  await waitFor(() => expect(mockShopping.addProduct).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Äpfel',
    spec: '2 kg',
    category: 'Obst & Gemüse'
  })));
});
test('keyboard suggestions are not active before input and support selection and Escape', async () => {
  setup();
  const search = screen.getByRole('combobox', {
    name: 'Artikel suchen oder mit Menge hinzufügen'
  });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  fireEvent.focus(search);
  fireEvent.change(search, {
    target: {
      value: 'Zitr'
    }
  });
  expect(screen.getByRole('option', {
    name: /Zitronen/
  })).toBeVisible();
  fireEvent.keyDown(search, {
    key: 'ArrowDown'
  });
  expect(search).toHaveAttribute('aria-activedescendant', 'shop-suggestion-0');
  fireEvent.keyDown(search, {
    key: 'Enter'
  });
  await waitFor(() => expect(mockShopping.addProduct).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Zitronen'
  })));
  fireEvent.change(search, {
    target: {
      value: 'Mil'
    }
  });
  fireEvent.keyDown(search, {
    key: 'Escape'
  });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
test('editing saves metadata and selected target list', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.change(dialog().getByLabelText('Menge'), {
    target: {
      value: '3'
    }
  });
  fireEvent.change(dialog().getByLabelText('Details für die Familie'), {
    target: {
      value: 'Bio'
    }
  });
  fireEvent.change(dialog().getByLabelText('Dringlichkeit'), {
    target: {
      value: 'urgent'
    }
  });
  fireEvent.change(dialog().getByLabelText('Einkaufsliste'), {
    target: {
      value: '20'
    }
  });
  fireEvent.click(dialog().getByRole('button', {
    name: 'Speichern',
    exact: true
  }));
  await waitFor(() => expect(mockShopping.editItem).toHaveBeenCalledWith(1, expect.objectContaining({
    spec: '3 kg',
    notes: 'Bio',
    priority: 'urgent',
    list_id: 20
  })));
});
test('failed save keeps the editor and input visible', async () => {
  setup({
    editItem: jest.fn().mockResolvedValue(false)
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Speichern',
    exact: true
  }));
  expect(await dialog().findByRole('alert')).toBeVisible();
  expect(dialog().getByLabelText('Artikel')).toHaveValue('Äpfel');
});
test('Cancel closes details without a write', () => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Abbrechen'
  }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockShopping.editItem).not.toHaveBeenCalled();
});
test('child controls allow checking but hide product/list mutations', () => {
  setup({}, {
    isChild: true
  });
  expect(screen.queryByRole('button', {
    name: 'Details zu Äpfel'
  })).toBeNull();
  expect(screen.queryByRole('button', {
    name: 'Neue Einkaufsliste',
    exact: true
  })).toBeNull();
  expect(screen.queryByRole('combobox', {
    name: 'Artikel suchen oder mit Menge hinzufügen'
  })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', {
    name: /^Äpfel,/
  }));
  expect(mockShopping.toggleItem).toHaveBeenCalled();
});
test('only urgent filters open items without altering basket counts', () => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Dringend 1'
  }));
  expect(screen.queryByRole('checkbox', {
    name: /^Äpfel,/
  })).toBeNull();
  expect(screen.getByRole('checkbox', {
    name: /^Milch,/
  })).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});
test('department order saves against the current list and supports custom categories', async () => {
  setup({
    uncheckedItems: [{
      ...apple,
      category: 'Mein Laden'
    }, milk]
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Reihenfolge der Kategorien ändern'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Mein Laden nach unten'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Reihenfolge speichern'
  }));
  await waitFor(() => expect(mockShopping.updateListDetails).toHaveBeenCalledWith(expect.objectContaining({
    category_order: expect.arrayContaining(['Mein Laden'])
  })));
});
test('completing uses the archive operation after confirmation and exposes recent products', async () => {
  const checked = {
    ...apple,
    checked: true
  };
  setup({
    items: [checked, milk],
    checkedItems: [checked],
    uncheckedItems: [milk]
  });
  const details = document.querySelector('.shop-done');
  details.open = true;
  fireEvent(details, new Event("toggle"));
  fireEvent.click(screen.getByRole('button', {
    name: 'Einkauf abschließen',
    exact: true
  }));
  expect(mockShopping.completeTrip).not.toHaveBeenCalled();
  fireEvent.click(dialog().getByRole('button', {
    name: 'Einkauf abschließen',
    exact: true
  }));
  await waitFor(() => expect(mockShopping.completeTrip).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', {
    name: 'Zuletzt',
    exact: true
  }));
  expect(screen.getByRole('button', {
    name: 'Äpfel, hinzufügen',
    exact: true
  })).toBeVisible();
});
test('preferences stay scoped to the family and user', () => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Listenansicht',
    exact: true
  }));
  expect(JSON.parse(localStorage.getItem('tribu_shopping_ui:demo:1')).layout).toBe('list');
});
test('sharing is a text snapshot of open products and includes notes', () => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Liste weitergeben',
    exact: true
  }));
  expect(dialog().getByRole('textbox', {
    name: 'Einkaufsliste als Text'
  }).value).toContain('Äpfel · 1 kg · Elstar');
});
test('store search remains reachable from item details without checking', () => {
  setup({
    storeLinks: [{
      id: 1,
      name: 'Shop',
      url_template: 'https://example.com/?q={query}'
    }]
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Online suchen'
  }));
  expect(screen.getByRole('link', {
    name: /Shop/
  })).toHaveAttribute('href', 'https://example.com/?q=%C3%84pfel');
  expect(mockShopping.toggleItem).not.toHaveBeenCalled();
});
test('list menu preserves template creation and application', async () => {
  setup({
    templates: [{
      id: 1,
      name: 'Frühstück',
      items: [{
        name: 'Brot'
      }]
    }]
  });
  fireEvent.click(screen.getAllByRole('button', {
    name: 'Listenoptionen'
  })[0]);
  fireEvent.click(dialog().getByRole('button', {
    name: 'Einkaufsvorlagen'
  }));
  fireEvent.click(dialog().getByText('Frühstück').closest('article').querySelector('.shopping-template-apply'));
  await waitFor(() => expect(mockShopping.applyTemplate).toHaveBeenCalledWith(1));
});
test('English UI uses the translation bundle', () => {
  setup({}, {
    messages: buildMessages('en')
  });
  expect(screen.getByRole('heading', {
    name: 'For everything you need.'
  })).toBeVisible();
  expect(screen.getByRole('button', {
    name: 'New shopping list',
    exact: true
  })).toBeVisible();
});
test.each([[[]], [[{
  id: 1,
  name: 'Unsafe',
  url_template: 'javascript:{query}'
}]]])('invalid or absent store links do not expose search', stores => {
  setup({
    storeLinks: stores
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  expect(dialog().queryByRole('button', {
    name: 'Online suchen'
  })).toBeNull();
});
test('store picker encodes names, protects the opener, contains focus and restores it on Escape', async () => {
  setup({
    storeLinks: [{
      id: 1,
      name: 'Shop',
      url_template: 'https://example.com/?q={query}'
    }]
  });
  const details = screen.getByRole('button', {
    name: 'Details zu Äpfel'
  });
  details.focus();
  fireEvent.click(details);
  fireEvent.click(dialog().getByRole('button', {
    name: 'Online suchen'
  }));
  const link = screen.getByRole('link', {
    name: /Shop/
  });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).toHaveFocus();
  fireEvent.keyDown(link, {
    key: 'Tab',
    shiftKey: true
  });
  expect(dialog().getByRole('button', {
    name: 'Abbrechen'
  })).toHaveFocus();
  fireEvent.keyDown(document, {
    key: 'Escape'
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(details).toHaveFocus());
});
test('whitespace search never shows suggestions; clearing and typing reopens them', () => {
  setup();
  const input = screen.getByRole('combobox', {
    name: 'Artikel suchen oder mit Menge hinzufügen'
  });
  fireEvent.focus(input);
  fireEvent.change(input, {
    target: {
      value: '   '
    }
  });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(input, {
    target: {
      value: 'Zitr'
    }
  });
  expect(screen.getByRole('listbox')).toBeVisible();
  fireEvent.change(input, {
    target: {
      value: ''
    }
  });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(input, {
    target: {
      value: 'Mil'
    }
  });
  expect(screen.getByRole('option', {
    name: /Milch/
  })).toBeVisible();
});
test('Escape closes an edited product without persisting changes', () => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.change(dialog().getByLabelText('Artikel'), {
    target: {
      value: 'Changed'
    }
  });
  fireEvent(screen.getByRole('dialog'), new Event('cancel', {
    bubbles: true,
    cancelable: true
  }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockShopping.editItem).not.toHaveBeenCalled();
});
test('clearing notes and the photo sends explicit null in one edit', async () => {
  const item = {
    ...apple,
    photo: 'data:image/png;base64,iVBORw0KGgo='
  };
  setup({
    items: [item],
    uncheckedItems: [item]
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.change(dialog().getByLabelText('Details für die Familie'), {
    target: {
      value: ''
    }
  });
  fireEvent.click(dialog().getByRole('button', {
    name: 'Foto entfernen'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Speichern',
    exact: true
  }));
  await waitFor(() => expect(mockShopping.editItem).toHaveBeenCalledWith(1, expect.objectContaining({
    photo: null,
    notes: null
  })));
});
test.each([['image/gif', 1], ['image/png', 6 * 1024 * 1024]])('photo rejects %s with %s bytes before uploading', async (type, size) => {
  setup();
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  const file = new File(['a'], 'photo', {
    type
  });
  Object.defineProperty(file, 'size', {
    value: size
  });
  fireEvent.change(dialog().getByLabelText('Produktfoto (optional)'), {
    target: {
      files: [file]
    }
  });
  expect(await dialog().findByRole('alert')).toHaveTextContent('5 MB');
  expect(mockShopping.editItem).not.toHaveBeenCalled();
});
test('long press opens details and suppresses the release click', () => {
  jest.useFakeTimers();
  setup();
  const item = screen.getByRole('checkbox', {
    name: /^Äpfel,/
  });
  fireEvent.pointerDown(item, {
    button: 0,
    clientX: 10,
    clientY: 10
  });
  act(() => jest.advanceTimersByTime(600));
  fireEvent.pointerUp(item);
  fireEvent.click(item);
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(mockShopping.toggleItem).not.toHaveBeenCalled();
  jest.useRealTimers();
});
test('pointer movement cancels a long press so scrolling does not open details', () => {
  jest.useFakeTimers();
  setup();
  const item = screen.getByRole('checkbox', {
    name: /^Äpfel,/
  });
  fireEvent.pointerDown(item, {
    button: 0,
    clientX: 10,
    clientY: 10
  });
  fireEvent.pointerMove(item, {
    clientX: 10,
    clientY: 50
  });
  act(() => jest.advanceTimersByTime(600));
  expect(screen.queryByRole('dialog')).toBeNull();
  jest.useRealTimers();
});
test('a child long press still permits checking but never details or completion', () => {
  jest.useFakeTimers();
  setup({}, {
    isChild: true
  });
  const item = screen.getByRole('checkbox', {
    name: /^Äpfel,/
  });
  fireEvent.pointerDown(item, {
    button: 0
  });
  act(() => jest.advanceTimersByTime(600));
  fireEvent.pointerUp(item);
  fireEvent.click(item);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockShopping.toggleItem).toHaveBeenCalledWith(1, false);
  fireEvent.click(screen.getAllByRole('button', {
    name: 'Listenoptionen'
  })[0]);
  expect(dialog().queryByRole('button', {
    name: 'Einkauf abschließen',
    exact: true
  })).toBeNull();
  expect(dialog().queryByRole('button', {
    name: 'Liste bearbeiten'
  })).toBeNull();
  jest.useRealTimers();
});
test('custom, Unicode, uncategorized and case-equivalent categories remain visible', () => {
  const rows = [{
    ...apple,
    category: 'Mein Laden'
  }, {
    ...milk,
    category: 'mein laden'
  }, {
    ...apple,
    id: 3,
    name: 'Σ',
    category: 'Σ'
  }, {
    ...apple,
    id: 4,
    name: 'Unknown',
    category: null
  }];
  setup({
    items: rows,
    uncheckedItems: rows
  });
  expect(screen.getAllByRole('region', {
    name: /Mein Laden/i
  })).toHaveLength(1);
  expect(within(screen.getByRole('region', {
    name: 'Mein Laden'
  })).getAllByRole('checkbox')).toHaveLength(2);
  expect(screen.getByRole('region', {
    name: 'Σ'
  })).toBeVisible();
  expect(screen.getByRole('region', {
    name: 'Sonstiges'
  })).toBeVisible();
});
test('list rename and icon are saved together and only after confirmation', async () => {
  setup();
  fireEvent.click(screen.getAllByRole('button', {
    name: 'Listenoptionen'
  })[0]);
  fireEvent.click(dialog().getByRole('button', {
    name: 'Liste bearbeiten'
  }));
  fireEvent.change(dialog().getByLabelText('Listenname'), {
    target: {
      value: 'Market'
    }
  });
  fireEvent.click(dialog().getByRole('button', {
    name: 'heart'
  }));
  expect(mockShopping.updateListDetails).not.toHaveBeenCalled();
  fireEvent.click(dialog().getByRole('button', {
    name: 'Speichern'
  }));
  await waitFor(() => expect(mockShopping.updateListDetails).toHaveBeenCalledWith({
    name: 'Market',
    icon: 'heart'
  }));
});
test('template editor preserves name, quantities and categories across create/edit', async () => {
  setup();
  fireEvent.click(screen.getAllByRole('button', {
    name: 'Listenoptionen'
  })[0]);
  fireEvent.click(dialog().getByRole('button', {
    name: 'Einkaufsvorlagen'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Neue Vorlage',
    exact: true
  }));
  fireEvent.change(screen.getByPlaceholderText('z.B. Wocheneinkauf'), {
    target: {
      value: 'Breakfast'
    }
  });
  fireEvent.change(screen.getByPlaceholderText('Vorlagenartikel'), {
    target: {
      value: 'Bread'
    }
  });
  fireEvent.change(screen.getByPlaceholderText('Menge/Details'), {
    target: {
      value: '2 loaves'
    }
  });
  fireEvent.change(screen.getByPlaceholderText('Kategorie'), {
    target: {
      value: 'Bakery'
    }
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Vorlage speichern'
  }));
  await waitFor(() => expect(mockShopping.createTemplate).toHaveBeenCalledWith({
    name: 'Breakfast',
    items: [{
      name: 'Bread',
      spec: '2 loaves',
      category: 'Bakery'
    }]
  }));
});
test('failed template save keeps the draft and reports an error', async () => {
  setup({
    createTemplate: jest.fn().mockResolvedValue(false)
  });
  fireEvent.click(screen.getAllByRole('button', {
    name: 'Listenoptionen'
  })[0]);
  fireEvent.click(dialog().getByRole('button', {
    name: 'Einkaufsvorlagen'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Neue Vorlage',
    exact: true
  }));
  fireEvent.change(screen.getByPlaceholderText('z.B. Wocheneinkauf'), {
    target: {
      value: 'Breakfast'
    }
  });
  fireEvent.change(screen.getByPlaceholderText('Vorlagenartikel'), {
    target: {
      value: 'Bread'
    }
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Vorlage speichern'
  }));
  expect(await dialog().findByRole('alert')).toBeVisible();
  expect(screen.getByPlaceholderText('Vorlagenartikel')).toHaveValue('Bread');
});
test('family/user preferences are isolated and revisiting restores only that scope', () => {
  const view = setup({}, {
    demoMode: false
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Listenansicht',
    exact: true
  }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Favorit speichern'
  }));
  mockApp = {
    ...mockApp,
    familyId: 2
  };
  view.rerender(<ShoppingView />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', {
    name: 'Kachelansicht'
  })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  expect(dialog().getByRole('button', {
    name: 'Favorit speichern'
  })).toBeVisible();
  mockApp = {
    ...mockApp,
    familyId: 1,
    me: {
      id: 2
    }
  };
  view.rerender(<ShoppingView />);
  expect(screen.getByRole('button', {
    name: 'Kachelansicht'
  })).toHaveAttribute('aria-pressed', 'true');
  mockApp = {
    ...mockApp,
    me: {
      id: 1
    }
  };
  view.rerender(<ShoppingView />);
  expect(screen.getByRole('button', {
    name: 'Listenansicht'
  })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  expect(dialog().getByRole('button', {
    name: 'Favorit entfernen'
  })).toBeVisible();
});
test('Recent restores the selected history record with its metadata instead of adding a replacement', async () => {
  const item = {
    ...apple,
    checked: true,
    archived: true,
    photo: 'data:image/png;base64,iVBORw0KGgo=',
    priority: 'urgent'
  };
  setup({
    items: [item],
    uncheckedItems: []
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Zuletzt',
    exact: true
  }));
  fireEvent.click(screen.getByRole('button', {
    name: 'Äpfel, hinzufügen'
  }));
  await waitFor(() => expect(mockShopping.restoreItem).toHaveBeenCalledWith(1));
  expect(mockShopping.addProduct).not.toHaveBeenCalled();
});
test('a pending editor response cannot close a new editor after switching lists', async () => {
  let resolve;
  const pending = new Promise(done => {
    resolve = done;
  });
  const view = setup({
    editItem: jest.fn(() => pending)
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Äpfel'
  }));
  fireEvent.click(dialog().getByRole('button', {
    name: 'Speichern',
    exact: true
  }));
  mockShopping = {
    ...mockShopping,
    activeListId: 20
  };
  view.rerender(<ShoppingView />);
  fireEvent.click(screen.getByRole('button', {
    name: 'Details zu Milch'
  }));
  await act(async () => {
    resolve(true);
    await pending;
  });
  expect(dialog().getByLabelText('Artikel')).toHaveValue('Milch');
});
test('today meal card follows the real meal_name contract and pre-deselects both open and basket ingredients', async () => {
  api.apiListRecipes.mockResolvedValue({
    ok: true,
    data: [{
      id: 41,
      title: 'Family supper',
      servings: 4,
      ingredients: [{
        name: 'Äpfel'
      }, {
        name: 'Milch'
      }, {
        name: 'Salt'
      }]
    }]
  });
  api.apiListMealPlans.mockResolvedValue({
    ok: true,
    data: [{
      meal_name: 'Family supper'
    }]
  });
  setup({
    items: [apple, {
      ...milk,
      checked: true
    }],
    uncheckedItems: [apple],
    checkedItems: [{
      ...milk,
      checked: true
    }]
  }, {
    demoMode: false
  });
  fireEvent.click(await screen.findByRole('button', {
    name: 'Zutaten auswählen'
  }));
  expect(dialog().getByRole('checkbox', {
    name: /Äpfel/
  })).not.toBeChecked();
  expect(dialog().getByRole('checkbox', {
    name: /Milch/
  })).not.toBeChecked();
  expect(dialog().getByRole('checkbox', {
    name: /Salt/
  })).toBeChecked();
  fireEvent.click(dialog().getByRole('button', {
    name: 'Ausgewählte Zutaten hinzufügen'
  }));
  await waitFor(() => expect(mockShopping.addRecipeIngredients).toHaveBeenCalledWith(41, ['Salt']));
});
test('deleting the selected list while its dialog is open renders the remaining list without crashing', () => {
  const view = setup();
  fireEvent.click(screen.getAllByRole('button', {
    name: 'Listenoptionen'
  })[0]);
  fireEvent.click(dialog().getByRole('button', {
    name: 'Liste löschen',
    exact: true
  }));
  mockShopping = {
    ...mockShopping,
    activeList: null,
    shoppingLists: [{
      id: 20,
      name: 'Other'
    }]
  };
  expect(() => view.rerender(<ShoppingView />)).not.toThrow();
  expect(screen.getByRole('heading', {
    name: 'Für alles, was euch fehlt.'
  })).toBeVisible();
});

test('a custom favourite remains available on another list in the same browser scope', () => {
  const custom={...apple,name:'Oat drink'};
  const view=setup({items:[custom],uncheckedItems:[custom]});
  fireEvent.click(screen.getByRole('button',{name:'Details zu Oat drink'}));
  fireEvent.click(dialog().getByRole('button',{name:'Favorit speichern'}));
  fireEvent.click(dialog().getByRole('button',{name:'Abbrechen'}));
  mockShopping={...mockShopping,activeListId:20,activeList:{id:20,name:'Other'},items:[],uncheckedItems:[]};
  view.rerender(<ShoppingView/>);
  expect(screen.getByRole('button',{name:'Oat drink, hinzufügen'})).toBeVisible();
});
