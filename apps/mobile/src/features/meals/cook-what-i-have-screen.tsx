/**
 * Cook What I Have — Generate a Meal, from Marcos's SwiftUI GenerateMealSheet.
 *
 * Same screens, same flow, same copy as the Swift: pick Breakfast / Lunch /
 * Dinner -> "Let Penny cook for a minute!" -> the recipe result with "From
 * your Pantry + Fridge" and "You'll need to buy" sections, plus the
 * limit-reached view.
 *
 * What did NOT change underneath: generation still calls the real meal-plan
 * backend (`generateMealPlan` with days: 1, one meal slot, and the real
 * `use_what_i_have` cooking style) on the user's saved questionnaire
 * preferences. The Swift's mock generation is design reference only — the
 * recipes here are real. The single-meal allowance still comes from the
 * shared ai-usage-limits counters, and every success is saved to the cook
 * history.
 *
 * Locked rules: B/L/D only (snacks deferred — no snack option here), kids
 * count as full servings (the questionnaire household already encodes that).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  HiveIcon,
  type HiveIconName,
  ModalSheet,
  PennyImage,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
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
const MEAL_KINDS: { kind: MealKind; icon: HiveIconName; accent: string }[] = [
  { kind: 'breakfast', icon: 'sunrise', accent: HiveColors.orange },
  { kind: 'lunch', icon: 'sun', accent: HiveColors.green },
  { kind: 'dinner', icon: 'moon', accent: HiveColors.blue },
];

type Phase = 'choose' | 'generating' | 'result' | 'limit';

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
  const [resultSaved, setResultSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [limitUsage, setLimitUsage] = useState<AiUsage | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
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

  // Plain function, no manual useCallback: the React Compiler memoizes it
  // automatically, and a manual memoization here blocks compilation.
  async function generate() {
    setError('');
    // The gate fires AT the limit — checked before any AI work is requested.
    if (!(await hasAiUsageRemaining('single_meal'))) {
      setLimitUsage(await getAiUsage('single_meal'));
      setPhase('limit');
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
      setResultSaved(false);
      // The AI work succeeded — this is what consumes the allowance. Saving
      // to the cook history is the user's explicit choice on the result
      // screen's "Save Recipe" button.
      await recordAiUsage('single_meal');
      setPhase('result');
    } catch (caught) {
      setError(describeError(caught).message);
      setPhase('choose');
    }
  }

  async function saveRecipe() {
    if (!recipe || resultSaved || saving) return;
    setSaving(true);
    try {
      const nextHistory = await saveCookedMeal({
        recipeId: recipe.recipeId,
        title: recipe.title,
        slot,
        pantryIngredientIds: prioritized.ingredientIds,
      });
      setHistory(nextHistory);
      setResultSaved(true);
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setSaving(false);
    }
  }

  const openHistoryRecipe = useCallback(async (record: CookedMealRecord) => {
    setError('');
    try {
      const fullRecipe = await recipeService.get(record.recipeId);
      setWhy(null);
      setRecipe(fullRecipe);
      setSlot(record.slot);
      setResultSaved(true);
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

  const haveLines = useMemo(() => (recipe ? recipe.ingredients.filter((line) => isHave(line)) : []), [recipe, isHave]);
  const missingLines = useMemo(
    () => (recipe ? recipe.ingredients.filter((line) => !line.isOptional && !isHave(line)) : []),
    [recipe, isHave],
  );

  const addMissingToGroceryList = useCallback(async (line: IngredientLine) => {
    const next = await addCookGroceryAddition({
      ingredientId: line.ingredientId ?? `cook:${line.rawText}`,
      displayName: line.displayName ?? line.rawText,
      neededQty: line.quantity ?? 1,
      unit: line.unit ?? '',
    });
    setAddedIds(next.map((item) => item.ingredientId));
  }, []);

  function chooseBody() {
    return (
      <View style={styles.body}>
        <Text style={styles.bigTitle}>What are you making?</Text>
        <Text style={uiText.muted}>
          Penny will build one recipe from what&apos;s in your Pantry + Fridge — using up ingredients that
          expire soon first.
        </Text>

        {MEAL_KINDS.map(({ kind, icon, accent }) => {
          const selected = slot === kind;
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setSlot(kind)}
              style={[styles.mealCard, selected && styles.mealCardSelected]}>
              <HiveIcon name={icon} size={20} color={accent} />
              <Text style={[styles.mealCardText, sharedStyles.flexOne]}>
                {kind.charAt(0).toUpperCase() + kind.slice(1)}
              </Text>
              {selected ? <HiveIcon name="checkCircle" size={20} color={HiveColors.green} /> : null}
            </Pressable>
          );
        })}

        {pantry.expiringItems.length > 0 ? (
          <View style={styles.expiringNote}>
            <Text style={styles.expiringBee}>🐝</Text>
            <Text style={[uiText.small, sharedStyles.flexOne, styles.expiringNoteText]}>
              {pantry.expiringItems.length} item{pantry.expiringItems.length === 1 ? '' : 's'} expiring
              soon — Penny will try to use them first.
            </Text>
          </View>
        ) : null}

        {focusIngredient ? (
          <Text style={uiText.small}>Suggested for “{focusIngredient}” from your pantry.</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <AppButton
          title="Generate My Meal 🐝"
          disabled={!hasPantry || pantry.isMutating}
          onPress={() => void generate()}
        />
        {!hasPantry ? (
          <>
            <Text style={[uiText.muted, sharedStyles.centerText]}>
              Your pantry is empty — add what&apos;s in your kitchen and Penny will cook from it.
            </Text>
            <AppButton title="Add pantry items" variant="secondary" onPress={() => nav.push('addPantry')} />
          </>
        ) : null}

        {history.length > 0 ? (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Your Saved Recipes</Text>
            {history.slice(0, 5).map((record) => (
              <Pressable
                key={`${record.recipeId}:${record.createdAt}`}
                accessibilityRole="button"
                onPress={() => void openHistoryRecipe(record)}
                style={styles.historyRow}>
                <HiveIcon name="fork" size={14} color={HiveColors.green} />
                <Text style={[uiText.body, sharedStyles.flexOne]} numberOfLines={1}>
                  {record.title}
                </Text>
                <Text style={uiText.small}>{record.slot.charAt(0).toUpperCase() + record.slot.slice(1)}</Text>
                <HiveIcon name="next" size={12} color={HiveColors.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function generatingBody() {
    return (
      <View style={styles.centerBody}>
        <View style={styles.pennyCircle}>
          <PennyImage source={pennyCookingSource} size={70} />
        </View>
        <Text style={styles.bigTitle}>Let Penny cook for a minute!</Text>
        <Text style={[uiText.muted, sharedStyles.centerText]}>Checking your Pantry + Fridge…</Text>
        <ActivityIndicator size="large" color={HiveColors.green} />
      </View>
    );
  }

  function resultBody() {
    if (!recipe) return null;
    const totalMinutes = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
    return (
      <View style={styles.body}>
        <Text style={styles.bigTitle}>{recipe.title}</Text>

        <View style={styles.metaRow}>
          {totalMinutes > 0 ? (
            <View style={styles.metaItem}>
              <HiveIcon name="clock" size={14} color={HiveColors.textSecondary} />
              <Text style={uiText.small}>{totalMinutes} min</Text>
            </View>
          ) : null}
          {recipe.servings != null ? (
            <View style={styles.metaItem}>
              <HiveIcon name="user" size={14} color={HiveColors.textSecondary} />
              <Text style={uiText.small}>{recipe.servings} servings</Text>
            </View>
          ) : null}
        </View>

        {why ? <Text style={uiText.body}>🐝 {why}</Text> : null}

        {haveLines.length > 0 ? (
          <View style={styles.haveCard}>
            <Text style={styles.haveTitle}>From your Pantry + Fridge</Text>
            {haveLines.map((line) => (
              <View key={line.position} style={styles.haveRow}>
                <HiveIcon name="checkCircle" size={14} color={HiveColors.green} />
                <Text style={uiText.body}>{line.displayName ?? line.rawText}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {missingLines.length > 0 ? (
          <View style={styles.buyCard}>
            <Text style={styles.buyTitle}>You&apos;ll need to buy</Text>
            {missingLines.map((line) => {
              const id = line.ingredientId ?? `cook:${line.rawText}`;
              const added = addedIds.includes(id);
              return (
                <View key={line.position} style={styles.buyRow}>
                  <HiveIcon name="cart" size={14} color={HiveColors.orange} />
                  <Text style={[uiText.body, sharedStyles.flexOne]} numberOfLines={1}>
                    {line.displayName ?? line.rawText}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={added}
                    onPress={() => void addMissingToGroceryList(line)}
                    hitSlop={8}>
                    <Text style={[styles.addToList, added && styles.addedToList]}>
                      {added ? 'Added' : 'Add to list'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={uiText.muted}>Everything you need is already in your pantry. 🎉</Text>
        )}

        <Text style={styles.sectionTitle}>Ingredients</Text>
        <View style={styles.bulletList}>
          {recipe.ingredients.map((line) => (
            <View key={line.position} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[uiText.body, sharedStyles.flexOne]}>{line.displayName ?? line.rawText}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Instructions</Text>
        <View style={styles.stepsList}>
          {recipe.instructions.map((step, index) => (
            <View key={step.step} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={[uiText.body, sharedStyles.flexOne]}>{step.text}</Text>
            </View>
          ))}
        </View>

        <AppButton
          title={saving ? 'Saving…' : resultSaved ? 'Saved to Your Recipes' : 'Save Recipe'}
          disabled={resultSaved || saving}
          onPress={() => void saveRecipe()}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => void generate()}
          style={styles.tryDifferentWrap}>
          <Text style={styles.tryDifferent}>Try a Different Recipe</Text>
        </Pressable>
      </View>
    );
  }

  function limitBody() {
    return (
      <View style={styles.centerBody}>
        <View style={styles.pennyCircle}>
          <PennyImage source={pennyCookingSource} size={70} />
        </View>
        <Text style={[styles.bigTitle, sharedStyles.centerText]}>You&apos;ve used your free{'\n'}meals this month</Text>
        <Text style={[uiText.muted, sharedStyles.centerText]}>
          Free members get {limitUsage?.limit ?? ''} pantry meal generations each month.
        </Text>
        <AppButton title="See Premium Options" onPress={() => setPaywallOpen(true)} style={styles.fullWidth} />
      </View>
    );
  }

  return (
    <ScrollScreen>
      <AppHeader
        title="Generate a Meal"
        onBack={phase === 'result' || phase === 'limit' ? () => setPhase('choose') : nav.back}
        onAvatar={() => nav.push('account')}
        profileImageUri={app.profile.profileImageUri}
      />
      {phase === 'choose' ? chooseBody() : null}
      {phase === 'generating' ? generatingBody() : null}
      {phase === 'result' ? resultBody() : null}
      {phase === 'limit' ? limitBody() : null}
      <ModalSheet visible={paywallOpen} onClose={() => setPaywallOpen(false)}>
        {limitUsage ? (
          <AiLimitGate usage={limitUsage} onClose={() => setPaywallOpen(false)} />
        ) : null}
      </ModalSheet>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 14, paddingBottom: 32 },
  bigTitle: { color: HiveColors.text, fontSize: 24, fontWeight: '800' },
  centerBody: { alignItems: 'center', gap: 14, paddingVertical: 48, paddingHorizontal: 32 },
  pennyCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { ...uiText.muted, color: HiveColors.danger },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HiveColors.border,
    padding: 14,
  },
  mealCardSelected: {
    backgroundColor: HiveColors.greenLight,
    borderColor: HiveColors.green,
  },
  mealCardText: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  expiringNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: HiveColors.orangeBanner,
    borderRadius: 10,
    padding: 10,
  },
  expiringBee: { fontSize: 14 },
  expiringNoteText: { color: '#8C5A00', fontSize: 12 },
  historySection: { gap: 8, marginTop: 4 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HiveColors.card,
    borderRadius: 10,
    padding: 10,
  },
  sectionTitle: { color: HiveColors.text, fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  haveCard: {
    gap: 8,
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
    padding: 12,
  },
  haveTitle: { color: HiveColors.green, fontSize: 14, fontWeight: '700' },
  haveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buyCard: {
    gap: 8,
    backgroundColor: HiveColors.orangeSoft,
    borderRadius: 12,
    padding: 12,
  },
  buyTitle: { color: HiveColors.orange, fontSize: 14, fontWeight: '700' },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addToList: { color: HiveColors.green, fontSize: 13, fontWeight: '700' },
  addedToList: { color: HiveColors.textSecondary, fontWeight: '500' },
  bulletList: { gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: HiveColors.green, marginTop: 7 },
  stepsList: { gap: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: HiveColors.white, fontSize: 12, fontWeight: '700' },
  tryDifferentWrap: { alignItems: 'center' },
  tryDifferent: {
    color: HiveColors.green,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
});
