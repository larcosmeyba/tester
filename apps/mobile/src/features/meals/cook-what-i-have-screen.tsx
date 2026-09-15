/**
 * Cook What I Have (Audit Section 5).
 *
 * Generates a single meal from what's already in the pantry, prioritizing
 * items that expire soonest. The generation reuses the existing meal-plan
 * backend (`generateMealPlan` with days: 1, one meal slot, and the real
 * `use_what_i_have` cooking-style enum) on top of the user's saved
 * questionnaire preferences — no new API, no invented recipes.
 *
 * Locked rules: B/L/D only (snacks deferred — no snack option here), kids
 * count as full servings (the questionnaire household already encodes that).
 * The single-meal allowance comes from the shared ai-usage-limits counters.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  Card,
  Chip,
  EmptyState,
  HiveIcon,
  ModalSheet,
  PennyImage,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { sharedStyles } from '@/features/app/app-shared';
import type { Navigation } from '@/features/app/navigation-types';
import { useAuth } from '@/auth/auth-context';
import { useAppState } from '@/state/app-state';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { usePantry } from '@/features/pantry/pantry-context';
import { seedCatalog } from '@/features/meals/mock/seed-data';
import {
  pantryCoversIngredient,
  pantryWordSet,
  prioritizePantryForCooking,
  type PrioritizedPantry,
} from '@/features/meals/cook-pantry-priority';
import { getAiUsage, hasAiUsageRemaining, recordAiUsage, type AiUsage } from '@/features/meals/ai-usage-limits';
import { AiLimitGate } from '@/features/meals/ai-limit-gate';
import { mealPlanService } from '@/features/meals/meal-plan-service';
import { recipeService } from '@/features/meals/recipe-service';
import type { PlanRequest } from '@/features/meals/meal-plan-model';
import type { IngredientLine, Recipe } from '@/features/meals/recipe-model';
import {
  addCookGroceryAddition,
  loadCookGroceryAdditions,
  type CookGroceryAddition,
} from '@/features/meals/cook-grocery-additions';
import {
  loadCookHistory,
  saveCookedMeal,
  type CookedMealRecord,
} from '@/features/meals/cook-what-i-have-history';
import { describeError } from '@/services/api-error';

// TODO(Marcos): replace with the Penny-cooking asset from his ZIP. penny-money
// is the closest existing illustration.
const pennyCookingSource = require('@/assets/images/hive/penny-money.png');

type MealKind = 'breakfast' | 'lunch' | 'dinner';
const MEAL_KINDS: MealKind[] = ['breakfast', 'lunch', 'dinner'];

type Phase = 'choose' | 'generating' | 'result';

export function CookWhatIHaveScreen({
  nav,
  focusIngredient,
}: {
  nav: Navigation;
  focusIngredient?: string;
}) {
  const auth = useAuth();
  const app = useAppState();
  const mealPlan = useMealPlan();
  const pantry = usePantry();

  const [slot, setSlot] = useState<MealKind>('dinner');
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [limitGate, setLimitGate] = useState<AiUsage | null>(null);
  const [history, setHistory] = useState<CookedMealRecord[]>([]);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const prioritized: PrioritizedPantry = useMemo(
    () => prioritizePantryForCooking(pantry.items, seedCatalog),
    [pantry.items],
  );
  const pantryWords = useMemo(() => pantryWordSet(prioritized.detail), [prioritized.detail]);
  const prioritizedIds = useMemo(() => new Set(prioritized.ingredientIds), [prioritized.ingredientIds]);

  useEffect(() => {
    void loadCookHistory().then(setHistory).catch(() => undefined);
    void loadCookGroceryAdditions()
      .then((additions) => setAddedIds(additions.map((item) => item.ingredientId)))
      .catch(() => undefined);
  }, []);

  const hasPantry = prioritized.detail.length > 0;

  const generate = useCallback(async () => {
    setError('');
    // The gate fires AT the limit — checked before any AI work is requested.
    if (!(await hasAiUsageRemaining('single_meal'))) {
      setLimitGate(await getAiUsage('single_meal'));
      return;
    }
    setPhase('generating');
    try {
      // The user's saved questionnaire preferences are the base (allergies,
      // diet, household, cooking time, equipment) — the audit's one guided
      // questionnaire reused rather than re-asked. Only the scope changes:
      // one day, one meal, pantry-first.
      const base: PlanRequest = mealPlan.request;
      const cookRequest: PlanRequest = {
        ...base,
        days: 1,
        meals: {
          breakfast: slot === 'breakfast' ? 1 : 0,
          lunch: slot === 'lunch' ? 1 : 0,
          dinner: slot === 'dinner' ? 1 : 0,
          snack: 0,
        },
        cookingStyle: base.cookingStyle.includes('use_what_i_have')
          ? base.cookingStyle
          : [...base.cookingStyle, 'use_what_i_have'],
        // Expiring-first order — the request carries what the household has,
        // soonest to expire first.
        pantryItems: prioritized.ingredientIds,
        household: { ...base.household, size: Math.max(1, base.household.size) },
      };
      const plan = await mealPlanService.generate(cookRequest, {
        userId: auth.user?.id ?? 'anonymous',
      });
      const meal = plan.meals.find((candidate) => candidate.slot.mealType === slot) ?? plan.meals[0];
      if (!meal) {
        throw new Error('The generator came back empty. Please try again.');
      }
      const fullRecipe = await recipeService.get(meal.recipeId);
      setWhy(meal.why ?? null);
      setRecipe(fullRecipe);
      // The AI work succeeded — this is what consumes the allowance.
      await recordAiUsage('single_meal');
      const nextHistory = await saveCookedMeal({
        recipeId: fullRecipe.recipeId,
        title: fullRecipe.title,
        slot,
        pantryIngredientIds: prioritized.ingredientIds,
      });
      setHistory(nextHistory);
      setPhase('result');
    } catch (caught) {
      setError(describeError(caught).message);
      setPhase('choose');
    }
  }, [auth.user?.id, mealPlan.request, prioritized.ingredientIds, slot]);

  const openHistoryRecipe = useCallback(async (record: CookedMealRecord) => {
    setError('');
    try {
      const fullRecipe = await recipeService.get(record.recipeId);
      setWhy(null);
      setRecipe(fullRecipe);
      setSlot(record.slot);
      setPhase('result');
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }, []);

  const isHave = useCallback(
    (line: IngredientLine): boolean => {
      if (line.ingredientId && prioritizedIds.has(line.ingredientId)) return true;
      const name = line.displayName ?? line.rawText;
      return pantryCoversIngredient(name, pantryWords);
    },
    [prioritizedIds, pantryWords],
  );

  const missingLines = useMemo(
    () => (recipe ? recipe.ingredients.filter((line) => !line.isOptional && !isHave(line)) : []),
    [recipe, isHave],
  );

  const addMissingToGroceryList = useCallback(async (line: IngredientLine) => {
    const addition: CookGroceryAddition = {
      ingredientId: line.ingredientId ?? `cook:${line.rawText}`,
      displayName: line.displayName ?? line.rawText,
      neededQty: line.quantity ?? 1,
      unit: line.unit ?? '',
    };
    const next = await addCookGroceryAddition(addition);
    setAddedIds(next.map((item) => item.ingredientId));
  }, []);

  function chooseBody() {
    return (
      <View style={styles.body}>
        <Text style={uiText.subtitle}>What meal are we making?</Text>
        <View style={sharedStyles.filterRow}>
          {MEAL_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={kind.charAt(0).toUpperCase() + kind.slice(1)}
              selected={slot === kind}
              onPress={() => setSlot(kind)}
            />
          ))}
        </View>

        <Card style={styles.pantryCard}>
          <Text style={uiText.subtitle}>Cooking with what you have</Text>
          {hasPantry ? (
            <>
              <Text style={uiText.muted}>
                {prioritized.detail.length} pantry {prioritized.detail.length === 1 ? 'item' : 'items'} —
                expiring first:
              </Text>
              {prioritized.detail.slice(0, 5).map((item) => (
                <View key={item.pantryItem.id} style={styles.haveRow}>
                  <HiveIcon name="check" size={14} color={HiveColors.green} />
                  <Text style={uiText.body} numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  <Text style={uiText.small}>
                    {item.daysUntilExpiry <= 0 ? 'use now' : `${item.daysUntilExpiry}d left`}
                  </Text>
                </View>
              ))}
              {focusIngredient ? (
                <Text style={uiText.small}>Suggested for “{focusIngredient}” from your pantry.</Text>
              ) : null}
            </>
          ) : (
            <Text style={uiText.muted}>
              Your pantry is empty — add what&apos;s in your kitchen and Penny will cook from it.
            </Text>
          )}
        </Card>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <AppButton
          title="Generate my meal"
          disabled={!hasPantry || pantry.isMutating}
          onPress={() => void generate()}
        />
        {!hasPantry ? (
          <AppButton title="Add pantry items" variant="secondary" onPress={() => nav.push('addPantry')} />
        ) : null}

        {history.length > 0 ? (
          <View style={styles.historySection}>
            <Text style={uiText.subtitle}>Recently cooked</Text>
            {history.map((record) => (
              <Card key={`${record.recipeId}:${record.createdAt}`} style={styles.historyCard}>
                <View style={sharedStyles.flexOne}>
                  <Text style={sharedStyles.cardTitle} numberOfLines={1}>
                    {record.title}
                  </Text>
                  <Text style={sharedStyles.miniMuted}>
                    {record.slot.charAt(0).toUpperCase() + record.slot.slice(1)} ·{' '}
                    {new Date(record.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <AppButton title="View" variant="secondary" onPress={() => void openHistoryRecipe(record)} />
              </Card>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function generatingBody() {
    return (
      <View style={styles.centerBody}>
        <PennyImage source={pennyCookingSource} size={120} />
        <Text style={uiText.subtitle}>Let Penny cook for a minute!</Text>
        <Text style={[uiText.muted, styles.centerText]}>
          Checking your pantry and putting together a {slot} from what expires soonest.
        </Text>
        <ActivityIndicator size="large" color={HiveColors.green} />
      </View>
    );
  }

  function resultBody() {
    if (!recipe) return null;
    return (
      <View style={styles.body}>
        <View style={styles.resultHeader}>
          <Chip label={slot.charAt(0).toUpperCase() + slot.slice(1)} selected onPress={() => undefined} />
        </View>
        <Text style={uiText.title}>{recipe.title}</Text>
        {recipe.description ? <Text style={uiText.muted}>{recipe.description}</Text> : null}
        {why ? <Text style={uiText.body}>🐝 {why}</Text> : null}

        <View style={styles.metaRow}>
          {recipe.servings != null ? (
            <Text style={uiText.small}>Serves {recipe.servings}</Text>
          ) : null}
          {recipe.prepTimeMinutes != null ? (
            <Text style={uiText.small}>Prep {recipe.prepTimeMinutes} min</Text>
          ) : null}
          {recipe.cookTimeMinutes != null ? (
            <Text style={uiText.small}>Cook {recipe.cookTimeMinutes} min</Text>
          ) : null}
        </View>

        <Text style={uiText.subtitle}>Ingredients</Text>
        {recipe.ingredients.map((line) => {
          const have = isHave(line);
          return (
            <View key={line.position} style={styles.ingredientRow}>
              <HiveIcon
                name={have ? 'check' : 'cart'}
                size={16}
                color={have ? HiveColors.green : HiveColors.textSecondary}
              />
              <View style={sharedStyles.flexOne}>
                <Text style={uiText.body}>{line.displayName ?? line.rawText}</Text>
                {line.quantity != null && line.unit ? (
                  <Text style={uiText.small}>
                    {line.quantity} {line.unit}
                    {line.preparation ? `, ${line.preparation}` : ''}
                  </Text>
                ) : null}
              </View>
              <Text style={[uiText.small, have ? styles.haveBadge : styles.needBadge]}>
                {have ? 'Have it' : 'Need it'}
              </Text>
            </View>
          );
        })}

        {missingLines.length > 0 ? (
          <Card style={styles.missingCard}>
            <Text style={uiText.subtitle}>Missing from your pantry</Text>
            {missingLines.map((line) => {
              const id = line.ingredientId ?? `cook:${line.rawText}`;
              const added = addedIds.includes(id);
              return (
                <View key={line.position} style={styles.missingRow}>
                  <Text style={[uiText.body, sharedStyles.flexOne]} numberOfLines={1}>
                    {line.displayName ?? line.rawText}
                  </Text>
                  <AppButton
                    title={added ? 'Added ✓' : 'Add to grocery list'}
                    variant="secondary"
                    disabled={added}
                    onPress={() => void addMissingToGroceryList(line)}
                  />
                </View>
              );
            })}
          </Card>
        ) : (
          <Text style={uiText.muted}>Everything you need is already in your pantry. 🎉</Text>
        )}

        <Text style={uiText.subtitle}>Steps</Text>
        {recipe.instructions.map((step, index) => (
          <View key={step.step} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
            <Text style={[uiText.body, sharedStyles.flexOne]}>{step.text}</Text>
          </View>
        ))}

        <AppButton title="Generate another" variant="secondary" onPress={() => void generate()} />
      </View>
    );
  }

  return (
    <ScrollScreen>
      <AppHeader
        title="Cook What I Have"
        onBack={phase === 'result' ? () => setPhase('choose') : nav.back}
        onAvatar={() => nav.push('account')}
        profileImageUri={app.profile.profileImageUri}
      />
      {phase === 'choose' ? (
        chooseBody()
      ) : phase === 'generating' ? (
        generatingBody()
      ) : (
        resultBody()
      )}
      <ModalSheet visible={limitGate !== null} onClose={() => setLimitGate(null)}>
        {limitGate ? <AiLimitGate usage={limitGate} onClose={() => setLimitGate(null)} /> : null}
      </ModalSheet>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 14, paddingBottom: 32 },
  centerBody: { alignItems: 'center', gap: 14, paddingVertical: 48, paddingHorizontal: 32 },
  centerText: { textAlign: 'center' },
  pantryCard: { gap: 8 },
  haveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { ...uiText.muted, color: HiveColors.danger },
  historySection: { gap: 10, marginTop: 4 },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultHeader: { flexDirection: 'row' },
  metaRow: { flexDirection: 'row', gap: 16 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  haveBadge: { color: HiveColors.green, fontWeight: '700' },
  needBadge: { color: HiveColors.textSecondary, fontWeight: '700' },
  missingCard: { gap: 10 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepRow: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: HiveColors.greenLight,
    color: HiveColors.green,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '800',
  },
});
