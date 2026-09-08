/**
 * Turning what somebody typed into an answer the server will accept, and
 * working out which questions to put to them.
 *
 * Deliberately free of any network or storage import so it can be tested on its
 * own: these are the rules that decide whether a box counts as answered, and
 * they are the rules most worth having tests for.
 */
import type { BenefitsAnswerInput } from "@helpthehive/api-contract";

import type {
  BenefitsApplication,
  BenefitsMissingField,
} from "@/features/benefits/benefits-types";

export type BenefitsAnswer = BenefitsAnswerInput;

/**
 * The questions the app should actually put to the user, in the order to ask
 * them: required first, then grouped by section.
 *
 * Derived answers are filtered out. A household's total monthly income is
 * computed from the income sources, so there is no answer the user could give
 * for it — asking would be a question with no valid reply.
 */
export function questionsToAsk(application: BenefitsApplication): BenefitsMissingField[] {
  return application.missingFields.filter((field) => !field.isDerived);
}

export function requiredQuestionsToAsk(application: BenefitsApplication): BenefitsMissingField[] {
  return questionsToAsk(application).filter((field) => field.strength === "REQUIRED");
}

/** Groups questions into the sections a questionnaire screen shows. */
export function groupQuestions(fields: BenefitsMissingField[]) {
  const sections = new Map<string, BenefitsMissingField[]>();
  for (const field of fields) {
    const existing = sections.get(field.group);
    if (existing) {
      existing.push(field);
      continue;
    }
    sections.set(field.group, [field]);
  }
  return [...sections.entries()].map(([group, questions]) => ({ group, questions }));
}

/**
 * Turns what the user typed into an answer the server will accept.
 *
 * An empty box is reported as UNKNOWN rather than as an empty string: the
 * server draws a hard line between "no answer" and "an answer of nothing", and
 * collapsing the two here would put a blank where a real answer belongs.
 * Saying "I have none of these" is a separate, deliberate action.
 */
export function answerFrom(
  field: Pick<BenefitsMissingField, "fieldPath" | "answerKind">,
  raw: string | boolean | null | undefined,
): BenefitsAnswer {
  const base = { fieldPath: field.fieldPath };

  if (raw === null || raw === undefined || raw === "") {
    return { ...base, status: "UNKNOWN" };
  }
  if (typeof raw === "boolean") {
    return { ...base, status: "PROVIDED", bool: raw };
  }

  const text = raw.trim();
  if (text === "") {
    return { ...base, status: "UNKNOWN" };
  }

  switch (field.answerKind) {
    case "MONEY": {
      const cents = moneyToCents(text);
      return cents === null
        ? { ...base, status: "UNKNOWN" }
        : { ...base, status: "PROVIDED", moneyCents: cents };
    }
    case "NUMBER": {
      const value = Number(text.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(value)
        ? { ...base, status: "PROVIDED", number: value }
        : { ...base, status: "UNKNOWN" };
    }
    case "DATE":
      return { ...base, status: "PROVIDED", date: text };
    case "BOOLEAN":
      return { ...base, status: "PROVIDED", bool: /^(y|yes|true)$/i.test(text) };
    case "LIST":
      return {
        ...base,
        status: "PROVIDED",
        list: text.split(",").map((item) => item.trim()).filter(Boolean),
      };
    default:
      return { ...base, status: "PROVIDED", text };
  }
}

/** Records that the user has none of something. A real answer, not a blank. */
export function noneAnswer(fieldPath: string): BenefitsAnswer {
  return { fieldPath, status: "NONE" };
}

/**
 * Money is held in cents throughout, so a household's income never drifts by a
 * rounding error. "1,240.50" and "$1240.5" both become 124050.
 */
export function moneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned.split(".").length > 2) {
    return null;
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = `${fraction}00`.slice(0, 2);
  const value = Number(`${whole || "0"}${cents}`);
  return Number.isFinite(value) ? value : null;
}

export function centsToMoney(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/**
 * Joins the API base onto the relative document path the server returns.
 *
 * The path is relative on purpose: there is no public link to a document
 * carrying somebody's benefits application, and it is fetched from this API
 * with the viewer's own token like any other request.
 */
export function joinDocumentUrl(apiUrl: string, path: string): string {
  return apiUrl.replace(/\/graphql\/?$/, "").replace(/\/$/, "") + path;
}
