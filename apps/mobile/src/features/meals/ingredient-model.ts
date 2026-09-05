/**
 * Canonical ingredient catalog (Doc 02 §3).
 *
 * Every downstream feature — allergens, diets, pantry, pricing, grocery list —
 * joins on `ingredientId`, never on raw text. The allergen/diet flags are
 * human-reviewed and set by the backend; the client only reads them.
 */
import { z } from 'zod';
import { aisleSchema, foodGroupSchema } from '@/features/meals/meal-enums';

const maybe = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const ingredientInfoSchema = z
  .object({
    ingredient_id: z.string(),
    display_name: z.string(),
    aisle: aisleSchema,
    food_group: foodGroupSchema,
    parent_ingredient_id: maybe(z.string()),
    /** Unit all quantities and prices for this ingredient use (lb, oz, each, can…). */
    price_reference_unit: z.string(),
    is_pantry_staple: z.boolean().default(false),
    /** salt, black pepper, water only — always treated as on hand. */
    assumed_on_hand: z.boolean().default(false),

    // Allergen / diet flags — deterministic, never set by AI.
    contains_meat: z.boolean().default(false),
    contains_poultry: z.boolean().default(false),
    contains_fish: z.boolean().default(false),
    contains_shellfish: z.boolean().default(false),
    contains_dairy: z.boolean().default(false),
    contains_egg: z.boolean().default(false),
    contains_gluten: z.boolean().default(false),
    contains_wheat: z.boolean().default(false),
    contains_soy: z.boolean().default(false),
    contains_peanut: z.boolean().default(false),
    contains_tree_nut: z.boolean().default(false),
    contains_sesame: z.boolean().default(false),
    contains_coconut: z.boolean().default(false),
    is_animal_derived: z.boolean().default(false),
  })
  .transform((v) => ({
    ingredientId: v.ingredient_id,
    displayName: v.display_name,
    aisle: v.aisle,
    foodGroup: v.food_group,
    parentIngredientId: v.parent_ingredient_id,
    priceReferenceUnit: v.price_reference_unit,
    isPantryStaple: v.is_pantry_staple,
    assumedOnHand: v.assumed_on_hand,
    containsMeat: v.contains_meat,
    containsPoultry: v.contains_poultry,
    containsFish: v.contains_fish,
    containsShellfish: v.contains_shellfish,
    containsDairy: v.contains_dairy,
    containsEgg: v.contains_egg,
    containsGluten: v.contains_gluten,
    containsWheat: v.contains_wheat,
    containsSoy: v.contains_soy,
    containsPeanut: v.contains_peanut,
    containsTreeNut: v.contains_tree_nut,
    containsSesame: v.contains_sesame,
    containsCoconut: v.contains_coconut,
    isAnimalDerived: v.is_animal_derived,
  }));

export type IngredientInfo = z.infer<typeof ingredientInfoSchema>;

export const ingredientCatalogSchema = z.array(ingredientInfoSchema);

/**
 * Whether an ingredient contains an allergen, using the catalog's flags.
 *
 * Tree nut is deliberately conservative: coconut counts (matching the Swift
 * engine's policy). This mirrors the backend so the UI can *explain* an
 * exclusion — it never decides one.
 */
export const ingredientContainsAllergen = (
  ingredient: IngredientInfo,
  allergen: import('@/features/meals/meal-enums').Allergen,
): boolean => {
  switch (allergen) {
    case 'milk':
      return ingredient.containsDairy;
    case 'egg':
      return ingredient.containsEgg;
    case 'fish':
      return ingredient.containsFish;
    case 'shellfish':
      return ingredient.containsShellfish;
    case 'tree_nut':
      return ingredient.containsTreeNut || ingredient.containsCoconut;
    case 'peanut':
      return ingredient.containsPeanut;
    case 'wheat':
      return ingredient.containsWheat;
    case 'soy':
      return ingredient.containsSoy;
    case 'sesame':
      return ingredient.containsSesame;
    default:
      return false;
  }
};

/** Indexed catalog with the lookups the UI needs. */
export class IngredientCatalog {
  private readonly byId: Map<string, IngredientInfo>;

  constructor(ingredients: IngredientInfo[]) {
    this.byId = new Map(ingredients.map((i) => [i.ingredientId, i]));
  }

  get(ingredientId: string | null | undefined): IngredientInfo | null {
    if (!ingredientId) return null;
    return this.byId.get(ingredientId) ?? null;
  }

  get all(): IngredientInfo[] {
    return [...this.byId.values()];
  }

  /**
   * Binary pantry check with parent matching (Doc 03 §4): pantry "chicken"
   * satisfies recipe "chicken_thigh"; salt/pepper/water are always on hand.
   */
  inPantry(ingredientId: string | null | undefined, pantry: ReadonlySet<string>): boolean {
    const ingredient = this.get(ingredientId);
    if (!ingredient) return false;
    if (ingredient.assumedOnHand) return true;
    if (pantry.has(ingredient.ingredientId)) return true;
    if (ingredient.parentIngredientId && pantry.has(ingredient.parentIngredientId)) return true;
    return false;
  }

  search(query: string, limit = 25): IngredientInfo[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];
    return this.all
      .filter(
        (i) =>
          i.displayName.toLowerCase().includes(needle) ||
          i.ingredientId.toLowerCase().includes(needle),
      )
      .slice(0, limit);
  }
}

/**
 * One estimated price row (Doc 03 §5).
 * Tier 1 = retailer, 2 = regional, 3 = national public estimate, 4 = HTH curated.
 */
export const priceEstimateSchema = z
  .object({
    ingredient_id: z.string(),
    unit_price: z.number(),
    package_size: z.number(),
    /** true = sold loose (per-lb produce): buy exactly what's needed, rounded up. */
    divisible: z.boolean().default(false),
    tier: z.number().int(),
    source: z.string(),
    geographic_scope: z.string().default('us'),
  })
  .transform((v) => ({
    ingredientId: v.ingredient_id,
    unitPrice: v.unit_price,
    packageSize: v.package_size,
    divisible: v.divisible,
    tier: v.tier,
    source: v.source,
    geographicScope: v.geographic_scope,
    packagePrice: v.unit_price * v.package_size,
  }));

export type PriceEstimate = z.infer<typeof priceEstimateSchema>;
export const priceBookSchema = z.array(priceEstimateSchema);
