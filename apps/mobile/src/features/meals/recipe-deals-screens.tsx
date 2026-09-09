// The two meal screens that live in the AppRoot shell rather than under a
// real route: the recipe detail reached from Home, and the deals hub.
//
// Extracted verbatim from app-root.tsx; markup unchanged. The rest of the meal
// feature is route-driven and lives beside this file.

import { Text, View } from 'react-native';
import { AppHeader, Chip, HiveIcon, ScrollScreen, rowStyles, uiText } from '@/components/hive-ui';
import { HiveColors } from '@/constants/theme';
import { type MealRecipe, mealsByDow, sampleDeals } from '@/data/mock-data';
import { useAppState } from '@/state/app-state';
import { Bullet, DealCard, sharedStyles } from '@/features/app/app-shared';
import { type Navigation } from '@/features/app/navigation-types';

export function DealsScreen({ nav }: { nav: Navigation }) {
  const app = useAppState();
  return (
    <ScrollScreen>
      <AppHeader title="Deals & Promotions" onBack={nav.back} />
      <View style={sharedStyles.gridList}>
        {sampleDeals.map((deal) => (
          <DealCard key={deal.id} deal={deal} inCart={app.isInCart(deal.id)} onAdd={() => app.addToCart(deal)} wide />
        ))}
      </View>
    </ScrollScreen>
  );
}

export function RecipeScreen({ nav, recipe }: { nav: Navigation; recipe?: MealRecipe }) {
  const chosen = recipe ?? mealsByDow[0][0].recipe;

  return (
    <ScrollScreen>
      <AppHeader title="Recipe Video" onBack={nav.back} />
      <View style={sharedStyles.videoHero}>
        <HiveIcon name="play" size={42} color={HiveColors.white} />
      </View>
      <View style={sharedStyles.formScreen}>
        <View style={rowStyles.spread}>
          <Text style={uiText.subtitle}>{chosen.name}</Text>
          <Chip label={chosen.tag} tone="warning" />
        </View>
        <Text style={uiText.muted}>{chosen.time} - {chosen.servings} - {chosen.cost}</Text>
        <Text style={sharedStyles.fieldGroupLabel}>Ingredients</Text>
        {chosen.ingredients.map((ingredient) => <Bullet key={ingredient} text={ingredient} />)}
        <Text style={sharedStyles.fieldGroupLabel}>Steps</Text>
        {chosen.steps.map((step, index) => <Bullet key={step} text={`${index + 1}. ${step}`} />)}
      </View>
    </ScrollScreen>
  );
}
