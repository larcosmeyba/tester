import {
  consumePennyContext,
  isBenefitsContext,
  PENNY_CONTEXT_LABELS,
  setPennyContext,
  subscribePennyContext,
} from '@/features/penny/penny-context';

describe('penny context store', () => {
  it('consumes exactly once', () => {
    setPennyContext({ source: 'benefits-ready', applicationIds: ['a1'] });
    expect(consumePennyContext()).toEqual({ source: 'benefits-ready', applicationIds: ['a1'] });
    expect(consumePennyContext()).toBeNull();
  });

  it('notifies subscribers on set', () => {
    const seen: string[] = [];
    const unsubscribe = subscribePennyContext((context) => seen.push(context.source));
    setPennyContext({ source: 'meal-plan' });
    setPennyContext({ source: 'pantry' });
    unsubscribe();
    setPennyContext({ source: 'home' });
    expect(seen).toEqual(['meal-plan', 'pantry']);
    // Drain for other tests.
    consumePennyContext();
  });

  it('labels every source', () => {
    expect(PENNY_CONTEXT_LABELS['benefits-ready']).toBe('Benefits application');
    expect(PENNY_CONTEXT_LABELS['meal-plan']).toBe('Meal plan');
    expect(PENNY_CONTEXT_LABELS.home).toBe('Home');
  });
});

describe('isBenefitsContext', () => {
  it('is true for benefits flow sources', () => {
    expect(isBenefitsContext({ source: 'benefits-questionnaire' })).toBe(true);
    expect(isBenefitsContext({ source: 'benefits-review', state: 'NM' })).toBe(true);
  });

  it('is false otherwise', () => {
    expect(isBenefitsContext({ source: 'pantry' })).toBe(false);
    expect(isBenefitsContext(null)).toBe(false);
    expect(isBenefitsContext(undefined)).toBe(false);
  });
});
