import { findReusableCheckedItem, formatShoppingItemName } from '../../hooks/useShopping';

describe('shopping item helpers', () => {
  test('capitalizes the first product name letter and trims whitespace', () => {
    expect(formatShoppingItemName('  milch  ')).toBe('Milch');
    expect(formatShoppingItemName('Äpfel')).toBe('Äpfel');
  });

  test('finds a reusable checked item by normalized name and matching details', () => {
    const items = [
      { id: 1, name: 'Milch', spec: null, category: null, checked: true },
      { id: 2, name: 'Milch', spec: '2 L', category: null, checked: true },
      { id: 3, name: 'Brot', spec: null, category: null, checked: false },
    ];

    expect(findReusableCheckedItem(items, { name: ' milch ', spec: '', category: null })).toEqual(items[0]);
    expect(findReusableCheckedItem(items, { name: 'milch', spec: '2 L', category: null })).toEqual(items[1]);
    expect(findReusableCheckedItem(items, { name: 'brot', spec: null, category: null })).toBeNull();
    expect(findReusableCheckedItem(items, { name: 'milch', spec: '1 L', category: null })).toBeNull();
  });
});
