/**
 * Renewal display logic with no native dependencies, so it stays unit-testable.
 *
 * Copy rules enforced here by construction:
 * - No eligibility language: nothing says anyone qualifies or will lose
 *   anything. Copy is about time to act.
 * - Program names appear only in-app; push titles/bodies stay generic.
 */
import type {
  BenefitsProgramRule,
  BenefitsRenewal,
} from "@/graphql/benefits-operations";

export type RenewalUrgency = "calm" | "soon" | "urgent" | "overdue";

/**
 * Days remaining drives the chip color: more than 30 days is calm, 7-30 days
 * is soon (amber), under 7 is urgent (red), and a past deadline is overdue.
 */
export function renewalUrgency(daysRemaining: number): RenewalUrgency {
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining < 7) return "urgent";
  if (daysRemaining <= 30) return "soon";
  return "calm";
}

export function daysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return "Overdue";
  if (daysRemaining === 0) return "Due today";
  if (daysRemaining === 1) return "1 day left";
  return `${daysRemaining} days left`;
}

/**
 * True when the renewal deserves an in-app nudge: due within 30 days (or
 * already past) and still actionable.
 */
export function renewalNeedsAttention(renewal: BenefitsRenewal): boolean {
  return (
    renewal.daysRemaining <= 30 &&
    (renewal.status === "scheduled" || renewal.status === "reminded")
  );
}

export function formatRenewalDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function renewalStatusLabel(status: string): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "reminded":
      return "Reminder sent";
    case "started":
      return "Renewal started";
    case "done":
      return "Done";
    case "dismissed":
      return "Dismissed";
    default:
      return status;
  }
}

function pluralMonths(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

/**
 * "Typical for SNAP is 12 months — confirm yours."
 */
export function typicalPeriodLabel(program: string, certPeriodMonths: number): string {
  return `Typical for ${program} is ${pluralMonths(certPeriodMonths)} — confirm yours.`;
}

/**
 * The rule-derived default deadline: the approval date plus the program's
 * typical certification period. The server owns the actual rules; this only
 * pre-fills the prompt so the user can confirm or correct it.
 */
export function ruleDerivedDeadline(approvedAt: Date, certPeriodMonths: number): Date {
  const result = new Date(approvedAt);
  result.setMonth(result.getMonth() + certPeriodMonths);
  return result;
}

/**
 * Picks the rule for a program, preferring the state-specific one. The server
 * uses state "*" for the national default.
 */
export function ruleForProgram(
  rules: BenefitsProgramRule[],
  program: string,
  state?: string | null,
): BenefitsProgramRule | null {
  const forProgram = rules.filter((rule) => rule.program === program);
  if (forProgram.length === 0) return null;
  if (state) {
    const exact = forProgram.find((rule) => rule.state === state);
    if (exact) return exact;
  }
  return forProgram.find((rule) => rule.state === "*") ?? forProgram[0] ?? null;
}

/**
 * Explains where the deadline came from. A rule-derived deadline is labelled
 * as the typical period and asks the user to confirm theirs; a user-confirmed
 * one is stated as their own.
 */
export function renewalSourceLabel(
  renewal: BenefitsRenewal,
  certPeriodMonths?: number | null,
): string {
  if (renewal.source === "user-confirmed") {
    return "This deadline was confirmed by you.";
  }
  if (certPeriodMonths != null) {
    return typicalPeriodLabel(renewal.program, certPeriodMonths);
  }
  return "Based on the typical certification period — confirm yours.";
}

/**
 * The push copy contract, owned by the server
 * (`apps/server/internal/modules/benefits/renewals.go` — RenewalPushMessage).
 *
 * Program names never appear in push titles or bodies — only inside the app
 * once it opens. With the discreet lock-screen preference on (the default),
 * even the generic "benefits" wording is replaced by a neutral reminder.
 */
export const RENEWAL_PUSH_DISCREET_TITLE = "Help The Hive reminder";
export const RENEWAL_PUSH_DISCREET_BODY = "Time to review your benefits";
export const RENEWAL_PUSH_TITLE = "Benefits renewal";
