import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  'module.shopping.list_name_placeholder': 'e.g. Grocery Store',
  'module.shopping.item_name_placeholder': 'Add an item...',
  'module.shopping.item_spec_placeholder': 'e.g. 500g, organic',
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
  'aria.delete_item': 'Delete item: {name}',
  'aria.delete_list': 'Delete list: {name}',
  'aria.delete_template': 'Delete template: {name}',
  'aria.add_item': 'Add item',
};

function setup(overrides = {}) {
  mockAppState = {
    familyId: '1',
    families: [{ family_id: 1, family_name: 'Test Family' }],
    members: [],
    messages,
    isMobile: false,
    isChild: false,
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
    showCreateList: false,
    setShowCreateList: jest.fn(),
    itemInputRef: { current: null },
    createList: jest.fn(),
    deleteList: jest.fn(),
    addItem: jest.fn((event) => event.preventDefault()),
    toggleItem: jest.fn(),
    deleteItem: jest.fn(),
    clearChecked: jest.fn(),
    wsConnected: true,
    templates: [
      { id: 5, name: 'Weekly groceries', item_count: 2, items: [
        { id: 51, name: 'Milk', spec: '2 L', category: 'Dairy' },
        { id: 52, name: 'Bananas', spec: '6', category: 'Produce' },
      ] },
    ],
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    applyTemplate: jest.fn(),
    ...overrides,
  };
  return render(<ShoppingView />);
}

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
