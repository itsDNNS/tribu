import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipesView from '../../components/RecipesView';
import { buildMessages } from '../../lib/i18n';

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

let mockAppState = {};
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const apiListRecipes = jest.fn();
const apiCreateRecipe = jest.fn();
const apiUpdateRecipe = jest.fn();
const apiDeleteRecipe = jest.fn();
const apiAddRecipeIngredientsToShopping = jest.fn();
jest.mock('../../lib/api', () => ({
  apiListRecipes: (...args) => apiListRecipes(...args),
  apiCreateRecipe: (...args) => apiCreateRecipe(...args),
  apiUpdateRecipe: (...args) => apiUpdateRecipe(...args),
  apiDeleteRecipe: (...args) => apiDeleteRecipe(...args),
  apiAddRecipeIngredientsToShopping: (...args) => apiAddRecipeIngredientsToShopping(...args),
}));

const messages = buildMessages('en');

function baseState(overrides) {
  return {
    familyId: '1',
    families: [{ family_id: 1, family_name: 'Test Family' }],
    messages,
    demoMode: false,
    shoppingLists: [{ id: 9, name: 'Groceries', item_count: 0, checked_count: 0 }],
    loadShoppingLists: jest.fn(),
    ...overrides,
  };
}

const recipe = {
  id: 5,
  family_id: 1,
  title: 'Pancakes',
  description: 'Weekend breakfast',
  source_url: 'https://example.com/pancakes',
  servings: 4,
  tags: ['breakfast'],
  ingredients: [
    { name: 'Flour', amount: 200, unit: 'g' },
    { name: 'Milk', amount: 300, unit: 'ml' },
  ],
  instructions: 'Mix and cook.',
  created_by_user_id: 1,
  created_at: '2099-01-01T00:00:00',
  updated_at: '2099-01-01T00:00:00',
};

describe('RecipesView', () => {
  beforeEach(() => {
    apiListRecipes.mockReset();
    apiCreateRecipe.mockReset();
    apiUpdateRecipe.mockReset();
    apiDeleteRecipe.mockReset();
    apiAddRecipeIngredientsToShopping.mockReset();
    apiListRecipes.mockResolvedValue({ ok: true, data: [] });
    apiCreateRecipe.mockResolvedValue({ ok: true, data: { ...recipe, id: 6, title: 'Soup' } });
    apiUpdateRecipe.mockResolvedValue({ ok: true, data: recipe });
    apiDeleteRecipe.mockResolvedValue({ ok: true, data: {} });
    apiAddRecipeIngredientsToShopping.mockResolvedValue({ ok: true, data: { added_count: 2 } });
  });

  test('renders recipes from the API with ingredient and serving metadata', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({ ok: true, data: [recipe] });

    render(<RecipesView />);

    await waitFor(() => expect(screen.getByText('Pancakes')).toBeInTheDocument());
    expect(screen.getByText('Weekend breakfast')).toBeInTheDocument();
    expect(screen.getByText('4 servings')).toBeInTheDocument();
    expect(screen.getByText('2 ingredients')).toBeInTheDocument();
    expect(screen.getByText('breakfast')).toBeInTheDocument();
  });


  test('does not render unsafe recipe source URLs as links', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({
      ok: true,
      data: [{ ...recipe, source_url: 'javascript:alert(1)' }],
    });

    render(<RecipesView />);

    await waitFor(() => expect(screen.getByText('Pancakes')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Open source' })).not.toBeInTheDocument();
    expect(screen.getByText('No source link')).toBeInTheDocument();
  });

  test('opens add dialog and creates a recipe with structured ingredients', async () => {
    mockAppState = baseState();

    render(<RecipesView />);
    await waitFor(() => expect(apiListRecipes).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Tomato pasta'), { target: { value: 'Soup' } });
    fireEvent.change(screen.getByPlaceholderText('Servings'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('quick, vegetarian, weekday'), { target: { value: 'quick, dinner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.change(screen.getByPlaceholderText('Flour'), { target: { value: 'Carrot' } });
    fireEvent.change(screen.getByPlaceholderText('500'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('g'), { target: { value: 'pcs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiCreateRecipe).toHaveBeenCalledTimes(1));
    expect(apiCreateRecipe).toHaveBeenCalledWith({
      family_id: 1,
      title: 'Soup',
      description: null,
      source_url: null,
      servings: 3,
      tags: ['quick', 'dinner'],
      ingredients: [{ name: 'Carrot', amount: 2, unit: 'pcs' }],
      instructions: null,
    });
  });

  test('pushes selected recipe ingredients to a shopping list and refreshes summaries', async () => {
    const loadShoppingLists = jest.fn();
    mockAppState = baseState({ loadShoppingLists });
    apiListRecipes.mockResolvedValueOnce({ ok: true, data: [recipe] });

    render(<RecipesView />);
    await waitFor(() => expect(screen.getByText('Pancakes')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe "Pancakes"' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Edit recipe' })).toBeInTheDocument());
    let pushButton;
    await waitFor(() => {
      pushButton = screen.getAllByRole('button', { name: 'To shopping list' }).pop();
      expect(pushButton).not.toBeDisabled();
    });
    fireEvent.click(pushButton);

    await waitFor(() => expect(apiAddRecipeIngredientsToShopping).toHaveBeenCalledWith(5, 9, ['Flour', 'Milk']));
    await waitFor(() => expect(loadShoppingLists).toHaveBeenCalled());
  });

  test('demo mode renders the blocked placeholder instead of fetching', () => {
    mockAppState = baseState({ demoMode: true });
    render(<RecipesView />);
    expect(screen.getByText('Not available in demo mode')).toBeInTheDocument();
    expect(apiListRecipes).not.toHaveBeenCalled();
  });
});
