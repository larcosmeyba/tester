import type { BenefitsApplication } from '@/features/benefits/benefits-repository';
import {
  countRequiredMissing,
  productStatusFor,
  statusToneFor,
} from '@/features/benefits/benefits-status';

function application(overrides: Partial<BenefitsApplication>): BenefitsApplication {
  return {
    id: 'app-1',
    status: 'NEEDS_INFORMATION',
    failureReason: null,
    draftDocumentPath: null,
    finalDocumentPath: null,
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    approvedAt: null,
    form: {
      id: 'form-1',
      program: 'SNAP',
      state: 'MO',
      formCode: 'SNAP-MO',
      formTitle: 'SNAP Application',
    },
    filledFields: [],
    missingFields: [],
    problems: [],
    skippedFields: [],
    ...overrides,
  } as BenefitsApplication;
}

function missingField(fieldPath: string, strength: 'REQUIRED' | 'PREFERRED') {
  return {
    fieldPath,
    label: fieldPath,
    question: `${fieldPath}?`,
    group: 'applicant',
    answerKind: 'TEXT' as const,
    choices: [],
    strength,
    isSensitive: false,
    isDerived: false,
    formFieldIds: [],
  };
}

describe('productStatusFor', () => {
  it('maps DRAFT to Draft', () => {
    expect(productStatusFor(application({ status: 'DRAFT' }))).toBe('Draft');
  });

  it('maps NEEDS_INFORMATION without a PDF to Preparing', () => {
    expect(productStatusFor(application({ status: 'NEEDS_INFORMATION' }))).toBe('Preparing');
  });

  it('maps NEEDS_INFORMATION with a draft PDF and nothing required missing to Ready to Submit', () => {
    const app = application({ status: 'NEEDS_INFORMATION', draftDocumentPath: 'drafts/a.pdf' });
    expect(productStatusFor(app)).toBe('Ready to Submit');
  });

  it('keeps NEEDS_INFORMATION with a draft PDF but required missing fields in Preparing', () => {
    const app = application({
      status: 'NEEDS_INFORMATION',
      draftDocumentPath: 'drafts/a.pdf',
      missingFields: [missingField('applicant.name', 'REQUIRED')],
    });
    expect(productStatusFor(app)).toBe('Preparing');
  });

  it('maps COMPLETED to Ready to Submit, not Submitted', () => {
    expect(productStatusFor(application({ status: 'COMPLETED' }))).toBe('Ready to Submit');
  });

  it('maps the session-only submitted flag to Submitted', () => {
    expect(productStatusFor(application({ status: 'COMPLETED' }), true)).toBe('Submitted');
  });
});

describe('statusToneFor', () => {
  it('uses green for Ready to Submit and Submitted', () => {
    expect(statusToneFor('Ready to Submit')).toBe('green');
    expect(statusToneFor('Submitted')).toBe('green');
  });

  it('uses warning for Preparing and Renewal Coming Up', () => {
    expect(statusToneFor('Preparing')).toBe('warning');
    expect(statusToneFor('Renewal Coming Up')).toBe('warning');
  });

  it('uses neutral for Draft', () => {
    expect(statusToneFor('Draft')).toBe('neutral');
  });
});

describe('countRequiredMissing', () => {
  it('counts required missing fields across applications', () => {
    const apps = [
      application({
        missingFields: [missingField('a', 'REQUIRED'), missingField('b', 'PREFERRED')],
      }),
      application({
        missingFields: [missingField('c', 'REQUIRED')],
      }),
    ];
    expect(countRequiredMissing(apps)).toBe(2);
  });
});
