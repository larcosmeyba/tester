/**
 * §13 Review — a plain-language summary of every answer, each row tapping back
 * to the section it came from.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HiveIcon, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import {
  allergenLabel,
  cookingStyleLabel,
  dietLabel,
  equipmentLabel,
  mealTypeLabel,
  nutritionGoalLabel,
} from '@/features/meals/meal-enums';
import { selectedMealTypes, type PlanRequest } from '@/features/meals/meal-plan-model';
import { BUDGET_MODE_OPTIONS, PANTRY_STAPLES, type QuestionnaireStepId } from '@/features/meals/questionnaire-steps';

const NONE = 'Not set';

function summarise(request: PlanRequest): { step: QuestionnaireStepId; label: string; value: string }[] {
  const { household, meals, days, budget } = request;

  const householdValue = [
    `${household.sizeIsPlus ? '8+' : household.size} ${household.size === 1 ? 'person' : 'people'}`,
    household.adults !== null || household.children !== null
      ? `(${household.adults ?? 0} adults, ${household.children ?? 0} children)`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  const planning = selectedMealTypes(meals)
    .map((type) => `${meals[type]} ${mealTypeLabel(type).toLowerCase()}`)
    .join(', ');

  const budgetValue = budget.amount > 0
    ? `$${budget.amount} · ${BUDGET_MODE_OPTIONS.find((option) => option.value === budget.mode)?.label ?? ''}`
    : 'No budget set';

  const pantryValue = request.pantryItems.length > 0
    ? request.pantryItems
        .map((id) => PANTRY_STAPLES.find((staple) => staple.ingredientId === id)?.label ?? id)
        .join(', ')
    : NONE;

  const timeValue = request.cookingTime.maxMinutes === null
    ? 'No preference'
    : `${request.cookingTime.maxMinutes} minutes or less${request.cookingTime.strength === 'required' ? ' (hard limit)' : ''}`;

  return [
    { step: 'household', label: 'Household', value: householdValue },
    { step: 'meals', label: 'Planning', value: planning.length > 0 ? `${planning} over ${days} days` : NONE },
    { step: 'budget', label: 'Budget', value: budgetValue },
    { step: 'pantry', label: 'Pantry', value: pantryValue },
    {
      step: 'diet',
      label: 'Diet',
      value:
        request.dietaryRequirements.length > 0
          ? request.dietaryRequirements.map((item) => dietLabel(item.diet)).join(', ')
          : 'No specific diet',
    },
    {
      step: 'allergies',
      label: 'Allergies',
      value:
        request.allergies.length > 0
          ? request.allergies.map((item) => allergenLabel(item.allergen)).join(', ')
          : 'None',
    },
    {
      step: 'nutrition',
      label: 'Priority',
      value:
        request.nutritionPreferences.length > 0
          ? request.nutritionPreferences.map((item) => nutritionGoalLabel(item.goal)).join(', ')
          : 'No specific goal',
    },
    { step: 'time', label: 'Cooking time', value: timeValue },
    { step: 'equipment', label: 'Equipment', value: request.equipment.map(equipmentLabel).join(', ') || NONE },
    {
      step: 'style',
      label: 'Preference',
      value: request.cookingStyle.length > 0 ? request.cookingStyle.map(cookingStyleLabel).join(' · ') : NONE,
    },
    { step: 'leftovers', label: 'Leftovers', value: request.leftovers },
  ];
}

export function QuestionnaireReview({
  request,
  onEdit,
}: {
  request: PlanRequest;
  onEdit: (step: QuestionnaireStepId) => void;
}) {
  return (
    <View style={styles.list}>
      {summarise(request).map((row) => (
        <Pressable
          key={row.step}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}: ${row.value}. Tap to change.`}
          onPress={() => onEdit(row.step)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowText}>
            <Text style={uiText.small}>{row.label}</Text>
            <Text style={uiText.body}>{row.value}</Text>
          </View>
          <HiveIcon name="next" size={16} color={HiveColors.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    backgroundColor: HiveColors.white,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
  },
  rowText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
});
