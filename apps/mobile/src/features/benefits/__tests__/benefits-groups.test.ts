import {
  draftsFromProfileRows,
  emptyRowDraft,
  groupPathOf,
  groupRowInputs,
  householdMemberNames,
  isEmptyDraft,
  isMemberRefField,
  isNeverAskPath,
  owningGroupPath,
  partitionGroupQuestions,
  rowLabelFor,
  rowSpecsFor,
  templatePath,
} from '@/features/benefits/benefits-groups';
import type {
  BenefitsFieldSpec,
  BenefitsMissingField,
} from '@/features/benefits/benefits-types';

function spec(fieldPath: string, overrides: Partial<BenefitsFieldSpec> = {}): BenefitsFieldSpec {
  return {
    fieldPath,
    kind: 'TEXT',
    group: 'household',
    label: fieldPath,
    question: `What is ${fieldPath}?`,
    choices: [],
    isSensitive: false,
    isDerived: false,
    isRepeating: fieldPath.includes('[]'),
    ...overrides,
  } as BenefitsFieldSpec;
}

const SPECS: BenefitsFieldSpec[] = [
  spec('household.size', { kind: 'NUMBER', isRepeating: false }),
  spec('household.members', { kind: 'LIST', isRepeating: false }),
  spec('household.members[].first_name'),
  spec('household.members[].last_name'),
  spec('household.members[].date_of_birth', { kind: 'DATE' }),
  spec('household.members[].relationship', { kind: 'CHOICE', choices: ['child', 'spouse'] }),
  spec('household.members[].ssn', { isSensitive: true }),
  spec('income.sources', { kind: 'LIST', group: 'income', isRepeating: false }),
  spec('income.sources[].payer', { group: 'income' }),
  spec('income.sources[].gross_amount', { kind: 'MONEY', group: 'income' }),
];

function missing(
  fieldPath: string,
  overrides: Partial<BenefitsMissingField> = {},
): BenefitsMissingField {
  return {
    fieldPath,
    label: fieldPath,
    question: `Q: ${fieldPath}`,
    group: 'household',
    answerKind: 'TEXT',
    choices: [],
    strength: 'REQUIRED',
    isSensitive: false,
    isDerived: false,
    formFieldIds: [],
    ...overrides,
  } as BenefitsMissingField;
}

describe('templatePath', () => {
  it('strips row indices back to the vocabulary template', () => {
    expect(templatePath('household.members[0].first_name')).toBe('household.members[].first_name');
    expect(templatePath('household.members[].first_name')).toBe('household.members[].first_name');
    expect(templatePath('applicant.first_name')).toBe('applicant.first_name');
  });
});

describe('groupPathOf', () => {
  it('finds the owning group for template and indexed paths', () => {
    expect(groupPathOf('household.members[].first_name')).toBe('household.members');
    expect(groupPathOf('household.members[2].last_name')).toBe('household.members');
  });

  it('returns null for scalar paths and for the bare group path', () => {
    expect(groupPathOf('applicant.first_name')).toBeNull();
    expect(groupPathOf('household.size')).toBeNull();
    expect(groupPathOf('household.members')).toBeNull();
  });
});

describe('owningGroupPath', () => {
  it('resolves the bare group path as well as its row paths', () => {
    expect(owningGroupPath('household.members', SPECS)).toBe('household.members');
    expect(owningGroupPath('household.members[].first_name', SPECS)).toBe('household.members');
    expect(owningGroupPath('household.members[2].last_name', SPECS)).toBe('household.members');
  });

  it('returns null for scalar paths', () => {
    expect(owningGroupPath('applicant.first_name', SPECS)).toBeNull();
    expect(owningGroupPath('household.size', SPECS)).toBeNull();
  });
});

describe('isNeverAskPath', () => {
  it('catches SSN-shaped paths', () => {
    expect(isNeverAskPath('applicant.ssn')).toBe(true);
    expect(isNeverAskPath('household.members[].ssn')).toBe(true);
    expect(isNeverAskPath('household.members[0].SSN')).toBe(true);
  });

  it('leaves ordinary paths alone', () => {
    expect(isNeverAskPath('applicant.first_name')).toBe(false);
    expect(isNeverAskPath('income.sources[].payer')).toBe(false);
  });
});

describe('rowSpecsFor', () => {
  it('returns the askable row fields for a group', () => {
    const rows = rowSpecsFor('household.members', SPECS).map((s) => s.fieldPath);
    expect(rows).toEqual([
      'household.members[].first_name',
      'household.members[].last_name',
      'household.members[].date_of_birth',
      'household.members[].relationship',
    ]);
  });

  it('never includes the SSN, even though the vocabulary has it', () => {
    const rows = rowSpecsFor('household.members', SPECS).map((s) => s.fieldPath);
    expect(rows).not.toContain('household.members[].ssn');
  });

  it('returns an empty list for a scalar path', () => {
    expect(rowSpecsFor('applicant.first_name', SPECS)).toEqual([]);
  });
});

describe('partitionGroupQuestions', () => {
  it('keeps scalar questions scalar', () => {
    const { scalars, groups } = partitionGroupQuestions(
      [missing('applicant.first_name'), missing('household.size')],
      SPECS,
    );
    expect(scalars.map((f) => f.fieldPath)).toEqual(['applicant.first_name', 'household.size']);
    expect(groups).toEqual([]);
  });

  it('buckets a group question with its indexed row gaps', () => {
    const { scalars, groups } = partitionGroupQuestions(
      [
        missing('household.members'),
        missing('household.members[0].date_of_birth', { group: 'household' }),
        missing('household.members[1].date_of_birth', { group: 'household' }),
        missing('income.sources', { group: 'income' }),
      ],
      SPECS,
    );
    expect(scalars).toEqual([]);
    expect(groups).toHaveLength(2);

    const members = groups.find((g) => g.groupPath === 'household.members')!;
    expect(members.groupQuestion?.fieldPath).toBe('household.members');
    expect(members.required).toBe(true);
    expect(members.sectionGroup).toBe('household');
    expect([...members.missingRowPaths]).toEqual(['household.members[].date_of_birth']);

    const income = groups.find((g) => g.groupPath === 'income.sources')!;
    expect(income.groupQuestion?.fieldPath).toBe('income.sources');
    expect(income.missingRowPaths.size).toBe(0);
  });

  it('drops NeverAsk paths instead of bucketing them', () => {
    const { scalars, groups } = partitionGroupQuestions(
      [missing('household.members'), missing('household.members[0].ssn')],
      SPECS,
    );
    expect(scalars).toEqual([]);
    expect(groups).toHaveLength(1);
    expect([...groups[0].missingRowPaths]).toEqual([]);
  });

  it('marks a preferred-strength group as not required', () => {
    const { groups } = partitionGroupQuestions(
      [missing('income.sources', { group: 'income', strength: 'PREFERRED' })],
      SPECS,
    );
    expect(groups[0].required).toBe(false);
  });
});

describe('row drafts', () => {
  it('builds editable drafts from stored profile rows', () => {
    const rows = draftsFromProfileRows([
      {
        rowId: 'row-1',
        answers: [
          { fieldPath: 'household.members[].first_name', kind: 'TEXT', status: 'PROVIDED', text: 'Sam' },
          { fieldPath: 'household.members[].date_of_birth', kind: 'DATE', status: 'PROVIDED', date: '2018-04-02' },
          { fieldPath: 'household.members[].is_us_citizen', kind: 'BOOLEAN', status: 'PROVIDED', bool: true },
          { fieldPath: 'household.members[].last_name', kind: 'TEXT', status: 'UNKNOWN', text: null },
        ],
      },
    ] as never);
    expect(rows).toEqual([
      {
        rowId: 'row-1',
        values: {
          'household.members[].first_name': 'Sam',
          'household.members[].date_of_birth': '2018-04-02',
          'household.members[].is_us_citizen': 'yes',
        },
      },
    ]);
  });

  it('detects empty drafts', () => {
    expect(isEmptyDraft(emptyRowDraft())).toBe(true);
    expect(isEmptyDraft({ rowId: '', values: { a: '  ' } })).toBe(true);
    expect(isEmptyDraft({ rowId: '', values: { a: 'x' } })).toBe(false);
  });

  it('builds mutation inputs, skipping blanks and empty rows', () => {
    const inputs = groupRowInputs(
      [
        { rowId: 'row-1', values: { 'household.members[].first_name': 'Sam', 'household.members[].last_name': '' } },
        emptyRowDraft(),
      ],
      SPECS,
    );
    expect(inputs).toHaveLength(1);
    expect(inputs[0].rowId).toBe('row-1');
    expect(inputs[0].answers).toEqual([
      { fieldPath: 'household.members[].first_name', status: 'PROVIDED', text: 'Sam' },
    ]);
  });

  it('omits rowId for brand-new rows so the server assigns one', () => {
    const inputs = groupRowInputs(
      [{ rowId: '', values: { 'income.sources[].payer': 'Acme', 'income.sources[].gross_amount': '1,240.50' } }],
      SPECS,
    );
    expect(inputs[0].rowId).toBeUndefined();
    expect(inputs[0].answers).toEqual([
      { fieldPath: 'income.sources[].payer', status: 'PROVIDED', text: 'Acme' },
      { fieldPath: 'income.sources[].gross_amount', status: 'PROVIDED', moneyCents: 124050 },
    ]);
  });

  it('encodes booleans and dates the way answerFrom does', () => {
    const inputs = groupRowInputs(
      [
        {
          rowId: '',
          values: {
            'household.members[].date_of_birth': '2018-04-02',
            'household.members[].relationship': 'child',
          },
        },
      ],
      SPECS,
    );
    expect(inputs[0].answers).toEqual([
      { fieldPath: 'household.members[].date_of_birth', status: 'PROVIDED', date: '2018-04-02' },
      { fieldPath: 'household.members[].relationship', status: 'PROVIDED', text: 'child' },
    ]);
  });
});

describe('householdMemberNames', () => {
  it('joins first and last names for member_ref pickers', () => {
    const profile = {
      groups: [
        {
          groupPath: 'household.members',
          collected: true,
          rows: [
            {
              rowId: 'r1',
              answers: [
                { fieldPath: 'household.members[].first_name', text: 'Sam' },
                { fieldPath: 'household.members[].last_name', text: 'Rivera' },
              ],
            },
            { rowId: 'r2', answers: [{ fieldPath: 'household.members[].first_name', text: 'Alex' }] },
            { rowId: 'r3', answers: [] },
          ],
        },
      ],
    } as never;
    expect(householdMemberNames(profile)).toEqual(['Sam Rivera', 'Alex']);
  });

  it('returns an empty list without a profile', () => {
    expect(householdMemberNames(null)).toEqual([]);
  });
});

describe('labels', () => {
  it('names rows per group', () => {
    expect(rowLabelFor('household.members', 0)).toBe('Person 1');
    expect(rowLabelFor('income.sources', 2)).toBe('Income source 3');
    expect(rowLabelFor('resources.vehicles', 0)).toBe('Vehicle 1');
  });

  it('detects member_ref fields', () => {
    expect(isMemberRefField('income.sources[].member_ref')).toBe(true);
    expect(isMemberRefField('income.sources[].payer')).toBe(false);
  });
});
