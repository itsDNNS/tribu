import {
  findReusableCheckedItem,
  formatShoppingItemName,
  predictShoppingItemTransition,
  shoppingSpecsAreCompatible,
} from '../../hooks/useShopping';

describe('shopping item helpers', () => {
  test('capitalizes the first product name letter and trims whitespace', () => {
    expect(formatShoppingItemName('  milch  ')).toBe('Milch');
    expect(formatShoppingItemName('Äpfel')).toBe('Äpfel');
  });

  test('finds a reusable checked item by normalized name and compatible details, independent of category', () => {
    const items = [
      { id: 1, name: 'Milch', spec: null, category: null, checked: true },
      { id: 2, name: 'Milch', spec: '2 L', category: null, checked: true },
      { id: 3, name: 'Brot', spec: null, category: null, checked: false },
    ];

    expect(findReusableCheckedItem(items, { name: ' milch ', spec: '', category: 'Other' })).toEqual(items[0]);
    expect(findReusableCheckedItem(items, { name: 'milch', spec: '2 L', category: null })).toEqual(items[0]);
    expect(findReusableCheckedItem(items, { name: 'brot', spec: null, category: null })).toBeNull();
    expect(findReusableCheckedItem([items[1]], { name: 'milch', spec: '1 kg', category: null })).toBeNull();
  });

  test('predicts active merge before checked restore and sums matching quantities', () => {
    const items = [
      { id: 1, name: 'Milch', spec: '2 L', category: 'Dairy', checked: true },
      { id: 2, name: 'Milch', spec: '1 l', category: 'Other', checked: false },
    ];
    expect(predictShoppingItemTransition(items, { name: ' milch ', spec: '0,5 L' })).toEqual({
      item: items[1], action: 'merged', spec: '1.5 l',
    });
  });

  test('uses Unicode-aware normalized product names', () => {
    const item = { id: 1, name: 'Straße', spec: null, category: null, checked: false };
    expect(predictShoppingItemTransition([item], { name: 'STRASSE', spec: null })).toMatchObject({
      item, action: 'merged',
    });
  });

  test('restores checked quantities without summing and keeps nonblank details', () => {
    const checked = { id: 1, name: 'Flour', spec: '2 kg', category: 'Pantry', checked: true };
    expect(predictShoppingItemTransition([checked], { name: 'flour', spec: '1 KG' })).toEqual({
      item: checked, action: 'restored', spec: '1 KG',
    });
    expect(predictShoppingItemTransition([checked], { name: 'flour', spec: '' })).toEqual({
      item: checked, action: 'restored', spec: '2 kg',
    });
  });

  test('matches the detail compatibility truth table', () => {
    expect(shoppingSpecsAreCompatible(null, '')).toBe(true);
    expect(shoppingSpecsAreCompatible(null, 'organic')).toBe(true);
    expect(shoppingSpecsAreCompatible(' Organic ', 'organic')).toBe(true);
    expect(shoppingSpecsAreCompatible('organic', 'ripe')).toBe(false);
    expect(shoppingSpecsAreCompatible('2 L', '1 l')).toBe(true);
    expect(shoppingSpecsAreCompatible('2 L', '1 kg')).toBe(false);
    expect(shoppingSpecsAreCompatible('2', '1')).toBe(true);
    expect(shoppingSpecsAreCompatible('2', 'organic')).toBe(false);
  });
});
