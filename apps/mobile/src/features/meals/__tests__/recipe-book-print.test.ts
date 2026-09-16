/**
 * Recipe book print sheet: HTML content and escaping. The print/share side
 * effects follow recipe-print.ts's pattern and are not exercised here.
 */
import { buildRecipeBookHtml, type RecipeBookEntry } from '@/features/meals/recipe-book-print';
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
jest.mock('@/features/meals/recipe-service', () => ({
  recipeService: { get: jest.fn() },
}));

function makeEntry(overrides: Partial<RecipeBookEntry> = {}): RecipeBookEntry {
  return {
    kicker: 'Tuesday · Lunch',
    title: 'Penny’s <Honey> "Oats" & Berries',
    cookTime: '15 min',
    servings: '2 servings',
    ingredients: [
      {
        position: 1,
        quantity: 1,
        unit: 'cup',
        displayName: 'rolled oats',
        rawText: '1 cup rolled oats',
        isOptional: false,
        isToTaste: false,
        missingInformation: null,
      },
      {
        position: 2,
        quantity: null,
        unit: null,
        displayName: null,
        rawText: 'honey',
        isOptional: false,
        isToTaste: true,
        missingInformation: null,
      },
    ] as Recipe['ingredients'],
    instructions: [
      { step: 1, text: 'Combine oats & water <gently>.', minutes: null },
      { step: 2, text: 'Top with berries.', minutes: null },
    ] as Recipe['instructions'],
    missingDetails: false,
    ...overrides,
  };
}

describe('buildRecipeBookHtml', () => {
  it('renders the kicker, title, cook time and servings', () => {
    const html = buildRecipeBookHtml([makeEntry()]);
    expect(html).toContain('Tuesday · Lunch');
    expect(html).toContain('15 min');
    expect(html).toContain('2 servings');
  });

  it('escapes HTML in titles and instructions', () => {
    const html = buildRecipeBookHtml([makeEntry()]);
    expect(html).toContain('Penny’s &lt;Honey&gt; &quot;Oats&quot; &amp; Berries');
    expect(html).toContain('Combine oats &amp; water &lt;gently&gt;.');
    expect(html).not.toContain('<Honey>');
  });

  it('renders ingredients with quantities and to-taste flags', () => {
    const html = buildRecipeBookHtml([makeEntry()]);
    expect(html).toContain('1 cup · rolled oats');
    expect(html).toContain('honey (to taste)');
  });

  it('numbers the instructions in order', () => {
    const html = buildRecipeBookHtml([makeEntry()]);
    expect(html).toContain('<strong>1.</strong>');
    expect(html).toContain('<strong>2.</strong>');
  });

  it('keeps the header with an honest note when the recipe failed to load', () => {
    const html = buildRecipeBookHtml([makeEntry({ missingDetails: true })]);
    expect(html).toContain('Tuesday · Lunch');
    expect(html).toContain('couldn’t be loaded');
    expect(html).not.toContain('<h2>Ingredients</h2>');
  });

  it('starts each recipe after the first on a new page', () => {
    const html = buildRecipeBookHtml([makeEntry(), makeEntry({ kicker: 'Tuesday · Dinner' })]);
    expect(html).toContain('page-break-before: always;');
    // The first section must not carry the page break.
    const firstSection = html.indexOf('<section');
    const firstBreak = html.indexOf('page-break-before');
    expect(firstBreak).toBeGreaterThan(firstSection);
  });

  it('omits the meta line when cook time and servings are missing', () => {
    const html = buildRecipeBookHtml([makeEntry({ cookTime: null, servings: null })]);
    expect(html).not.toContain('class="meta"');
  });
});
