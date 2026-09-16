/**
 * Penny monthly limits: month-keyed counting, success-only recording, fail-open.
 */
import {
  getPennyUsage,
  hasPennyMessagesRemaining,
  PENNY_TURNS_PER_MONTH,
  recordPennyMessage,
} from '@/features/penny/penny-limits';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key)! : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

describe('penny monthly limits', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('starts at the full allowance', async () => {
    const usage = await getPennyUsage();
    expect(usage.limit).toBe(PENNY_TURNS_PER_MONTH);
    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(PENNY_TURNS_PER_MONTH);
    expect(await hasPennyMessagesRemaining()).toBe(true);
  });

  it('counts only recorded sends and decrements remaining', async () => {
    await recordPennyMessage();
    await recordPennyMessage();
    const usage = await getPennyUsage();
    expect(usage.used).toBe(2);
    expect(usage.remaining).toBe(PENNY_TURNS_PER_MONTH - 2);
  });

  it('reports empty at the limit', async () => {
    for (let i = 0; i < PENNY_TURNS_PER_MONTH; i++) {
      await recordPennyMessage();
    }
    const usage = await getPennyUsage();
    expect(usage.remaining).toBe(0);
    expect(await hasPennyMessagesRemaining()).toBe(false);
  });
});
