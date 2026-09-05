/**
 * Choose My Recipes — browse the library, filter it, pick what you want.
 *
 * The selected recipes go through the same pipeline as a Penny-generated plan:
 * one recipe model, one consolidation engine, one grocery list. Nothing here
 * builds a second path.
 *
 * Recipes the engine cannot plan automatically (a source that never stated a
 * quantity, say) are still shown — they are just marked, because the spec says
 * incomplete recipes stay viewable and never get auto-planned.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Chip, EmptyState, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { recipeService } from '@/features/meals/recipe-service';
import { isIncomplete, type Recipe } from '@/features/meals/recipe-model';
import { describeError } from '@/services/api-error';

/** Doc 02 §6 — the filter panel's tag map. */
const FILTERS: { tagId: string; label: string }[] = [
  { tagId: 'meal.breakfast', label: 'Breakfast' },
  { tagId: 'meal.lunch', label: 'Lunch' },
  { tagId: 'meal.dinner', label: 'Dinner' },
  { tagId: 'diet.vegan', label: 'Vegan' },
  { tagId: 'diet.vegetarian', label: 'Vegetarian' },
  { tagId: 'diet.gluten_free', label: 'Gluten Free' },
  { tagId: 'diet.dairy_free', label: 'Dairy Free' },
  { tagId: 'nutrition.high_protein', label: 'High Protein' },
  { tagId: 'time.30_min', label: 'Under 30 Minutes' },
  { tagId: 'method.one_pot', label: 'One Pot' },
];

export function RecipeBrowser() {
  const router = useRouter();
  const { selectedRecipeIds, toggleRecipe } = useMealPlan();

  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (tagIds: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      setRecipes(await recipeService.list({ tagIds }));
    } catch (caught) {
      setError(caught);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrapped so no setState runs synchronously in the effect body.
    void (async () => {
      await load(activeTags);
    })();
  }, [load, activeTags]);

  const toggleFilter = useCallback((tagId: string) => {
    setActiveTags((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    );
  }, []);

  const selectedCount = selectedRecipeIds.length;

  const body = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.stateBody}>
          <ActivityIndicator size="large" color={HiveColors.green} />
        </View>
      );
    }

    if (error) {
      const { message, retryable } = describeError(error);
      return (
        <View style={styles.stateBody}>
          <Text style={uiText.subtitle}>We couldn&apos;t load the recipes</Text>
          <Text style={uiText.muted}>{message}</Text>
          {retryable ? <AppButton title="Try again" onPress={() => void load(activeTags)} /> : null}
        </View>
      );
    }

    if (recipes.length === 0) {
      return (
        <View style={styles.stateBody}>
          <EmptyState
            icon="fork"
            title="Nothing matches those filters"
            subtitle="Try removing one to see more recipes."
          />
        </View>
      );
    }

    return (
      <View style={styles.list}>
        {recipes.map((recipe) => (
          <RecipeRow
            key={recipe.recipeId}
            recipe={recipe}
            selected={selectedRecipeIds.includes(recipe.recipeId)}
            onToggle={() => toggleRecipe(recipe.recipeId)}
            onOpen={() => router.push(`/meals/recipe/${recipe.recipeId}`)}
          />
        ))}
      </View>
    );
  }, [isLoading, error, recipes, selectedRecipeIds, toggleRecipe, router, load, activeTags]);

  return (
    <ScrollScreen>
      <AppHeader title="Choose recipes" onBack={router.back} />
      <View style={styles.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((filter) => (
            <Chip
              key={filter.tagId}
              label={filter.label}
              selected={activeTags.includes(filter.tagId)}
              onPress={() => toggleFilter(filter.tagId)}
            />
          ))}
        </ScrollView>

        {body}

        {selectedCount > 0 ? (
          <View style={styles.actions}>
            <AppButton
              title={`Continue with ${selectedCount} ${selectedCount === 1 ? 'recipe' : 'recipes'}`}
              onPress={() => router.push('/meals/assign')}
            />
          </View>
        ) : null}
      </View>
    </ScrollScreen>
  );
}

function RecipeRow({
  recipe,
  selected,
  onToggle,
  onOpen,
}: {
  recipe: Recipe;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const incomplete = isIncomplete(recipe);

  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${recipe.title}`}
        onPress={onOpen}
        style={styles.flexOne}>
        <Text style={uiText.body}>{recipe.title}</Text>
        <Text style={uiText.small}>
          {[
            recipe.totalTimeMinutes ? `${recipe.totalTimeMinutes} min` : null,
            recipe.servings ? `${recipe.servings} servings` : null,
            recipe.cuisine ?? null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {incomplete ? (
          <Text style={styles.incompleteNote}>
            Missing some details — you can still cook it, but Penny won&apos;t auto-plan it.
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={selected ? `Remove ${recipe.title}` : `Add ${recipe.title}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.addButton, selected && styles.addButtonSelected, pressed && styles.pressed]}>
        <HiveIcon
          name={selected ? 'check' : 'plus'}
          size={16}
          color={selected ? HiveColors.white : HiveColors.green}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  stateBody: { paddingVertical: Spacing.five, gap: Spacing.three, alignItems: 'center' },
  filterRow: { gap: Spacing.two, paddingVertical: Spacing.one },
  list: { gap: Spacing.two },
  flexOne: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  rowSelected: { borderColor: HiveColors.green },
  incompleteNote: { color: HiveColors.warningText, fontSize: 12, lineHeight: 17, marginTop: 2 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: HiveColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonSelected: { backgroundColor: HiveColors.green },
  pressed: { opacity: 0.7 },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
