/**
 * Questionnaire answer persistence.
 *
 * Answers survive the app being backgrounded: what was saved is what loads
 * back, field by field. Corrupt or missing storage fails open to the Swift
 * defaults, and writes never throw.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_ANSWERS } from '@/features/meals/questionnaire-answers';
import {
  clearQuestionnaireAnswers,
  loadQuestionnaireAnswers,
  saveQuestionnaireAnswers,
} from '@/features/meals/questionnaire-storage';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(async (keys: string[]) =>
    keys.map((key) => [key, mockStore.has(key) ? mockStore.get(key)! : null]),
  ),
  multiSet: jest.fn(async (pairs: [string, string][]) => {
    for (const [key, value] of pairs) mockStore.set(key, value);
  }),
  multiRemove: jest.fn(async (keys: string[]) => {
    for (const key of keys) mockStore.delete(key);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('questionnaire storage', () => {
  it('loads the Swift defaults when nothing was saved', async () => {
    expect(await loadQuestionnaireAnswers()).toEqual(DEFAULT_ANSWERS);
  });

  it('round-trips a full answer set', async () => {
    const answers = {
      ...DEFAULT_ANSWERS,
      householdSize: 4,
      childrenCount: 2,
      childrenAges: ['4–8', '9–12'],
      diets: ['Vegetarian'],
      dietOtherText: '',
      allergies: ['Peanuts', 'Other'],
      allergyOtherText: 'Avocado',
      dislikes: 'Olives',
      health: ['High Blood Pressure'],
      goals: ['Build Muscle'],
      doctorDietText: '',
      cuisines: ['Mexican', 'Italian'],
      spice: 'Medium',
      cookTime: '20–40 Minutes',
      skill: 'Comfortable',
      equipment: ['Stove / Cooktop', 'Oven / Baking'],
      dinnersPerWeek: 6,
      mealTypes: ['Breakfast', 'Dinner'],
      budget: '$75–$150',
      shopping: 'Give Me a Grocery List',
    };
    await saveQuestionnaireAnswers(answers);
    expect(await loadQuestionnaireAnswers()).toEqual(answers);
  });

  it('merges saved fields over the defaults instead of dropping the rest', async () => {
    await saveQuestionnaireAnswers({ ...DEFAULT_ANSWERS, householdSize: 5 });
    const loaded = await loadQuestionnaireAnswers();
    expect(loaded.householdSize).toBe(5);
    expect(loaded.dinnersPerWeek).toBe(DEFAULT_ANSWERS.dinnersPerWeek);
  });

  it('fails open to defaults on corrupt storage', async () => {
    mockStore.set('hth:meal_q:diets', 'not-json');
    mockStore.set('hth:meal_q:household_size', 'banana');
    const loaded = await loadQuestionnaireAnswers();
    expect(loaded.diets).toEqual(DEFAULT_ANSWERS.diets);
    expect(loaded.householdSize).toBe(DEFAULT_ANSWERS.householdSize);
  });

  it('fails open to defaults when reads throw', async () => {
    jest.mocked(AsyncStorage.multiGet).mockRejectedValueOnce(new Error('disk gone'));
    expect(await loadQuestionnaireAnswers()).toEqual(DEFAULT_ANSWERS);
  });

  it('never throws on write failures', async () => {
    jest.mocked(AsyncStorage.multiSet).mockRejectedValueOnce(new Error('disk gone'));
    await expect(saveQuestionnaireAnswers(DEFAULT_ANSWERS)).resolves.toBeUndefined();
  });

  it('clears every saved answer', async () => {
    await saveQuestionnaireAnswers({ ...DEFAULT_ANSWERS, householdSize: 5, spice: 'Hot' });
    await clearQuestionnaireAnswers();
    expect(mockStore.size).toBe(0);
    expect(await loadQuestionnaireAnswers()).toEqual(DEFAULT_ANSWERS);
  });
});
