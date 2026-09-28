import { mealSuggestions } from '../../lib/meal-plans';

describe('mealSuggestions (Tribu 2.0, M4)', () => {
  const recipes = [
    { id: 1, title: 'Lasagne', is_favorite: true },
    { id: 2, title: 'Porridge', is_favorite: false },
  ];
  const pastMeals = [
    { meal_name: 'Pancakes', slot: 'morning', plan_date: '2026-09-20', ingredients: [{ name: 'Flour', amount: 200, unit: 'g' }] },
    { meal_name: 'Curry', slot: 'evening', plan_date: '2026-09-25', ingredients: [] },
    { meal_name: 'lasagne', slot: 'evening', plan_date: '2026-09-26', ingredients: [] },
    { meal_name: 'Soup', slot: 'evening', plan_date: '2026-09-22', ingredients: [] },
    { meal_name: 'Curry ', slot: 'evening', plan_date: '2026-09-10', ingredients: [] },
  ];

  it('offers favourites first, then the same meal time, the latest first, each name once', () => {
    const titles = mealSuggestions({ recipes, pastMeals, slot: 'evening' }).map((entry) => `${entry.kind}:${entry.title}`);
    expect(titles).toEqual(['recipe:Lasagne', 'recent:Curry', 'recent:Soup', 'recent:Pancakes']);
  });

  it('carries the ingredients of a past meal and keeps to the limit', () => {
    const [pancakes] = mealSuggestions({ pastMeals, slot: 'morning', limit: 1 });
    expect(pancakes).toEqual({
      kind: 'recent', key: 'recent-pancakes', title: 'Pancakes',
      ingredients: [{ name: 'Flour', amount: '200', unit: 'g' }],
    });
  });
});
