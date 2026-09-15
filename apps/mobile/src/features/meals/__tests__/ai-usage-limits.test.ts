/**
 * AI usage limits: monthly counters, the at-limit gate, and fail-open storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AI_PLANS_PER_MONTH,
  SINGLE_MEALS_PER_MONTH,
  VIDEO_IMPORTS_PER_MONTH,
  getAiUsage,
  hasAiUsageRemaining,
  recordAiUsage,
  type AiUsageKind,
} from '@/features/meals/ai-usage-limits';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key)! : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

const kinds: AiUsageKind[] = ['ai_plan', 'video_import', 'single_meal'];
const limits: Record<AiUsageKind, number> = {
  ai_plan: AI_PLANS_PER_MONTH,
  video_import: VIDEO_IMPORTS_PER_MONTH,
  single_meal: SINGLE_MEALS_PER_MONTH,
};

describe.each(kinds)('ai usage (%s)', (kind) => {
  test('starts at zero with the full allowance remaining', async () => {
    const usage = await getAiUsage(kind);
    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(limits[kind]);
    expect(usage.remaining).toBe(limits[kind]);
    expect(await hasAiUsageRemaining(kind)).toBe(true);
  });

  test('records uses and fires the gate AT the limit', async () => {
    const limit = limits[kind];
    for (let i = 0; i < limit; i++) {
      expect(await hasAiUsageRemaining(kind)).toBe(true);
      await recordAiUsage(kind);
    }
    const usage = await getAiUsage(kind);
    expect(usage.used).toBe(limit);
    expect(usage.remaining).toBe(0);
    expect(await hasAiUsageRemaining(kind)).toBe(false);
  });

  test('counters are independent per kind', async () => {
    await recordAiUsage('ai_plan');
    await recordAiUsage('ai_plan');
    const video = await getAiUsage('video_import');
    expect(video.used).toBe(0);
    const plan = await getAiUsage('ai_plan');
    expect(plan.used).toBe(2);
  });
});

test('corrupt stored counts fail open at zero', async () => {
  jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async () => 'not-a-number');
  const usage = await getAiUsage('ai_plan');
  expect(usage.used).toBe(0);
  expect(await hasAiUsageRemaining('ai_plan')).toBe(true);
});
