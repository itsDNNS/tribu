import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import MealPlanDialog from '../../components/MealPlanDialog';
import { buildMessages } from '../../lib/i18n';
import { createEmptyMealForm } from '../../lib/meal-plans';

function Harness({ isEditing = false, onForm }) {
  const [form, setForm] = useState(createEmptyMealForm({ plan_date: '2026-09-30', slot: 'evening' }));
  onForm(form);
  return (
    <MealPlanDialog
      open
      onClose={() => {}}
      messages={buildMessages('en')}
      form={form}
      setForm={setForm}
      onSubmit={() => {}}
      isEditing={isEditing}
      recipes={[{ id: 1, title: 'Lasagne', is_favorite: true, ingredients: [{ name: 'Pasta', amount: 500, unit: 'g' }] }]}
      suggestions={[
        { kind: 'recipe', key: 'recipe-1', title: 'Lasagne', recipeId: 1 },
        { kind: 'recent', key: 'recent-curry', title: 'Curry', ingredients: [{ name: 'Rice', amount: '300', unit: 'g' }] },
      ]}
    />
  );
}

test('a suggestion fills in the meal and then steps aside', () => {
  let form;
  render(<Harness onForm={(value) => { form = value; }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Curry, cooked lately' }));
  expect(form.meal_name).toBe('Curry');
  expect(form.ingredients).toEqual([{ name: 'Rice', amount: '300', unit: 'g' }]);
  expect(screen.queryByRole('group', { name: 'Suggestions' })).not.toBeInTheDocument();
});

test('a favourite recipe brings its ingredients', () => {
  let form;
  render(<Harness onForm={(value) => { form = value; }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Lasagne, favourite recipe' }));
  expect(form.meal_name).toBe('Lasagne');
  expect(form.ingredients).toEqual([{ name: 'Pasta', amount: '500', unit: 'g' }]);
});

test('editing a meal shows no suggestions', () => {
  render(<Harness isEditing onForm={() => {}} />);
  expect(screen.queryByRole('group', { name: 'Suggestions' })).not.toBeInTheDocument();
});
