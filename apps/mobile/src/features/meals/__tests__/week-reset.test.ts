/**
 * Weekly reset prompt logic: week boundaries and once-per-week dismissal.
 */
import {
  dismissResetPrompt,
  readPlanWeekStart,
  savePlanWeekStart,
  wasResetPromptDismissed,
  weekStartIso,
  weekStatus,
} from '@/features/meals/week-reset';

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

describe('weekStatus', () => {
  const start = new Date('2026-09-14T00:00:00');

  test('is active during the week', () => {
    expect(weekStatus(start, 7, new Date('2026-09-14T12:00:00'))).toBe('active');
    expect(weekStatus(start, 7, new Date('2026-09-20T23:59:59'))).toBe('active');
  });

  test('ends on the day after the last plan day', () => {
    expect(weekStatus(start, 7, new Date('2026-09-21T00:00:00'))).toBe('ended');
    expect(weekStatus(start, 7, new Date('2026-09-25T00:00:00'))).toBe('ended');
  });

  test('a zero-day plan never reports ended', () => {
    expect(weekStatus(start, 0, new Date('2027-01-01T00:00:00'))).toBe('active');
  });
});

describe('weekStartIso', () => {
  test('is the calendar date regardless of time', () => {
    expect(weekStartIso(new Date('2026-09-14T18:30:00'))).toBe('2026-09-14');
  });
});

describe('plan week persistence', () => {
  test('round-trips the week anchor', async () => {
    await savePlanWeekStart('plan-1', new Date('2026-09-14T09:00:00'));
    const read = await readPlanWeekStart('plan-1');
    expect(read).not.toBeNull();
    expect(weekStartIso(read!)).toBe('2026-09-14');
  });

  test('returns null when nothing was saved', async () => {
    expect(await readPlanWeekStart('plan-9')).toBeNull();
  });

  test('returns null for a corrupt value', async () => {
    mockStore.set('hth:plan-week-start:plan-1', 'not-a-date');
    expect(await readPlanWeekStart('plan-1')).toBeNull();
  });
});

describe('reset prompt dismissal', () => {
  const start = new Date('2026-09-14T00:00:00');

  test('fires until dismissed, then stays quiet for that week', async () => {
    expect(await wasResetPromptDismissed('plan-1', start)).toBe(false);
    await dismissResetPrompt('plan-1', start);
    expect(await wasResetPromptDismissed('plan-1', start)).toBe(true);
  });

  test('a new week prompts again', async () => {
    await dismissResetPrompt('plan-1', start);
    expect(await wasResetPromptDismissed('plan-1', new Date('2026-09-21T00:00:00'))).toBe(false);
  });

  test('dismissal is scoped per plan', async () => {
    await dismissResetPrompt('plan-1', start);
    expect(await wasResetPromptDismissed('plan-2', start)).toBe(false);
  });
});
