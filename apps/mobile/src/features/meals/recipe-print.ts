/**
 * Printable / shareable recipe sheet for the meal calendar (Audit Section 6).
 *
 * Builds a paper-friendly HTML page from the Standard HTH Recipe Object and
 * prints it with expo-print, offering the PDF through the system share sheet
 * where available. Missing quantities/times print as blank lines rather than
 * plausible-looking numbers — the spec forbids inventing them.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Recipe } from '@/features/meals/recipe-model';

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

export function buildRecipeHtml(recipe: Recipe): string {
  const meta = [
    recipe.totalTimeMinutes ? `${recipe.totalTimeMinutes} min total` : null,
    recipe.servings ? `${recipe.servings} servings` : null,
    recipe.cuisine,
  ]
    .filter((entry): entry is string => entry !== null)
    .join(' · ');

  const ingredients = recipe.ingredients
    .map((line) => `      <li>${escapeHtml(ingredientText(line))}</li>`)
    .join('\n');

  const steps = recipe.instructions
    .map((step) => `      <li><strong>${step.step}.</strong> ${escapeHtml(step.text)}</li>`)
    .join('\n');

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(recipe.title)}</title></head>
<body style="font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1a1a1a;">
  <h1>${escapeHtml(recipe.title)}</h1>
  ${meta ? `<p style="color: #555;">${escapeHtml(meta)}</p>` : ''}
  ${recipe.description ? `<p>${escapeHtml(recipe.description)}</p>` : ''}
  <h2>Ingredients</h2>
  <ul>
${ingredients}
  </ul>
  <h2>Instructions</h2>
  <ol>
${steps}
  </ol>
  ${recipe.sourceUrl ? `<p style="color: #555;">Source: ${escapeHtml(recipe.sourceUrl)}</p>` : ''}
</body>
</html>`;
}

/**
 * Prints the recipe and, where the device supports it, offers the PDF through
 * the system share sheet. Falls back to the system print dialog when sharing
 * isn't available so the recipe is always printable.
 */
export async function printAndShareRecipe(recipe: Recipe): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: buildRecipeHtml(recipe) });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare && Platform.OS !== 'web') {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${recipe.title} — recipe`,
    });
    return;
  }
  await Print.printAsync({ uri });
}
