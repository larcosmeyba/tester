/**
 * Week calendar strip, matching `MealPlanTabView.weekCalendarStrip`.
 *
 * Month label with chevrons either side, then a seven-column day picker: the
 * selected day is a filled green circle, today is an outlined one.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HiveIcon } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function WeekCalendarStrip({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const weekDates = useMemo(() => {
    const first = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }, [selectedDate]);

  const monthLabel = selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const today = new Date();

  return (
    <View style={styles.container}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          onPress={() => onSelectDate(addDays(selectedDate, -7))}
          style={styles.navButton}>
          <HiveIcon name="back" size={14} color={HiveColors.green} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          onPress={() => onSelectDate(addDays(selectedDate, 7))}
          style={styles.navButton}>
          <HiveIcon name="next" size={14} color={HiveColors.green} />
        </Pressable>
      </View>

      <View style={styles.dayRow}>
        {weekDates.map((date, index) => {
          const selected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={date.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              onPress={() => onSelectDate(date)}
              style={styles.dayCell}>
              <Text style={[styles.dayLetter, selected && styles.dayLetterSelected]}>
                {WEEKDAY_LETTERS[index]}
              </Text>
              <View
                style={[
                  styles.dayCircle,
                  selected && styles.dayCircleSelected,
                  !selected && isToday && styles.dayCircleToday,
                ]}>
                <Text
                  style={[
                    styles.dayNumber,
                    selected && styles.dayNumberSelected,
                    !selected && isToday && styles.dayNumberToday,
                  ]}>
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 12, backgroundColor: HiveColors.white, gap: 10 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  navButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { color: HiveColors.text, fontSize: 16, fontWeight: '600' },
  dayRow: { flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 10 },
  dayCell: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 2 },
  dayLetter: { fontSize: 12, fontWeight: '500', color: HiveColors.textSecondary },
  dayLetterSelected: { color: HiveColors.green },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: HiveColors.green },
  dayCircleToday: { borderWidth: 1.5, borderColor: HiveColors.green },
  dayNumber: { fontSize: 15, color: HiveColors.text },
  dayNumberSelected: { color: HiveColors.white, fontWeight: '600' },
  dayNumberToday: { color: HiveColors.green, fontWeight: '600' },
});
