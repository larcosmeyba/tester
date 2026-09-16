/**
 * The questionnaire's seven steps, matching Marcos's SwiftUI sandbox
 * (`22_-_MealPlanQuestionnaireView`) screen for screen.
 *
 * The Swift view's building blocks are rebuilt here as `MQStepper`,
 * `MQChipGrid`, `MQSingleSelect` and `MQTextField`. Each step section reads
 * and writes the shared `MealQuestionnaireAnswers`; the mapping to the real
 * `PlanRequest` lives in `questionnaire-answers.ts`.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppButton, HiveIcon, uiText, type HiveIconName } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { usePantry } from '@/features/pantry/pantry-context';
import { expirationDateInDays, locationLabel } from '@/features/pantry/pantry-model';
import {
  ALLERGY_EXCLUSIVE_OPTION,
  ALLERGY_OPTIONS,
  BUDGET_OPTIONS,
  CHILD_AGE_RANGES,
  COOK_TIME_OPTIONS,
  CUISINE_EXCLUSIVE_OPTION,
  CUISINE_OPTIONS,
  DIET_EXCLUSIVE_OPTION,
  DIET_OPTIONS,
  EQUIPMENT_EXCLUSIVE_OPTION,
  EQUIPMENT_OPTIONS,
  GOAL_EXCLUSIVE_OPTION,
  GOAL_OPTIONS,
  HEALTH_EXCLUSIVE_OPTIONS,
  HEALTH_OPTIONS,
  HOUSEHOLD_SIZE_PLUS_LABEL,
  MAX_CHILDREN_COUNT,
  MAX_HOUSEHOLD_SIZE,
  MAX_PLAN_DAYS,
  MEAL_TYPE_OPTIONS,
  MIN_HOUSEHOLD_SIZE,
  MIN_PLAN_DAYS,
  SHOPPING_OPTIONS,
  SKILL_OPTIONS,
  SPICE_OPTIONS,
  type QuestionnaireStep,
} from '@/features/meals/questionnaire-steps';
import {
  toggleChip,
  type MealQuestionnaireAnswers,
} from '@/features/meals/questionnaire-answers';

export type QuestionnaireSectionProps = {
  answers: MealQuestionnaireAnswers;
  update: (patch: Partial<MealQuestionnaireAnswers>) => void;
};

// ---------------------------------------------------------------------------
// Building blocks (MQStepper / MQChipGrid / MQSingleSelect / MQTextField)
// ---------------------------------------------------------------------------

export function QuestionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.questionLabel}>{children}</Text>;
}

export function StepHeader({ step }: { step: QuestionnaireStep }) {
  return (
    <View style={styles.stepHeader}>
      <View style={[styles.stepIconCircle, { backgroundColor: `${step.iconTint}1F` }]}>
        <HiveIcon name={step.icon} size={26} color={step.iconTint} />
      </View>
      <Text style={uiText.subtitle}>{step.title}</Text>
      <Text style={uiText.muted}>{step.subtitle}</Text>
    </View>
  );
}

export function MQStepper({
  value,
  min,
  max,
  maxLabel,
  onChange,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  maxLabel?: string;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}) {
  const canDecrease = value > min;
  const canIncrease = value < max;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        disabled={!canDecrease}
        onPress={() => onChange(value - 1)}
        style={[styles.stepperButton, !canDecrease && styles.stepperButtonDisabled]}>
        <Text style={[styles.stepperButtonText, !canDecrease && styles.stepperButtonTextDisabled]}>−</Text>
      </Pressable>
      <Text
        accessibilityLabel={`${accessibilityLabel}: ${value >= max && maxLabel ? maxLabel : value}`}
        style={styles.stepperValue}>
        {value >= max && maxLabel ? maxLabel : String(value)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
        style={[styles.stepperButton, !canIncrease && styles.stepperButtonDisabled]}>
        <Text style={[styles.stepperButtonText, !canIncrease && styles.stepperButtonTextDisabled]}>+</Text>
      </Pressable>
    </View>
  );
}

export function MQChipGrid({
  options,
  selected,
  exclusive,
  onToggle,
}: {
  options: string[];
  selected: string[];
  exclusive?: string | string[];
  onToggle: (option: string) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={option}
            onPress={() => onToggle(option)}
            style={[styles.chip, isSelected && styles.chipSelected]}>
            {isSelected ? (
              <HiveIcon name="checkCircle" size={14} color={HiveColors.green} />
            ) : (
              <View style={styles.chipCircle} />
            )}
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MQSingleSelect({
  options,
  selected,
  onSelect,
  icons,
}: {
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
  icons?: (HiveIconName | null)[];
}) {
  return (
    <View style={styles.singleSelect}>
      {options.map((option, index) => {
        const isSelected = selected === option;
        const icon = icons?.[index] ?? null;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={option}
            onPress={() => onSelect(option)}
            style={[styles.selectRow, isSelected && styles.selectRowSelected]}>
            {icon ? (
              <HiveIcon
                name={icon}
                size={14}
                color={isSelected ? HiveColors.green : HiveColors.textSecondary}
              />
            ) : null}
            <Text style={[styles.selectText, isSelected && styles.selectTextSelected]}>{option}</Text>
            {isSelected ? (
              <HiveIcon name="checkCircle" size={18} color={HiveColors.green} />
            ) : (
              <View style={styles.selectCircle} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function MQTextField({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <TextInput
      style={styles.textField}
      placeholder={placeholder}
      placeholderTextColor={HiveColors.placeholder}
      value={value}
      onChangeText={onChangeText}
      multiline
      textAlignVertical="top"
    />
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Household
// ---------------------------------------------------------------------------

export function HouseholdStep({ answers, update }: QuestionnaireSectionProps) {
  return (
    <View style={styles.stepBody}>
      <View>
        <QuestionLabel>1. How many people are you planning meals for?</QuestionLabel>
        <MQStepper
          value={answers.householdSize}
          min={MIN_HOUSEHOLD_SIZE}
          max={MAX_HOUSEHOLD_SIZE}
          maxLabel={HOUSEHOLD_SIZE_PLUS_LABEL}
          onChange={(householdSize) => update({ householdSize })}
          accessibilityLabel="Household size"
        />
      </View>
      <View>
        <QuestionLabel>2. How many are children?</QuestionLabel>
        <MQStepper
          value={answers.childrenCount}
          min={0}
          max={MAX_CHILDREN_COUNT}
          onChange={(childrenCount) => update({ childrenCount })}
          accessibilityLabel="Children count"
        />
      </View>
      {answers.childrenCount > 0 ? (
        <View>
          <QuestionLabel>Which age ranges? (select all that apply)</QuestionLabel>
          <MQChipGrid
            options={CHILD_AGE_RANGES}
            selected={answers.childrenAges}
            onToggle={(option) =>
              update({ childrenAges: toggleChip(answers.childrenAges, option) })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Diets, Allergies & Dislikes
// ---------------------------------------------------------------------------

export function DietsStep({ answers, update }: QuestionnaireSectionProps) {
  return (
    <View style={styles.stepBody}>
      <View>
        <QuestionLabel>3. Does anyone in your household follow a specific diet?</QuestionLabel>
        <MQChipGrid
          options={DIET_OPTIONS}
          selected={answers.diets}
          exclusive={DIET_EXCLUSIVE_OPTION}
          onToggle={(option) => update({ diets: toggleChip(answers.diets, option, DIET_EXCLUSIVE_OPTION) })}
        />
        {answers.diets.includes('Other') ? (
          <View style={styles.textFieldWrap}>
            <MQTextField
              placeholder="Describe the diet…"
              value={answers.dietOtherText}
              onChangeText={(dietOtherText) => update({ dietOtherText })}
            />
          </View>
        ) : null}
      </View>
      <View>
        <QuestionLabel>4. Any food allergies or intolerances?</QuestionLabel>
        <View style={styles.warningRow}>
          <HiveIcon name="warning" size={11} color="#BF6100" />
          <Text style={styles.warningText}>Allergies are always treated as hard restrictions.</Text>
        </View>
        <MQChipGrid
          options={ALLERGY_OPTIONS}
          selected={answers.allergies}
          exclusive={ALLERGY_EXCLUSIVE_OPTION}
          onToggle={(option) =>
            update({ allergies: toggleChip(answers.allergies, option, ALLERGY_EXCLUSIVE_OPTION) })
          }
        />
        {answers.allergies.includes('Other') ? (
          <View style={styles.textFieldWrap}>
            <MQTextField
              placeholder="Describe the allergy or intolerance…"
              value={answers.allergyOtherText}
              onChangeText={(allergyOtherText) => update({ allergyOtherText })}
            />
          </View>
        ) : null}
      </View>
      <View>
        <QuestionLabel>5. Any foods you never want in your meal plan?</QuestionLabel>
        <MQTextField
          placeholder="e.g. Mushrooms, cilantro, olives"
          value={answers.dislikes}
          onChangeText={(dislikes) => update({ dislikes })}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Health & Goals
// ---------------------------------------------------------------------------

export function HealthStep({ answers, update }: QuestionnaireSectionProps) {
  return (
    <View style={styles.stepBody}>
      <View>
        <QuestionLabel>6. Any health considerations to keep in mind?</QuestionLabel>
        <MQChipGrid
          options={HEALTH_OPTIONS}
          selected={answers.health}
          exclusive={HEALTH_EXCLUSIVE_OPTIONS}
          onToggle={(option) =>
            update({ health: toggleChip(answers.health, option, HEALTH_EXCLUSIVE_OPTIONS) })
          }
        />
      </View>
      <View>
        <QuestionLabel>7. What goals would you like your plan to support?</QuestionLabel>
        <MQChipGrid
          options={GOAL_OPTIONS}
          selected={answers.goals}
          exclusive={GOAL_EXCLUSIVE_OPTION}
          onToggle={(option) => update({ goals: toggleChip(answers.goals, option, GOAL_EXCLUSIVE_OPTION) })}
        />
        {answers.goals.includes('Doctor-Recommended Diet') ? (
          <View style={styles.textFieldWrap}>
            <MQTextField
              placeholder="Optional: describe the diet your doctor recommended…"
              value={answers.doctorDietText}
              onChangeText={(doctorDietText) => update({ doctorDietText })}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Taste & Cooking
// ---------------------------------------------------------------------------

const SPICE_ICONS: (HiveIconName | null)[] = [null, null, null];
const COOK_TIME_ICONS: (HiveIconName | null)[] = ['clock', 'clock', 'clock', 'ellipsis'];
const SKILL_ICONS: (HiveIconName | null)[] = [null, null, null];
const BUDGET_ICONS: (HiveIconName | null)[] = ['dollar', 'dollar', 'dollar', 'dollar', 'ellipsis'];
const SHOPPING_ICONS: (HiveIconName | null)[] = ['doc', 'cart', 'ellipsis'];

export function TasteStep({ answers, update }: QuestionnaireSectionProps) {
  return (
    <View style={styles.stepBody}>
      <View>
        <QuestionLabel>8. What types of food do you enjoy most?</QuestionLabel>
        <MQChipGrid
          options={CUISINE_OPTIONS}
          selected={answers.cuisines}
          exclusive={CUISINE_EXCLUSIVE_OPTION}
          onToggle={(option) =>
            update({ cuisines: toggleChip(answers.cuisines, option, CUISINE_EXCLUSIVE_OPTION) })
          }
        />
      </View>
      <View>
        <QuestionLabel>9. How spicy do you like your food?</QuestionLabel>
        <MQSingleSelect
          options={SPICE_OPTIONS}
          selected={answers.spice}
          onSelect={(spice) => update({ spice })}
          icons={SPICE_ICONS}
        />
      </View>
      <View>
        <QuestionLabel>10. How much time do you usually have to cook?</QuestionLabel>
        <MQSingleSelect
          options={COOK_TIME_OPTIONS}
          selected={answers.cookTime}
          onSelect={(cookTime) => update({ cookTime })}
          icons={COOK_TIME_ICONS}
        />
      </View>
      <View>
        <QuestionLabel>11. How comfortable are you in the kitchen?</QuestionLabel>
        <MQSingleSelect
          options={SKILL_OPTIONS}
          selected={answers.skill}
          onSelect={(skill) => update({ skill })}
          icons={SKILL_ICONS}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Kitchen / Equipment
// ---------------------------------------------------------------------------

export function KitchenStep({ answers, update }: QuestionnaireSectionProps) {
  return (
    <View style={styles.stepBody}>
      <View>
        <QuestionLabel>12. What do you have to cook with?</QuestionLabel>
        <Text style={[uiText.small, styles.helperText]}>Select everything available to you.</Text>
        <MQChipGrid
          options={EQUIPMENT_OPTIONS}
          selected={answers.equipment}
          exclusive={EQUIPMENT_EXCLUSIVE_OPTION}
          onToggle={(option) =>
            update({ equipment: toggleChip(answers.equipment, option, EQUIPMENT_EXCLUSIVE_OPTION) })
          }
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Meal Planning & Budget
// ---------------------------------------------------------------------------

export function PlanningStep({ answers, update }: QuestionnaireSectionProps) {
  return (
    <View style={styles.stepBody}>
      <View>
        <QuestionLabel>13. How many dinners would you like planned each week?</QuestionLabel>
        <MQStepper
          value={answers.dinnersPerWeek}
          min={MIN_PLAN_DAYS}
          max={MAX_PLAN_DAYS}
          onChange={(dinnersPerWeek) => update({ dinnersPerWeek })}
          accessibilityLabel="Dinners per week"
        />
      </View>
      <View>
        <QuestionLabel>14. Which meals would you like included in your plan?</QuestionLabel>
        <MQChipGrid
          options={MEAL_TYPE_OPTIONS}
          selected={answers.mealTypes}
          onToggle={(option) => update({ mealTypes: toggleChip(answers.mealTypes, option) })}
        />
      </View>
      <View>
        <QuestionLabel>15. About how much would you like to spend on groceries per week?</QuestionLabel>
        <MQSingleSelect
          options={BUDGET_OPTIONS}
          selected={answers.budget}
          onSelect={(budget) => update({ budget })}
          icons={BUDGET_ICONS}
        />
      </View>
      <View>
        <QuestionLabel>16. How would you like to shop for your groceries?</QuestionLabel>
        <MQSingleSelect
          options={SHOPPING_OPTIONS}
          selected={answers.shopping}
          onSelect={(shopping) => update({ shopping })}
          icons={SHOPPING_ICONS}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Confirm Pantry + Fridge
// ---------------------------------------------------------------------------

export function PantryStep() {
  const { activeItems, status, error, isMutating, markUsed, addItem, refresh } = usePantry();
  const [quickAdd, setQuickAdd] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmed = quickAdd.trim();

  async function handleQuickAdd() {
    if (trimmed.length === 0 || saving) return;
    setSaving(true);
    try {
      await addItem({
        name: trimmed,
        quantity: '1',
        location: 'PANTRY',
        category: 'Groceries',
        expirationDate: expirationDateInDays(14),
      });
      setQuickAdd('');
    } catch {
      // The pantry context surfaces the error; the typed text is kept so
      // nothing the user wrote is lost.
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.stepBody}>
      {status === 'loading' ? (
        <View style={styles.pantryCenter}>
          <ActivityIndicator size="small" color={HiveColors.green} />
          <Text style={uiText.muted}>Loading your pantry…</Text>
        </View>
      ) : status === 'error' ? (
        <View style={styles.pantryCenter}>
          <Text style={uiText.muted}>
            {error || "We couldn't reach your pantry. You can continue — Penny will plan without it."}
          </Text>
          <AppButton title="Try again" variant="secondary" onPress={() => void refresh()} />
        </View>
      ) : activeItems.length === 0 ? (
        <View style={styles.pantryCenter}>
          <HiveIcon name="box" size={30} color={HiveColors.border} />
          <Text style={[uiText.body, styles.centerText]}>Nothing saved in your Pantry + Fridge yet.</Text>
          <Text style={[uiText.small, styles.centerText]}>
            Add a few items below, or continue and Penny will plan without them.
          </Text>
        </View>
      ) : (
        <View style={styles.pantryList}>
          {activeItems.map((item) => (
            <View key={item.id} style={styles.pantryRow}>
              <HiveIcon
                name={item.location === 'REFRIGERATOR' ? 'fridge' : 'box'}
                size={14}
                color={HiveColors.green}
              />
              <View style={styles.pantryRowText}>
                <Text style={styles.pantryName}>{item.name}</Text>
                <Text style={uiText.small}>
                  {[item.quantity, locationLabel(item.location)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name} from the plan`}
                disabled={isMutating}
                onPress={() => void markUsed(item.id)}
                style={styles.pantryRemove}>
                <HiveIcon name="xCircle" size={18} color={HiveColors.border} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.quickAddRow}>
        <TextInput
          style={styles.quickAddInput}
          placeholder="Add an item (e.g. rice, eggs)"
          placeholderTextColor={HiveColors.placeholder}
          value={quickAdd}
          onChangeText={setQuickAdd}
          onSubmitEditing={() => void handleQuickAdd()}
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add pantry item"
          disabled={trimmed.length === 0 || saving}
          onPress={() => void handleQuickAdd()}
          style={[
            styles.quickAddButton,
            (trimmed.length === 0 || saving) && styles.quickAddButtonDisabled,
          ]}>
          {saving ? (
            <ActivityIndicator size="small" color={HiveColors.white} />
          ) : (
            <HiveIcon name="plus" size={16} color={HiveColors.white} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  stepBody: { gap: Spacing.four },
  stepHeader: { gap: Spacing.two, marginBottom: Spacing.three },
  stepIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: HiveColors.text,
    marginBottom: Spacing.two,
  },
  helperText: { marginBottom: Spacing.two },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.two,
  },
  warningText: { fontSize: 12, color: '#BF6100' },
  textFieldWrap: { marginTop: Spacing.two },
  // MQStepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HiveColors.card,
    borderRadius: Radii.xl,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.green,
  },
  stepperButtonDisabled: { backgroundColor: HiveColors.border },
  stepperButtonText: { fontSize: 24, fontWeight: '700', color: HiveColors.white, lineHeight: 28 },
  stepperButtonTextDisabled: { color: HiveColors.textSecondary },
  stepperValue: { fontSize: 42, fontWeight: '800', color: HiveColors.text, minWidth: 60, textAlign: 'center' },
  // MQChipGrid
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexGrow: 1,
    flexBasis: '46%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelected: { backgroundColor: HiveColors.greenLight, borderColor: HiveColors.green },
  chipCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
  },
  chipText: { flex: 1, fontSize: 13, color: HiveColors.text },
  chipTextSelected: { fontWeight: '600', color: HiveColors.green },
  // MQSingleSelect
  singleSelect: { gap: 8 },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selectRowSelected: { backgroundColor: HiveColors.greenLight, borderColor: HiveColors.green },
  selectText: { flex: 1, fontSize: 14, color: HiveColors.text },
  selectTextSelected: { fontWeight: '600', color: HiveColors.green },
  selectCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
  },
  // MQTextField
  textField: {
    minHeight: 80,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: HiveColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: HiveColors.text,
  },
  // Pantry step
  pantryCenter: { alignItems: 'center', gap: Spacing.two, paddingVertical: 24 },
  centerText: { textAlign: 'center' },
  pantryList: { gap: Spacing.two },
  pantryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.md,
  },
  pantryRowText: { flex: 1, gap: 1 },
  pantryName: { fontSize: 15, fontWeight: '500', color: HiveColors.text },
  pantryRemove: { padding: 4 },
  quickAddRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.one },
  quickAddInput: {
    flex: 1,
    height: 46,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: HiveColors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: HiveColors.text,
  },
  quickAddButton: {
    width: 46,
    height: 46,
    borderRadius: Radii.md,
    backgroundColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddButtonDisabled: { backgroundColor: HiveColors.border },
});
