/**
 * Assign hand-picked recipes to days and meal categories.
 *
 * This is the step between "Choose My Recipes" and the grocery list: the user
 * has picked what they want to cook, and now says when. The result is the same
 * `MealPlan` shape Penny produces, so the plan page and the grocery list do not
 * care which path the meals came from.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Chip, EmptyState, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { mealTypeLabel, PLANNABLE_MEAL_TYPES, type PlannableMealType } from '@/features/meals/meal-enums';
import { recipeService } from '@/features/meals/recipe-service';
import type { Recipe } from '@/features/meals/recipe-model';
import { describeError } from '@/services/api-error';

type Assignment = { recipeId: string; day: number; mealType: PlannableMealType };

export function AssignRecipesScreen() {
  const router = useRouter();
  const { selectedRecipeIds, request } = useMealPlan();

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
            day: index + 1,
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

  if (recipes.length === 0) {
    return (
      <ScrollScreen>
        <AppHeader title="Plan your week" onBack={router.back} />
        <View style={styles.stateBody}>
          <EmptyState
            icon="fork"
            title="No recipes picked yet"
            subtitle="Choose a few recipes and you can assign them to days here."
          />
          <AppButton title="Browse recipes" onPress={() => router.replace('/meals/build')} />
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
                {PLANNABLE_MEAL_TYPES.map((mealType) => (
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

        <View style={styles.actions}>
          <AppButton title="Build my grocery list" onPress={() => router.push('/meals/grocery-list')} />
        </View>
      </View>
    </ScrollScreen>
  );
}

/** Uses the recipe's own meal types when it has them, so nothing lands oddly. */
function defaultMealType(recipe: Recipe): PlannableMealType {
  const match = PLANNABLE_MEAL_TYPES.find((type) => recipe.mealTypes.includes(type));
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
});
