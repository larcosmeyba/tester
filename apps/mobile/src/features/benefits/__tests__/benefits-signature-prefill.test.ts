import { isSignatureComplete } from '@/features/benefits/benefits-signature';
import { prefillAnswersFromProfile } from '@/features/benefits/benefits-answers';
import type { BenefitsValueKind } from '@helpthehive/api-contract';

describe('signature gating', () => {
  // The approve button stays disabled until the applicant types their name
  // AND checks the attestation. A blank-or-whitespace name is not a name.
  it('needs both a typed name and the attestation', () => {
    expect(isSignatureComplete('', false)).toBe(false);
    expect(isSignatureComplete('', true)).toBe(false);
    expect(isSignatureComplete('   ', true)).toBe(false);
    expect(isSignatureComplete('Jane Doe', false)).toBe(false);
    expect(isSignatureComplete('Jane Doe', true)).toBe(true);
  });

  it('trims the name before deciding', () => {
    expect(isSignatureComplete('  Jane Doe  ', true)).toBe(true);
  });
});

describe('questionnaire prefill from the local profile', () => {
  const profile = {
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '555-0100',
    zip: '90210',
    householdSize: 3,
  };

  function field(fieldPath: string, answerKind: BenefitsValueKind = 'TEXT') {
    return { fieldPath, answerKind };
  }

  it('seeds the questions the server says are missing', () => {
    const seeded = prefillAnswersFromProfile(
      [
        field('applicant.first_name'),
        field('applicant.last_name'),
        field('contact.phone_primary'),
        field('address.residential.postal_code'),
        field('household.size', 'NUMBER'),
      ],
      profile,
      {},
    );
    expect(seeded).toEqual({
      'applicant.first_name': 'Jane',
      'applicant.last_name': 'Doe',
      'contact.phone_primary': '555-0100',
      'address.residential.postal_code': '90210',
      'household.size': '3',
    });
  });

  it('only pre-fills from data the user already provided', () => {
    const seeded = prefillAnswersFromProfile(
      [field('applicant.first_name'), field('contact.phone_primary')],
      { ...profile, firstName: '', phone: '   ' },
      {},
    );
    expect(seeded).toEqual({});
  });

  it('never reaches for a question it does not understand', () => {
    const seeded = prefillAnswersFromProfile(
      [field('income.monthly_gross_total', 'MONEY'), field('applicant.ssn')],
      profile,
      {},
    );
    expect(seeded).toEqual({});
  });

  it('never overwrites what the user already typed', () => {
    const seeded = prefillAnswersFromProfile([field('applicant.first_name')], profile, {
      'applicant.first_name': 'Janet',
    });
    expect(seeded).toEqual({});
  });

  it('ignores an empty household size rather than seeding zero', () => {
    const seeded = prefillAnswersFromProfile([field('household.size', 'NUMBER')], {
      ...profile,
      householdSize: 0,
    }, {});
    expect(seeded).toEqual({});
  });
});
