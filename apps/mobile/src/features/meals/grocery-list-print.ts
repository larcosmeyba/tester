/**
 * Printable / shareable grocery list.
 *
 * One paper-friendly HTML builder shared by the plan flow's Shop On My Own
 * screen and the video-import own-list phase, printed with expo-print and
 * shared with expo-sharing. Checked-off items print struck through so the
 * paper list matches what the user already picked up.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { GroceryItem, GrocerySection } from '@/features/meals/meal-plan-model';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowHtml(item: GroceryItem, checked: boolean): string {
  const strike = checked ? ' text-decoration: line-through; color: #777;' : '';
  return `<tr>
    <td style="width: 28px;${strike}">${checked ? '&#9746;' : '&#9744;'}</td>
    <td style="${strike}">${escapeHtml(item.displayName)}</td>
    <td style="text-align: right;${strike}">$${item.estimatedPrice.toFixed(2)}</td>
  </tr>`;
}

export function buildGroceryListHtml(
  title: string,
  sections: GrocerySection[],
  checkedIds: readonly string[]
): string {
  const checked = new Set(checkedIds);
  const body = sections
    .map(
      (section) => `
      <h2>${escapeHtml(section.aisleLabel)}</h2>
      <table>
        ${section.items.map((item) => rowHtml(item, checked.has(item.ingredientId))).join('')}
      </table>`
    )
    .join('');
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
<body style="font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1a1a1a;">
  <h1>${escapeHtml(title)}</h1>
  <p style="color: #555;">${escapeHtml(PRICING_NOTICE)}</p>
  ${body}
</body>
</html>`;
}

/**
 * Prints the list and, where the device supports it, offers the PDF through
 * the system share sheet. Falls back to the system print dialog when sharing
 * isn't available so the list is always printable.
 */
export async function printAndShareGroceryList(
  title: string,
  sections: GrocerySection[],
  checkedIds: readonly string[]
): Promise<void> {
  const { uri } = await Print.printToFileAsync({
    html: buildGroceryListHtml(title, sections, checkedIds),
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare && Platform.OS !== 'web') {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${title} — grocery list`,
    });
    return;
  }
  await Print.printAsync({ uri });
}
