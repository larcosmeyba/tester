/**
 * Questionnaire answer persistence — the Swift file's `UserDefaults` keys,
 * rebuilt on AsyncStorage (this is React Native; there is no UserDefaults).
 *
 * Answers are saved every time the user advances a step and when they close
 * the questionnaire, and reloaded when the flow opens, so a half-finished
 * questionnaire survives the app being backgrounded or killed.
 *
 * Reads fail open to the Swift defaults; writes are best-effort and never
 * throw. Only the user's own questionnaire answers are stored — never pantry
 * contents, plans, or anything sensitive.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_ANSWERS,
  type MealQuestionnaireAnswers,
} from '@/features/meals/questionnaire-answers';

const PREFIX = 'hth:meal_q:';

const KEYS: Record<keyof MealQuestionnaireAnswers, string> = {
  householdSize: `${PREFIX}household_size`,
  childrenCount: `${PREFIX}children_count`,
  childrenAges: `${PREFIX}children_ages`,
  diets: `${PREFIX}diets`,
  dietOtherText: `${PREFIX}diet_other`,
  allergies: `${PREFIX}allergies`,
  allergyOtherText: `${PREFIX}allergy_other`,
  dislikes: `${PREFIX}dislikes`,
  health: `${PREFIX}health`,
  goals: `${PREFIX}goals`,
  doctorDietText: `${PREFIX}doctor_diet`,
  cuisines: `${PREFIX}cuisines`,
  spice: `${PREFIX}spice`,
  cookTime: `${PREFIX}cook_time`,
  skill: `${PREFIX}skill`,
  equipment: `${PREFIX}equipment`,
  dinnersPerWeek: `${PREFIX}dinners_week`,
  mealTypes: `${PREFIX}meal_types`,
  budget: `${PREFIX}budget`,
  shopping: `${PREFIX}shopping`,
};

const ALL_KEYS = Object.values(KEYS);

type FieldKind = 'number' | 'string' | 'stringArray';

const FIELD_KINDS: Record<keyof MealQuestionnaireAnswers, FieldKind> = {
  householdSize: 'number',
  childrenCount: 'number',
  childrenAges: 'stringArray',
  diets: 'stringArray',
  dietOtherText: 'string',
  allergies: 'stringArray',
  allergyOtherText: 'string',
  dislikes: 'string',
  health: 'stringArray',
  goals: 'stringArray',
  doctorDietText: 'string',
  cuisines: 'stringArray',
  spice: 'string',
  cookTime: 'string',
  skill: 'string',
  equipment: 'stringArray',
  dinnersPerWeek: 'number',
  mealTypes: 'stringArray',
  budget: 'string',
  shopping: 'string',
};

const FIELD_NAMES = Object.keys(KEYS) as (keyof MealQuestionnaireAnswers)[];

function parseField(
  kind: FieldKind,
  raw: string | null,
  fallback: number | string | string[],
): number | string | string[] {
  if (raw === null) return fallback;
  try {
    switch (kind) {
      case 'number': {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      case 'string':
        return typeof raw === 'string' ? raw : fallback;
      case 'stringArray': {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
          ? parsed
          : fallback;
      }
    }
  } catch {
    return fallback;
  }
}

function serializeField(kind: FieldKind, value: number | string | string[]): string {
  return kind === 'stringArray' ? JSON.stringify(value) : String(value);
}

/** Loads the saved answers, merged over the Swift defaults. Never throws. */
export async function loadQuestionnaireAnswers(): Promise<MealQuestionnaireAnswers> {
  try {
    const entries = await AsyncStorage.multiGet(ALL_KEYS);
    const raw = new Map(entries.map(([key, value]) => [key, value]));
    const answers = { ...DEFAULT_ANSWERS };
    for (const field of FIELD_NAMES) {
      const parsed = parseField(FIELD_KINDS[field], raw.get(KEYS[field]) ?? null, DEFAULT_ANSWERS[field]);
      (answers[field] as number | string | string[]) = parsed;
    }
    return answers;
  } catch {
    return { ...DEFAULT_ANSWERS };
  }
}

/** Persists the full answer set. Best-effort: never throws. */
export async function saveQuestionnaireAnswers(answers: MealQuestionnaireAnswers): Promise<void> {
  try {
    const pairs: [string, string][] = FIELD_NAMES.map((field) => [
      KEYS[field],
      serializeField(FIELD_KINDS[field], answers[field]),
    ]);
    await AsyncStorage.multiSet(pairs);
  } catch {
    // A storage failure must never block the questionnaire.
  }
}

/** Clears every saved answer. Used after a plan is successfully generated. */
export async function clearQuestionnaireAnswers(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(ALL_KEYS);
  } catch {
    // Best-effort.
  }
}
