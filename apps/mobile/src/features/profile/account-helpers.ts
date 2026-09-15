// Pure helpers for the Account screen rebuild (Swift-matched MyAccountView).
//
// Everything here is UI-free and unit-testable: ZIP validation/normalization,
// the app-version footer label, the Member Since stat formatting, and the
// delete-account confirm copy. Components in this feature import from here.

/**
 * Strip a ZIP entry down to digits only, mirroring the Swift sandbox's
 * `zipInput.filter(\.isNumber)` so pasted or typed separators ("91502-1234",
 * " 91502 ") still yield the 5-digit code.
 */
export function normalizeHomeZip(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * A Home ZIP is valid only when it is exactly 5 digits after normalization.
 * The resources tab falls back to this value when location permission is
 * denied, so a strict shape keeps that lookup honest.
 */
export function isValidHomeZip(input: string): boolean {
  return /^\d{5}$/.test(normalizeHomeZip(input));
}

export type AppVersionInput = {
  version?: string | null;
  build?: string | number | null;
};

/**
 * "Version 1.0.0 (Build 1)" — pulled from the bundle (expo Constants) at the
 * call site so it never goes stale. Falls back to 1.0.0 / 1 rather than a
 * dash, matching the Swift bundle lookup defaults.
 */
export function formatAppVersion(input: AppVersionInput): string {
  const version = input.version?.trim() || '1.0.0';
  const build = input.build == null || String(input.build).trim() === '' ? '1' : String(input.build).trim();
  return `Version ${version} (Build ${build})`;
}

/**
 * Format a real account creation date as the MEMBER SINCE stat ("SEP 2026").
 * Returns null for missing/unparseable input so the stat card hides entirely
 * — a stat with no data never renders a dash or placeholder.
 */
export function formatMemberSince(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${month} ${date.getUTCFullYear()}`;
}

/** Copy for the destructive delete-account confirm, kept in one place. */
export const DELETE_ACCOUNT_ALERT_TITLE = 'Delete your account?';
export const DELETE_ACCOUNT_ALERT_MESSAGE =
  "This permanently deletes your profile, meal plans, and applications. This can't be undone.";
export const DELETE_ACCOUNT_CONFIRM_LABEL = 'Delete Account';
