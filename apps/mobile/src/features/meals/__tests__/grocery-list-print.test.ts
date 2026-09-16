/**
 * Grocery list printing: the HTML is escaped, checked items strike through,
 * and prices are labeled estimates.
 */
import { buildGroceryListHtml } from '@/features/meals/grocery-list-print';
import type { GrocerySection } from '@/features/meals/meal-plan-model';

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

const sections: GrocerySection[] = [
  {
    aisle: 'produce',
    aisleLabel: 'Produce',
    items: [
      {
        ingredientId: 'ing-1',
        displayName: 'Tomatoes <fresh>',
        neededQty: 2,
        unit: 'pcs',
        packages: 1,
        packageLabel: '2 pcs',
        estimatedPrice: 3.5,
        priceTier: 2,
        inPantry: false,
        usedBy: [],
      },
    ],
  },
];

test('escapes HTML and marks checked items', () => {
  const html = buildGroceryListHtml('My list', sections, ['ing-1']);
  expect(html).toContain('Tomatoes &lt;fresh&gt;');
  expect(html).not.toContain('Tomatoes <fresh>');
  expect(html).toContain('text-decoration: line-through');
});

test('unchecked items are not struck through and prices are estimates', () => {
  const html = buildGroceryListHtml('My list', sections, []);
  expect(html).not.toContain('text-decoration: line-through');
  expect(html).toContain('$3.50');
  expect(html).toContain('estimates');
});
