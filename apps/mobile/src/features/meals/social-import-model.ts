/**
 * Social media video import — link queue model.
 *
 * Pure types and helpers for the "Import from Social Media" flow. The platform
 * detection mirrors Marcos's SwiftUI sandbox (`SocialMediaImportView.detectPlatform`):
 * substring match on the URL, case-insensitive. Which hosts the backend can
 * actually import from is decided server-side — this is a client-side queue
 * convenience only, and nothing here invents a recipe.
 */

/** The platforms the import UI knows how to label. Anything else is "other". */
export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube' | 'other';

/** Platform badges shown above the URL field. */
export const SOCIAL_PLATFORM_BADGES: SocialPlatform[] = ['tiktok', 'instagram', 'youtube'];

export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  other: 'Video',
};

/**
 * Accent colors per platform, taken from the Swift sandbox (SwiftUI RGB -> hex):
 * TikTok (0.00, 0.78, 0.78), Instagram (0.82, 0.14, 0.44),
 * YouTube (0.85, 0.12, 0.12), other (0.28, 0.18, 0.68).
 */
export const SOCIAL_PLATFORM_ACCENT: Record<SocialPlatform, string> = {
  tiktok: '#00C7C7',
  instagram: '#D12470',
  youtube: '#D91F1F',
  other: '#462EAE',
};

export type SocialImportLink = {
  id: string;
  url: string;
  platform: SocialPlatform;
};

/**
 * Detects the platform from a URL. Mirrors the Swift sandbox exactly:
 * "tiktok" / "instagram" (or "instagr") / "youtube" (or "youtu.be") substring,
 * then any http(s) URL as "other", otherwise null.
 */
export function detectSocialPlatform(url: string): SocialPlatform | null {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok')) return 'tiktok';
  if (lower.includes('instagram') || lower.includes('instagr')) return 'instagram';
  if (lower.includes('youtube') || lower.includes('youtu.be')) return 'youtube';
  if (lower.startsWith('http')) return 'other';
  return null;
}

/** Trims and validates; returns null when the text cannot be queued. */
export function normalizeSocialLinkUrl(urlText: string): { url: string; platform: SocialPlatform } | null {
  const url = urlText.trim();
  if (url.length === 0) return null;
  const platform = detectSocialPlatform(url);
  if (platform == null) return null;
  return { url, platform };
}

/** The Add button is enabled only for a valid, not-yet-queued URL. */
export function canAddSocialLink(links: SocialImportLink[], urlText: string): boolean {
  const normalized = normalizeSocialLinkUrl(urlText);
  if (normalized == null) return false;
  return !links.some((link) => link.url === normalized.url);
}

/**
 * Appends a link to the queue. Returns the original array unchanged when the
 * URL is invalid or already queued (so callers can treat identity as "no-op").
 */
export function addSocialLink(
  links: SocialImportLink[],
  urlText: string,
  makeId: () => string
): SocialImportLink[] {
  if (!canAddSocialLink(links, urlText)) return links;
  const { url, platform } = normalizeSocialLinkUrl(urlText)!;
  return [...links, { id: makeId(), url, platform }];
}

export function removeSocialLink<T extends { id: string }>(links: T[], id: string): T[] {
  return links.filter((link) => link.id !== id);
}

/** Swift sandbox: URLs longer than 44 chars show the first 41 + "…". */
export function truncateDisplayUrl(url: string): string {
  return url.length > 44 ? `${url.slice(0, 41)}…` : url;
}

/**
 * Real time for a recipe card: the backend's totalTimeMinutes when present,
 * otherwise the sum of per-step minutes. null when the backend gave nothing —
 * the card then falls back to servings instead of inventing a time.
 */
export function estimatedRecipeMinutes(input: {
  totalTimeMinutes?: number | null;
  steps?: { minutes?: number | null }[];
}): number | null {
  if (input.totalTimeMinutes != null && input.totalTimeMinutes > 0) {
    return input.totalTimeMinutes;
  }
  const sum = (input.steps ?? []).reduce((acc, step) => acc + (step.minutes ?? 0), 0);
  return sum > 0 ? sum : null;
}

/**
 * "Yes — Continue to Grocery List" is enabled only when at least one recipe
 * was actually imported and accepted (never an empty or mock list).
 */
export function canContinueToGrocery(acceptedRecipeIds: string[]): boolean {
  return acceptedRecipeIds.length > 0;
}
