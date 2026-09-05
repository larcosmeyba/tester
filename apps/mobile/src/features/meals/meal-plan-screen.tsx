/**
 * The main meal plan page.
 *
 * Structure follows the Xcode app's `MealPlanTabView`: centred title with the
 * profile avatar, a week calendar strip, the selected day's meals, a deals
 * section, and a two-button shopping bar pinned above the tab bar.
 *
 * Functionality the reference app does not have is kept and dressed in the same
 * design language — the real cost range, Penny's written summary, and moving a
 * meal between slots.
 *
 * Two product rules shape this screen:
 *  - "Customized Meals" is gone. The way to change a meal is to move or swap it.
 *  - Moving a meal modifies the existing plan. It never regenerates the week, so
 *    the grocery list and the cost range stay exactly as they were.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, AvatarButton, HiveIcon, uiText } from '@/components/hive-ui';
import { AlertBanner, ComingSoonCard } from '@/components/hive-cards';
import { WeekCalendarStrip, addDays, isSameDay, startOfWeek } from '@/components/hive-calendar';
import { InstacartButton } from '@/components/hive-instacart';
import { FLOATING_TAB_BAR_HEIGHT, useFloatingTabBarSpace } from '@/components/hive-navigation';
import { HiveColors, Radii } from '@/constants/theme';
import { useAppState } from '@/state/app-state';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { mealTypeLabel } from '@/features/meals/meal-enums';
import { isWithinBudget, type MealSlot, type PlannedMeal } from '@/features/meals/meal-plan-model';
import { mealTypesInPlan, planDayCount } from '@/features/meals/move-meal';
import { describeError } from '@/services/api-error';

/** Accent per meal category, echoing the reference app's colour-coded cards. */
const MEAL_ACCENTS: Record<string, string> = {
  breakfast: '#F0A81E',
  lunch: '#3887FF',
  dinner: '#1F8C38',
  snack: '#8E5BD8',
};

export function MealPlanScreen() {
  const router = useRouter();
  const app = useAppState();
  const { plan, planStartDate, error, loadCurrent, moveMeal, clearError } = useMealPlan();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  /** The meal the user picked up, waiting for a destination slot. */
  const [movingSlot, setMovingSlot] = useState<MealSlot | null>(null);
  const barSpace = useFloatingTabBarSpace();

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const dayCount = plan ? planDayCount(plan.meals) : 0;
  const mealTypes = useMemo(() => (plan ? mealTypesInPlan(plan.meals) : []), [plan]);

  /** Which plan day the selected calendar date maps to, or null if outside it. */
  const selectedDay = useMemo(() => {
    const startOfSelected = new Date(selectedDate);
    startOfSelected.setHours(0, 0, 0, 0);
    const diff = Math.round((startOfSelected.getTime() - planStartDate.getTime()) / 86_400_000);
    const day = diff + 1;
    return day >= 1 && day <= dayCount ? day : null;
  }, [selectedDate, planStartDate, dayCount]);

  const mealsForDay = useMemo(
    () => (plan && selectedDay ? plan.meals.filter((meal) => meal.slot.day === selectedDay) : []),
    [plan, selectedDay]
  );

  const dayLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const handleSlotPress = useCallback(
    (slot: MealSlot, meal: PlannedMeal | undefined) => {
      if (!movingSlot) {
        if (meal) setMovingSlot(slot);
        return;
      }
      if (movingSlot.day === slot.day && movingSlot.mealType === slot.mealType) {
        setMovingSlot(null);
        return;
      }
      void moveMeal(movingSlot, slot);
      setMovingSlot(null);
    },
    [movingSlot, moveMeal]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Meals for the Week</Text>
        <AvatarButton imageUri={app.profile.profileImageUri} onPress={() => router.push('/account')} />
      </View>

      <WeekCalendarStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error ? <PlanError error={error} onRetry={() => { clearError(); void loadCurrent(); }} /> : null}

        {!plan ? (
          <AlertBanner
            emoji="🐝"
            title="Time to plan this week's meals!"
            subtitle="Tap to generate a fresh meal plan with Penny."
            onPress={() => router.push('/meals/questionnaire')}
            style={styles.block}
          />
        ) : null}

        <Text style={styles.dayLabel}>{dayLabel}</Text>

        {plan && mealTypes.length > 0 && selectedDay ? (
          <>
            {movingSlot ? (
              <View style={styles.movingBanner}>
                <Text style={uiText.body}>Pick a slot to move this meal to.</Text>
                <Pressable onPress={() => setMovingSlot(null)} accessibilityRole="button">
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}

            {mealTypes.map((mealType) => {
              const slot: MealSlot = { day: selectedDay, mealType };
              const meal = mealsForDay.find((candidate) => candidate.slot.mealType === mealType);
              const isMoving = movingSlot?.day === slot.day && movingSlot?.mealType === slot.mealType;
              return (
                <MealRow
                  key={mealType}
                  mealType={mealType}
                  meal={meal}
                  isMoving={isMoving}
                  isTarget={Boolean(movingSlot) && !isMoving}
                  onPress={() => handleSlotPress(slot, meal)}
                />
              );
            })}
          </>
        ) : (
          <EmptyDay
            hasPlan={Boolean(plan)}
            onBuild={() => router.push('/meals/questionnaire')}
          />
        )}

        {plan ? <PlanSummary plan={plan} /> : null}

        <Text style={styles.sectionTitle}>Deals for you this week</Text>
        <ComingSoonCard
          icon="cart"
          title="Coming Soon"
          subtitle="Personalized deals based on your meal plan — launching soon!"
          style={styles.block}
        />
      </ScrollView>

      <View style={[styles.shopBar, { bottom: barSpace + 12 }]}>
        <AppButton
          title="Shop on Your Own List"
          variant="secondary"
          onPress={() => router.push('/meals/shop-own')}
          style={styles.shopButton}
        />
        <InstacartButton
          title="Shop Ingredients"
          onPress={() => router.push('/meals/instacart')}
          style={styles.instacartButton}
        />
      </View>
    </View>
  );
}

function MealRow({
  mealType,
  meal,
  isMoving,
  isTarget,
  onPress,
}: {
  mealType: string;
  meal: PlannedMeal | undefined;
  isMoving: boolean;
  isTarget: boolean;
  onPress: () => void;
}) {
  const accent = MEAL_ACCENTS[mealType] ?? HiveColors.green;

  return (
    <View style={styles.mealBlock}>
      <View style={styles.mealHeader}>
        <HiveIcon name="fork" size={16} color={accent} />
        <Text style={styles.mealType}>{mealTypeLabel(mealType as never)}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          meal
            ? `${mealTypeLabel(mealType as never)}: ${meal.title}. Tap to move this meal.`
            : `${mealTypeLabel(mealType as never)}: nothing planned.`
        }
        onPress={onPress}
        style={({ pressed }) => [
          styles.mealRow,
          isMoving && styles.mealRowMoving,
          isTarget && styles.mealRowTarget,
          pressed && styles.pressed,
        ]}>
        <View style={[styles.thumb, { backgroundColor: `${accent}22` }]}>
          <HiveIcon name="fork" size={26} color={accent} />
        </View>
        <View style={styles.mealText}>
          {meal ? (
            <>
              <Text style={styles.mealName}>{meal.title}</Text>
              <View style={styles.metaRow}>
                {meal.totalTimeMinutes ? (
                  <Text style={styles.meta}>{meal.totalTimeMinutes} min</Text>
                ) : null}
                <Text style={styles.meta}>{Math.round(meal.servingsPlanned)} servings</Text>
              </View>
              {meal.pantryIngredientsUsed.length > 0 ? (
                <View style={styles.metaRow}>
                  <HiveIcon name="check" size={12} color={HiveColors.green} />
                  <Text style={styles.meta}>
                    {meal.pantryIngredientsUsed.length} from your pantry
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.mealEmpty}>Nothing planned</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

function EmptyDay({ hasPlan, onBuild }: { hasPlan: boolean; onBuild: () => void }) {
  return (
    <View style={styles.empty}>
      <HiveIcon name="fork" size={32} color={HiveColors.border} />
      <Text style={styles.emptyText}>No meals planned for this day</Text>
      {!hasPlan ? (
        <Pressable accessibilityRole="button" onPress={onBuild} style={styles.emptyButton}>
          <Text style={styles.emptyButtonText}>Build a Meal Plan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Cost range, budget standing and Penny's summary — kept from the newer app. */
function PlanSummary({ plan }: { plan: NonNullable<ReturnType<typeof useMealPlan>['plan']> }) {
  const withinBudget = isWithinBudget(plan);
  const { estimatedCost, budget } = plan.summary;

  return (
    <View style={styles.summary}>
      <Text style={uiText.small}>Estimated grocery cost</Text>
      <Text style={styles.summaryRange}>
        ${estimatedCost.low}–${estimatedCost.high}
      </Text>
      {budget !== null && withinBudget !== null ? (
        <Text style={[uiText.small, withinBudget ? styles.withinBudget : styles.overBudget]}>
          {withinBudget
            ? `Fits your $${Math.round(budget)} budget`
            : `About $${Math.round(estimatedCost.high - budget)} over your $${Math.round(budget)} budget`}
        </Text>
      ) : null}
      {plan.pennyMessage ? <Text style={uiText.muted}>{plan.pennyMessage}</Text> : null}
      <Text style={uiText.small}>{PRICING_NOTICE}</Text>
    </View>
  );
}

function PlanError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { message, retryable } = describeError(error);
  return (
    <View style={[styles.summary, styles.block]}>
      <Text style={uiText.subtitle}>We couldn&apos;t load your meal plan</Text>
      <Text style={uiText.muted}>{message}</Text>
      {retryable ? <AppButton title="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export { addDays, isSameDay, startOfWeek };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HiveColors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerSpacer: { width: 38 },
  headerTitle: { flex: 1, textAlign: 'center', color: HiveColors.text, fontSize: 20, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: HiveColors.border },
  content: { paddingBottom: FLOATING_TAB_BAR_HEIGHT + 150 },
  block: { marginHorizontal: 20, marginBottom: 16 },

  dayLabel: {
    color: HiveColors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  sectionTitle: {
    color: HiveColors.text,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 10,
  },

  movingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: Radii.lg,
    backgroundColor: HiveColors.greenLight,
  },
  cancelText: { color: HiveColors.green, fontSize: 14, fontWeight: '700' },

  mealBlock: { paddingBottom: 14 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  mealType: { color: HiveColors.text, fontSize: 16, fontWeight: '600' },
  mealRow: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 20,
    padding: 10,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  mealRowMoving: { borderColor: HiveColors.green, backgroundColor: HiveColors.greenLight },
  mealRowTarget: { borderColor: HiveColors.green, borderStyle: 'dashed' },
  pressed: { opacity: 0.75 },
  thumb: { width: 110, height: 88, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mealText: { flex: 1, gap: 6, paddingTop: 2 },
  mealName: { color: HiveColors.text, fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: HiveColors.textSecondary, fontSize: 12 },
  mealEmpty: { color: HiveColors.textSecondary, fontSize: 14 },

  empty: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  emptyText: { color: HiveColors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptyButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: HiveColors.green,
  },
  emptyButtonText: { color: HiveColors.white, fontSize: 14, fontWeight: '600' },

  summary: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    padding: 16,
    borderRadius: Radii.lg,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
    gap: 6,
  },
  summaryRange: { color: HiveColors.text, fontSize: 26, fontWeight: '700' },
  withinBudget: { color: HiveColors.green },
  overBudget: { color: HiveColors.warningText },

  shopBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  // Both buttons share the row evenly and are tall enough for a wrapped label.
  shopButton: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 58, paddingHorizontal: 8, paddingVertical: 8 },
  instacartButton: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 58, paddingHorizontal: 8 },
});
