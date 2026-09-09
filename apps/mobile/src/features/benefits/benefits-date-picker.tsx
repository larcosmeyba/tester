/**
 * A dependency-free date picker: an inline month grid with month navigation.
 *
 * The repo avoids adding native dependencies when a small custom component
 * does the job — this covers the one place the app needs a date (the
 * post-approval certification-end prompt). Days before `minimumDate` are
 * disabled rather than selectable.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HiveIcon } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function BenefitsDatePicker({
  value,
  onChange,
  minimumDate,
}: {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
}) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const result: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) result.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      result.push(new Date(viewYear, viewMonth, day));
    }
    return result;
  }, [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const today = startOfDay(new Date());
  const min = minimumDate ? startOfDay(minimumDate) : null;

  const moveMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => moveMonth(-1)}
          style={styles.navButton}>
          <HiveIcon name="back" size={16} color={HiveColors.green} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => moveMonth(1)}
          style={styles.navButton}>
          <HiveIcon name="next" size={16} color={HiveColors.green} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text key={`${letter}-${index}`} style={styles.weekday}>
            {letter}
          </Text>
        ))}
        {cells.map((date, index) => {
          if (!date) return <View key={`empty-${index}`} style={styles.cell} />;
          const disabled = min != null && date < min;
          const selected = isSameDay(date, value);
          const isToday = isSameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={date.toDateString()}
              disabled={disabled}
              onPress={() => onChange(date)}
              style={[
                styles.cell,
                selected && styles.cellSelected,
                isToday && !selected && styles.cellToday,
              ]}>
              <Text
                style={[
                  styles.cellText,
                  selected && styles.cellTextSelected,
                  disabled && styles.cellTextDisabled,
                ]}>
                {date.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  navButton: { padding: Spacing.one },
  monthLabel: { color: HiveColors.text, fontSize: 15, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    color: HiveColors.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  cellSelected: { backgroundColor: HiveColors.green },
  cellToday: { borderWidth: 1, borderColor: HiveColors.green },
  cellText: { color: HiveColors.text, fontSize: 14 },
  cellTextSelected: { color: HiveColors.white, fontWeight: '600' },
  cellTextDisabled: { color: HiveColors.textSecondary, opacity: 0.4 },
});
