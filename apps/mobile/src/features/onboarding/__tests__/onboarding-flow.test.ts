import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DEFAULT_BUDGET_DOLLARS,
  ONBOARDING_ROUTES,
  formatBudgetDollars,
} from '../onboarding-model';

describe('onboarding budget model', () => {
  it('formats the default $100 budget', () => {
    expect(formatBudgetDollars(DEFAULT_BUDGET_DOLLARS)).toBe('$100');
  });

  it('formats the slider minimum', () => {
    expect(formatBudgetDollars(BUDGET_MIN)).toBe('$25');
  });

  it('formats the slider maximum as "$300+"', () => {
    expect(formatBudgetDollars(BUDGET_MAX)).toBe('$300+');
  });

  it('clamps anything at/above the max to "$300+"', () => {
    expect(formatBudgetDollars(500)).toBe('$300+');
  });

  it('uses $5 steps from $25 to $300', () => {
    expect(BUDGET_MIN).toBe(25);
    expect(BUDGET_MAX).toBe(300);
    expect(BUDGET_STEP).toBe(5);
    expect((BUDGET_MAX - BUDGET_MIN) % BUDGET_STEP).toBe(0);
  });
});

describe('onboarding route order', () => {
  it('runs the benefits-first 3-step flow, then all-set, then permissions', () => {
    expect(ONBOARDING_ROUTES).toEqual([
      '/(onboarding)/resources',
      '/(onboarding)/benefits',
      '/(onboarding)/profile-photo',
      '/(onboarding)/all-set',
      '/(onboarding)/permissions',
    ]);
  });
});
