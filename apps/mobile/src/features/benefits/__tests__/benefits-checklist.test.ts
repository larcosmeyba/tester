import { orderChecklistSections } from '@/features/benefits/benefits-checklist';
import type { BenefitsChecklistSection } from '@/features/benefits/benefits-types';

function section(phase: string, title: string): BenefitsChecklistSection {
  return {
    phase,
    title,
    items: [{ label: `${title} item`, detail: null, confirmOnPortal: false }],
  } as BenefitsChecklistSection;
}

describe('checklist section ordering', () => {
  it('renders before, during, then after', () => {
    const ordered = orderChecklistSections([
      section('after', 'After'),
      section('during', 'During'),
      section('before', 'Before'),
    ]);
    expect(ordered.map((s) => s.phase)).toEqual(['before', 'during', 'after']);
  });

  it('keeps the server order within a phase', () => {
    const first = section('before', 'First');
    const second = section('before', 'Second');
    const ordered = orderChecklistSections([second, first]);
    expect(ordered.map((s) => s.title)).toEqual(['Second', 'First']);
  });

  it('pushes unknown phases to the end instead of dropping them', () => {
    const ordered = orderChecklistSections([
      section('mystery', 'Mystery'),
      section('before', 'Before'),
    ]);
    expect(ordered.map((s) => s.phase)).toEqual(['before', 'mystery']);
  });

  it('does not mutate the input', () => {
    const input = [section('after', 'After'), section('before', 'Before')];
    orderChecklistSections(input);
    expect(input.map((s) => s.phase)).toEqual(['after', 'before']);
  });
});
