/**
 * Questionnaire control primitives, styled after the Figma screens.
 *
 * - StepperControl: the green − / + circle stepper (Q1, Q2, Q12).
 * - OptionGrid: the two-column chip grid with radio circles (Q3, Q4, Q6, Q7, Q8, Q13).
 * - RadioRows: full-width single-select rows (Q9, Q10, Q11, Q14, Q15).
 * - TextInputControl: the free-text answer box (Q5).
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HiveIcon } from '@/components/hive-ui';
import { HiveColors, Radii } from '@/constants/theme';
import { type QuestionOption } from '@/features/meals/questionnaire-steps';

export function QuestionLabel({ number, text }: { number: number; text: string }) {
  return (
    <Text style={styles.questionLabel}>
      {number}. {text}
    </Text>
  );
}

export function StepperControl({
  value,
  min,
  max,
  onChange,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}) {
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(Math.min(max, value + 1));

  return (
    <View
      style={styles.stepper}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: String(value) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        disabled={value <= min}
        onPress={decrement}
        style={({ pressed }) => [
          styles.stepperButton,
          value <= min && styles.stepperButtonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.stepperGlyph}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        disabled={value >= max}
        onPress={increment}
        style={({ pressed }) => [
          styles.stepperButton,
          value >= max && styles.stepperButtonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.stepperGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
      </View>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Multi-select chip grid. Selecting "None" clears everything else; selecting
 * anything else clears "None" — matching the iOS exclusivity behaviour.
 */
export function OptionGrid({
  options,
  selected,
  onChange,
  columns = 2,
}: {
  options: QuestionOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  columns?: 1 | 2;
}) {
  const press = (value: string) => {
    if (value === 'none') {
      onChange(selected.includes('none') ? [] : ['none']);
      return;
    }
    onChange(toggle(selected.filter((item) => item !== 'none'), value));
  };

  return (
    <View style={[styles.grid, columns === 1 && styles.gridSingle]}>
      {options.map((option) => (
        <View key={option.value} style={columns === 2 ? styles.gridCell : styles.gridCellSingle}>
          <OptionChip
            label={option.label}
            selected={selected.includes(option.value)}
            onPress={() => press(option.value)}
          />
        </View>
      ))}
    </View>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.radioRow,
        selected && styles.radioRowSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.radioRowLabel, selected && styles.radioRowLabelSelected]}>{label}</Text>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <HiveIcon name="check" size={12} color={HiveColors.white} /> : null}
      </View>
    </Pressable>
  );
}

/** Single-select rows (Q9, Q10, Q11, Q14, Q15). */
export function RadioRows({
  options,
  selected,
  onSelect,
}: {
  options: QuestionOption[];
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.rows}>
      {options.map((option) => (
        <RadioRow
          key={option.value}
          label={option.label}
          selected={selected === option.value}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

/** Free-text answer box (Q5). */
export function TextInputControl({
  value,
  placeholder,
  onChange,
  accessibilityLabel,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      style={styles.textInput}
      value={value}
      placeholder={placeholder}
      placeholderTextColor={HiveColors.textSecondary}
      onChangeText={onChange}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
      accessibilityLabel={accessibilityLabel}
      returnKeyType="done"
    />
  );
}

export function WarningNote({ text }: { text: string }) {
  return (
    <View style={styles.warning}>
      <HiveIcon name="bell" size={16} color={HiveColors.warningText} />
      <Text style={styles.warningText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  questionLabel: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HiveColors.card,
    borderRadius: 28,
    paddingVertical: 20,
    paddingHorizontal: 28,
  },
  stepperButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: HiveColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: HiveColors.border,
  },
  stepperValue: {
    color: HiveColors.text,
    fontSize: 56,
    fontWeight: '800',
  },
  stepperGlyph: {
    color: HiveColors.white,
    fontSize: 34,
    fontWeight: '600',
    lineHeight: 38,
  },
  pressed: { opacity: 0.7 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridSingle: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  gridCell: {
    width: '50%',
    padding: 6,
  },
  gridCellSingle: {
    width: '100%',
    padding: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 14,
    minHeight: 60,
  },
  chipSelected: {
    backgroundColor: HiveColors.greenLight,
    borderColor: HiveColors.green,
  },
  chipLabel: {
    flex: 1,
    color: HiveColors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  chipLabelSelected: {
    color: HiveColors.greenDark,
    fontWeight: '700',
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: HiveColors.greenDark,
    backgroundColor: HiveColors.greenDark,
  },
  rows: { gap: 10 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  radioRowSelected: {
    backgroundColor: HiveColors.greenLight,
    borderColor: HiveColors.green,
  },
  radioRowLabel: {
    flex: 1,
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  radioRowLabelSelected: {
    color: HiveColors.greenDark,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: HiveColors.card,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 96,
    color: HiveColors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: {
    color: HiveColors.warningText,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
