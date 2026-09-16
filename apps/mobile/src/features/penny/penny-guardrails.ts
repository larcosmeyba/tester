/**
 * Client-side guardrails for Penny chat (Audit Section 7).
 *
 * The authoritative safety rules live server-side (apps/penny/penny/policy/
 * states them to the model; the Go output guard enforces them). This module
 * holds the checks the client can do honestly before a message ever leaves
 * the phone:
 *
 * - SSN guard: never let the user paste a Social Security number into Penny.
 *   Help The Hive never asks for or stores SSNs (locked product policy), so
 *   the send is blocked with an inline warning instead of transmitted.
 * - Scope check: Penny's beat is benefits, app navigation, meals, pantry,
 *   grocery, and resources. Clearly out-of-scope questions get a graceful
 *   local redirect — no lecture, no backend call, no usage consumed.
 * - Safety exemption: help finishing an EXISTING government application is
 *   never paywalled (locked product policy).
 *
 * Everything here is pure and unit-tested. Ambiguous input always defaults
 * to sending — the backend is the final authority.
 */

import { isBenefitsContext, type PennyScreenContext } from '@/features/penny/penny-context';

/** Dashed SSN shape, mirroring the server redaction pattern. */
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

/** True when the text contains something shaped like a Social Security number. */
export function containsSsn(text: string): boolean {
  return SSN_PATTERN.test(text);
}

export const SSN_WARNING =
  'Please don\u2019t share your Social Security number here \u2014 Penny never needs it, and Help The Hive never asks for or stores it.';

/** Penny's beat, per the audit. */
export type PennyScope = 'in-scope' | 'out-of-scope';

const IN_SCOPE_PATTERN =
  /\b(benefit|snap|wic|medicaid|medicare|ssi|ssdi|tanf|liheap|chip|ebt|unemployment|food stamp|meal|recipe|cook|pantry|fridge|freezer|groc|food bank|resource|shelter|clinic|expire|ingredient|instacart|kroger|budget|dinner|lunch|breakfast|serving|application|apply|enroll|submit|document|interview|renew)\b/i;

/**
 * High-confidence unrelated intents. Deliberately narrow: anything ambiguous
 * stays in-scope and goes to the backend, which handles it gracefully.
 */
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(homework|math problem|algebra|calculus|geometry|essay|book report|science project)\b/i,
  /\b(write|debug|fix|refactor)\b.{0,30}\b(code|function|program|script|app|website|python|javascript|java)\b/i,
  /\b(code|program|script)\b.{0,30}\bin\b.{0,20}\b(python|javascript|java|c\+\+|rust|go)\b/i,
  /\b(who won|score of|betting odds|fantasy football|super bowl|world series)\b/i,
  /\bwrite me a (poem|song|story|novel|screenplay)\b/i,
];

export function classifyPennyScope(text: string): PennyScope {
  if (IN_SCOPE_PATTERN.test(text)) return 'in-scope';
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) return 'out-of-scope';
  return 'in-scope';
}

export const PENNY_SCOPE_REDIRECT =
  'I\u2019m at my best helping with benefits, meals, your pantry, groceries, and nearby resources. Want to ask me about one of those?';

/**
 * True when this message is safety information needed to finish an EXISTING
 * government application — which the paywall must never block (locked
 * product policy). Either the user arrived from a benefits screen, or the
 * message itself is about completing/submitting their application.
 */
export function isApplicationSafetyMessage(
  text: string,
  context: PennyScreenContext | null | undefined,
): boolean {
  if (isBenefitsContext(context)) return true;
  return /\b(submit\w*|finish\w*|complet\w*|stuck|help)\b/i.test(text) &&
    /\b(application|benefit|snap|wic|medicaid|ssi|tanf)\b/i.test(text);
}
