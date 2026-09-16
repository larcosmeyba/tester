/**
 * Penny's free message allowance (Hive Free tier).
 *
 * Free tier: 60 Penny turns per calendar month. Viewing, scrolling, and
 * reading stay free; only sent messages count, and only when the send
 * succeeds — a failed send must not consume the allowance. Out-of-scope
 * redirects and SSN-blocked sends never reach the backend and never count.
 *
 * There is deliberately no daily gate: the product decision (2026-09-15) is
 * monthly soft limits for AI features, with Hive Plus offering unlimited AI.
 *
 * Safety-critical help finishing an EXISTING government application is
 * exempt from the gate entirely (see isApplicationSafetyMessage) — the
 * counter still records those sends, but the gate never blocks them.
 * Government-application assistance is never paywalled.
 *
 * Counters live in AsyncStorage keyed by calendar month (they reset naturally
 * on rollover). Fail open: a storage failure must never block the chat.
 * TODO(backend): replace with server-side usage when the API exposes it, so
 * limits survive reinstalls and apply across devices.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENNY_TURNS_PER_MONTH = 60;

function monthKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function storageKey(month: string): string {
  return `hth:penny_usage:${month}`;
}

export type PennyUsage = {
  used: number;
  limit: number;
  remaining: number;
};

async function readCount(month: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(month));
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    // Fail open: a storage failure must never block the chat.
    return 0;
  }
}

export async function getPennyUsage(): Promise<PennyUsage> {
  const used = await readCount(monthKey());
  return {
    used,
    limit: PENNY_TURNS_PER_MONTH,
    remaining: Math.max(0, PENNY_TURNS_PER_MONTH - used),
  };
}

/**
 * Records one sent message. Call only after the send succeeded — a failed
 * send must not consume the user's allowance.
 */
export async function recordPennyMessage(): Promise<PennyUsage> {
  const usage = await getPennyUsage();
  try {
    await AsyncStorage.setItem(storageKey(monthKey()), String(usage.used + 1));
  } catch {
    // Fail open: the count is best-effort.
  }
  const used = usage.used + 1;
  return { used, limit: usage.limit, remaining: Math.max(0, usage.limit - used) };
}

/** True while the user still has free turns left this month. */
export async function hasPennyMessagesRemaining(): Promise<boolean> {
  const usage = await getPennyUsage();
  return usage.remaining > 0;
}
