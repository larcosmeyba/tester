/**
 * The main meal plan page.
 *
 * Shows the user's actual weekly plan — every day, every meal category they
 * asked for — and lets meals be moved between slots.
 *
 * Two product rules shape this screen:
 *  - The "Customized Meals" feature is gone. This page shows real meals, and the
 *    way to change one is to move or swap it.
 *  - Moving a meal modifies the existing plan. It never regenerates the week, so
 *    the grocery list and the cost range stay exactly as they were.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, Card, EmptyState, HiveIcon, ScrollScreen, SectionHeader, uiText } from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { PRICING_NOTICE } from '@/features/meals/pricing-notice';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { mealTypeLabel } from '@/features/meals/meal-enums';
import { groupByDay, isWithinBudget, type MealSlot, type PlannedMeal } from '@/features/meals/meal-plan-model';
import { mealTypesInPlan, planDayCount } from '@/features/meals/move-meal';
import { describeError } from '@/services/api-error';

export function MealPlanScreen() {
  const router = useRouter();
  const { plan, error, loadCurrent, moveMeal, clearError } = useMealPlan();
  const [selectedDay, setSelectedDay] = useState(1);
  /** The meal the user picked up, waiting for a destination slot. */
  const [movingSlot, setMovingSlot] = useState<MealSlot | null>(null);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const dayCount = plan ? planDayCount(plan.meals) : 0;
  const mealTypes = useMemo(() => (plan ? mealTypesInPlan(plan.meals) : []), [plan]);
  const days = useMemo(() => (plan ? groupByDay(plan.meals, dayCount) : []), [plan, dayCount]);
  const currentDay = days.find((day) => day.day === selectedDay) ?? days[0];

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

  if (error && !plan) {
    const { message, retryable } = describeError(error);
    return (
      <ScrollScreen>
        <View style={styles.stateBody}>
          <Text style={uiText.subtitle}>We couldn&apos;t load your meal plan</Text>
          <Text style={uiText.muted}>{message}</Text>
          {retryable ? (
            <AppButton
              title="Try again"
              onPress={() => {
                clearError();
                void loadCurrent();
              }}
            />
          ) : null}
        </View>
      </ScrollScreen>
    );
  }

  if (!plan) {
    return (
      <ScrollScreen>
        <View style={styles.stateBody}>
          <EmptyState
            icon="fork"
            title="No meal plan yet"
            subtitle="Answer a few questions and Penny will build your week around your budget."
          />
          <AppButton title="Build my meal plan" onPress={() => router.push('/meals/questionnaire')} />
          <AppButton
            title="Choose recipes myself"
            variant="secondary"
            onPress={() => router.push('/meals/build')}
          />
        </View>
      </ScrollScreen>
    );
  }

  const withinBudget = isWithinBudget(plan);
  const { estimatedCost, budget } = plan.summary;

  return (
    <ScrollScreen>
      <View style={styles.body}>
        <Text style={uiText.title}>Meals for the week</Text>

        <Card style={styles.costCard}>
          <Text style={uiText.small}>Estimated grocery cost</Text>
          <Text style={styles.costRange}>
            ${estimatedCost.low}–${estimatedCost.high}
          </Text>
          {budget !== null && withinBudget !== null ? (
            <Text style={[uiText.small, withinBudget ? styles.withinBudget : styles.overBudget]}>
              {withinBudget
                ? `Fits your $${Math.round(budget)} budget`
                : `About $${Math.round(estimatedCost.high - budget)} over your $${Math.round(budget)} budget`}
            </Text>
          ) : null}
          {/* Required wherever a price appears. */}
          <Text style={uiText.small}>{PRICING_NOTICE}</Text>
        </Card>

        {plan.pennyMessage ? (
          <Card style={styles.pennyCard}>
            <View style={styles.pennyRow}>
              <HiveIcon name="penny" size={20} color={HiveColors.green} />
              <Text style={[uiText.body, styles.flexOne]}>{plan.pennyMessage}</Text>
            </View>
          </Card>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {days.map((day) => (
            <Pressable
              key={day.day}
              accessibilityRole="button"
              accessibilityState={{ selected: day.day === selectedDay }}
              onPress={() => setSelectedDay(day.day)}
              style={[styles.dayPill, day.day === selectedDay && styles.dayPillSelected]}>
              <Text style={[styles.dayPillText, day.day === selectedDay && styles.dayPillTextSelected]}>
                Day {day.day}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {movingSlot ? (
          <Card style={styles.movingBanner}>
            <Text style={uiText.body}>Pick a slot to move this meal to.</Text>
            <AppButton title="Cancel" variant="plain" onPress={() => setMovingSlot(null)} />
          </Card>
        ) : null}

        {currentDay
          ? mealTypes.map((mealType) => {
              const slot: MealSlot = { day: currentDay.day, mealType };
              const meal = currentDay.meals.find((candidate) => candidate.slot.mealType === mealType);
              const isMoving =
                movingSlot?.day === slot.day && movingSlot?.mealType === slot.mealType;

              return (
                <View key={mealType} style={styles.slotGroup}>
                  <SectionHeader title={mealTypeLabel(mealType)} actionLabel="" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      meal
                        ? `${mealTypeLabel(mealType)}: ${meal.title}. ${movingSlot ? 'Tap to move the selected meal here.' : 'Tap to move this meal.'}`
                        : `${mealTypeLabel(mealType)}: empty. ${movingSlot ? 'Tap to move the selected meal here.' : ''}`
                    }
                    onPress={() => handleSlotPress(slot, meal)}
                    style={({ pressed }) => [
                      styles.slot,
                      isMoving && styles.slotMoving,
                      movingSlot && !isMoving && styles.slotTarget,
                      pressed && styles.pressed,
                    ]}>
                    {meal ? (
                      <View style={styles.flexOne}>
                        <Text style={uiText.body}>{meal.title}</Text>
                        <Text style={uiText.small}>
                          {[
                            meal.totalTimeMinutes ? `${meal.totalTimeMinutes} min` : null,
                            `${Math.round(meal.servingsPlanned)} servings`,
                            meal.pantryIngredientsUsed.length > 0
                              ? `${meal.pantryIngredientsUsed.length} from your pantry`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        {meal.why ? <Text style={uiText.small}>{meal.why}</Text> : null}
                      </View>
                    ) : (
                      <Text style={uiText.muted}>Nothing planned</Text>
                    )}
                    <HiveIcon name={movingSlot ? 'next' : 'calendar'} size={16} color={HiveColors.textSecondary} />
                  </Pressable>
                </View>
              );
            })
          : null}

        <View style={styles.actions}>
          <AppButton title="View grocery list" onPress={() => router.push('/meals/grocery-list')} />
          <AppButton
            title="Add more recipes"
            variant="secondary"
            onPress={() => router.push('/meals/build')}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  stateBody: { paddingHorizontal: Spacing.three, paddingTop: Spacing.five, gap: Spacing.three },
  flexOne: { flex: 1 },
  costCard: { gap: Spacing.one },
  costRange: { color: HiveColors.text, fontSize: 26, fontWeight: '800' },
  withinBudget: { color: HiveColors.green },
  overBudget: { color: HiveColors.warningText },
  pennyCard: { gap: Spacing.two },
  pennyRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  dayRow: { gap: Spacing.two, paddingVertical: Spacing.one },
  dayPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  dayPillSelected: { backgroundColor: HiveColors.green, borderColor: HiveColors.green },
  dayPillText: { color: HiveColors.text, fontSize: 14, fontWeight: '600' },
  dayPillTextSelected: { color: HiveColors.white },
  movingBanner: { gap: Spacing.two },
  slotGroup: { gap: Spacing.one },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 68,
    borderRadius: Radii.lg,
    borderWidth: 1.5,
    borderColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  slotMoving: { borderColor: HiveColors.green, backgroundColor: HiveColors.greenLight },
  slotTarget: { borderStyle: 'dashed', borderColor: HiveColors.green },
  pressed: { opacity: 0.7 },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
