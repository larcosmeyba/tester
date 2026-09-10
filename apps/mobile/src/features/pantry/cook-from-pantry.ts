/**
 * "Cook what I have" — picks one recipe that best fits the pantry on hand.
 *
 * This is a deliberate client-side heuristic, not Penny and not the backend
 * meal planner. It scores a small built-in set of pantry-staple recipes
 * against the user's active items and returns the one that uses the most of
 * what they already have. Ties prefer fewer missing ingredients; a small bonus
 * nudges recipes that rescue items expiring soon.
 *
 * Read-only seam with features/meals: the recipes here are a local fallback
 * set for when the pantry has no meal plan context. Nothing here invents
 * server data and nothing here writes to the meal plan.
 */
import { daysUntilExpiry, type PantryItem } from '@/features/pantry/pantry-model';

/** One ingredient a built-in recipe asks for. */
export type CookIngredient = {
  /** Display name, e.g. "Eggs". */
  name: string;
  /** Free-text amount shown next to the name, e.g. "2". Never invented by matching. */
  amount: string;
  /**
   * Lowercase keywords matched against pantry item names. The first alias is
   * the canonical one; extras cover common phrasing ("chicken breast",
   * "brown rice"). Keep singular base words — plural handling is in
   * `nameMatches`.
   */
  keywords: string[];
  /** True for salt/pepper/water-type items that do not count as "missing". */
  assumed?: boolean;
};

export type CookRecipe = {
  id: string;
  title: string;
  blurb: string;
  minutes: number;
  ingredients: CookIngredient[];
  steps: string[];
};

/** The one recipe the heuristic chose, with on-hand vs missing resolved. */
export type CookSuggestion = {
  recipe: CookRecipe;
  /** Ingredients matched to pantry items, in recipe order. */
  matched: Array<{ ingredient: CookIngredient; pantryItem: PantryItem }>;
  /** Ingredients the pantry did not have (assumed staples excluded). */
  missing: CookIngredient[];
};

const ing = (
  name: string,
  amount: string,
  keywords: string[],
  assumed?: true,
): CookIngredient => ({ name, amount, keywords, assumed });

export const COOK_RECIPES: CookRecipe[] = [
  {
    id: 'french-toast',
    title: 'French Toast',
    blurb: 'Stale bread becomes breakfast. Uses up eggs and milk before they go.',
    minutes: 20,
    ingredients: [
      ing('Bread', '4 slices', ['bread']),
      ing('Eggs', '2', ['egg']),
      ing('Milk', '1/2 cup', ['milk']),
      ing('Butter', '1 tbsp', ['butter']),
      ing('Salt', 'a pinch', ['salt'], true),
    ],
    steps: [
      'Whisk the eggs, milk, and salt in a shallow dish.',
      'Soak each slice of bread for about 30 seconds per side.',
      'Melt the butter in a skillet over medium heat.',
      'Cook the soaked bread 2–3 minutes per side, until golden.',
    ],
  },
  {
    id: 'veggie-fried-rice',
    title: 'Veggie Fried Rice',
    blurb: 'The classic leftover-grain rescue — day-old rice works best.',
    minutes: 25,
    ingredients: [
      ing('Rice', '2 cups cooked', ['rice']),
      ing('Eggs', '2', ['egg']),
      ing('Carrots', '2, diced', ['carrot']),
      ing('Peas', '1 cup', ['pea']),
      ing('Soy sauce', '2 tbsp', ['soy sauce']),
      ing('Cooking oil', '1 tbsp', ['oil'], true),
    ],
    steps: [
      'Scramble the eggs in a hot pan with the oil; set aside.',
      'Stir-fry the carrots (and peas) until just tender.',
      'Add the rice and break up any clumps.',
      'Stir in the soy sauce and the scrambled eggs; serve hot.',
    ],
  },
  {
    id: 'pasta-garlic-butter',
    title: 'Pasta with Garlic Butter',
    blurb: 'Five ingredients, one pan sauce, dinner in the time the pasta boils.',
    minutes: 20,
    ingredients: [
      ing('Pasta', '8 oz', ['pasta', 'spaghetti', 'noodle', 'penne', 'linguine']),
      ing('Garlic', '3 cloves', ['garlic']),
      ing('Butter', '4 tbsp', ['butter']),
      ing('Parmesan', '1/4 cup', ['parmesan']),
      ing('Salt', 'to taste', ['salt'], true),
    ],
    steps: [
      'Boil the pasta in salted water; save a cup of the pasta water.',
      'Sizzle the garlic in the butter until fragrant, about 1 minute.',
      'Toss in the drained pasta with a splash of pasta water.',
      'Finish with parmesan and serve immediately.',
    ],
  },
  {
    id: 'chicken-rice-skillet',
    title: 'Chicken & Rice Skillet',
    blurb: 'One pan, everything cooks together, and the rice soaks up the flavor.',
    minutes: 40,
    ingredients: [
      ing('Chicken', '1 lb', ['chicken']),
      ing('Rice', '1 cup uncooked', ['rice']),
      ing('Onion', '1, diced', ['onion']),
      ing('Garlic', '2 cloves', ['garlic']),
      ing('Chicken broth', '2 cups', ['chicken broth', 'chicken stock']),
      ing('Cooking oil', '1 tbsp', ['oil'], true),
      ing('Salt', 'to taste', ['salt'], true),
    ],
    steps: [
      'Brown the chicken in the oiled skillet; set aside.',
      'Soften the onion and garlic in the same pan.',
      'Stir in the rice and broth; bring to a simmer.',
      'Return the chicken, cover, and cook on low 20 minutes until the rice is tender.',
    ],
  },
  {
    id: 'baked-chicken-potatoes',
    title: 'Baked Chicken & Potatoes',
    blurb: 'Set-and-forget tray bake. The potatoes crisp in the chicken drippings.',
    minutes: 50,
    ingredients: [
      ing('Chicken', '1 lb', ['chicken']),
      ing('Potatoes', '4, wedged', ['potato']),
      ing('Garlic', '4 cloves', ['garlic']),
      ing('Olive oil', '2 tbsp', ['olive oil']),
      ing('Salt', 'to taste', ['salt'], true),
    ],
    steps: [
      'Heat the oven to 425°F (220°C).',
      'Toss the chicken and potatoes with olive oil, garlic, and salt on a sheet pan.',
      'Bake 35–40 minutes, turning once, until the chicken is cooked through.',
      'Rest 5 minutes before serving.',
    ],
  },
  {
    id: 'pancakes',
    title: 'Simple Pancakes',
    blurb: 'A batter pantry that turns into a stack of breakfast.',
    minutes: 25,
    ingredients: [
      ing('Flour', '1 cup', ['flour']),
      ing('Milk', '3/4 cup', ['milk']),
      ing('Eggs', '1', ['egg']),
      ing('Sugar', '2 tbsp', ['sugar']),
      ing('Butter', '2 tbsp', ['butter']),
      ing('Baking powder', '2 tsp', ['baking powder'], true),
    ],
    steps: [
      'Whisk the flour, sugar, and baking powder in a bowl.',
      'Whisk in the milk, egg, and melted butter until just combined.',
      'Cook ladles of batter in a buttered skillet 2 minutes per side.',
      'Serve warm with whatever you have — fruit, honey, or syrup.',
    ],
  },
  {
    id: 'scrambled-eggs-toast',
    title: 'Scrambled Eggs on Toast',
    blurb: 'The fastest honest meal when the day got away from you.',
    minutes: 10,
    ingredients: [
      ing('Eggs', '3', ['egg']),
      ing('Bread', '2 slices', ['bread']),
      ing('Butter', '1 tbsp', ['butter']),
      ing('Milk', '1 tbsp', ['milk']),
      ing('Salt', 'a pinch', ['salt'], true),
    ],
    steps: [
      'Whisk the eggs with the milk and salt.',
      'Toast the bread while the skillet heats with the butter.',
      'Scramble the eggs over medium-low, stirring gently, until just set.',
      'Serve the eggs over the toast.',
    ],
  },
  {
    id: 'apple-oatmeal',
    title: 'Apple Cinnamon Oatmeal',
    blurb: 'Chop an apple into the pot and breakfast smells like a bakery.',
    minutes: 15,
    ingredients: [
      ing('Oats', '1/2 cup', ['oat']),
      ing('Apples', '1, diced', ['apple']),
      ing('Milk', '1 cup', ['milk']),
      ing('Sugar', '1 tbsp', ['sugar']),
      ing('Cinnamon', '1/2 tsp', ['cinnamon'], true),
    ],
    steps: [
      'Simmer the milk, oats, and apple together for 5 minutes.',
      'Stir in the sugar and cinnamon.',
      'Let stand 2 minutes, then serve warm.',
    ],
  },
  {
    id: 'grilled-cheese',
    title: 'Grilled Cheese',
    blurb: 'Three ingredients, one rule: low and slow so the middle melts.',
    minutes: 15,
    ingredients: [
      ing('Bread', '2 slices', ['bread']),
      ing('Cheese', '2 slices', ['cheese']),
      ing('Butter', '1 tbsp', ['butter']),
    ],
    steps: [
      'Butter the outside of both bread slices.',
      'Sandwich the cheese between the unbuttered sides.',
      'Cook in a skillet over medium-low 3–4 minutes per side, until golden and melted.',
    ],
  },
  {
    id: 'chicken-vegetable-soup',
    title: 'Chicken Vegetable Soup',
    blurb: 'The clean-out-the-fridge pot. Almost any sturdy vegetable works.',
    minutes: 45,
    ingredients: [
      ing('Chicken', '1 lb', ['chicken']),
      ing('Carrots', '3, sliced', ['carrot']),
      ing('Onion', '1, diced', ['onion']),
      ing('Garlic', '2 cloves', ['garlic']),
      ing('Chicken broth', '6 cups', ['chicken broth', 'chicken stock']),
      ing('Celery', '2 stalks', ['celery']),
      ing('Salt', 'to taste', ['salt'], true),
    ],
    steps: [
      'Soften the onion, carrots, and celery in a pot with a little oil.',
      'Add the garlic and cook 1 minute.',
      'Add the chicken and broth; simmer 25 minutes.',
      'Shred the chicken, return it to the pot, season, and serve.',
    ],
  },
];

/**
 * Forgiving name match: every word of the keyword (lowercased, trailing "s"
 * stripped) must appear among the pantry item's words. Word-subset rather
 * than substring on purpose: "chicken" must match "Chicken breast" but must
 * NOT match the "chicken broth" ingredient keyword, which would inflate the
 * score with an ingredient the user does not have.
 */
/** Depluralize one lowercase word for matching ("potatoes" → "potato"). */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('oes')) return word.slice(0, -2); // potatoes → potato
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`; // berries → berry
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function nameMatches(pantryName: string, keyword: string): boolean {
  const words = (value: string): string[] =>
    value
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
      .map(stem);

  const itemWords = words(pantryName);
  const keywordWords = words(keyword);
  if (keywordWords.length === 0 || itemWords.length === 0) return false;
  return keywordWords.every((word) => itemWords.includes(word));
}

function matchIngredient(ingredient: CookIngredient, items: PantryItem[]): PantryItem | null {
  for (const keyword of ingredient.keywords) {
    for (const item of items) {
      if (nameMatches(item.name, keyword)) return item;
    }
  }
  return null;
}

/**
 * Picks the one recipe that uses the most on-hand items.
 *
 * Scoring: each matched ingredient is worth 1 point; a recipe earns a small
 * bonus (0.1) per matched pantry item expiring within 5 days, so it prefers
 * rescuing the things about to go bad. Ties break toward fewer missing
 * ingredients, then toward the earlier recipe in the list, so the answer is
 * deterministic for the same pantry.
 *
 * Returns null for an empty pantry — the screens render the "add items first"
 * empty state from that, and never a recipe.
 */
export function cookFromPantry(items: PantryItem[], now: Date = new Date()): CookSuggestion | null {
  if (items.length === 0) return null;

  let best: CookSuggestion | null = null;
  let bestScore = -1;

  for (const recipe of COOK_RECIPES) {
    const matched: CookSuggestion['matched'] = [];
    const missing: CookSuggestion['missing'] = [];

    for (const ingredient of recipe.ingredients) {
      const pantryItem = matchIngredient(ingredient, items);
      if (pantryItem) {
        matched.push({ ingredient, pantryItem });
      } else if (!ingredient.assumed) {
        missing.push(ingredient);
      }
    }

    const expiringBonus = matched.reduce(
      (sum, { pantryItem }) => sum + (daysUntilExpiry(pantryItem, now) <= 5 ? 0.1 : 0),
      0,
    );
    const score = matched.length + expiringBonus;

    const isBetter =
      score > bestScore ||
      (score === bestScore && best !== null && missing.length < best.missing.length);
    if (isBetter) {
      best = { recipe, matched, missing };
      bestScore = score;
    }
  }

  return best;
}
