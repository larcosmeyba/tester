/**
 * The product status vocabulary for benefit applications (audit Section 3b).
 *
 * The backend only knows four states — DRAFT, NEEDS_INFORMATION, FAILED,
 * COMPLETED — so the product labels are derived, never invented:
 *
 * - Draft: the application was created but not yet filled.
 * - Preparing: Penny is still filling it in, or information is still missing.
 * - Ready to Submit: a PDF exists and nothing required is missing (draft), or
 *   the applicant approved the final flattened PDF (COMPLETED). The user still
 *   submits it to the agency themselves.
 * - Submitted: the user told the app they submitted it. This is session-only:
 *   there is no backend mutation that persists submission status yet, so it is
 *   never presented as server truth. See the TODO in the submission sheet.
 * - Renewal Coming Up: derived from renewal data, not application status.
 */
import { requiredQuestionsToAsk } from './benefits-answers';
import type { BenefitsApplication } from './benefits-repository';

export type BenefitsProductStatus =
  | 'Draft'
  | 'Preparing'
  | 'Ready to Submit'
  | 'Submitted'
  | 'Renewal Coming Up';

export type BenefitsStatusTone = 'neutral' | 'warning' | 'green';

/**
 * Derive the product status for one application. `submittedLocally` is the
 * session-only flag set when the user answers "Yes, I submitted" — it is not
 * persisted anywhere until the backend grows a submission mutation.
 */
export function productStatusFor(
  application: BenefitsApplication,
  submittedLocally = false,
): BenefitsProductStatus {
  if (submittedLocally) return 'Submitted';
  switch (application.status) {
    case 'COMPLETED':
      // Approved and flattened. The user still files it with the agency
      // themselves; "Submitted" is only ever the user's own session answer.
      return 'Ready to Submit';
    case 'DRAFT':
      return 'Draft';
    case 'FAILED':
    case 'NEEDS_INFORMATION':
    default: {
      const hasDocument =
        application.draftDocumentPath != null || application.finalDocumentPath != null;
      const requiredMissing = requiredQuestionsToAsk(application).length > 0;
      if (hasDocument && !requiredMissing) return 'Ready to Submit';
      return 'Preparing';
    }
  }
}

export function statusToneFor(status: BenefitsProductStatus): BenefitsStatusTone {
  switch (status) {
    case 'Ready to Submit':
    case 'Submitted':
      return 'green';
    case 'Renewal Coming Up':
      return 'warning';
    case 'Preparing':
      return 'warning';
    case 'Draft':
    default:
      return 'neutral';
  }
}

/**
 * Count the required questions still missing across a set of applications.
 * Used for the Page 5 missing-information checklist.
 */
export function countRequiredMissing(applications: BenefitsApplication[]): number {
  return applications.reduce(
    (total, application) => total + requiredQuestionsToAsk(application).length,
    0,
  );
}
