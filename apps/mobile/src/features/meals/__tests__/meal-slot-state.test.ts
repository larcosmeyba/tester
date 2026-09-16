/**
 * Meal calendar slot overlays: checkoff + removal persistence.
 */
import {
  addRemovedSlot,
  clearSlotOverlays,
  getCompletedSlots,
  getRemovedSlots,
  setSlotCompleted,
  slotKey,
} from '@/features/meals/meal-slot-state';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key)! : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => mockStore.delete(key));
  }),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

const slot = { day: 3, mealType: 'dinner' } as const;

describe('slotKey', () => {
  test('is a stable day:mealType string', () => {
    expect(slotKey(slot)).toBe('3:dinner');
    expect(slotKey({ day: 1, mealType: 'breakfast' })).toBe('1:breakfast');
  });
});

describe('completed slots', () => {
  test('starts empty', async () => {
    expect(await getCompletedSlots('plan-1')).toEqual(new Set());
  });

  test('toggle on and off round-trips', async () => {
    await setSlotCompleted('plan-1', slot, true);
    expect(await getCompletedSlots('plan-1')).toEqual(new Set(['3:dinner']));
    await setSlotCompleted('plan-1', slot, false);
    expect(await getCompletedSlots('plan-1')).toEqual(new Set());
  });

  test('is scoped per plan', async () => {
    await setSlotCompleted('plan-1', slot, true);
    expect(await getCompletedSlots('plan-2')).toEqual(new Set());
  });
});

describe('removed slots', () => {
  test('starts empty and accumulates', async () => {
    expect(await getRemovedSlots('plan-1')).toEqual(new Set());
    await addRemovedSlot('plan-1', slot);
    await addRemovedSlot('plan-1', { day: 5, mealType: 'lunch' });
    expect(await getRemovedSlots('plan-1')).toEqual(new Set(['3:dinner', '5:lunch']));
  });
});

describe('clearSlotOverlays', () => {
  test('clears both overlays for the plan only', async () => {
    await setSlotCompleted('plan-1', slot, true);
    await addRemovedSlot('plan-1', slot);
    await setSlotCompleted('plan-2', slot, true);
    await clearSlotOverlays('plan-1');
    expect(await getCompletedSlots('plan-1')).toEqual(new Set());
    expect(await getRemovedSlots('plan-1')).toEqual(new Set());
    expect(await getCompletedSlots('plan-2')).toEqual(new Set(['3:dinner']));
  });
});
