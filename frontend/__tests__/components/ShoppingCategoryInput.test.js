import '@testing-library/jest-dom';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ShoppingCategoryInput from '../../components/ShoppingCategoryInput';

function Input() {
  const [value, setValue] = useState('');
  return <ShoppingCategoryInput value={value} onChange={setValue} categories={['Dairy', ' dairy ', 'Dry goods']} label="Category" />;
}

test('category suggestions require text and support keyboard, Escape, blur, touch, clear and retype', () => {
  render(<Input />);
  const input = screen.getByRole('combobox', { name: 'Category' });
  fireEvent.focus(input);
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(input, { target: { value: '  ' } });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(input, { target: { value: 'd' } });
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(document.getElementById(input.getAttribute('aria-activedescendant'))).toHaveTextContent('Dairy');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('Dairy');
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.change(input, { target: { value: 'dr' } });
  fireEvent.pointerDown(screen.getByRole('option'), { pointerType: 'touch' });
  fireEvent.click(screen.getByRole('option'));
  expect(input).toHaveValue('Dry goods');
  fireEvent.focus(input);
  expect(screen.getByRole('listbox')).toBeVisible();
  fireEvent.blur(input);
  expect(screen.queryByRole('listbox')).toBeNull();
});
