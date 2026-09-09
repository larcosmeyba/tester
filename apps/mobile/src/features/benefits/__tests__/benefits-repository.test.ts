import {
  answerFrom,
  joinDocumentUrl,
  centsToMoney,
  groupQuestions,
  moneyToCents,
  noneAnswer,
  questionsToAsk,
  requiredQuestionsToAsk,
} from '@/features/benefits/benefits-answers';

type Missing = Parameters<typeof questionsToAsk>[0]['missingFields'][number];

function missing(overrides: Partial<Missing>): Missing {
  return {
    fieldPath: 'applicant.last_name',
    label: 'Last name',
    question: 'What is your last name?',
    group: 'applicant',
    answerKind: 'TEXT',
    choices: [],
    strength: 'REQUIRED',
    isSensitive: false,
    isDerived: false,
    formFieldIds: [],
    ...overrides,
  } as Missing;
}

function application(missingFields: Missing[]) {
  return { missingFields } as Parameters<typeof questionsToAsk>[0];
}

describe('what the app asks for', () => {
  // A derived value is computed from other answers, so there is no answer the
  // user could give. Asking would be a question with no valid reply.
  it('never asks for a value the profile works out itself', () => {
    const fields = questionsToAsk(
      application([
        missing({ fieldPath: 'income.monthly_gross_total', isDerived: true }),
        missing({ fieldPath: 'income.sources' }),
      ]),
    );
    expect(fields.map((field) => field.fieldPath)).toEqual(['income.sources']);
  });

  it('separates the questions the form cannot go without', () => {
    const fields = requiredQuestionsToAsk(
      application([
        missing({ fieldPath: 'applicant.last_name', strength: 'REQUIRED' }),
        missing({ fieldPath: 'contact.phone_primary', strength: 'PREFERRED' }),
      ]),
    );
    expect(fields).toHaveLength(1);
    expect(fields[0].fieldPath).toBe('applicant.last_name');
  });

  it('groups questions into the sections a screen shows', () => {
    const sections = groupQuestions([
      missing({ fieldPath: 'applicant.last_name', group: 'applicant' }),
      missing({ fieldPath: 'address.residential.city', group: 'address' }),
      missing({ fieldPath: 'applicant.first_name', group: 'applicant' }),
    ]);
    expect(sections.map((section) => section.group)).toEqual(['applicant', 'address']);
    expect(sections[0].questions).toHaveLength(2);
  });
});

describe('turning what was typed into an answer', () => {
  // The rule the whole system rests on: an empty box is not an answer of
  // nothing, it is the absence of one, and the question comes back.
  it('records an empty box as unanswered rather than as blank', () => {
    expect(answerFrom(missing({}), '')).toEqual({
      fieldPath: 'applicant.last_name',
      status: 'UNKNOWN',
    });
    expect(answerFrom(missing({}), '   ')).toEqual({
      fieldPath: 'applicant.last_name',
      status: 'UNKNOWN',
    });
  });

  it('records "I have none" as a real answer, distinct from a blank', () => {
    expect(noneAnswer('income.sources')).toEqual({
      fieldPath: 'income.sources',
      status: 'NONE',
    });
  });

  it('sends money in cents so nothing drifts by a rounding error', () => {
    const answer = answerFrom(missing({ fieldPath: 'housing.rent_monthly', answerKind: 'MONEY' }), '1,240.50');
    expect(answer).toEqual({
      fieldPath: 'housing.rent_monthly',
      status: 'PROVIDED',
      moneyCents: 124050,
    });
  });

  it('reads a boolean question from a yes or no', () => {
    const yes = answerFrom(missing({ fieldPath: 'utilities.pays_gas', answerKind: 'BOOLEAN' }), 'yes');
    expect(yes).toEqual({ fieldPath: 'utilities.pays_gas', status: 'PROVIDED', bool: true });
    const no = answerFrom(missing({ fieldPath: 'utilities.pays_gas', answerKind: 'BOOLEAN' }), 'no');
    expect(no.bool).toBe(false);
  });

  it('passes a date through in the shape the server expects', () => {
    const answer = answerFrom(missing({ fieldPath: 'applicant.date_of_birth', answerKind: 'DATE' }), '1988-03-07');
    expect(answer).toEqual({
      fieldPath: 'applicant.date_of_birth',
      status: 'PROVIDED',
      date: '1988-03-07',
    });
  });

  it('does not turn unreadable money into a number', () => {
    const answer = answerFrom(missing({ fieldPath: 'housing.rent_monthly', answerKind: 'MONEY' }), 'about a grand');
    expect(answer.status).toBe('UNKNOWN');
    expect(answer.moneyCents).toBeUndefined();
  });
});

describe('money', () => {
  it('round-trips through cents', () => {
    expect(moneyToCents('1240.50')).toBe(124050);
    expect(moneyToCents('$1,240')).toBe(124000);
    expect(moneyToCents('0.05')).toBe(5);
    expect(centsToMoney(124050)).toBe('1240.50');
    expect(centsToMoney(5)).toBe('0.05');
  });

  it('refuses nonsense rather than guessing a figure', () => {
    expect(moneyToCents('')).toBeNull();
    expect(moneyToCents('1.2.3')).toBeNull();
  });
});

describe('document links', () => {
  // The path is relative because there is no public link to somebody's benefits
  // application; it is fetched from this API with the viewer's own token.
  it('builds the document URL from the API base', () => {
    expect(
      joinDocumentUrl('https://api.example.com/graphql', '/benefits/applications/abc/pdf?kind=draft'),
    ).toBe('https://api.example.com/benefits/applications/abc/pdf?kind=draft');
    expect(joinDocumentUrl('http://localhost:8080/', '/benefits/x/pdf')).toBe(
      'http://localhost:8080/benefits/x/pdf',
    );
  });
});
