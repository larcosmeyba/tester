/**
 * Penny's free message allowance (Audit Section 7).
 *
 * Free tier: 10 Penny questions per day. Viewing, scrolling, and reading
 * stay free; only sent messages count, and only when the send succeeds — a
 * failed send must not consume the allowance. Out-of-scope redirects and
 * SSN-blocked sends never reach the backend and never count.
 *
 * Safety-critical help finishing an EXISTING government application is
 * exempt from the gate entirely (see isApplicationSafetyMessage) — the
 * counter still records those sends, but the gate never blocks them.
 *
 * Counters live in AsyncStorage keyed by calendar day (they reset naturally
 * on rollover), mirroring features/meals/ai-usage-limits.ts. Fail open: a
 * storage failure must never block the chat.
 * TODO(backend): replace with server-side usage when the API exposes it, so
 * limits survive reinstalls and apply across devices.
 * TODO(Marcos): lock the final free-tier number before launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENNY_QUESTIONS_PER_DAY = 10;

function dayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function storageKey(day: string): string {
  return `hth:penny_usage:${day}`;
}

export type PennyUsage = {
  used: number;
  limit: number;
  remaining: number;
};

async function readCount(day: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(day));
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    // Fail open: a storage failure must never block the chat.
    return 0;
  }
}

export async function getPennyUsage(): Promise<PennyUsage> {
  const used = await readCount(dayKey());
  return {
    used,
    limit: PENNY_QUESTIONS_PER_DAY,
    remaining: Math.max(0, PENNY_QUESTIONS_PER_DAY - used),
  };
}

/**
 * Records one sent message. Call only after the send succeeded — a failed
 * send must not consume the user's allowance.
 */
export async function recordPennyMessage(): Promise<PennyUsage> {
  const usage = await getPennyUsage();
  try {
    await AsyncStorage.setItem(storageKey(dayKey()), String(usage.used + 1));
  } catch {
    // Fail open: the count is best-effort.
  }
  const used = usage.used + 1;
  return { used, limit: usage.limit, remaining: Math.max(0, usage.limit - used) };
}

/** True while the user still has free messages left today. */
export async function hasPennyMessagesRemaining(): Promise<boolean> {
  const usage = await getPennyUsage();
  return usage.remaining > 0;
}
