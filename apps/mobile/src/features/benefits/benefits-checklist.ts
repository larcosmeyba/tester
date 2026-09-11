/**
 * Presentation rules for the guided application checklist.
 *
 * The content comes from the server; this module only decides the order the
 * sections are shown in: before → during → after. Pure and UI-free so the
 * ordering rule is testable without rendering.
 */
import type { BenefitsChecklistSection } from '@/features/benefits/benefits-types';

const PHASE_ORDER = ['before', 'during', 'after'];

/**
 * Orders checklist sections before → during → after, keeping the server's
 * order within a phase and pushing unknown phases to the end.
 */
export function orderChecklistSections(
  sections: BenefitsChecklistSection[],
): BenefitsChecklistSection[] {
  const rank = (phase: string) => {
    const index = PHASE_ORDER.indexOf(phase.toLowerCase());
    return index < 0 ? PHASE_ORDER.length : index;
  };
  return [...sections].sort((a, b) => rank(a.phase) - rank(b.phase));
}
