/**
 * Recipe print sheet: HTML content and escaping.
 */
import { buildRecipeHtml } from '@/features/meals/recipe-print';
import type { Recipe } from '@/features/meals/recipe-model';

// jest.mock calls are hoisted above the imports by babel-plugin-jest-hoist,
// so they stay effective while satisfying import/first.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
  printAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'r-1',
    title: 'Penny’s <Honey> "Oats" & Berries',
    description: 'A quick breakfast.',
    totalTimeMinutes: 15,
    servings: 2,
    cuisine: 'American',
    sourceUrl: 'https://example.com/recipe',
    ingredients: [
      { position: 1, quantity: 1, unit: 'cup', displayName: 'rolled oats', rawText: '1 cup rolled oats', isOptional: false, isToTaste: false, missingInformation: null },
      { position: 2, quantity: null, unit: null, displayName: null, rawText: 'honey', isOptional: false, isToTaste: true, missingInformation: null },
    ],
    instructions: [
      { step: 1, text: 'Combine oats & water <gently>.' },
      { step: 2, text: 'Top with berries.' },
    ],
    ...overrides,
  } as Recipe;
}

describe('buildRecipeHtml', () => {
  test('includes title, meta, ingredients and steps', () => {
    const html = buildRecipeHtml(makeRecipe());
    expect(html).toContain('Penny’s');
    expect(html).toContain('15 min total');
    expect(html).toContain('2 servings');
    expect(html).toContain('1 cup · rolled oats');
    expect(html).toContain('honey (to taste)');
    expect(html).toContain('<strong>1.</strong> Combine oats');
    expect(html).toContain('https://example.com/recipe');
  });

  test('escapes HTML special characters', () => {
    const html = buildRecipeHtml(makeRecipe());
    expect(html).toContain('&lt;Honey&gt; &quot;Oats&quot; &amp; Berries');
    expect(html).toContain('oats &amp; water &lt;gently&gt;');
    expect(html).not.toContain('<Honey>');
  });

  test('omits meta and source lines when the recipe has none', () => {
    const html = buildRecipeHtml(
      makeRecipe({ totalTimeMinutes: null, servings: null, cuisine: null, description: null, sourceUrl: null })
    );
    expect(html).not.toContain('min total');
    expect(html).not.toContain('Source:');
  });
});
