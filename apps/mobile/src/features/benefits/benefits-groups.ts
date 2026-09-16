/**
 * Repeating-group questions for the benefits questionnaire.
 *
 * Some answers come in rows, not scalars: household members, jobs, income
 * sources, childcare and medical costs, bank accounts, vehicles. The server
 * reports a group's own path (e.g. `household.members`) as missing until the
 * group has been collected, and indexed row paths (e.g.
 * `household.members[0].date_of_birth`) for gaps inside collected rows. The
 * scalar questionnaire cannot ask either kind: saving free text against a
 * group path is rejected by the server, and saving an indexed path through
 * the scalar mutation would file it in the wrong place.
 *
 * Everything here is pure so it can be tested on its own. The group a path
 * belongs to is derived from the vocabulary the server publishes, never from
 * a hardcoded list, so a new repeating group is a server change rather than
 * an app release.
 */
import type { BenefitsGroupRowInput } from "@helpthehive/api-contract";

import {
  answerFrom,
  centsToMoney,
} from "@/features/benefits/benefits-answers";
import type {
  BenefitsFieldSpec,
  BenefitsMissingField,
  BenefitsProfileData,
} from "@/features/benefits/benefits-types";

/** One stored answer inside a profile group row. */
type StoredRowAnswer =
  BenefitsProfileData["groups"][number]["rows"][number]["answers"][number];

/** Never rendered, never sent: the collection policy, mirrored client-side. */
export function isNeverAskPath(fieldPath: string): boolean {
  return /ssn|social.?security/i.test(fieldPath);
}

/** `household.members[0].first_name` -> `household.members[].first_name`. */
export function templatePath(fieldPath: string): string {
  return fieldPath.replace(/\[\d+\]/g, "[]");
}

/**
 * The repeating group that owns a path — `household.members` for
 * `household.members[].first_name` and `household.members[2].last_name`
 * alike — or null. The bare group path itself and scalar paths both return
 * null here; use owningGroupPath() when the bare path must resolve too.
 */
export function groupPathOf(fieldPath: string): string | null {
  const template = templatePath(fieldPath);
  const marker = template.indexOf("[]");
  if (marker === -1) return null;
  return template.slice(0, marker);
}

function isGroupPath(path: string, specs: BenefitsFieldSpec[]): boolean {
  if (path.includes("[")) return false;
  const prefix = `${path}[]`;
  return specs.some((spec) => spec.fieldPath.startsWith(prefix));
}

/**
 * The repeating group a missing-field path belongs to, validated against the
 * vocabulary: the bare group path, its template row paths, and its indexed
 * row paths all resolve to the group; anything else returns null.
 */
export function owningGroupPath(
  fieldPath: string,
  specs: BenefitsFieldSpec[],
): string | null {
  const fromBrackets = groupPathOf(fieldPath);
  if (fromBrackets !== null && isGroupPath(fromBrackets, specs)) return fromBrackets;
  if (isGroupPath(fieldPath, specs)) return fieldPath;
  return null;
}

/**
 * The row fields a group editor asks for: every vocabulary entry under
 * `groupPath[]` that a user can actually answer. Derived totals are computed,
 * never asked; NeverAsk paths (Social Security numbers) are never rendered.
 */
export function rowSpecsFor(
  groupPath: string,
  specs: BenefitsFieldSpec[],
): BenefitsFieldSpec[] {
  const prefix = `${groupPath}[]`;
  return specs.filter(
    (spec) =>
      spec.fieldPath.startsWith(prefix) &&
      !spec.isDerived &&
      !isNeverAskPath(spec.fieldPath),
  );
}

export type GroupBucket = {
  /** e.g. `household.members`. */
  groupPath: string;
  /** The questionnaire section this group belongs to, e.g. `household`. */
  sectionGroup: string;
  /** The group's own missing-field entry, when the group is uncollected. */
  groupQuestion: BenefitsMissingField | null;
  /** Indexed/template row paths still missing, for highlighting. */
  missingRowPaths: Set<string>;
  /** Whether any selected form requires this group. */
  required: boolean;
  /** Whether the question is sensitive (shown as a privacy note). */
  sensitive: boolean;
};

/**
 * Splits the server-reported missing fields into scalar questions, which the
 * existing questionnaire renders, and one bucket per repeating group, which
 * the group editor renders. Group membership is derived from the vocabulary:
 * a missing path with no brackets whose `path[]` prefix owns vocabulary
 * entries is a group question; any missing path under such a prefix is a row
 * gap that belongs to the same editor.
 */
export function partitionGroupQuestions(
  fields: BenefitsMissingField[],
  specs: BenefitsFieldSpec[],
): { scalars: BenefitsMissingField[]; groups: GroupBucket[] } {
  const scalars: BenefitsMissingField[] = [];
  const buckets = new Map<string, GroupBucket>();

  function bucketFor(groupPath: string): GroupBucket {
    let bucket = buckets.get(groupPath);
    if (!bucket) {
      bucket = {
        groupPath,
        sectionGroup: "",
        groupQuestion: null,
        missingRowPaths: new Set<string>(),
        required: false,
        sensitive: false,
      };
      buckets.set(groupPath, bucket);
    }
    return bucket;
  }

  for (const field of fields) {
    if (isNeverAskPath(field.fieldPath)) continue;
    const owner = owningGroupPath(field.fieldPath, specs);
    if (owner !== null) {
      const bucket = bucketFor(owner);
      if (field.fieldPath === owner) {
        bucket.groupQuestion = field;
        bucket.sectionGroup = field.group;
      } else {
        bucket.missingRowPaths.add(templatePath(field.fieldPath));
        if (bucket.sectionGroup === "") bucket.sectionGroup = field.group;
      }
      if (field.strength === "REQUIRED") bucket.required = true;
      if (field.isSensitive) bucket.sensitive = true;
      continue;
    }
    scalars.push(field);
  }

  // A bucket whose group question never arrived (only row gaps reported)
  // still needs its section and question text: fall back to the vocabulary.
  for (const bucket of buckets.values()) {
    if (bucket.groupQuestion !== null) continue;
    const spec = specs.find((candidate) => candidate.fieldPath === bucket.groupPath);
    if (spec) {
      bucket.sectionGroup = spec.group;
      bucket.sensitive = spec.isSensitive;
    }
  }

  return { scalars, groups: [...buckets.values()] };
}

/** Display label for one row of a group, e.g. "Person 2". */
export function rowLabelFor(groupPath: string, index: number): string {
  const nouns: Record<string, string> = {
    "household.members": "Person",
    "employment.jobs": "Job",
    "income.sources": "Income source",
    "expenses.childcare": "Childcare cost",
    "expenses.medical": "Medical cost",
    "resources.accounts": "Account",
    "resources.vehicles": "Vehicle",
  };
  return `${nouns[groupPath] ?? "Entry"} ${index + 1}`;
}

/** `member_ref` fields name a household member; the form splits the name. */
export function isMemberRefField(fieldPath: string): boolean {
  return fieldPath.endsWith("member_ref");
}

export type GroupRowDraft = {
  /** The server's row id, or "" for a row the user just added. */
  rowId: string;
  /** Template field path -> raw text ("yes"/"no" for booleans). */
  values: Record<string, string>;
};

function storedAnswerToString(answer: StoredRowAnswer): string {
  switch (answer.kind) {
    case "TEXT":
    case "CHOICE":
      return answer.text ?? "";
    case "NUMBER":
      return answer.number != null ? String(answer.number) : "";
    case "MONEY":
      return answer.moneyCents != null ? centsToMoney(answer.moneyCents) : "";
    case "DATE":
      return answer.date ?? "";
    case "BOOLEAN":
      return answer.bool == null ? "" : answer.bool ? "yes" : "no";
    case "LIST":
      return (answer.list ?? []).join(", ");
    default:
      return "";
  }
}

/** Turns stored profile rows into editable drafts. */
export function draftsFromProfileRows(
  rows: BenefitsProfileData["groups"][number]["rows"],
): GroupRowDraft[] {
  return rows.map((row) => {
    const values: Record<string, string> = {};
    for (const answer of row.answers) {
      if (answer.status !== "PROVIDED") continue;
      const text = storedAnswerToString(answer);
      if (text !== "") values[templatePath(answer.fieldPath)] = text;
    }
    return { rowId: row.rowId, values };
  });
}

export function emptyRowDraft(): GroupRowDraft {
  return { rowId: "", values: {} };
}

/** A row with nothing typed in it carries no information; drop it on save. */
export function isEmptyDraft(draft: GroupRowDraft): boolean {
  return Object.values(draft.values).every((value) => value.trim() === "");
}

/**
 * Builds the mutation input for one saved group. Answers are keyed by
 * template path, which is how the server files row values; blank boxes are
 * left out rather than saved as blanks, so the question comes back.
 */
export function groupRowInputs(
  drafts: GroupRowDraft[],
  specs: BenefitsFieldSpec[],
): BenefitsGroupRowInput[] {
  const kindByPath = new Map(specs.map((spec) => [spec.fieldPath, spec.kind]));
  return drafts
    .filter((draft) => !isEmptyDraft(draft))
    .map((draft) => ({
      ...(draft.rowId !== "" ? { rowId: draft.rowId } : {}),
      answers: Object.entries(draft.values)
        .map(([fieldPath, raw]) => {
          const kind = kindByPath.get(fieldPath) ?? "TEXT";
          return answerFrom({ fieldPath, answerKind: kind }, raw);
        })
        .filter((answer) => answer.status === "PROVIDED"),
    }));
}

/** The profile's rows for one group, for seeding the editor. */
export function profileGroup(
  profile: BenefitsProfileData | null,
  groupPath: string,
): BenefitsProfileData["groups"][number] | null {
  if (!profile) return null;
  return profile.groups.find((group) => group.groupPath === groupPath) ?? null;
}

/** Full names of the household members, for `member_ref` pickers. */
export function householdMemberNames(profile: BenefitsProfileData | null): string[] {
  const group = profileGroup(profile, "household.members");
  if (!group) return [];
  return group.rows
    .map((row) => {
      const first =
        row.answers.find((answer) => templatePath(answer.fieldPath) === "household.members[].first_name")
          ?.text ?? "";
      const last =
        row.answers.find((answer) => templatePath(answer.fieldPath) === "household.members[].last_name")
          ?.text ?? "";
      return `${first} ${last}`.trim();
    })
    .filter((name) => name !== "");
}
