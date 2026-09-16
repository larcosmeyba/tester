/**
 * Weekly recipe-book PDF for the meal plan screen's share button.
 *
 * Builds a paper-friendly HTML page — one recipe per page with the day and
 * slot kicker, name, cook time/servings, ingredients and numbered
 * instructions — then prints it with expo-print and offers the PDF through
 * the system share sheet where available. Mirrors the Swift
 * `RecipeBookPDFBuilder` and reuses `recipe-print.ts`'s print/share pattern.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { recipeService } from '@/features/meals/recipe-service';
import type { Recipe } from '@/features/meals/recipe-model';
import { type MealPlan, type PlannedMeal } from '@/features/meals/meal-plan-model';
import { planDayName } from '@/features/meals/meal-week';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ingredientText(line: Recipe['ingredients'][number]): string {
  const amount = line.quantity !== null && line.unit ? `${line.quantity} ${line.unit} · ` : '';
  const name = line.displayName ?? line.rawText;
  const flags = [line.isOptional ? 'optional' : null, line.isToTaste ? 'to taste' : null]
    .filter(Boolean)
    .join(', ');
  return `${amount}${name}${flags ? ` (${flags})` : ''}`;
}

/** One planned meal plus its full recipe, ready for the recipe book. */
export interface RecipeBookEntry {
  /** e.g. "Tuesday · Lunch". */
  kicker: string;
  title: string;
  cookTime: string | null;
  servings: string | null;
  ingredients: Recipe['ingredients'];
  instructions: Recipe['instructions'];
  /** True when the recipe failed to load — the entry keeps its header but says so. */
  missingDetails: boolean;
}

export function buildRecipeBookHtml(entries: RecipeBookEntry[]): string {
  const pages = entries
    .map((entry, index) => {
      const meta = [entry.cookTime, entry.servings].filter(Boolean).join(' · ');
      const ingredients = entry.ingredients
        .map((line) => `      <li>${escapeHtml(ingredientText(line))}</li>`)
        .join('\n');
      const steps = entry.instructions
        .map((step) => `      <li><strong>${step.step}.</strong> ${escapeHtml(step.text)}</li>`)
        .join('\n');
      return `  <section${index > 0 ? ' style="page-break-before: always;"' : ''}>
    <p class="kicker">${escapeHtml(entry.kicker)}</p>
    <h1>${escapeHtml(entry.title)}</h1>
    ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ''}
    ${
      entry.missingDetails
        ? '    <p class="meta">Recipe details couldn’t be loaded.</p>'
        : `    <h2>Ingredients</h2>
    <ul>
${ingredients}
    </ul>
    <h2>Instructions</h2>
    <ol>
${steps}
    </ol>`
    }
  </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Weekly Recipes</title></head>
<body style="font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 32px; color: #1a1a1a;">
  <style>
    .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #777; margin: 0 0 4px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { font-size: 14px; margin: 18px 0 6px; }
    .meta { font-size: 12px; color: #555; margin: 0 0 4px; }
    li { font-size: 13px; margin-bottom: 4px; }
  </style>
${pages}
</body>
</html>`;
}

const capitalize = (value: string): string =>
  value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;

/**
 * Fetches every recipe in the plan and shares the resulting PDF. Recipes
 * that fail to load keep their day/slot/name header with an honest
 * "couldn't be loaded" note rather than being dropped silently.
 */
export async function shareRecipeBook(plan: MealPlan, planStartDate: Date): Promise<void> {
  const meals: PlannedMeal[] = [...plan.meals].sort(
    (a, b) => a.slot.day - b.slot.day || a.slot.mealType.localeCompare(b.slot.mealType),
  );
  const recipeIds = [...new Set(meals.map((meal) => meal.recipeId))];
  const loaded = await Promise.allSettled(recipeIds.map((id) => recipeService.get(id)));
  const byId = new Map<string, Recipe>();
  loaded.forEach((result, index) => {
    if (result.status === 'fulfilled') byId.set(recipeIds[index], result.value);
  });

  const entries: RecipeBookEntry[] = meals.map((meal) => {
    const recipe = byId.get(meal.recipeId);
    return {
      kicker: `${planDayName(planStartDate, meal.slot.day)} · ${capitalize(meal.slot.mealType)}`,
      title: meal.title,
      cookTime: meal.totalTimeMinutes ? `${meal.totalTimeMinutes} min` : null,
      servings: `${Math.round(meal.servingsPlanned)} servings`,
      ingredients: recipe?.ingredients ?? [],
      instructions: recipe?.instructions ?? [],
      missingDetails: !recipe,
    };
  });

  const { uri } = await Print.printToFileAsync({ html: buildRecipeBookHtml(entries) });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare && Platform.OS !== 'web') {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Weekly Recipes',
    });
    return;
  }
  await Print.printAsync({ uri });
}
