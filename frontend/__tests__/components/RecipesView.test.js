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
const apiImportRecipe = jest.fn();
jest.mock('../../lib/api', () => ({
  apiListRecipes: (...args) => apiListRecipes(...args),
  apiCreateRecipe: (...args) => apiCreateRecipe(...args),
  apiUpdateRecipe: (...args) => apiUpdateRecipe(...args),
  apiDeleteRecipe: (...args) => apiDeleteRecipe(...args),
  apiAddRecipeIngredientsToShopping: (...args) => apiAddRecipeIngredientsToShopping(...args),
  apiImportRecipe: (...args) => apiImportRecipe(...args),
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
  is_favorite: false,
  last_used_at: null,
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

  test('renders favorite and recently used metadata and toggles favorites', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({
      ok: true,
      data: [{ ...recipe, is_favorite: true, last_used_at: '2099-01-02T03:04:05' }],
    });

    render(<RecipesView />);

    await waitFor(() => expect(screen.getByText('Favorite')).toBeInTheDocument());
    expect(screen.getByText('Used recently')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pancakes from favorites' }));

    await waitFor(() => expect(apiUpdateRecipe).toHaveBeenCalledWith(5, { is_favorite: false }));
  });

  test('an open recipe scales its servings conservatively', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({
      ok: true,
      data: [{
        ...recipe,
        ingredients: [...recipe.ingredients, { name: 'Salt', amount: null, unit: null }],
      }],
    });

    render(<RecipesView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pancakes' }));
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(screen.getByText('8 servings')).toBeInTheDocument();
    expect(screen.getByText('400 g')).toBeInTheDocument();
    expect(screen.getByText('600 ml')).toBeInTheDocument();
    // Salt has no amount to scale and shows none.
    expect(screen.getByRole('checkbox', { name: 'Salt' })).toBeInTheDocument();
  });

  test('an open recipe shows ingredients and numbered steps as tabs', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({
      ok: true,
      data: [{ ...recipe, instructions: '1. Mix flour and milk.\n\n2) Rest for ten minutes.\n- Fry in a hot pan.' }],
    });

    render(<RecipesView />);
    // The whole card opens the recipe (discussion #511).
    fireEvent.click(await screen.findByText('Weekend breakfast'));
    expect(screen.getByRole('heading', { name: 'Pancakes', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ingredients · 2' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Instructions · 3' }));
    expect(screen.getByRole('tab', { name: 'Instructions · 3' })).toHaveAttribute('aria-selected', 'true');
    const steps = screen.getAllByRole('checkbox').filter((box) => box.className.includes('recipe-step'));
    expect(steps.map((step) => step.textContent)).toEqual(['1Mix flour and milk.', '2Rest for ten minutes.', '3Fry in a hot pan.']);
    fireEvent.click(steps[0]);
    expect(steps[0]).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'All recipes' }));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add recipe' })).toBeInTheDocument();
  });

  test('a recipe without steps points to editing', async () => {
    mockAppState = baseState();
    apiListRecipes.mockResolvedValueOnce({ ok: true, data: [{ ...recipe, instructions: null }] });

    render(<RecipesView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pancakes' }));
    expect(screen.getByText('No steps yet. Add them under “Edit”.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' }).pop());
    expect(await screen.findByRole('dialog', { name: 'Edit recipe' })).toBeInTheDocument();
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

  test('only the ingredients still missing go on the shopping list', async () => {
    const loadShoppingLists = jest.fn();
    mockAppState = baseState({ loadShoppingLists });
    apiListRecipes.mockResolvedValueOnce({ ok: true, data: [recipe] });

    render(<RecipesView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pancakes' }));
    // Milk is at home already.
    fireEvent.click(screen.getByRole('checkbox', { name: /Milk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'To shopping list (1)' }));

    await waitFor(() => expect(apiAddRecipeIngredientsToShopping).toHaveBeenCalledWith(5, 9, ['Flour']));
    await waitFor(() => expect(loadShoppingLists).toHaveBeenCalled());
  });

  test('a recipe page fills the new recipe to check before saving', async () => {
    mockAppState = baseState();
    apiImportRecipe.mockResolvedValueOnce({
      ok: true,
      data: {
        title: 'Lentil soup',
        description: 'Warming.',
        source_url: 'https://example.com/lentils',
        servings: 4,
        tags: ['Soup'],
        ingredients: [{ name: 'Lentils', amount: 300, unit: 'g' }, { name: 'Salt', amount: null, unit: null }],
        instructions: 'Rinse.\nSimmer.',
      },
    });

    render(<RecipesView />);
    await waitFor(() => expect(apiListRecipes).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Add recipe' }));
    // The page is loaded through the server, and the dialog says so.
    expect(screen.getByText(/loads the page through your server/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Take it from a link'), { target: { value: 'https://example.com/lentils' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Tomato pasta')).toHaveValue('Lentil soup'));
    expect(apiImportRecipe).toHaveBeenCalledWith('1', 'https://example.com/lentils');
    expect(screen.getByText('Imported. Check the ingredients and steps, then save.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiCreateRecipe).toHaveBeenCalledWith({
      family_id: 1,
      title: 'Lentil soup',
      description: 'Warming.',
      source_url: 'https://example.com/lentils',
      servings: 4,
      tags: ['Soup'],
      ingredients: [{ name: 'Lentils', amount: 300, unit: 'g' }, { name: 'Salt', amount: null, unit: null }],
      instructions: 'Rinse.\nSimmer.',
    }));
  });

  test('demo mode renders the blocked placeholder instead of fetching', () => {
    mockAppState = baseState({ demoMode: true });
    render(<RecipesView />);
    expect(screen.getByText('Not available in demo mode')).toBeInTheDocument();
    expect(apiListRecipes).not.toHaveBeenCalled();
  });
});
