/**
 * Pure display helpers for the Resources applications list (Audit Section 8).
 * Kept in their own module so they stay unit-testable without the
 * react-native component tree.
 */
import { programCatalog } from '@/features/benefits/benefits-program-catalog';

/** Catalog display name for a program id, falling back to the raw id. */
export function programDisplayName(programId: string): string {
  const entry = programCatalog.find(
    (candidate) => candidate.id.toLowerCase() === programId.toLowerCase(),
  );
  return entry?.name ?? programId;
}

/** Short human date for the "Submitted — [date]" card label. */
export function submittedDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
