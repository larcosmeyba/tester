/**
 * Recipe Database — browse budget-friendly, EBT-approved recipes (iOS layout).
 *
 * Search, All/Breakfast/Lunch/Dinner filters, and rows with image, time,
 * servings, estimated price and a meal chip. Data is Spoonacular-shaped
 * (`MOCK_SPOONACULAR_CATALOG`) converted to the one shared Recipe model, so
 * picks flow through the same pipeline as everything else: assign → week →
 * grocery list.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, AppHeader, EmptyState, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { MOCK_SPOONACULAR_CATALOG } from '@/features/meals/mock/spoonacular-catalog';
import { registerMockRecipes } from '@/features/meals/mock/mock-recipe-service';
import {
  spoonacularMealType,
  spoonacularToRecipe,
  type SpoonacularRecipe,
} from '@/features/meals/spoonacular-types';

type MealFilter = 'all' | 'breakfast' | 'lunch' | 'dinner';

const FILTERS: { key: MealFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

const MEAL_CHIP_TINTS: Record<'breakfast' | 'lunch' | 'dinner', { background: string; text: string }> = {
  breakfast: { background: '#FFF3E2', text: '#D97A1F' },
  lunch: { background: '#E9F7EF', text: '#1E7A3C' },
  dinner: { background: '#E7F0FE', text: '#2F7CF6' },
};

function servingsLabel(servings: number): string {
  return servings === 1 ? '1 serving' : `${servings} servings`;
}

function priceLabel(pricePerServingUsd: number | null): string {
  return pricePerServingUsd === null ? 'Est. —' : `Est. $${pricePerServingUsd.toFixed(2)}`;
}

function RecipeRow({
  recipe,
  selected,
  onToggle,
}: {
  recipe: SpoonacularRecipe;
  selected: boolean;
  onToggle: () => void;
}) {
  const mealType = spoonacularMealType(recipe.dishTypes);
  const tint = MEAL_CHIP_TINTS[mealType];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={recipe.title}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}>
      <View style={styles.thumb}>
        {recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.thumbImage} accessibilityLabel="" />
        ) : (
          <HiveIcon name="fork" size={30} color="#E8A04C" />
        )}
        {selected ? (
          <View style={styles.checkBadge}>
            <HiveIcon name="check" size={14} color={HiveColors.white} />
          </View>
        ) : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{recipe.title}</Text>
        <Text style={styles.rowMeta}>
          {recipe.readyInMinutes !== null ? `${recipe.readyInMinutes} min` : '—'}
          {'  ·  '}
          {servingsLabel(recipe.servings)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowPrice}>{priceLabel(recipe.pricePerServingUsd)}</Text>
        <View style={[styles.mealChip, { backgroundColor: tint.background }]}>
          <Text style={[styles.mealChipText, { color: tint.text }]}>
            {mealType === 'breakfast' ? 'Breakfast' : mealType === 'lunch' ? 'Lunch' : 'Dinner'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function RecipeBrowser() {
  const router = useRouter();
  const { selectedRecipeIds, toggleRecipe, clearSelectedRecipes } = useMealPlan();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MealFilter>('all');

  // One shared model: converted records resolve in recipeService.get() so the
  // assign screen and grocery pipeline work unchanged.
  useEffect(() => {
    registerMockRecipes(MOCK_SPOONACULAR_CATALOG.map(spoonacularToRecipe));
  }, []);

  const recipes = useMemo(() => {
    const search = query.trim().toLowerCase();
    return MOCK_SPOONACULAR_CATALOG.filter((recipe) => {
      if (filter !== 'all' && spoonacularMealType(recipe.dishTypes) !== filter) return false;
      if (search.length > 0 && !recipe.title.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [query, filter]);

  const toggle = (recipe: SpoonacularRecipe) => {
    toggleRecipe(spoonacularToRecipe(recipe).recipeId);
  };

  const selectedCount = selectedRecipeIds.length;

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Recipe Database" onBack={router.back} />
      <View style={styles.body}>
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes..."
            placeholderTextColor={HiveColors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search recipes"
          />
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((entry) => {
            const active = filter === entry.key;
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter: ${entry.label}`}
                onPress={() => setFilter(entry.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  active ? styles.filterChipActive : styles.filterChipInactive,
                  pressed && styles.pressed,
                ]}>
                <Text style={active ? styles.filterLabelActive : styles.filterLabelInactive}>
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {recipes.length === 0 ? (
          <EmptyState
            icon="fork"
            title="No recipes found"
            subtitle="Try a different search or meal filter."
          />
        ) : (
          <View style={styles.list}>
            {recipes.map((recipe) => {
              const recipeId = spoonacularToRecipe(recipe).recipeId;
              return (
                <RecipeRow
                  key={recipe.id}
                  recipe={recipe}
                  selected={selectedRecipeIds.includes(recipeId)}
                  onToggle={() => toggle(recipe)}
                />
              );
            })}
          </View>
        )}
      </View>

      {selectedCount > 0 ? (
        <View style={styles.footer}>
          <AppButton
            title={`Continue (${selectedCount})`}
            onPress={() => router.push('/meals/assign')}
          />
          <Pressable onPress={clearSelectedRecipes} accessibilityRole="button" accessibilityLabel="Clear selection">
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  searchWrap: {
    backgroundColor: HiveColors.card,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
    justifyContent: 'center',
  },
  searchInput: {
    color: HiveColors.text,
    fontSize: 16,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterChip: {
    borderRadius: Radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  filterChipActive: {
    backgroundColor: HiveColors.greenDark,
  },
  filterChipInactive: {
    backgroundColor: HiveColors.card,
  },
  filterLabelActive: {
    color: HiveColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  filterLabelInactive: {
    color: HiveColors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  pressed: { opacity: 0.7 },
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: Radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowSelected: {
    borderColor: HiveColors.green,
    backgroundColor: HiveColors.greenLight,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radii.lg,
    backgroundColor: '#FFF3E2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: HiveColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  rowTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  rowMeta: {
    color: HiveColors.textSecondary,
    fontSize: 14,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  rowPrice: {
    color: HiveColors.greenDark,
    fontSize: 16,
    fontWeight: '800',
  },
  mealChip: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  mealChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    alignItems: 'center',
  },
  clearLabel: {
    color: HiveColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
