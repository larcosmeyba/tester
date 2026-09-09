import {
  STORAGE_LOCATIONS,
  byExpiry,
  byRecentlyUsed,
  daysUntilExpiry,
  expirationDateInDays,
  expiringSoon,
  itemsMatching,
  locationIconFor,
  locationLabel,
  type PantryItem,
} from '@/features/pantry/pantry-model';

const item = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'p1',
  name: 'Milk',
  quantity: '1 gallon',
  location: 'REFRIGERATOR',
  expirationDate: '2026-09-15',
  category: 'Dairy',
  status: 'ACTIVE',
  dateAdded: '2026-09-08',
  dateUsed: null,
  createdAt: '2026-09-08T00:00:00Z',
  updatedAt: '2026-09-08T00:00:00Z',
  ...overrides,
});

describe('the wire vocabulary is the contract vocabulary', () => {
  it('uses the GraphQL enum values, not display strings', () => {
    expect(STORAGE_LOCATIONS).toEqual(['PANTRY', 'REFRIGERATOR', 'FREEZER']);
  });

  it('renders the title-case labels the design expects', () => {
    expect(locationLabel('PANTRY')).toBe('Pantry');
    expect(locationLabel('REFRIGERATOR')).toBe('Refrigerator');
    expect(locationLabel('FREEZER')).toBe('Freezer');
  });

  it('maps each location to its icon', () => {
    expect(locationIconFor('PANTRY')).toBe('box');
    expect(locationIconFor('REFRIGERATOR')).toBe('fridge');
    expect(locationIconFor('FREEZER')).toBe('snow');
  });
});

describe('partitioning by status', () => {
  const items = [
    item({ id: 'a', status: 'ACTIVE' }),
    item({ id: 'b', status: 'USED', dateUsed: '2026-09-07' }),
    item({ id: 'c', status: 'EXPIRED' }),
    item({ id: 'd', status: 'ACTIVE' }),
  ];

  it('splits the list on the status the server reported', () => {
    expect(itemsMatching(items, 'active').map((i) => i.id)).toEqual(['a', 'd']);
    expect(itemsMatching(items, 'used').map((i) => i.id)).toEqual(['b']);
    expect(itemsMatching(items, 'expired').map((i) => i.id)).toEqual(['c']);
  });

  it('never recomputes expiry itself', () => {
    // A lapsed date the server still calls ACTIVE stays in the active tab.
    // The server owns that decision; a second opinion here would only be a way
    // for the two to disagree.
    const lapsedButActive = item({ id: 'e', status: 'ACTIVE', expirationDate: '2000-01-01' });
    expect(itemsMatching([lapsedButActive], 'active')).toHaveLength(1);
    expect(itemsMatching([lapsedButActive], 'expired')).toHaveLength(0);
  });
});

describe('expiry', () => {
  // Local noon, not a UTC instant: these helpers reason in local calendar days.
  const now = new Date(2026, 8, 10, 12, 0, 0);

  it('counts whole days to the expiration date', () => {
    expect(daysUntilExpiry(item({ expirationDate: '2026-09-15' }), now)).toBe(5);
    expect(daysUntilExpiry(item({ expirationDate: '2026-09-10' }), now)).toBe(0);
  });

  it('goes negative once an item has lapsed', () => {
    expect(daysUntilExpiry(item({ expirationDate: '2026-09-08' }), now)).toBe(-2);
  });

  it('surfaces only active items expiring inside the window, soonest first', () => {
    const items = [
      item({ id: 'far', expirationDate: '2026-10-01' }),
      item({ id: 'soon', expirationDate: '2026-09-12' }),
      item({ id: 'sooner', expirationDate: '2026-09-11' }),
      item({ id: 'used-soon', expirationDate: '2026-09-11', status: 'USED' }),
    ];
    expect(expiringSoon(items, 5, now).map((i) => i.id)).toEqual(['sooner', 'soon']);
  });

  it('produces the YYYY-MM-DD the contract expects', () => {
    const start = new Date(2026, 8, 8, 12, 0, 0);
    expect(expirationDateInDays(7, start)).toBe('2026-09-15');
    expect(expirationDateInDays(0, start)).toBe('2026-09-08');
  });

  it('stays on the local calendar day near midnight', () => {
    // Late evening west of UTC is already tomorrow in UTC. Using toISOString()
    // here would silently add a day to every expiry date a user sets at night.
    const lateEvening = new Date(2026, 8, 8, 23, 30, 0);
    expect(expirationDateInDays(1, lateEvening)).toBe('2026-09-09');
  });
});

describe('ordering', () => {
  it('puts the soonest expiry first, so what needs dealing with is on top', () => {
    const sorted = [
      item({ id: 'late', expirationDate: '2026-12-01' }),
      item({ id: 'early', expirationDate: '2026-09-09' }),
    ].sort(byExpiry);
    expect(sorted.map((i) => i.id)).toEqual(['early', 'late']);
  });

  it('puts the most recently used first, because a used item is history', () => {
    const sorted = [
      item({ id: 'old', dateUsed: '2026-01-01' }),
      item({ id: 'recent', dateUsed: '2026-09-01' }),
    ].sort(byRecentlyUsed);
    expect(sorted.map((i) => i.id)).toEqual(['recent', 'old']);
  });

  it('does not fall over on an item with no used date', () => {
    const sorted = [item({ id: 'none', dateUsed: null }), item({ id: 'used', dateUsed: '2026-09-01' })].sort(
      byRecentlyUsed,
    );
    expect(sorted.map((i) => i.id)).toEqual(['used', 'none']);
  });
});
