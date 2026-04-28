import { formatIngredientAmount, scaleRecipeIngredients } from '../../lib/recipes';

describe('recipe scaling helpers', () => {
  test('scales numeric ingredient amounts from base servings to target servings', () => {
    const scaled = scaleRecipeIngredients(
      [
        { name: 'Flour', amount: 250, unit: 'g' },
        { name: 'Milk', amount: 300, unit: 'ml' },
        { name: 'Salt', amount: null, unit: null },
      ],
      4,
      8,
    );

    expect(scaled).toEqual([
      { name: 'Flour', amount: 500, unit: 'g', scalable: true },
      { name: 'Milk', amount: 600, unit: 'ml', scalable: true },
      { name: 'Salt', amount: null, unit: null, scalable: false },
    ]);
    expect(formatIngredientAmount(scaled[0])).toBe('500 g');
  });

  test('keeps unsupported scaling explicit when base or target servings are missing', () => {
    const scaled = scaleRecipeIngredients([{ name: 'Flour', amount: 250, unit: 'g' }], null, 8);

    expect(scaled).toEqual([{ name: 'Flour', amount: 250, unit: 'g', scalable: false }]);
  });
});
