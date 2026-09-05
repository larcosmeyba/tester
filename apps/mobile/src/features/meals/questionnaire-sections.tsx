/**
 * One component per questionnaire section (product Doc 04 §1–§12).
 *
 * Each section reads and writes `PlanRequest` directly, so what the user sees
 * and what gets posted to `POST /plans` can never drift apart.
 */
import { Text, View } from 'react-native';

import { AppTextField, CheckboxRow, Chip, SelectionRow, uiText } from '@/components/hive-ui';
import { Spacing } from '@/constants/theme';
import {
  allergenLabel,
  cookingStyleLabel,
  dietLabel,
  equipmentLabel,
  mealTypeLabel,
  nutritionGoalLabel,
  PLANNABLE_MEAL_TYPES,
  type Allergen,
  type CookingStyle,
  type Diet,
  type Equipment,
  type NutritionGoal,
  type PlannableMealType,
} from '@/features/meals/meal-enums';
import {
  MAX_HOUSEHOLD_SIZE,
  MAX_PLAN_DAYS,
  MIN_PLAN_DAYS,
  type PlanRequest,
} from '@/features/meals/meal-plan-model';
import {
  ALLERGEN_CHOICES,
  BUDGET_MODE_OPTIONS,
  COOKING_STYLE_CHOICES,
  COOKING_TIME_OPTIONS,
  CUISINE_CHOICES,
  DIET_CHOICES,
  EQUIPMENT_OPTIONS,
  LEFTOVERS_OPTIONS,
  MAX_COOKING_STYLES,
  NUTRITION_GOAL_CHOICES,
  PANTRY_STAPLES,
  householdSplitError,
} from '@/features/meals/questionnaire-steps';

export type SectionProps = {
  request: PlanRequest;
  update: (patch: Partial<PlanRequest>) => void;
};

const gap = { gap: Spacing.two } as const;
const chipRow = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: Spacing.two };

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** §1 Household — the only other required section besides Meals. */
export function HouseholdSection({ request, update }: SectionProps) {
  const splitError = householdSplitError(request);

  return (
    <View style={gap}>
      <View style={chipRow}>
        {Array.from({ length: MAX_HOUSEHOLD_SIZE }, (_, index) => index + 1).map((size) => (
          <Chip
            key={size}
            label={size === MAX_HOUSEHOLD_SIZE ? '8+' : String(size)}
            selected={request.household.size === size}
            onPress={() =>
              update({
                household: {
                  ...request.household,
                  size,
                  sizeIsPlus: size === MAX_HOUSEHOLD_SIZE,
                },
              })
            }
          />
        ))}
      </View>

      <Text style={uiText.muted}>Optional — how the household splits.</Text>
      <AppTextField
        label="Adults"
        value={request.household.adults === null ? '' : String(request.household.adults)}
        keyboardType="number-pad"
        onChangeText={(value) =>
          update({
            household: { ...request.household, adults: parseCount(value) },
          })
        }
      />
      <AppTextField
        label="Children"
        value={request.household.children === null ? '' : String(request.household.children)}
        keyboardType="number-pad"
        onChangeText={(value) =>
          update({
            household: { ...request.household, children: parseCount(value) },
          })
        }
      />
      {splitError ? <Text style={uiText.small}>{splitError}</Text> : null}
    </View>
  );
}

function parseCount(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return Math.min(MAX_HOUSEHOLD_SIZE, Number.parseInt(digits, 10));
}

/**
 * §2 Meals — which categories, and how many days.
 *
 * A user need not plan every category: breakfast + dinner, or lunch + dinner +
 * snacks, are both valid. Selecting a category sets its count to the number of
 * days; deselecting sets it back to zero.
 */
export function MealsSection({ request, update }: SectionProps) {
  const setDays = (days: number) => {
    const meals = { ...request.meals };
    for (const type of PLANNABLE_MEAL_TYPES) {
      if (meals[type] > 0) meals[type] = days;
    }
    update({ days, meals });
  };

  const toggleCategory = (type: PlannableMealType) => {
    const selected = request.meals[type] > 0;
    update({ meals: { ...request.meals, [type]: selected ? 0 : request.days } });
  };

  return (
    <View style={gap}>
      {PLANNABLE_MEAL_TYPES.map((type) => (
        <CheckboxRow
          key={type}
          title={mealTypeLabel(type)}
          subtitle={request.meals[type] > 0 ? `${request.meals[type]} planned` : undefined}
          selected={request.meals[type] > 0}
          onPress={() => toggleCategory(type)}
        />
      ))}

      <Text style={[uiText.body, { marginTop: Spacing.three }]}>How many days?</Text>
      <View style={chipRow}>
        {Array.from({ length: MAX_PLAN_DAYS - MIN_PLAN_DAYS + 1 }, (_, i) => MIN_PLAN_DAYS + i).map((days) => (
          <Chip key={days} label={String(days)} selected={request.days === days} onPress={() => setDays(days)} />
        ))}
      </View>
    </View>
  );
}

/** §3 Budget — optional. A blank amount turns budget planning off entirely. */
export function BudgetSection({ request, update }: SectionProps) {
  return (
    <View style={gap}>
      <AppTextField
        label="Grocery budget for this plan"
        placeholder="$"
        keyboardType="decimal-pad"
        value={request.budget.amount > 0 ? String(request.budget.amount) : ''}
        onChangeText={(value) => {
          const amount = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
          const next = Number.isFinite(amount) ? amount : 0;
          // `enabled` is always derived from the amount, never set by hand.
          update({ budget: { ...request.budget, amount: next, enabled: next > 0 } });
        }}
      />
      <Text style={uiText.muted}>
        Leave this blank to plan without a budget.
      </Text>

      {request.budget.amount > 0 ? (
        <View style={[gap, { marginTop: Spacing.two }]}>
          <Text style={uiText.body}>Should Penny keep costs as low as possible, or use more of the budget for variety?</Text>
          {BUDGET_MODE_OPTIONS.map((option) => (
            <SelectionRow
              key={option.value}
              title={option.label}
              selected={request.budget.mode === option.value}
              onPress={() => update({ budget: { ...request.budget, mode: option.value } })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * §4 Pantry — nothing is pre-checked. The spec is explicit that we must not
 * assume a household already owns olive oil or any other expensive staple.
 */
export function PantrySection({ request, update }: SectionProps) {
  return (
    <View style={gap}>
      <View style={chipRow}>
        {PANTRY_STAPLES.map((staple) => (
          <Chip
            key={staple.ingredientId}
            label={staple.label}
            selected={request.pantryItems.includes(staple.ingredientId)}
            onPress={() => update({ pantryItems: toggle(request.pantryItems, staple.ingredientId) })}
          />
        ))}
      </View>
      <Text style={uiText.small}>Salt, pepper and water are always assumed on hand.</Text>
    </View>
  );
}

/** §5 Dietary requirements. Selected diets are hard requirements by default. */
export function DietSection({ request, update }: SectionProps) {
  const isSelected = (diet: Diet) => request.dietaryRequirements.some((item) => item.diet === diet);

  return (
    <View style={gap}>
      <SelectionRow
        title="No specific diet"
        selected={request.dietaryRequirements.length === 0}
        onPress={() => update({ dietaryRequirements: [] })}
      />
      {DIET_CHOICES.map((diet) => (
        <CheckboxRow
          key={diet}
          title={dietLabel(diet)}
          selected={isSelected(diet)}
          onPress={() =>
            update({
              dietaryRequirements: isSelected(diet)
                ? request.dietaryRequirements.filter((item) => item.diet !== diet)
                : [...request.dietaryRequirements, { diet, strength: 'required' }],
            })
          }
        />
      ))}
    </View>
  );
}

/**
 * §6 Allergies. Always a hard requirement — the spec rejects any other strength.
 * The engine removes matching recipes by ingredient flag, not by name matching.
 */
export function AllergiesSection({ request, update }: SectionProps) {
  const isSelected = (allergen: Allergen) => request.allergies.some((item) => item.allergen === allergen);

  return (
    <View style={gap}>
      {ALLERGEN_CHOICES.map((allergen) => (
        <CheckboxRow
          key={allergen}
          title={allergenLabel(allergen)}
          selected={isSelected(allergen)}
          onPress={() =>
            update({
              allergies: isSelected(allergen)
                ? request.allergies.filter((item) => item.allergen !== allergen)
                : [...request.allergies, { allergen, strength: 'required' }],
            })
          }
        />
      ))}
      <Text style={uiText.small}>
        Recipes containing anything you select are removed from every plan we build for you.
      </Text>
    </View>
  );
}

/** §7 Nutrition goals — preferences, never medical rules or health claims. */
export function NutritionSection({ request, update }: SectionProps) {
  const isSelected = (goal: NutritionGoal) => request.nutritionPreferences.some((item) => item.goal === goal);

  return (
    <View style={gap}>
      <SelectionRow
        title="No specific goal"
        selected={request.nutritionPreferences.length === 0}
        onPress={() => update({ nutritionPreferences: [] })}
      />
      {NUTRITION_GOAL_CHOICES.map((goal) => (
        <CheckboxRow
          key={goal}
          title={nutritionGoalLabel(goal)}
          selected={isSelected(goal)}
          onPress={() =>
            update({
              nutritionPreferences: isSelected(goal)
                ? request.nutritionPreferences.filter((item) => item.goal !== goal)
                : [...request.nutritionPreferences, { goal, strength: 'preferred' }],
            })
          }
        />
      ))}
    </View>
  );
}

/** §8 Food preferences. Likes are a nudge; dislikes are a hard filter. */
export function PreferencesSection({ request, update }: SectionProps) {
  return (
    <View style={gap}>
      <Text style={uiText.body}>Cuisines you enjoy</Text>
      <View style={chipRow}>
        {CUISINE_CHOICES.map((cuisine) => (
          <Chip
            key={cuisine.value}
            label={cuisine.label}
            selected={request.likes.cuisines.includes(cuisine.value)}
            onPress={() =>
              update({ likes: { ...request.likes, cuisines: toggle(request.likes.cuisines, cuisine.value) } })
            }
          />
        ))}
      </View>

      <AppTextField
        label="Anything you especially like?"
        placeholder="Chicken, rice, beans…"
        value={request.likes.freeText ?? ''}
        onChangeText={(value) => update({ likes: { ...request.likes, freeText: value.length > 0 ? value : null } })}
      />
      <AppTextField
        label="Anything you'd rather not eat?"
        placeholder="Mushrooms, olives…"
        value={request.dislikes.freeText ?? ''}
        onChangeText={(value) =>
          update({ dislikes: { ...request.dislikes, freeText: value.length > 0 ? value : null } })
        }
      />
      <Text style={uiText.small}>
        We&apos;ll confirm what these map to before using them, so nothing is excluded by mistake.
      </Text>
    </View>
  );
}

/** §9 Cooking time, with the hard-limit toggle. */
export function TimeSection({ request, update }: SectionProps) {
  return (
    <View style={gap}>
      {COOKING_TIME_OPTIONS.map((option) => (
        <SelectionRow
          key={String(option.value)}
          title={option.label}
          selected={request.cookingTime.maxMinutes === option.value}
          onPress={() => update({ cookingTime: { ...request.cookingTime, maxMinutes: option.value } })}
        />
      ))}
      {request.cookingTime.maxMinutes !== null ? (
        <CheckboxRow
          title="This is a hard limit"
          subtitle="Leave off and we'll treat it as a preference."
          selected={request.cookingTime.strength === 'required'}
          onPress={() =>
            update({
              cookingTime: {
                ...request.cookingTime,
                strength: request.cookingTime.strength === 'required' ? 'preferred' : 'required',
              },
            })
          }
        />
      ) : null}
    </View>
  );
}

/** §10 Equipment. Stovetop, oven and microwave start checked. */
export function EquipmentSection({ request, update }: SectionProps) {
  return (
    <View style={gap}>
      {EQUIPMENT_OPTIONS.map((item: Equipment) => (
        <CheckboxRow
          key={item}
          title={equipmentLabel(item)}
          selected={request.equipment.includes(item)}
          onPress={() => update({ equipment: toggle(request.equipment, item) })}
        />
      ))}
    </View>
  );
}

/** §11 Cooking style, capped at three selections. */
export function StyleSection({ request, update }: SectionProps) {
  const atLimit = request.cookingStyle.length >= MAX_COOKING_STYLES;

  return (
    <View style={gap}>
      {COOKING_STYLE_CHOICES.map((style: CookingStyle) => {
        const selected = request.cookingStyle.includes(style);
        return (
          <CheckboxRow
            key={style}
            title={cookingStyleLabel(style)}
            subtitle={!selected && atLimit ? `Pick at most ${MAX_COOKING_STYLES}` : undefined}
            selected={selected}
            onPress={() => {
              if (!selected && atLimit) return;
              update({ cookingStyle: toggle(request.cookingStyle, style) });
            }}
          />
        );
      })}
    </View>
  );
}

/** §12 Leftovers. */
export function LeftoversSection({ request, update }: SectionProps) {
  return (
    <View style={gap}>
      {LEFTOVERS_OPTIONS.map((option) => (
        <SelectionRow
          key={option.value}
          title={option.label}
          selected={request.leftovers === option.value}
          onPress={() => update({ leftovers: option.value })}
        />
      ))}
    </View>
  );
}
