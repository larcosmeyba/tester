/**
 * meal-week helpers: Sunday-anchored weeks, the month/year label, and the
 * plan-day mapping the calendar strip and the move-day sheet rely on.
 */
import {
  isSameDay,
  monthYearLabel,
  planDayDate,
  planDayName,
  selectedPlanDay,
  sundayAnchoredWeek,
} from '@/features/meals/meal-week';

describe('sundayAnchoredWeek', () => {
  it('returns the Sunday-anchored 7-day window containing the date', () => {
    // 2026-09-15 is a Tuesday.
    const week = sundayAnchoredWeek(new Date(2026, 8, 15, 12));
    expect(week).toHaveLength(7);
    expect(week[0].getDay()).toBe(0);
    expect(week.map((day) => day.getDate())).toEqual([13, 14, 15, 16, 17, 18, 19]);
  });

  it('a Sunday starts its own week', () => {
    const week = sundayAnchoredWeek(new Date(2026, 8, 13, 12));
    expect(week[0].getDate()).toBe(13);
    expect(week[6].getDate()).toBe(19);
  });

  it('normalizes every date to midnight', () => {
    const week = sundayAnchoredWeek(new Date(2026, 8, 16, 18, 30));
    expect(week.every((day) => day.getHours() === 0 && day.getMinutes() === 0)).toBe(true);
  });
});

describe('monthYearLabel', () => {
  it('uses the long month and year when the week stays in one month', () => {
    const week = sundayAnchoredWeek(new Date(2026, 8, 15));
    const expected = week[0].toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    expect(monthYearLabel(week)).toBe(expected);
  });

  it('combines a short first month with the long last month when the week straddles months', () => {
    // Week of Sun 2026-08-30 .. Sat 2026-09-05.
    const week = sundayAnchoredWeek(new Date(2026, 8, 2));
    const first = week[0].toLocaleDateString(undefined, { month: 'short' });
    const last = week[6].toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    expect(monthYearLabel(week)).toBe(`${first} – ${last}`);
  });

  it('returns an empty string for an empty week', () => {
    expect(monthYearLabel([])).toBe('');
  });
});

describe('selectedPlanDay', () => {
  // Plan day 1 = Monday 2026-09-14.
  const start = new Date(2026, 8, 14);

  it('maps the start date to day 1', () => {
    expect(selectedPlanDay(start, 5, new Date(2026, 8, 14))).toBe(1);
  });

  it('maps dates inside the plan to their day number', () => {
    expect(selectedPlanDay(start, 5, new Date(2026, 8, 18))).toBe(5);
  });

  it('returns null outside the plan', () => {
    expect(selectedPlanDay(start, 5, new Date(2026, 8, 13))).toBeNull();
    expect(selectedPlanDay(start, 5, new Date(2026, 8, 19))).toBeNull();
  });

  it('ignores the time of day', () => {
    expect(selectedPlanDay(start, 5, new Date(2026, 8, 15, 23, 59))).toBe(2);
  });
});

describe('planDayDate / planDayName', () => {
  it('anchors day 1 at the plan start date', () => {
    const start = new Date(2026, 8, 14);
    expect(planDayDate(start, 1).getDate()).toBe(14);
    expect(planDayDate(start, 3).getDate()).toBe(16);
  });

  it('names the weekday for the move-day sheet', () => {
    // 2026-09-16 is a Wednesday.
    expect(planDayName(new Date(2026, 8, 14), 3)).toBe(
      new Date(2026, 8, 16).toLocaleDateString(undefined, { weekday: 'long' }),
    );
  });
});

describe('isSameDay', () => {
  it('matches dates on the same calendar day regardless of time', () => {
    expect(isSameDay(new Date(2026, 8, 15, 8), new Date(2026, 8, 15, 22))).toBe(true);
    expect(isSameDay(new Date(2026, 8, 15), new Date(2026, 8, 16))).toBe(false);
  });
});
