import {
  daysRemainingLabel,
  formatRenewalDate,
  renewalNeedsAttention,
  renewalSourceLabel,
  renewalStatusLabel,
  renewalUrgency,
  ruleDerivedDeadline,
  ruleForProgram,
  typicalPeriodLabel,
} from '@/features/benefits/benefits-renewals';
import type { BenefitsProgramRule, BenefitsRenewal } from '@/graphql/benefits-operations';

function renewal(overrides: Partial<BenefitsRenewal>): BenefitsRenewal {
  return {
    id: 'r1',
    program: 'SNAP',
    state: 'MO',
    formId: 'f1',
    certificationEndsAt: null,
    renewalDueAt: '2027-09-09T00:00:00Z',
    source: 'rule-derived',
    status: 'scheduled',
    reminderStage: 0,
    daysRemaining: 20,
    ...overrides,
  };
}

describe('renewal urgency buckets', () => {
  it('colors the days-remaining chip: calm, soon, urgent, overdue', () => {
    expect(renewalUrgency(45)).toBe('calm');
    expect(renewalUrgency(31)).toBe('calm');
    expect(renewalUrgency(30)).toBe('soon');
    expect(renewalUrgency(7)).toBe('soon');
    expect(renewalUrgency(6)).toBe('urgent');
    expect(renewalUrgency(0)).toBe('urgent');
    expect(renewalUrgency(-1)).toBe('overdue');
    expect(renewalUrgency(-30)).toBe('overdue');
  });

  it('labels the chip without any eligibility language', () => {
    expect(daysRemainingLabel(-3)).toBe('Overdue');
    expect(daysRemainingLabel(0)).toBe('Due today');
    expect(daysRemainingLabel(1)).toBe('1 day left');
    expect(daysRemainingLabel(20)).toBe('20 days left');
    for (const label of [daysRemainingLabel(-1), daysRemainingLabel(0), daysRemainingLabel(5)]) {
      expect(label.toLowerCase()).not.toMatch(/qualif|lose|eligib/);
    }
  });
});

describe('renewal attention', () => {
  it('flags renewals due within 30 days that are still actionable', () => {
    expect(renewalNeedsAttention(renewal({ daysRemaining: 30, status: 'scheduled' }))).toBe(true);
    expect(renewalNeedsAttention(renewal({ daysRemaining: 0, status: 'reminded' }))).toBe(true);
    expect(renewalNeedsAttention(renewal({ daysRemaining: -5, status: 'scheduled' }))).toBe(true);
    expect(renewalNeedsAttention(renewal({ daysRemaining: 31, status: 'scheduled' }))).toBe(false);
    expect(renewalNeedsAttention(renewal({ daysRemaining: 5, status: 'done' }))).toBe(false);
    expect(renewalNeedsAttention(renewal({ daysRemaining: 5, status: 'dismissed' }))).toBe(false);
    expect(renewalNeedsAttention(renewal({ daysRemaining: 5, status: 'started' }))).toBe(false);
  });
});

describe('renewal source copy', () => {
  it('labels a rule-derived deadline as the typical period to confirm', () => {
    expect(renewalSourceLabel(renewal({ source: 'rule-derived' }), 12)).toBe(
      'Typical for SNAP is 12 months — confirm yours.',
    );
    expect(typicalPeriodLabel('SNAP', 1)).toBe('Typical for SNAP is 1 month — confirm yours.');
  });

  it('states a user-confirmed deadline as their own', () => {
    expect(renewalSourceLabel(renewal({ source: 'user-confirmed' }), 12)).toBe(
      'This deadline was confirmed by you.',
    );
  });

  it('falls back gracefully without rule data', () => {
    expect(renewalSourceLabel(renewal({ source: 'rule-derived' }), null)).toBe(
      'Based on the typical certification period — confirm yours.',
    );
  });

  it('keeps statuses readable', () => {
    expect(renewalStatusLabel('scheduled')).toBe('Scheduled');
    expect(renewalStatusLabel('reminded')).toBe('Reminder sent');
    expect(renewalStatusLabel('started')).toBe('Renewal started');
    expect(renewalStatusLabel('done')).toBe('Done');
    expect(renewalStatusLabel('dismissed')).toBe('Dismissed');
  });
});

describe('rule-derived defaults', () => {
  const rules: BenefitsProgramRule[] = [
    { program: 'SNAP', state: '*', certPeriodMonths: 12, sourceCitation: 'https://example.gov', notes: null },
    { program: 'SNAP', state: 'MO', certPeriodMonths: 6, sourceCitation: 'https://example.gov', notes: null },
  ];

  it('prefers the state-specific rule', () => {
    expect(ruleForProgram(rules, 'SNAP', 'MO')).toEqual({
      program: 'SNAP',
      state: 'MO',
      certPeriodMonths: 6,
      sourceCitation: 'https://example.gov',
      notes: null,
    });
  });

  it('falls back to the national default and then null', () => {
    expect(ruleForProgram(rules, 'SNAP', 'CA')?.certPeriodMonths).toBe(12);
    expect(ruleForProgram(rules, 'SNAP')?.state).toBe('*');
    expect(ruleForProgram(rules, 'Medicaid', 'MO')).toBeNull();
  });

  it('adds the certification period to the approval date', () => {
    const deadline = ruleDerivedDeadline(new Date('2026-09-09T00:00:00Z'), 12);
    expect(deadline.getUTCFullYear()).toBe(2027);
    expect(deadline.getUTCMonth()).toBe(8);
    expect(deadline.getUTCDate()).toBe(9);
  });
});

describe('date formatting', () => {
  it('formats ISO timestamps for display', () => {
    expect(formatRenewalDate('2027-03-12T00:00:00Z')).toContain('2027');
  });

  it('passes through unparseable input instead of crashing', () => {
    expect(formatRenewalDate('not-a-date')).toBe('not-a-date');
  });
});
