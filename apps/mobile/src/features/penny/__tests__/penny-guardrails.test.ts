import {
  classifyPennyScope,
  containsSsn,
  isApplicationSafetyMessage,
  PENNY_SCOPE_REDIRECT,
  SSN_WARNING,
} from '@/features/penny/penny-guardrails';

describe('containsSsn', () => {
  it('detects a dashed SSN', () => {
    expect(containsSsn('my number is 123-45-6789 ok?')).toBe(true);
  });

  it('does not flag phone numbers or ordinary digits', () => {
    expect(containsSsn('call me at 555-123-4567')).toBe(false);
    expect(containsSsn('I have 3 kids and a $1200 budget')).toBe(false);
    expect(containsSsn('')).toBe(false);
  });

  it('does not flag a bare 9-digit run (too ambiguous to block)', () => {
    expect(containsSsn('order 123456789 shipped')).toBe(false);
  });
});

describe('SSN warning copy', () => {
  it('tells the user Penny never needs it and it is never stored', () => {
    expect(SSN_WARNING).toMatch(/never needs it/);
    expect(SSN_WARNING).toMatch(/never asks for or stores/);
  });
});

describe('classifyPennyScope', () => {
  it.each([
    'How do I apply for SNAP?',
    'What can I cook with chicken and rice?',
    'Add milk to my pantry',
    'Where is the nearest food bank?',
    'My groceries cost too much this week',
    'How do I change my notification settings?',
    'When does my spinach expire?',
    'What documents do I need for WIC?',
  ])('treats "%s" as in-scope', (text) => {
    expect(classifyPennyScope(text)).toBe('in-scope');
  });

  it.each([
    'Can you do my algebra homework?',
    'Write a python function to sort a list',
    'Debug my javascript code please',
    'Who won the Super Bowl?',
  ])('treats "%s" as out-of-scope', (text) => {
    expect(classifyPennyScope(text)).toBe('out-of-scope');
  });

  it('keeps in-scope keywords winning over out-of-scope patterns', () => {
    expect(classifyPennyScope('Help me write a meal plan, not code')).toBe('in-scope');
  });

  it('defaults ambiguous input to in-scope (backend is the authority)', () => {
    expect(classifyPennyScope('Hello there')).toBe('in-scope');
    expect(classifyPennyScope('What do you think about the weather?')).toBe('in-scope');
  });

  it('redirect copy is graceful, not a lecture', () => {
    expect(PENNY_SCOPE_REDIRECT).toMatch(/benefits, meals, your pantry, groceries/);
    expect(PENNY_SCOPE_REDIRECT).not.toMatch(/cannot|not allowed|prohibited/i);
  });
});

describe('isApplicationSafetyMessage', () => {
  it('exempts anything arriving from a benefits screen', () => {
    expect(
      isApplicationSafetyMessage('What documents do I need?', {
        source: 'benefits-ready',
        applicationIds: ['a1'],
      }),
    ).toBe(true);
    expect(
      isApplicationSafetyMessage('What documents do I need?', {
        source: 'benefits-questionnaire',
      }),
    ).toBe(true);
  });

  it('does not exempt non-benefits context', () => {
    expect(isApplicationSafetyMessage('What documents do I need?', { source: 'meal-plan' })).toBe(false);
    expect(isApplicationSafetyMessage('What documents do I need?', null)).toBe(false);
  });

  it('exempts application-completion help by message text alone', () => {
    expect(isApplicationSafetyMessage('I am stuck submitting my SNAP application', null)).toBe(true);
    expect(isApplicationSafetyMessage('Help me finish my benefits application', undefined)).toBe(true);
  });

  it('does not exempt ordinary questions', () => {
    expect(isApplicationSafetyMessage('What should I cook tonight?', null)).toBe(false);
  });
});
