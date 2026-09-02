import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShoppingView from '../../components/ShoppingView';

let mockAppState = {};
let mockShoppingState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../hooks/useShopping', () => ({
  useShopping: () => mockShoppingState,
}));

const messages = {
  'module.shopping.name': 'Shopping',
  'module.shopping.new_list': 'New list',
  'module.shopping.list_name': 'List name',
  'module.shopping.list_name_placeholder': 'e.g. Grocery Store',
  'module.shopping.item_name': 'Item',
  'module.shopping.item_name_placeholder': 'Add an item...',
  'module.shopping.item_spec': 'Details',
  'module.shopping.item_spec_placeholder': 'e.g. 500g, organic',
  'module.shopping.item_category': 'Category',
  'module.shopping.item_category_placeholder': 'Category or aisle',
  'module.shopping.items': 'Items',
  'module.shopping.no_items': 'No items yet',
  'module.shopping.add_first_item': 'Add first item',
  'module.shopping.checked_section': 'Checked',
  'module.shopping.clear_checked': 'Clear checked',
  'module.shopping.clear_checked_confirm': 'Remove all checked items?',
  'module.shopping.delete_list': 'Delete list',
  'module.shopping.delete_list_confirm': 'Delete this list and all its items?',
  'module.shopping.no_lists': 'No shopping lists yet',
  'module.shopping.templates': 'Templates',
  'module.shopping.new_template': 'New template',
  'module.shopping.show_templates': 'Show templates',
  'module.shopping.hide_templates': 'Hide templates',
  'module.shopping.template_name_placeholder': 'e.g. Weekly groceries',
  'module.shopping.template_item_name_placeholder': 'Template item',
  'module.shopping.template_item_spec_placeholder': 'Amount/details',
  'module.shopping.template_item_category_placeholder': 'Category',
  'module.shopping.add_template_item': 'Add template item',
  'module.shopping.save_template': 'Save template',
  'module.shopping.cancel_template': 'Cancel',
  'module.shopping.apply_template': 'Add to list',
  'module.shopping.edit_template': 'Edit template',
  'module.shopping.delete_template': 'Delete template',
  'module.shopping.rename_list': 'Rename list',
  'module.shopping.edit_item': 'Edit item',
  'module.shopping.move_to_list': 'Move to list',
  'module.shopping.keep_current_list': 'Keep in current list',
  'module.shopping.save': 'Save',
  'module.shopping.cancel': 'Cancel',
  'module.shopping.search_online_title': 'Search for {name}',
  'module.shopping.search_online_hint': 'Opens the store website in a new tab.',
  'aria.rename_list': 'Rename list: {name}',
  'aria.edit_item': 'Edit item: {name}',
  'aria.delete_item': 'Delete item: {name}',
  'aria.delete_list': 'Delete list: {name}',
  'aria.delete_template': 'Delete template: {name}',
  'aria.add_item': 'Add item',
  'aria.search_item': 'Search online: {name}',
  'cancel': 'Cancel',
};

function setup(overrides = {}, appOverrides = {}) {
  mockAppState = {
    familyId: '1',
    families: [{ family_id: 1, family_name: 'Test Family' }],
    members: [],
    messages,
    isMobile: false,
    isChild: false,
    ...appOverrides,
  };
  mockShoppingState = {
    shoppingLists: [{ id: 10, name: 'Groceries', item_count: 0, checked_count: 0 }],
    activeListId: 10,
    setActiveListId: jest.fn(),
    activeList: { id: 10, name: 'Groceries', item_count: 0, checked_count: 0 },
    items: [],
    uncheckedItems: [],
    checkedItems: [],
    newListName: '',
    setNewListName: jest.fn(),
    newItemName: '',
    setNewItemName: jest.fn(),
    newItemSpec: '',
    setNewItemSpec: jest.fn(),
    newItemCategory: '',
    setNewItemCategory: jest.fn(),
    showCreateList: false,
    setShowCreateList: jest.fn(),
    itemInputRef: { current: null },
    createList: jest.fn(),
    renameList: jest.fn(),
    deleteList: jest.fn(),
    addItem: jest.fn((event) => event.preventDefault()),
    toggleItem: jest.fn(),
    editItem: jest.fn(),
    moveItem: jest.fn(),
    deleteItem: jest.fn(),
    clearChecked: jest.fn(),
    wsConnected: true,
    templates: [
      { id: 5, name: 'Weekly groceries', item_count: 2, items: [
        { id: 51, name: 'Milk', spec: '2 L', category: 'Dairy' },
        { id: 52, name: 'Bananas', spec: '6', category: 'Produce' },
      ] },
    ],
    storeLinks: [],
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    applyTemplate: jest.fn(),
    ...overrides,
  };
  return render(<ShoppingView />);
}

describe('ShoppingView redesign shell', () => {
  test('renders the active list command header and category overview', () => {
    const { container } = setup({
      items: [
        { id: 1, name: 'Milk', spec: null, category: 'Dairy', checked: false },
        { id: 2, name: 'Apples', spec: null, category: 'Produce', checked: false },
      ],
      uncheckedItems: [
        { id: 1, name: 'Milk', spec: null, category: 'Dairy', checked: false },
        { id: 2, name: 'Apples', spec: null, category: 'Produce', checked: false },
      ],
      checkedItems: [],
    });

    expect(container.querySelector('.shopping-active-header')).toBeInTheDocument();
    expect(container.querySelector('.shopping-active-select')).toBeInTheDocument();
    expect(container.querySelector('.shopping-category-overview')).toHaveTextContent('Dairy');
    expect(container.querySelector('.shopping-category-overview')).toHaveTextContent('Produce');
    expect(container.querySelector('.shopping-category-summary')).toHaveTextContent('2 Items');
    expect(container.querySelector('.shopping-total-chip')).not.toBeInTheDocument();
  });
});

describe('shopping store search picker', () => {
  const bread = { id: 1, list_id: 10, name: 'Bread', checked: false, added_by_user_id: null };
  const validStore = { id: 4, name: 'E2E Store', url_template: 'https://www.example.com/search?q={query}' };

  function storeSetup(overrides = {}, appOverrides = {}) {
    return setup({
      shoppingLists: [{ id: 10, name: 'Groceries', item_count: 1, checked_count: 0 }],
      activeList: { id: 10, name: 'Groceries', item_count: 1, checked_count: 0 },
      items: [bread],
      uncheckedItems: [bread],
      checkedItems: [],
      ...overrides,
    }, appOverrides);
  }

  it('renders no action for zero stores or invalid-only stores', () => {
    const first = storeSetup();
    expect(screen.queryByRole('button', { name: 'Search online: Bread' })).not.toBeInTheDocument();
    first.unmount();
    storeSetup({ storeLinks: [{ id: 1, name: 'Broken', url_template: 'javascript:{query}' }] });
    expect(screen.queryByRole('button', { name: 'Search online: Bread' })).not.toBeInTheDocument();
  });

  it('hides the action for children even when a store is valid', () => {
    storeSetup({ storeLinks: [validStore] }, { isChild: true });
    expect(screen.queryByRole('button', { name: 'Search online: Bread' })).not.toBeInTheDocument();
  });

  it('opens a safe native-link picker without toggling the item', () => {
    storeSetup({ storeLinks: [validStore] });
    const searchButton = screen.getByRole('button', { name: 'Search online: Bread' });
    fireEvent.click(searchButton);
    const dialog = screen.getByRole('dialog', { name: 'Search for Bread' });
    const link = within(dialog).getByRole('link', { name: /E2E Store/ });
    expect(link).toHaveAttribute('href', 'https://www.example.com/search?q=Bread');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('www.example.com');
    expect(mockShoppingState.toggleItem).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockShoppingState.toggleItem).not.toHaveBeenCalled();
  });

  it('focuses the first link and restores focus after Escape', async () => {
    storeSetup({ storeLinks: [validStore] });
    const searchButton = screen.getByRole('button', { name: 'Search online: Bread' });
    searchButton.focus();
    fireEvent.click(searchButton);
    const link = screen.getByRole('link', { name: /E2E Store/ });
    await waitFor(() => expect(link).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(searchButton).toHaveFocus());
  });
});



describe('ShoppingView list and item editing', () => {
  test('renames the active list from an inline form', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Rename list: Groceries' }));
    const form = document.querySelector('.shopping-list-rename-form');
    expect(form).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('List name'), { target: { value: 'Store B' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockShoppingState.renameList).toHaveBeenCalledWith(10, 'Store B'));
  });

  test('hides rename and item edit affordances from child members', () => {
    setup({
      uncheckedItems: [{ id: 1, name: 'Bread', spec: null, category: null, checked: false }],
      items: [{ id: 1, name: 'Bread', spec: null, category: null, checked: false }],
    }, { isChild: true });

    expect(screen.queryByRole('button', { name: 'Rename list: Groceries' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit item: Bread' })).not.toBeInTheDocument();
  });

  test('edits item details and moves the item to another list', async () => {
    setup({
      shoppingLists: [
        { id: 10, name: 'Groceries', item_count: 1, checked_count: 0 },
        { id: 11, name: 'Store B', item_count: 0, checked_count: 0 },
      ],
      uncheckedItems: [{ id: 1, list_id: 10, name: 'Bread', spec: '1 loaf', category: 'Bakery', checked: false }],
      items: [{ id: 1, list_id: 10, name: 'Bread', spec: '1 loaf', category: 'Bakery', checked: false }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item: Bread' }));
    const form = document.querySelector('.shopping-item-edit-form');
    expect(form).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Item'), { target: { value: 'baguette' } });
    fireEvent.change(within(form).getByLabelText('Details'), { target: { value: '2 loaves' } });
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'Bakery aisle' } });
    fireEvent.change(within(form).getByLabelText('Move to list'), { target: { value: '11' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockShoppingState.editItem).toHaveBeenCalledWith(1, {
      name: 'baguette',
      spec: '2 loaves',
      category: 'Bakery aisle',
      list_id: 11,
    }));
    expect(mockShoppingState.moveItem).not.toHaveBeenCalled();
  });

  test('escape closes the item edit form without saving', () => {
    setup({
      uncheckedItems: [{ id: 1, list_id: 10, name: 'Bread', spec: null, category: null, checked: false }],
      items: [{ id: 1, list_id: 10, name: 'Bread', spec: null, category: null, checked: false }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit item: Bread' }));
    fireEvent.keyDown(within(document.querySelector('.shopping-item-edit-form')).getByLabelText('Item'), { key: 'Escape' });

    expect(document.querySelector('.shopping-item-edit-form')).not.toBeInTheDocument();
    expect(mockShoppingState.editItem).not.toHaveBeenCalled();
    expect(mockShoppingState.moveItem).not.toHaveBeenCalled();
  });
});

describe('ShoppingView quick add', () => {
  test('keeps quick-add suggestions inactive until the user types a real query', () => {
    setup({
      items: [
        { id: 1, name: 'Milk', spec: null, checked: true },
        { id: 2, name: 'Bread', spec: null, checked: false },
        { id: 3, name: 'Milk', spec: null, checked: false },
      ],
      checkedItems: [{ id: 1, name: 'Milk', spec: null, checked: true }],
      uncheckedItems: [{ id: 2, name: 'Bread', spec: null, checked: false }, { id: 3, name: 'Milk', spec: null, checked: false }],
    });

    const input = screen.getByPlaceholderText('Add an item...');
    expect(input).not.toHaveAttribute('list');
    expect(screen.queryByRole('listbox', { name: 'Add an item...' })).not.toBeInTheDocument();
  });

  test('keeps quick-add suggestions inactive for whitespace-only input', () => {
    setup({
      newItemName: '  ',
      items: [
        { id: 1, name: 'Milk', spec: null, checked: true },
        { id: 2, name: 'Bread', spec: null, checked: false },
      ],
    });

    const input = screen.getByPlaceholderText('Add an item...');
    expect(input).not.toHaveAttribute('list');
    expect(screen.queryByRole('listbox', { name: 'Add an item...' })).not.toBeInTheDocument();
  });

  test('filters quick-add suggestions after typed input', () => {
    setup({
      newItemName: 'mi',
      items: [
        { id: 1, name: 'Milk', spec: null, checked: true },
        { id: 2, name: 'Bread', spec: null, checked: false },
        { id: 3, name: 'Milk', spec: null, checked: false },
      ],
      checkedItems: [{ id: 1, name: 'Milk', spec: null, checked: true }],
      uncheckedItems: [{ id: 2, name: 'Bread', spec: null, checked: false }, { id: 3, name: 'Milk', spec: null, checked: false }],
    });

    const input = screen.getByPlaceholderText('Add an item...');
    fireEvent.focus(input);

    expect(input).not.toHaveAttribute('list');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getByRole('listbox', { name: 'Add an item...' }).querySelectorAll('[role="option"]');
    const optionLabels = Array.from(options).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Milk']);
  });

  test('supports keyboard selection in the app-controlled quick-add suggestions', () => {
    setup({
      newItemName: 'm',
      items: [
        { id: 1, name: 'Milk', spec: null, checked: true },
        { id: 2, name: 'Muesli', spec: null, checked: false },
      ],
    });

    const input = screen.getByPlaceholderText('Add an item...');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(input).toHaveAttribute('aria-activedescendant', 'shopping-item-suggestion-0');
    expect(screen.getByRole('option', { name: 'Milk' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'shopping-item-suggestion-1');
    expect(screen.getByRole('option', { name: 'Muesli' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockShoppingState.setNewItemName).toHaveBeenCalledWith('Muesli');
  });

  test('reopens quick-add suggestions as an opaque app-controlled list after clearing and typing again', () => {
    const { rerender } = setup({
      newItemName: 'mi',
      items: [
        { id: 1, name: 'Milk', spec: null, checked: true },
        { id: 2, name: 'Bread', spec: null, checked: false },
      ],
    });

    const input = screen.getByPlaceholderText('Add an item...');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox', { name: 'Add an item...' })).toHaveClass('shopping-item-suggestions');

    mockShoppingState.newItemName = '';
    rerender(<ShoppingView />);
    expect(screen.queryByRole('listbox', { name: 'Add an item...' })).not.toBeInTheDocument();

    mockShoppingState.newItemName = 'br';
    rerender(<ShoppingView />);
    fireEvent.focus(screen.getByPlaceholderText('Add an item...'));
    expect(screen.getByRole('option', { name: 'Bread' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Add an item...' })).toHaveClass('shopping-item-suggestions');
  });

  test('adds a category field and groups items into collapsible category sections', () => {
    setup({
      uncheckedItems: [
        { id: 1, name: 'Salmon', spec: null, category: 'Fish', checked: false },
        { id: 2, name: 'Carrots', spec: null, category: 'Vegetables', checked: false },
        { id: 3, name: 'Chocolate', spec: null, category: 'Sweets', checked: false },
      ],
      checkedItems: [],
      items: [
        { id: 1, name: 'Salmon', spec: null, category: 'Fish', checked: false },
        { id: 2, name: 'Carrots', spec: null, category: 'Vegetables', checked: false },
        { id: 3, name: 'Chocolate', spec: null, category: 'Sweets', checked: false },
      ],
    });

    expect(screen.getByPlaceholderText('Category or aisle')).toBeInTheDocument();
    const vegetablesToggle = document.querySelector('#shopping-category-vegetables-items').previousElementSibling;
    expect(vegetablesToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(vegetablesToggle);
    expect(vegetablesToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Carrots' })).not.toBeInTheDocument();
  });
});

describe('ShoppingView templates', () => {
  test('renders saved templates and can apply one to the active list', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('2 L')).toBeInTheDocument();
    expect(screen.getByText('Dairy')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to list: Weekly groceries' }));
    expect(mockShoppingState.applyTemplate).toHaveBeenCalledWith(5);
  });

  test('creates and edits templates with name, spec, and category fields', async () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekly groceries'), { target: { value: 'Weekly basics' } });
    fireEvent.change(screen.getByPlaceholderText('Template item'), { target: { value: 'Oats' } });
    fireEvent.change(screen.getByPlaceholderText('Amount/details'), { target: { value: '1 kg' } });
    fireEvent.change(screen.getByPlaceholderText('Category'), { target: { value: 'Pantry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add template item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(mockShoppingState.createTemplate).toHaveBeenCalledWith({
      name: 'Weekly basics',
      items: [{ name: 'Oats', spec: '1 kg', category: 'Pantry' }],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit template: Weekly groceries' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Weekly groceries'), { target: { value: 'Weekly restock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(mockShoppingState.updateTemplate).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'Weekly restock' })));
  });
});


describe('ShoppingView mobile store flow', () => {
  test('keeps templates collapsed by default on mobile and expands them for planning', () => {
    const { rerender } = setup({}, { isMobile: true });

    expect(screen.getByRole('heading', { name: 'Templates' })).toBeInTheDocument();
    expect(screen.queryByText('Weekly groceries')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show templates' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide templates' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument();

    const itemsPanel = document.querySelector('.shopping-items-panel');
    const templatesPanel = document.querySelector('.shopping-templates-panel');
    expect(itemsPanel.compareDocumentPosition(templatesPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<ShoppingView />);
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
  });

  test('blurs the quick-add input when checking items on mobile', () => {
    setup({
      uncheckedItems: [{ id: 1, name: 'Apples', spec: '6', category: 'Produce', checked: false }],
      checkedItems: [],
      items: [{ id: 1, name: 'Apples', spec: '6', category: 'Produce', checked: false }],
    }, { isMobile: true });

    const input = screen.getByPlaceholderText('Add an item...');
    act(() => input.focus());
    expect(document.activeElement).toBe(input);

    const item = screen.getByRole('checkbox', { name: 'Apples' });
    fireEvent.pointerDown(item);
    fireEvent.click(item);

    expect(document.activeElement).not.toBe(input);
    expect(mockShoppingState.toggleItem).toHaveBeenCalledWith(1, false);
  });
});


test('mobile template toggle closes an open template form when hiding templates', () => {
  setup({}, { isMobile: true });

  fireEvent.click(screen.getByRole('button', { name: 'Show templates' }));
  fireEvent.click(screen.getByRole('button', { name: 'New template' }));
  expect(screen.getByPlaceholderText('e.g. Weekly groceries')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Hide templates' }));
  expect(screen.queryByPlaceholderText('e.g. Weekly groceries')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show templates' })).toHaveAttribute('aria-expanded', 'false');
});
