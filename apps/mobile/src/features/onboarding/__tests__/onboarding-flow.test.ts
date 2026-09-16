import type { QuestionnaireAnswers } from '@helpthehive/api-contract';

import {
  HOUSEHOLD_SIZE_OPTIONS,
  INCOME_BRACKET_OPTIONS,
  ONBOARDING_STEP_KEYS,
  PRIMARY_GOAL_APPLY_BENEFITS,
  PRIMARY_GOAL_BUDGET_MEALS,
  QUESTIONNAIRE_STEP_COUNT,
  STEP_ALL_SET,
  STEP_COUNT,
  STEP_FINANCE_TOPICS,
  STEP_HOUSEHOLD_SIZE,
  STEP_INCOME,
  STEP_INTENT,
  STEP_LOCATION,
  STEP_PROFILE_PHOTO,
  STEP_PUSH_PERMISSION,
  STEP_RESOURCES,
  resumeIndexForStepKey,
} from '../onboarding-model';

function answersWith(partial: Partial<QuestionnaireAnswers>): QuestionnaireAnswers {
  return {
    __typename: 'QuestionnaireAnswers',
    financeTopics: [],
    resources: [],
    updatedAt: '2026-09-15T00:00:00Z',
    ...partial,
  } as QuestionnaireAnswers;
}

describe('onboarding step order', () => {
  it('runs 6 questionnaire steps, then all-set, push, and location', () => {
    expect([...ONBOARDING_STEP_KEYS]).toEqual([
      'questionnaire:1',
      'questionnaire:2',
      'questionnaire:3',
      'questionnaire:4',
      'questionnaire:5',
      'questionnaire:6',
      'all-set',
      'permissions:push',
      'permissions:location',
    ]);
  });

  it('has 6 questionnaire steps and 9 screens total', () => {
    expect(QUESTIONNAIRE_STEP_COUNT).toBe(6);
    expect(STEP_COUNT).toBe(9);
    expect(STEP_RESOURCES).toBe(0);
    expect(STEP_HOUSEHOLD_SIZE).toBe(1);
    expect(STEP_INTENT).toBe(2);
    expect(STEP_INCOME).toBe(3);
    expect(STEP_FINANCE_TOPICS).toBe(4);
    expect(STEP_PROFILE_PHOTO).toBe(5);
    expect(STEP_ALL_SET).toBe(6);
    expect(STEP_PUSH_PERMISSION).toBe(7);
    expect(STEP_LOCATION).toBe(8);
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
  it('resumes post-questionnaire markers at the next screen', () => {
    expect(resumeIndexForStepKey('all-set')).toBe(STEP_PUSH_PERMISSION);
    expect(resumeIndexForStepKey('permissions:push')).toBe(STEP_LOCATION);
    expect(resumeIndexForStepKey('permissions:location')).toBe(STEP_COUNT);
  });

  it('infers the questionnaire position from saved answers', () => {
    expect(resumeIndexForStepKey('questionnaire:1', null)).toBe(STEP_RESOURCES);
    expect(resumeIndexForStepKey('questionnaire:3', answersWith({ resources: ['Food Assistance'] }))).toBe(
      STEP_HOUSEHOLD_SIZE,
    );
    expect(
      resumeIndexForStepKey('questionnaire:2', answersWith({ resources: ['Food Assistance'], householdSize: '3' })),
    ).toBe(STEP_INTENT);
    expect(
      resumeIndexForStepKey(
        'questionnaire:4',
        answersWith({ resources: ['Food Assistance'], householdSize: '3', primaryGoal: 'APPLY_BENEFITS' }),
      ),
    ).toBe(STEP_INCOME);
    expect(
      resumeIndexForStepKey(
        'questionnaire:5',
        answersWith({
          resources: ['Food Assistance'],
          householdSize: '3',
          primaryGoal: 'APPLY_BENEFITS',
          incomeBracket: '$1,500–$2,499',
        }),
      ),
    ).toBe(STEP_FINANCE_TOPICS);
    expect(
      resumeIndexForStepKey(
        'questionnaire:6',
        answersWith({
          resources: ['Food Assistance'],
          householdSize: '3',
          primaryGoal: 'APPLY_BENEFITS',
          incomeBracket: '$1,500–$2,499',
          financeTopics: ['Budgeting Basics'],
        }),
      ),
    ).toBe(STEP_PROFILE_PHOTO);
  });

  it('remaps legacy step keys from the old 12-step flow via answers', () => {
    // Old flow order differs; the answers are the source of truth.
    expect(resumeIndexForStepKey('questionnaire:7', answersWith({ resources: ['Food Assistance'] }))).toBe(
      STEP_HOUSEHOLD_SIZE,
    );
    expect(resumeIndexForStepKey('consent:email', answersWith({ resources: ['Food Assistance'] }))).toBe(
      STEP_HOUSEHOLD_SIZE,
    );
    expect(resumeIndexForStepKey('push', null)).toBe(STEP_RESOURCES);
  });

  it('restarts at the first questionnaire step for unknown or missing keys', () => {
    expect(resumeIndexForStepKey(null)).toBe(STEP_RESOURCES);
    expect(resumeIndexForStepKey(undefined)).toBe(STEP_RESOURCES);
    expect(resumeIndexForStepKey('')).toBe(STEP_RESOURCES);
    expect(resumeIndexForStepKey('not-a-step')).toBe(STEP_RESOURCES);
  });
});
