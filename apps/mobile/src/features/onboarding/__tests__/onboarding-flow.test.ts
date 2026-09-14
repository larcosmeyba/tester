import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DEFAULT_BUDGET_DOLLARS,
  HOUSEHOLD_SIZE_OPTIONS,
  INCOME_BRACKET_OPTIONS,
  ONBOARDING_STEP_KEYS,
  PRIMARY_GOAL_APPLY_BENEFITS,
  PRIMARY_GOAL_BUDGET_MEALS,
  formatBudgetDollars,
  parseBudgetDollars,
  resumeIndexForStepKey,
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

  it('parses stored budget strings back into slider dollars', () => {
    expect(parseBudgetDollars('$100')).toBe(100);
    expect(parseBudgetDollars('$300+')).toBe(300);
    expect(parseBudgetDollars('$25')).toBe(25);
    expect(parseBudgetDollars(null)).toBe(DEFAULT_BUDGET_DOLLARS);
    expect(parseBudgetDollars('garbage')).toBe(DEFAULT_BUDGET_DOLLARS);
  });

  it('round-trips through format and parse', () => {
    for (let dollars = BUDGET_MIN; dollars <= BUDGET_MAX; dollars += BUDGET_STEP) {
      expect(parseBudgetDollars(formatBudgetDollars(dollars))).toBe(dollars);
    }
  });
});

describe('onboarding step order', () => {
  it('runs 7 questionnaire steps, then push, location, the two consents, then all-set', () => {
    expect([...ONBOARDING_STEP_KEYS]).toEqual([
      'questionnaire:1',
      'questionnaire:2',
      'questionnaire:3',
      'questionnaire:4',
      'questionnaire:5',
      'questionnaire:6',
      'questionnaire:7',
      'permissions:push',
      'permissions:location',
      'consent:email',
      'consent:phone',
      'all-set',
    ]);
  });

  it('has exactly two primary-goal codes', () => {
    expect(PRIMARY_GOAL_APPLY_BENEFITS).toBe('APPLY_BENEFITS');
    expect(PRIMARY_GOAL_BUDGET_MEALS).toBe('BUDGET_MEALS');
  });

  it('has 8 household-size tiles ending in 8+', () => {
    expect([...HOUSEHOLD_SIZE_OPTIONS]).toEqual(['1', '2', '3', '4', '5', '6', '7', '8+']);
  });

  it('has 7 income brackets including a privacy opt-out', () => {
    expect([...INCOME_BRACKET_OPTIONS]).toEqual([
      'Less than $1,500',
      '$1,500–$2,499',
      '$2,500–$3,499',
      '$3,500–$4,999',
      '$5,000–$6,999',
      '$7,000+',
      'Prefer not to say',
    ]);
  });
});

describe('resume step mapping', () => {
  it('resumes each questionnaire step at its screen index', () => {
    expect(resumeIndexForStepKey('questionnaire:1')).toBe(0);
    expect(resumeIndexForStepKey('questionnaire:2')).toBe(1);
    expect(resumeIndexForStepKey('questionnaire:3')).toBe(2);
    expect(resumeIndexForStepKey('questionnaire:4')).toBe(3);
    expect(resumeIndexForStepKey('questionnaire:5')).toBe(4);
    expect(resumeIndexForStepKey('questionnaire:6')).toBe(5);
    expect(resumeIndexForStepKey('questionnaire:7')).toBe(6);
  });

  it('resumes push, location, and consent steps at their screen indexes', () => {
    expect(resumeIndexForStepKey('permissions:push')).toBe(7);
    expect(resumeIndexForStepKey('permissions:location')).toBe(8);
    expect(resumeIndexForStepKey('consent:email')).toBe(9);
    expect(resumeIndexForStepKey('consent:phone')).toBe(10);
    expect(resumeIndexForStepKey('all-set')).toBe(11);
  });

  it('restarts at the first questionnaire step for unknown or missing keys', () => {
    expect(resumeIndexForStepKey(null)).toBe(0);
    expect(resumeIndexForStepKey(undefined)).toBe(0);
    expect(resumeIndexForStepKey('')).toBe(0);
    expect(resumeIndexForStepKey('not-a-step')).toBe(0);
  });
});
