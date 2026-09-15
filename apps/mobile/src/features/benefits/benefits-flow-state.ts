/**
 * Benefits flow, Pages 1-3 (audit Section 3) — pure helpers.
 *
 * Kept free of network and storage imports so the rules can be tested on
 * their own:
 * - the 50-state list the state picker renders,
 * - matching a geocoder's region string ("California", "CA", "california")
 *   to that list,
 * - the union of outstanding questions across several applications, deduped
 *   by fieldPath so the multi-program questionnaire never asks the same
 *   question twice.
 */

export type USState = {
  name: string;
  code: string;
};

export const US_STATES: USState[] = [
  { name: 'Alabama', code: 'AL' },
  { name: 'Alaska', code: 'AK' },
  { name: 'Arizona', code: 'AZ' },
  { name: 'Arkansas', code: 'AR' },
  { name: 'California', code: 'CA' },
  { name: 'Colorado', code: 'CO' },
  { name: 'Connecticut', code: 'CT' },
  { name: 'Delaware', code: 'DE' },
  { name: 'Florida', code: 'FL' },
  { name: 'Georgia', code: 'GA' },
  { name: 'Hawaii', code: 'HI' },
  { name: 'Idaho', code: 'ID' },
  { name: 'Illinois', code: 'IL' },
  { name: 'Indiana', code: 'IN' },
  { name: 'Iowa', code: 'IA' },
  { name: 'Kansas', code: 'KS' },
  { name: 'Kentucky', code: 'KY' },
  { name: 'Louisiana', code: 'LA' },
  { name: 'Maine', code: 'ME' },
  { name: 'Maryland', code: 'MD' },
  { name: 'Massachusetts', code: 'MA' },
  { name: 'Michigan', code: 'MI' },
  { name: 'Minnesota', code: 'MN' },
  { name: 'Mississippi', code: 'MS' },
  { name: 'Missouri', code: 'MO' },
  { name: 'Montana', code: 'MT' },
  { name: 'Nebraska', code: 'NE' },
  { name: 'Nevada', code: 'NV' },
  { name: 'New Hampshire', code: 'NH' },
  { name: 'New Jersey', code: 'NJ' },
  { name: 'New Mexico', code: 'NM' },
  { name: 'New York', code: 'NY' },
  { name: 'North Carolina', code: 'NC' },
  { name: 'North Dakota', code: 'ND' },
  { name: 'Ohio', code: 'OH' },
  { name: 'Oklahoma', code: 'OK' },
  { name: 'Oregon', code: 'OR' },
  { name: 'Pennsylvania', code: 'PA' },
  { name: 'Rhode Island', code: 'RI' },
  { name: 'South Carolina', code: 'SC' },
  { name: 'South Dakota', code: 'SD' },
  { name: 'Tennessee', code: 'TN' },
  { name: 'Texas', code: 'TX' },
  { name: 'Utah', code: 'UT' },
  { name: 'Vermont', code: 'VT' },
  { name: 'Virginia', code: 'VA' },
  { name: 'Washington', code: 'WA' },
  { name: 'West Virginia', code: 'WV' },
  { name: 'Wisconsin', code: 'WI' },
  { name: 'Wyoming', code: 'WY' },
];

/**
 * Matches a region string from the OS geocoder to a US state. iOS returns the
 * state name ("New Mexico"), Android the admin area, and either may hand back
 * a two-letter code — all three spellings resolve here. Returns null when
 * nothing matches so the caller falls back to the manual state list.
 */
export function findState(input: string | null | undefined): USState | null {
  if (!input) {
    return null;
  }
  const needle = input.trim().toLowerCase();
  if (needle === '') {
    return null;
  }
  return (
    US_STATES.find(
      (state) =>
        state.name.toLowerCase() === needle || state.code.toLowerCase() === needle,
    ) ?? null
  );
}

type MissingFieldLike = {
  fieldPath: string;
  isDerived?: boolean | null;
};

/**
 * Defense in depth for the never-collect-SSN policy. The server's NeverAsk
 * flag is the authority and already excludes SSN questions; this drops
 * anything SSN-shaped before it can ever render in a questionnaire.
 */
export function excludeNeverAskQuestions<T extends MissingFieldLike>(fields: T[]): T[] {
  return fields.filter((field) => !/ssn|social.?security/i.test(field.fieldPath));
}

/**
 * The question set for the multi-program questionnaire: the union of every
 * selected application's outstanding fields, deduped by fieldPath. Answers
 * are stored once on the benefits profile and shared by every application, so
 * a question answered for one program is never asked again for another.
 * Derived fields (computed from other answers, e.g. total household income)
 * are filtered out — there is no answer the user could give for them.
 */
export function unionMissingFields<T extends MissingFieldLike>(
  applications: { missingFields: T[] }[],
): T[] {
  const seen = new Set<string>();
  const union: T[] = [];
  for (const application of applications) {
    for (const field of application.missingFields) {
      if (field.isDerived || seen.has(field.fieldPath)) {
        continue;
      }
      seen.add(field.fieldPath);
      union.push(field);
    }
  }
  return union;
}
