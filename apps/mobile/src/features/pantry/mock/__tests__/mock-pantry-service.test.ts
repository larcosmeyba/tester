import {
  addPantryItem,
  deletePantryItem,
  fetchPantryItems,
  fetchWasteStats,
  markPantryItemUsed,
  resetMockPantry,
  updatePantryItem,
} from '@/features/pantry/mock/mock-pantry-service';

beforeEach(() => {
  resetMockPantry();
});

describe('the mock pantry service', () => {
  it('seeds a plausible household list instead of failing like the network would', async () => {
    const items = await fetchPantryItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.status === 'ACTIVE')).toBe(true);
  });

  it('adds, updates, marks used, and deletes within the session', async () => {
    const created = await addPantryItem({
      name: 'Yogurt',
      quantity: '4 pack',
      location: 'REFRIGERATOR',
      category: 'Dairy',
      expirationDate: '2026-09-20',
    });
    expect(created.id).toBeTruthy();
    expect((await fetchPantryItems()).some((item) => item.id === created.id)).toBe(true);

    const updated = await updatePantryItem(created.id, { quantity: '2 pack' });
    expect(updated.quantity).toBe('2 pack');

    const used = await markPantryItemUsed(created.id);
    expect(used.status).toBe('USED');

    expect(await deletePantryItem(created.id)).toBe(true);
    expect((await fetchPantryItems()).some((item) => item.id === created.id)).toBe(false);
  });

  it('reports deleting a missing item as false, not an error', async () => {
    await expect(deletePantryItem('no-such-item')).resolves.toBe(false);
  });

  it('keeps waste stats consistent with the session', async () => {
    const before = await fetchWasteStats();
    const created = await addPantryItem({
      name: 'Beans',
      quantity: '1 can',
      location: 'PANTRY',
      category: 'Canned',
      expirationDate: '2027-09-10',
    });
    await markPantryItemUsed(created.id);
    const after = await fetchWasteStats();
    expect(after.totalUsed).toBe(before.totalUsed + 1);
  });
});
