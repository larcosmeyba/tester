/**
 * AI usage limits (Audit Section 4).
 *
 * Free-tier caps: AI meal plans, video imports, and single-meal generations
 * each have their own monthly allowance; viewing, moving, and checking off
 * meals are always free. The gate fires AT the limit — the Nth use is the
 * last free one.
 *
 * The backend does not expose AI usage yet, so the counters live in
 * AsyncStorage, keyed by calendar month (they reset naturally on rollover).
 * Only counts are stored — never prompts, recipes, or plans.
 * TODO(backend): replace with server-side usage when the API exposes it, so
 * limits survive reinstalls and apply across devices.
 *
 * Limit values are the audit's working numbers (~4–5 AI plans/month free).
 * TODO(Marcos): lock the final free-tier numbers before launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AI_PLANS_PER_MONTH = 5;
export const VIDEO_IMPORTS_PER_MONTH = 5;
export const SINGLE_MEALS_PER_MONTH = 10;

export type AiUsageKind = 'ai_plan' | 'video_import' | 'single_meal';

const LIMITS: Record<AiUsageKind, number> = {
  ai_plan: AI_PLANS_PER_MONTH,
  video_import: VIDEO_IMPORTS_PER_MONTH,
  single_meal: SINGLE_MEALS_PER_MONTH,
};

const KIND_LABELS: Record<AiUsageKind, string> = {
  ai_plan: 'AI meal plans',
  video_import: 'video imports',
  single_meal: 'single-meal generations',
};

function monthKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function storageKey(kind: AiUsageKind, month: string): string {
  return `hth:ai_usage:${kind}:${month}`;
}

export type AiUsage = {
  kind: AiUsageKind;
  used: number;
  limit: number;
  remaining: number;
  /** Human label for the gate UI, e.g. "AI meal plans". */
  label: string;
};

async function readCount(kind: AiUsageKind): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(kind, monthKey()));
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    // A storage failure must never block the feature; fail open.
    return 0;
  }
}

export async function getAiUsage(kind: AiUsageKind): Promise<AiUsage> {
  const limit = LIMITS[kind];
  const used = await readCount(kind);
  return {
    kind,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    label: KIND_LABELS[kind],
  };
}

/**
 * Records one use. Call only after the AI work succeeded — a failed
 * generation must not consume the user's allowance.
 */
export async function recordAiUsage(kind: AiUsageKind): Promise<AiUsage> {
  const usage = await getAiUsage(kind);
  try {
    await AsyncStorage.setItem(storageKey(kind, monthKey()), String(usage.used + 1));
  } catch {
    // Fail open: the count is best-effort.
  }
  return { ...usage, used: usage.used + 1, remaining: Math.max(0, usage.limit - usage.used - 1) };
}

/** True while the user still has free uses left this month. */
export async function hasAiUsageRemaining(kind: AiUsageKind): Promise<boolean> {
  const usage = await getAiUsage(kind);
  return usage.remaining > 0;
}
