/**
 * Penny generates the plan, then the user reviews it — Marcos's SwiftUI
 * sandbox (`26_-_MealPlanGeneratingView`), rebuilt in React Native.
 *
 * The plan itself is always built by the real backend (`mealPlanService` /
 * the AI engine); nothing here invents a meal. The screens in this file are
 * presentational: the questionnaire wizard drives generation and hands the
 * resulting plan to `GeneratedPlanReview`.
 *
 * Honesty rules:
 * - Costs are shown as the estimated ranges the backend returns, always with
 *   the "estimates only — not verified retailer prices" caveat.
 * - A failed generation shows an honest error screen with a retry — never a
 *   fabricated plan.
 * - The free-tier limit screen (`AiLimitGate`) is shown only because the real
 *   `ai-usage-limits` mechanism exists; no paywall gate is invented here.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  HiveIcon,
  ModalSheet,
  PennyImage,
  uiText,
  type HiveIconName,
} from '@/components/hive-ui';
import { HiveColors, Radii, Spacing } from '@/constants/theme';
import { describeError } from '@/services/api-error';
import { groupByDay, type MealPlan, type MealSlot, type SwapAction } from '@/features/meals/meal-plan-model';
import { mealTypeLabel } from '@/features/meals/meal-enums';
import { useMealPlan } from '@/features/meals/meal-plan-context';

const pennyCookingSource = require('@/assets/images/hive/penny-chef-full.png');
const pennyChefHeadshotSource = require('@/assets/images/hive/penny-chef-headshot.png');

/** The Swift sandbox's rotating progress lines, in order. */
export const PROGRESS_MESSAGES = [
  'Building your meal plan…',
  'Working within your budget…',
  'Finding meals your household will enjoy…',
  'Checking for dietary preferences…',
  'Selecting budget-friendly ingredients…',
  'Putting together your grocery list…',
  'Almost there…',
];

const MESSAGE_INTERVAL_MS = 1800;

function ProgressDots() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setActive((current) => (current + 1) % 3), 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.dots} accessibilityRole="progressbar">
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[styles.dot, active === index ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

/** The "Penny is cooking" screen shown while the backend builds the plan. */
export function GeneratingScreen() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % PROGRESS_MESSAGES.length),
      MESSAGE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.generating} accessibilityLiveRegion="polite">
      <View style={styles.generatingMain}>
        <View style={styles.pennyCircle}>
          <PennyImage source={pennyCookingSource} size={70} />
        </View>
        <Text style={[uiText.subtitle, styles.centered]}>Let Penny cook{'\n'}for a moment.</Text>
        <Text style={[uiText.body, styles.centered, styles.progressMessage]}>{PROGRESS_MESSAGES[index]}</Text>
        <ProgressDots />
      </View>
      <Text style={[uiText.small, styles.centered, styles.faint]}>
        This usually takes about 10–20 seconds
      </Text>
    </View>
  );
}

/** Honest failure: what went wrong, a retry, and a way back to the answers. */
export function GenerationErrorScreen({
  error,
  onRetry,
  onCancel,
}: {
  error: unknown;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { message, retryable } = describeError(error);
  return (
    <View style={styles.generating} accessibilityLiveRegion="polite">
      <HiveIcon name="warning" size={44} color={HiveColors.warning} />
      <Text style={uiText.subtitle}>Something went wrong</Text>
      <Text style={[uiText.muted, styles.centered]}>
        {message || "We couldn't generate your meal plan. Please try again."}
      </Text>
      <View style={styles.actions}>
        {retryable ? <AppButton title="Try Again" onPress={onRetry} /> : null}
        <AppButton title="Change my answers" variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Plan review
// ---------------------------------------------------------------------------

const SLOT_STYLE: Record<'breakfast' | 'lunch' | 'dinner', { icon: HiveIconName; color: string }> = {
  breakfast: { icon: 'sunrise', color: '#E8930C' },
  lunch: { icon: 'sun', color: '#3887FF' },
  dinner: { icon: 'moon', color: '#1F8C33' },
};

const SWAP_ACTION_LABELS: Record<SwapAction, string> = {
  swap_slot: 'Swap for a different meal',
  cheaper: 'Find a cheaper option',
  higher_protein: 'Higher protein',
  faster: 'Quicker to make',
  dislike: "I don't like this one",
  regenerate_week: 'Regenerate the whole week',
};

const money = (value: number): string => `$${value.toFixed(2)}`;

function dayLabel(startDate: Date, day: number): string {
  const date = new Date(startDate);
  date.setDate(date.getDate() + (day - 1));
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function ReviewMealCard({
  plan,
  slot,
  title,
  cookTime,
  cost,
  onSwap,
}: {
  plan: MealPlan;
  slot: MealSlot;
  title: string;
  cookTime: string | null;
  cost: number | null;
  onSwap: (slot: MealSlot) => void;
}) {
  const style = SLOT_STYLE[slot.mealType as 'breakfast' | 'lunch' | 'dinner'] ?? SLOT_STYLE.dinner;
  const canSwap = plan.swapOptions.length > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mealTypeLabel(slot.mealType)}: ${title}. ${canSwap ? 'Tap to swap.' : ''}`}
      disabled={!canSwap}
      onPress={() => onSwap(slot)}
      style={({ pressed }) => [styles.mealCard, pressed && canSwap && styles.pressed]}>
      <View style={[styles.mealIcon, { backgroundColor: `${style.color}1F` }]}>
        <HiveIcon name={style.icon} size={18} color={style.color} />
      </View>
      <View style={styles.mealText}>
        <Text style={[styles.mealSlotLabel, { color: style.color }]}>
          {mealTypeLabel(slot.mealType).toUpperCase()}
        </Text>
        <Text style={styles.mealTitle}>{title}</Text>
        <View style={styles.mealMeta}>
          {cookTime ? (
            <View style={styles.metaRow}>
              <HiveIcon name="clock" size={12} color={HiveColors.textSecondary} />
              <Text style={uiText.small}>{cookTime}</Text>
            </View>
          ) : null}
          {cost !== null ? <Text style={styles.mealCost}>{money(cost)}</Text> : null}
        </View>
      </View>
      {canSwap ? <HiveIcon name="ellipsis" size={13} color={HiveColors.textSecondary} /> : null}
    </Pressable>
  );
}

/**
 * "Your meal plan is ready!" — day pills, meal cards with swap, and the
 * confirm button. Reads the plan from context so a swap re-renders fresh data.
 */
export function GeneratedPlanReview({
  onConfirm,
  onBack,
}: {
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { plan, planStartDate, swapMeal } = useMealPlan();
  const [selectedDay, setSelectedDay] = useState(1);
  const [swapSlot, setSwapSlot] = useState<MealSlot | null>(null);

  if (!plan) return null;

  const days = groupByDay(plan.meals);
  const activeDay = days.find((day) => day.day === selectedDay) ?? days[0];
  const { low, high } = plan.summary.estimatedCost;

  async function handleSwap(action: SwapAction) {
    if (!swapSlot) return;
    setSwapSlot(null);
    await swapMeal(swapSlot, action);
  }

  return (
    <View style={styles.review}>
      <AppHeader title="Review Your Plan" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.reviewScroll}>
        <View style={styles.reviewHeader}>
          <PennyImage source={pennyChefHeadshotSource} size={32} />
          <Text style={styles.reviewTitle}>Your meal plan is ready!</Text>
        </View>
        <Text style={[uiText.small, styles.reviewSubtitle]}>
          Review your meals below. Tap any meal to swap it.
        </Text>

        <View style={styles.budgetRow}>
          <HiveIcon name="dollar" size={14} color={HiveColors.green} />
          <Text style={styles.budgetText}>
            Estimated weekly cost: {money(low)}–{money(high)}{' '}
            <Text style={styles.budgetCaveat}>(estimates only — not verified retailer prices)</Text>
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayPills}>
          {days.map((day) => {
            const selected = day.day === selectedDay;
            return (
              <Pressable
                key={day.day}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={dayLabel(planStartDate, day.day)}
                onPress={() => setSelectedDay(day.day)}
                style={[styles.dayPill, selected && styles.dayPillSelected]}>
                <Text style={[styles.dayPillText, selected && styles.dayPillTextSelected]}>
                  {dayLabel(planStartDate, day.day)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeDay ? (
          <View style={styles.dayMeals}>
            <Text style={styles.dayTitle}>{dayLabel(planStartDate, activeDay.day)}</Text>
            {activeDay.meals.map((meal) => (
              <ReviewMealCard
                key={`${meal.slot.day}-${meal.slot.mealType}`}
                plan={plan}
                slot={meal.slot}
                title={meal.title}
                cookTime={
                  meal.totalTimeMinutes !== null ? `${meal.totalTimeMinutes} min` : null
                }
                cost={meal.consumedCost ?? meal.incrementalCheckoutCost ?? null}
                onSwap={setSwapSlot}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.reviewFooter}>
        <View style={styles.footerNote}>
          <PennyImage source={pennyChefHeadshotSource} size={18} />
          <Text style={[uiText.small, styles.footerNoteText]}>
            You can move meals to different days or slots anytime from your calendar.
          </Text>
        </View>
        <AppButton title="This Plan Looks Good →" onPress={onConfirm} />
      </View>

      <ModalSheet visible={swapSlot !== null} onClose={() => setSwapSlot(null)}>
        <View style={styles.swapSheet}>
          <Text style={uiText.subtitle}>Swap this meal</Text>
          {plan.swapOptions.map((action) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              onPress={() => void handleSwap(action)}
              style={({ pressed }) => [styles.swapOption, pressed && styles.pressed]}>
              <Text style={uiText.body}>{SWAP_ACTION_LABELS[action]}</Text>
              <HiveIcon name="next" size={16} color={HiveColors.textSecondary} />
            </Pressable>
          ))}
          <AppButton title="Keep it" variant="plain" onPress={() => setSwapSlot(null)} />
        </View>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  faint: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
  // Generating
  generating: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: 48,
  },
  generatingMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  pennyCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  progressMessage: { paddingHorizontal: 40 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: HiveColors.green },
  dotInactive: { backgroundColor: HiveColors.greenLight },
  actions: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two, paddingHorizontal: 16 },
  // Review
  review: { flex: 1 },
  reviewScroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  reviewTitle: { fontSize: 20, fontWeight: '800', color: HiveColors.text },
  reviewSubtitle: { color: HiveColors.textSecondary },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  budgetText: { flex: 1, fontSize: 13, fontWeight: '600', color: HiveColors.green },
  budgetCaveat: { fontSize: 11, fontWeight: '400', color: HiveColors.textSecondary },
  dayPills: { marginVertical: 4 },
  dayPill: {
    minWidth: 50,
    height: 34,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HiveColors.card,
    borderRadius: 10,
    marginRight: 8,
  },
  dayPillSelected: { backgroundColor: HiveColors.green },
  dayPillText: { fontSize: 13, fontWeight: '600', color: HiveColors.text },
  dayPillTextSelected: { color: HiveColors.white },
  dayMeals: { gap: 12, marginTop: 4 },
  dayTitle: { fontSize: 18, fontWeight: '800', color: HiveColors.text },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: HiveColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  mealIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mealText: { flex: 1, gap: 3 },
  mealSlotLabel: { fontSize: 11, fontWeight: '600' },
  mealTitle: { fontSize: 15, fontWeight: '600', color: HiveColors.text },
  mealMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mealCost: { fontSize: 12, color: HiveColors.green, fontWeight: '600' },
  reviewFooter: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: HiveColors.border,
    backgroundColor: HiveColors.white,
  },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerNoteText: { flex: 1, color: HiveColors.textSecondary },
  swapSheet: { gap: Spacing.two, padding: Spacing.three },
  swapOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    backgroundColor: HiveColors.card,
    borderRadius: Radii.md,
  },
});
