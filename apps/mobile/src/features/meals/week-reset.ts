/**
 * Weekly reset prompt logic for the meal calendar (Audit Section 6).
 *
 * When the plan's week ends, the calendar prompts: start a new week
 * (routes to the AI questionnaire) or reuse last week's plan (the same
 * meals anchored to a fresh week). The prompt fires once per plan-week;
 * the dismissal is keyed by planId + week start so next week prompts again.
 *
 * The plan's week anchor is persisted per planId because the context starts
 * each session with planStartDate = today — without this, a restart would
 * silently move the week boundary.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WeekStatus = 'active' | 'ended';

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * The week runs planStartDate .. planStartDate + dayCount days. Once `now`
 * reaches the day after the last plan day, the week has ended.
 */
export function weekStatus(planStartDate: Date, dayCount: number, now: Date = new Date()): WeekStatus {
  if (dayCount <= 0) return 'active';
  const weekEnd = startOfDay(planStartDate).getTime() + dayCount * 86_400_000;
  return startOfDay(now).getTime() >= weekEnd ? 'ended' : 'active';
}

function weekStartKey(planId: string): string {
  return `hth:plan-week-start:${planId}`;
}

function dismissalKey(planId: string, weekStartIso: string): string {
  return `hth:plan-week-reset-dismissed:${planId}:${weekStartIso}`;
}

export function weekStartIso(planStartDate: Date): string {
  return startOfDay(planStartDate).toISOString().slice(0, 10);
}

/** Persists the week anchor when a plan is generated or confirmed. */
export async function savePlanWeekStart(planId: string, planStartDate: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(weekStartKey(planId), weekStartIso(planStartDate));
  } catch {
    // Best effort — the in-memory anchor still works for this session.
  }
}

/** Reads the persisted anchor; null when this plan has no recorded week. */
export async function readPlanWeekStart(planId: string): Promise<Date | null> {
  try {
    const raw = await AsyncStorage.getItem(weekStartKey(planId));
    if (!raw) return null;
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export async function wasResetPromptDismissed(planId: string, planStartDate: Date): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(dismissalKey(planId, weekStartIso(planStartDate)));
    return raw === '1';
  } catch {
    return false;
  }
}

export async function dismissResetPrompt(planId: string, planStartDate: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(dismissalKey(planId, weekStartIso(planStartDate)), '1');
  } catch {
    // Best effort.
  }
}
