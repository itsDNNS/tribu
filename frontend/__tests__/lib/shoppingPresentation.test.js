import { categoryKey, categoryVocabulary, compareCheckedItems } from '../../lib/shoppingPresentation';

test('category matching follows locale-independent backend casefold conventions', () => {
  expect(categoryVocabulary([' Dairy ', 'DAIRY', 'Straße', 'STRASSE', 'İçecek', 'i̇çecek', 'ICE', 'ıce', 'Σ', 'ς'])).toEqual(['Dairy', 'Straße', 'İçecek', 'ICE', 'ıce', 'Σ']);
  expect(categoryKey('İ')).toBe('i̇');
  expect(categoryKey('ı')).not.toBe(categoryKey('I'));
});

test('checked timestamps descend with stable creation time and ID fallback', () => {
  const items = [
    { id: 5, checked_at: null, created_at: '2026-01-01T00:00:00' },
    { id: 4, checked_at: null, created_at: '2026-01-01T00:00:00' },
    { id: 3, checked_at: '2026-09-18T12:00:00Z' },
    { id: 2, checked_at: '2026-09-19T12:00:00' },
  ];
  expect(items.sort(compareCheckedItems).map((item) => item.id)).toEqual([2, 3, 4, 5]);
});
