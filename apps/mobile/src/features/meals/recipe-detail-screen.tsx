/**
 * Recipe detail.
 *
 * Renders the Standard HTH Recipe Object as-is. Where the source never stated a
 * quantity, a time, or a serving count, the screen says so rather than showing a
 * plausible-looking number — the spec forbids inventing any of it.
 */
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { recipeService } from '@/features/meals/recipe-service';
import { isIncomplete, type Recipe } from '@/features/meals/recipe-model';
import { describeError } from '@/services/api-error';

export function RecipeDetailScreen() {
  const router = useRouter();
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const { selectedRecipeIds, toggleRecipe } = useMealPlan();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  // Starts loading only when there is an id to load; a missing id is a render-
  // time fact, not something to discover in an effect.
  const [isLoading, setIsLoading] = useState(Boolean(recipeId));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!recipeId) return;
    let cancelled = false;

    async function load(id: string) {
      try {
        const loaded = await recipeService.get(id);
        if (!cancelled) setRecipe(loaded);
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load(recipeId);
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  if (isLoading) {
    return (
      <ScrollScreen>
        <AppHeader title="Recipe" onBack={router.back} />
        <View style={styles.stateBody}>
          <ActivityIndicator size="large" color={HiveColors.green} />
        </View>
      </ScrollScreen>
    );
  }

  if (error || !recipe) {
    const { message, retryable } = recipeId
      ? describeError(error)
      : { message: "We didn't get a recipe to open.", retryable: false };
    return (
      <ScrollScreen>
        <AppHeader title="Recipe" onBack={router.back} />
        <View style={styles.stateBody}>
          <Text style={uiText.subtitle}>We couldn&apos;t load that recipe</Text>
          <Text style={uiText.muted}>{message}</Text>
          {retryable ? <AppButton title="Go back" onPress={router.back} /> : null}
        </View>
      </ScrollScreen>
    );
  }

  const selected = selectedRecipeIds.includes(recipe.recipeId);
  const meta = [
    recipe.totalTimeMinutes ? `${recipe.totalTimeMinutes} min total` : null,
    recipe.servings ? `${recipe.servings} servings` : null,
    recipe.cuisine,
  ].filter(Boolean);

  return (
    <ScrollScreen>
      <AppHeader title={recipe.title} onBack={router.back} />
      <View style={styles.body}>
        {recipe.description ? <Text style={uiText.body}>{recipe.description}</Text> : null}
        {meta.length > 0 ? <Text style={uiText.small}>{meta.join(' · ')}</Text> : null}

        {isIncomplete(recipe) ? (
          <Card style={styles.warning}>
            <Text style={uiText.body}>Some details are missing</Text>
            <Text style={uiText.muted}>
              The source didn&apos;t give us everything, so we left those parts blank rather than
              guessing. You can still cook this — it just won&apos;t be planned automatically.
            </Text>
            {recipe.missingInformation.map((note) => (
              <Text key={note} style={uiText.small}>
                • {note}
              </Text>
            ))}
          </Card>
        ) : null}

        <Text style={uiText.subtitle}>Ingredients</Text>
        <View style={styles.list}>
          {recipe.ingredients.map((line) => (
            <View key={line.position} style={styles.listRow}>
              <Text style={uiText.body}>
                {line.quantity !== null && line.unit
                  ? `${line.quantity} ${line.unit} · `
                  : ''}
                {line.displayName ?? line.rawText}
                {line.isOptional ? ' (optional)' : ''}
                {line.isToTaste ? ' (to taste)' : ''}
              </Text>
              {line.missingInformation ? (
                <Text style={styles.missingNote}>{line.missingInformation}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <Text style={uiText.subtitle}>Instructions</Text>
        <View style={styles.list}>
          {recipe.instructions.map((step) => (
            <View key={step.step} style={styles.listRow}>
              <Text style={uiText.body}>
                {step.step}. {step.text}
              </Text>
            </View>
          ))}
        </View>

        {recipe.sourceUrl ? <Text style={uiText.small}>Source: {recipe.sourceUrl}</Text> : null}
        {recipe.attributionText ? <Text style={uiText.small}>{recipe.attributionText}</Text> : null}

        <View style={styles.actions}>
          <AppButton
            title={selected ? 'Remove from my plan' : 'Add to my plan'}
            variant={selected ? 'secondary' : 'primary'}
            onPress={() => toggleRecipe(recipe.recipeId)}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  stateBody: { paddingVertical: Spacing.five, paddingHorizontal: Spacing.three, gap: Spacing.three, alignItems: 'center' },
  warning: { gap: Spacing.one },
  list: { gap: Spacing.two },
  listRow: { gap: 2 },
  missingNote: { color: HiveColors.warningText, fontSize: 12, lineHeight: 17 },
  actions: { gap: Spacing.two, marginTop: Spacing.four },
});
