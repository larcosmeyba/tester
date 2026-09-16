import {
  excludeNeverAskQuestions,
  findState,
  unionMissingFields,
  US_STATES,
} from '@/features/benefits/benefits-flow-state';

type Field = { fieldPath: string; isDerived?: boolean | null };

function field(fieldPath: string, isDerived?: boolean): Field {
  return { fieldPath, isDerived };
}

function application(fields: Field[]) {
  return { missingFields: fields };
}

describe('findState', () => {
  it('matches a full state name', () => {
    expect(findState('California')).toEqual({ name: 'California', code: 'CA' });
  });

  it('matches a two-letter code regardless of case', () => {
    expect(findState('CA')).toEqual({ name: 'California', code: 'CA' });
    expect(findState('nm')).toEqual({ name: 'New Mexico', code: 'NM' });
  });

  it('matches a lowercase name from the OS geocoder', () => {
    expect(findState('new mexico')).toEqual({ name: 'New Mexico', code: 'NM' });
  });

  it('returns null for unknown, empty, or missing input', () => {
    expect(findState('Atlantis')).toBeNull();
    expect(findState('')).toBeNull();
    expect(findState('   ')).toBeNull();
    expect(findState(null)).toBeNull();
    expect(findState(undefined)).toBeNull();
  });

  it('covers all 50 states exactly once', () => {
    expect(US_STATES).toHaveLength(50);
    const codes = US_STATES.map((state) => state.code);
    expect(new Set(codes).size).toBe(50);
    const names = [...US_STATES.map((state) => state.name)].sort();
    expect(names[0]).toBe('Alabama');
    expect(names[names.length - 1]).toBe('Wyoming');
  });
});

describe('unionMissingFields', () => {
  it('returns an empty list when no applications are selected', () => {
    expect(unionMissingFields([])).toEqual([]);
  });

  it('deduplicates questions shared by several applications', () => {
    const snap = application([field('applicant.first_name'), field('applicant.last_name')]);
    const medicaid = application([field('applicant.last_name'), field('contact.phone')]);
    const union = unionMissingFields([snap, medicaid]);
    expect(union.map((item) => item.fieldPath)).toEqual([
      'applicant.first_name',
      'applicant.last_name',
      'contact.phone',
    ]);
  });

  it('excludes derived fields', () => {
    const app = application([
      field('applicant.first_name'),
      field('income.total_monthly', true),
    ]);
    const union = unionMissingFields([app]);
    expect(union.map((item) => item.fieldPath)).toEqual(['applicant.first_name']);
  });

  it('keeps first-seen order so the questionnaire is stable', () => {
    const first = application([field('b.one'), field('a.two')]);
    const second = application([field('c.three')]);
    const union = unionMissingFields([first, second]);
    expect(union.map((item) => item.fieldPath)).toEqual(['b.one', 'a.two', 'c.three']);
  });
});

describe('excludeNeverAskQuestions', () => {
  it('drops SSN-shaped fields while keeping everything else', () => {
    const fields = [
      field('applicant.ssn'),
      field('household.members[0].ssn'),
      field('applicant.social_security_number'),
      field('applicant.first_name'),
    ];
    const kept = excludeNeverAskQuestions(fields);
    expect(kept.map((item) => item.fieldPath)).toEqual(['applicant.first_name']);
  });

  it('is case-insensitive', () => {
    const kept = excludeNeverAskQuestions([field('applicant.SSN')]);
    expect(kept).toEqual([]);
  });
});
