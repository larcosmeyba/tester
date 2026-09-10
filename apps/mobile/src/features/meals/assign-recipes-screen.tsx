/**
 * Assign hand-picked recipes to days and meal categories.
 *
 * This is the step between "Choose My Recipes" (or social import) and the
 * week: the user has picked what they want to cook, and now says when.
 * Finishing publishes the assignments into the shared `MealPlan`, so the
 * week calendar and the grocery list treat them exactly like an AI plan.
 *
 * Product rule: breakfast, lunch and dinner only — snacks are deferred.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Chip, EmptyState, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { useMealPlan, type PublishedMeal } from '@/features/meals/meal-plan-context';
import { mealTypeLabel, PLANNABLE_MEAL_TYPES } from '@/features/meals/meal-enums';
import { recipeService } from '@/features/meals/recipe-service';
import type { Recipe } from '@/features/meals/recipe-model';
import { describeError } from '@/services/api-error';

/** Snacks are deferred — only breakfast, lunch and dinner can be assigned. */
const ASSIGNABLE_MEAL_TYPES = PLANNABLE_MEAL_TYPES.filter((type) => type !== 'snack');
type AssignableMealType = (typeof ASSIGNABLE_MEAL_TYPES)[number];

type Assignment = { recipeId: string; day: number; mealType: AssignableMealType };

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  other: 'Video',
};

export function AssignRecipesScreen() {
  const router = useRouter();
  const { selectedRecipeIds, request, importedLinks, publishAssignments } = useMealPlan();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loaded = await Promise.all(selectedRecipeIds.map((id) => recipeService.get(id)));
        if (cancelled) return;
        setRecipes(loaded);
        // Seed a sensible default: one recipe per day, as a dinner.
        setAssignments(
          loaded.map((recipe, index) => ({
            recipeId: recipe.recipeId,
            day: Math.min(index + 1, request.days),
            mealType: defaultMealType(recipe),
          }))
        );
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // `request.days` is read once when the recipes load; re-running on every
    // questionnaire tweak would wipe the user's assignments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipeIds]);

  const setAssignment = useCallback((recipeId: string, patch: Partial<Assignment>) => {
    setAssignments((current) =>
      current.map((item) => (item.recipeId === recipeId ? { ...item, ...patch } : item))
    );
  }, []);

  const dayOptions = useMemo(
    () => Array.from({ length: request.days }, (_, index) => index + 1),
    [request.days]
  );

  const finish = useCallback(() => {
    const byId = new Map(recipes.map((recipe) => [recipe.recipeId, recipe]));
    const published: PublishedMeal[] = assignments.flatMap((assignment) => {
      const recipe = byId.get(assignment.recipeId);
      if (!recipe) return [];
      return [
        {
          recipeId: recipe.recipeId,
          title: recipe.title,
          day: assignment.day,
          mealType: assignment.mealType,
          totalTimeMinutes: recipe.totalTimeMinutes,
          servings: recipe.servings ?? request.household.size,
        },
      ];
    });
    publishAssignments(published);
    router.replace('/meals/plan');
  }, [assignments, recipes, publishAssignments, request.household.size, router]);

  if (isLoading) {
    return (
      <ScrollScreen>
        <AppHeader title="Plan your week" onBack={router.back} />
        <View style={styles.stateBody}>
          <ActivityIndicator size="large" color={HiveColors.green} />
        </View>
      </ScrollScreen>
    );
  }

  if (error) {
    const { message, retryable } = describeError(error);
    return (
      <ScrollScreen>
        <AppHeader title="Plan your week" onBack={router.back} />
        <View style={styles.stateBody}>
          <Text style={uiText.subtitle}>We couldn&apos;t load those recipes</Text>
          <Text style={uiText.muted}>{message}</Text>
          {retryable ? <AppButton title="Try again" onPress={() => router.replace('/meals/assign')} /> : null}
        </View>
      </ScrollScreen>
    );
  }

  if (recipes.length === 0 && importedLinks.length === 0) {
    return (
      <ScrollScreen>
        <AppHeader title="Plan your week" onBack={router.back} />
        <View style={styles.stateBody}>
          <EmptyState
            icon="fork"
            title="No recipes picked yet"
            subtitle="Choose a few recipes and you can assign them to days here."
          />
          <AppButton title="Browse recipes" onPress={() => router.replace('/meals/database')} />
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <AppHeader title="Plan your week" onBack={router.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          Put each recipe on a day. You can move meals around later without rebuilding the plan.
        </Text>

        {recipes.map((recipe) => {
          const assignment = assignments.find((item) => item.recipeId === recipe.recipeId);
          if (!assignment) return null;
          return (
            <View key={recipe.recipeId} style={styles.card}>
              <Text style={uiText.body}>{recipe.title}</Text>

              <Text style={uiText.small}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {dayOptions.map((day) => (
                  <Chip
                    key={day}
                    label={`Day ${day}`}
                    selected={assignment.day === day}
                    onPress={() => setAssignment(recipe.recipeId, { day })}
                  />
                ))}
              </ScrollView>

              <Text style={uiText.small}>Meal</Text>
              <View style={styles.chipRow}>
                {ASSIGNABLE_MEAL_TYPES.map((mealType) => (
                  <Chip
                    key={mealType}
                    label={mealTypeLabel(mealType)}
                    selected={assignment.mealType === mealType}
                    onPress={() => setAssignment(recipe.recipeId, { mealType })}
                  />
                ))}
              </View>
            </View>
          );
        })}

        {importedLinks.length > 0 ? (
          <View style={styles.importedSection}>
            <View style={styles.importedHeader}>
              <HiveIcon name="play" size={18} color={HiveColors.greenDark} />
              <Text style={styles.importedTitle}>Imported from social media</Text>
            </View>
            <Text style={uiText.small}>
              These join your week as soon as transcription finishes.
            </Text>
            {importedLinks.map((link) => (
              <View key={link.url} style={styles.importedCard}>
                <Text style={styles.importedPlatform}>
                  {PLATFORM_LABELS[link.platform] ?? 'Video'}
                  <Text style={styles.importedProvenance}>
                    {'  ·  '}
                    {link.provenance === 'clipboard' ? 'From clipboard' : 'Pasted'}
                  </Text>
                </Text>
                <Text style={uiText.small} numberOfLines={1}>
                  {link.url}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <AppButton title="Save to my week" onPress={finish} disabled={assignments.length === 0} />
        </View>
      </View>
    </ScrollScreen>
  );
}

/** Uses the recipe's own meal types when it has them, so nothing lands oddly. */
function defaultMealType(recipe: Recipe): AssignableMealType {
  const match = ASSIGNABLE_MEAL_TYPES.find((type) => recipe.mealTypes.includes(type));
  return match ?? 'dinner';
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  stateBody: { paddingVertical: Spacing.five, gap: Spacing.three, alignItems: 'center', paddingHorizontal: Spacing.three },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
  importedSection: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  importedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  importedTitle: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  importedCard: {
    gap: 4,
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.card,
    opacity: 0.9,
  },
  importedPlatform: {
    color: HiveColors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  importedProvenance: {
    color: HiveColors.textSecondary,
    fontWeight: '500',
  },
});
