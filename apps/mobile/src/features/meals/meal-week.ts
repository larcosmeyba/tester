/**
 * Week helpers for the meal plan screen, matching `MealPlanTabView`'s
 * Sunday-anchored 7-day window and its cross-month month/year label
 * ("September 2026", or "Sep – October 2026" when the week straddles months).
 *
 * Pure date math only — no rendering, so it stays unit-testable.
 */

/** The 7 dates (Sunday..Saturday) of the week containing `date`. */
export function sundayAnchoredWeek(date: Date): Date[] {
  const sunday = new Date(date);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + index);
    return day;
  });
}

/**
 * "September 2026", or "Sep – October 2026" when the week spans two months —
 * the same rule as the Swift `monthYearLabel`.
 */
export function monthYearLabel(week: Date[]): string {
  const first = week[0];
  const last = week[week.length - 1];
  if (!first || !last) return '';
  const sameMonthYear =
    first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth();
  if (sameMonthYear) {
    return first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const firstPart = first.toLocaleDateString(undefined, { month: 'short' });
  const lastPart = last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `${firstPart} – ${lastPart}`;
}

/** "Tuesday, September 15" — the selected-day heading. */
export function dayHeadingLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** True when both dates fall on the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The calendar date plan day `day` (1-based) falls on, anchored at the
 * plan's week start the same way `useMealPlan` anchors day numbers.
 */
export function planDayDate(planStartDate: Date, day: number): Date {
  const date = new Date(planStartDate);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + (day - 1));
  return date;
}

/** Full weekday name ("Wednesday") of a plan day — used by the move-day sheet. */
export function planDayName(planStartDate: Date, day: number): string {
  return planDayDate(planStartDate, day).toLocaleDateString(undefined, { weekday: 'long' });
}

/**
 * Which plan day (1-based) the selected calendar date maps to, or null when
 * the date is outside the plan's days.
 */
export function selectedPlanDay(
  planStartDate: Date,
  dayCount: number,
  selectedDate: Date,
): number | null {
  const start = new Date(planStartDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(selectedDate);
  target.setHours(0, 0, 0, 0);
  const day = Math.round((target.getTime() - start.getTime()) / 86_400_000) + 1;
  return day >= 1 && day <= dayCount ? day : null;
}
