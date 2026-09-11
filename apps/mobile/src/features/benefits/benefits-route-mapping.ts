/**
 * Pure mapping between the expo-style hrefs the benefits screens navigate
 * with and the app-state shell's route names.
 *
 * Kept free of any React, React Native, or expo-router import so the
 * reconciliation — one benefits flow across two navigation systems — is
 * unit-testable. The shell bridge (benefits-shell-bridge.tsx) consumes this;
 * the tests assert on it directly.
 */
import type { ScreenName } from '@/features/app/navigation-types';

/**
 * The expo-style paths the benefits screens navigate to, and the shell route
 * each one becomes inside the app-state shell. The application id rides in
 * the path ("/resources/applications/:id"); everything else rides in the
 * query string.
 */
export const EXPO_PATH_TO_SHELL: Record<string, ScreenName> = {
  '/resources/government': 'government',
  '/resources/benefits-questionnaire': 'benefitsQuestionnaire',
  '/resources/benefits-renewals': 'benefitsRenewals',
  '/resources/benefits-zip': 'benefitsZip',
  '/resources/benefits-portal': 'benefitsPortal',
  '/resources/benefits-confirmation': 'benefitsConfirmation',
  '/resources/benefits-checklist': 'benefitsChecklist',
  // Penny chat, reachable as a contextual entry from inside the benefits flow.
  '/penny': 'penny',
};

function parseQuery(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    const key =
      separator < 0 ? decodeURIComponent(pair) : decodeURIComponent(pair.slice(0, separator));
    const value =
      separator < 0 ? '' : decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, ' '));
    if (key !== '') params[key] = value;
  }
  return params;
}

/**
 * Translates an expo-style href into a shell route. Returns null for paths
 * outside the benefits flow — the caller decides what to do with those
 * (the bridge ignores them rather than leaving the shell).
 */
export function benefitsHrefToShellRoute(href: string): {
  name: ScreenName;
  params: Record<string, string>;
} | null {
  const queryIndex = href.indexOf('?');
  const rawPath = queryIndex < 0 ? href : href.slice(0, queryIndex);
  const path = rawPath.replace(/\/+$/, '') || '/';
  const query = parseQuery(queryIndex < 0 ? '' : href.slice(queryIndex + 1));

  const applicationMatch = path.match(/^\/resources\/applications\/([^/]+)$/);
  if (applicationMatch) {
    return {
      name: 'benefitsReview',
      params: { ...query, applicationId: decodeURIComponent(applicationMatch[1]) },
    };
  }

  const name = EXPO_PATH_TO_SHELL[path];
  if (!name) return null;
  return { name, params: query };
}
