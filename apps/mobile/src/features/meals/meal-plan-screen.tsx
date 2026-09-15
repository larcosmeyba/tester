/**
 * The main meal plan page.
 *
 * Rebuild matching Marcos's SwiftUI `MealPlanTabView` design reference:
 * a custom header with Penny and a share button (recipe-book PDF), a bordered
 * week strip, the selected day's slot-coloured meal cards, long-press actions
 * (complete / view recipe / move day / move slot / remove), and the shopping
 * bar pinned above the tab bar.
 *
 * Product rules carried over from the previous screen:
 * - "Customized Meals" is gone. The way to change a meal is to move or remove it.
 * - Moving a meal modifies the existing plan. It never regenerates the week,
 *   so the grocery list and the cost figures stay exactly as they were.
 * - Removal is a client overlay until the backend supports it (meal-slot-state).
 */
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  AppButton,
  HiveIcon,
  ModalSheet,
  PennyImage,
  uiText,
  type HiveIconName,
} from '@/components/hive-ui';
import { InstacartButton } from '@/components/hive-instacart';
import { FLOATING_TAB_BAR_HEIGHT, useFloatingTabBarSpace } from '@/components/hive-navigation';
import { HiveColors, MealAccents, Radii } from '@/constants/theme';
import { useAppState } from '@/state/app-state';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { mealTypesInPlan, planDayCount } from '@/features/meals/move-meal';
import {
  addRemovedSlot,
  getCompletedSlots,
  getRemovedSlots,
  setSlotCompleted,
  slotKey,
} from '@/features/meals/meal-slot-state';
import { dismissResetPrompt, wasResetPromptDismissed, weekStatus } from '@/features/meals/week-reset';
import { describeError } from '@/services/api-error';
import {
  dayHeadingLabel,
  isSameDay,
  monthYearLabel,
  planDayName,
  selectedPlanDay,
  sundayAnchoredWeek,
} from '@/features/meals/meal-week';
import { shareRecipeBook } from '@/features/meals/recipe-book-print';
import type { MealSlot, PlannedMeal } from '@/features/meals/meal-plan-model';

const pennyHeaderSource = require('@/assets/images/hive/penny.png');
const pennyEmptySource = require('@/assets/images/hive/ask-penny.png');

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Slot glyphs from `MealSlotType.icon` in the Swift design reference. */
const SLOT_ICONS: Partial<Record<MealSlot['mealType'], HiveIconName>> = {
  breakfast: 'sunrise',
  lunch: 'sun',
  dinner: 'moonStars',
  snack: 'leaf',
};

const capitalize = (value: string): string =>
  value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type MealSheet =
  | { kind: 'meal'; slot: MealSlot; meal: PlannedMeal }
  | { kind: 'moveDay'; slot: MealSlot; meal: PlannedMeal }
  | { kind: 'moveSlot'; slot: MealSlot; meal: PlannedMeal };

export function MealPlanScreen() {
  const router = useRouter();
  const app = useAppState();
  const {
    plan,
    planStartDate,
    error,
    isLoadingPlan,
    loadCurrent,
    moveMeal,
    startNewWeekWithSamePlan,
    clearError,
  } = useMealPlan();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  /** The action sheet state — used on Android; iOS uses ActionSheetIOS. */
  const [sheet, setSheet] = useState<MealSheet | null>(null);
  /** Slot keys the user has checked off as cooked this week. */
  const [completedSlots, setCompletedSlots] = useState<Set<string>>(new Set());
  /** Slot keys the user has removed from this week (client overlay — see meal-slot-state). */
  const [removedSlots, setRemovedSlots] = useState<Set<string>>(new Set());
  /** Weekly reset prompt: null = hidden, 'choice' = new/reuse, 'pantry' = pantry nudge. */
  const [resetStep, setResetStep] = useState<'choice' | 'pantry' | null>(null);
  const [pendingResetChoice, setPendingResetChoice] = useState<'new' | 'reuse' | null>(null);
  const [sharing, setSharing] = useState(false);
  const barSpace = useFloatingTabBarSpace();

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const reloadOverlays = useEffectEvent(async (planId: string) => {
    const [completed, removed] = await Promise.all([getCompletedSlots(planId), getRemovedSlots(planId)]);
    setCompletedSlots(completed);
    setRemovedSlots(removed);
  });

  const planId = plan?.planId;
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot overlay sync when
     the active plan changes: completed/removed slot state must reset for the new plan. */
  useEffect(() => {
    if (planId) {
      void reloadOverlays(planId);
    } else {
      setCompletedSlots(new Set());
      setRemovedSlots(new Set());
    }
  }, [planId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Weekly reset prompt (Audit Section 6): once the plan's week ends, offer a
  // fresh week or the same plan re-anchored to today. Fires once per plan-week.
  useEffect(() => {
    if (!plan || isLoadingPlan) return;
    const days = planDayCount(plan.meals);
    if (weekStatus(planStartDate, days) !== 'ended') return;
    let cancelled = false;
    void wasResetPromptDismissed(plan.planId, planStartDate).then((dismissed) => {
      if (!cancelled && !dismissed) setResetStep('choice');
    });
    return () => {
      cancelled = true;
    };
  }, [plan, planStartDate, isLoadingPlan]);

  const dayCount = plan ? planDayCount(plan.meals) : 0;
  const mealTypes = useMemo(() => (plan ? mealTypesInPlan(plan.meals) : []), [plan]);

  /** Which plan day the selected calendar date maps to, or null if outside it. */
  const selectedDay = useMemo(
    () => selectedPlanDay(planStartDate, dayCount, selectedDate),
    [selectedDate, planStartDate, dayCount],
  );

  const mealsForDay = useMemo(
    () => (plan && selectedDay ? plan.meals.filter((meal) => meal.slot.day === selectedDay) : []),
    [plan, selectedDay],
  );
  /** Removed meals stay hidden without mutating the server plan (see meal-slot-state). */
  const visibleMealsForDay = useMemo(
    () => mealsForDay.filter((meal) => !removedSlots.has(slotKey(meal.slot))),
    [mealsForDay, removedSlots],
  );

  /** Only slots that actually have a meal render a card — the Swift design
   *  shows no empty-slot rows, just "No meals planned for this day". */
  const dayRows = useMemo(
    () =>
      mealTypes
        .map((mealType) => ({
          mealType,
          meal: visibleMealsForDay.find((candidate) => candidate.slot.mealType === mealType),
        }))
        .filter((row): row is { mealType: (typeof mealTypes)[number]; meal: PlannedMeal } =>
          row.meal !== undefined,
        ),
    [mealTypes, visibleMealsForDay],
  );

  /** Plan days other than the selected one, for the "Move to Another Day" menu. */
  const otherDays = useMemo(() => {
    const days: number[] = [];
    for (let day = 1; day <= dayCount; day += 1) {
      if (day !== selectedDay) days.push(day);
    }
    return days;
  }, [dayCount, selectedDay]);

  /** Share the week's recipes as a PDF recipe book. */
  const handleShare = useCallback(() => {
    if (!plan || sharing) return;
    setSharing(true);
    void shareRecipeBook(plan, planStartDate)
      .catch((caught: unknown) =>
        Alert.alert(
          'Couldn’t build the recipe book',
          caught instanceof Error ? caught.message : 'Please try again.',
        ),
      )
      .finally(() => setSharing(false));
  }, [plan, planStartDate, sharing]);

  /** Checks a meal off as cooked. */
  const handleToggleDone = useCallback(
    (slot: MealSlot, done: boolean) => {
      if (!plan) return;
      void setSlotCompleted(plan.planId, slot, done).then(setCompletedSlots);
    },
    [plan],
  );

  const handleViewRecipe = useCallback(
    (meal: PlannedMeal) => {
      router.push(`/meals/recipe/${meal.recipeId}`);
    },
    [router],
  );

  /** Removes a meal from the week (client overlay until the backend supports it). */
  const handleRemove = useCallback(
    (slot: MealSlot, meal: PlannedMeal) => {
      if (!plan) return;
      Alert.alert('Remove meal', `Remove "${meal.title}" from this week?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void addRemovedSlot(plan.planId, slot).then(setRemovedSlots);
          },
        },
      ]);
    },
    [plan],
  );

  const handleMoveToDay = useCallback(
    (slot: MealSlot, day: number) => {
      void moveMeal(slot, { day, mealType: slot.mealType });
    },
    [moveMeal],
  );

  const handleMoveToSlot = useCallback(
    (slot: MealSlot, mealType: MealSlot['mealType']) => {
      void moveMeal(slot, { day: slot.day, mealType });
    },
    [moveMeal],
  );

  /**
   * Long-press a card: iOS gets the native action sheet (with sequential
   * sheets for the two submenus); Android gets the app's bottom sheet,
   * where the submenus swap the sheet content.
   */
  const openMealActions = useCallback(
    (slot: MealSlot, meal: PlannedMeal) => {
      const done = completedSlots.has(slotKey(slot));
      if (Platform.OS === 'ios') {
        const mainOptions = [
          done ? 'Mark as Not Completed' : 'Mark as Completed',
          'View Recipe',
          'Move to Another Day',
          'Change Meal Slot',
          'Remove Meal',
          'Cancel',
        ];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: mainOptions,
            cancelButtonIndex: mainOptions.length - 1,
            destructiveButtonIndex: 4,
            title: meal.title,
          },
          (index) => {
            if (index === 0) {
              handleToggleDone(slot, !done);
            } else if (index === 1) {
              handleViewRecipe(meal);
            } else if (index === 2) {
              const days = otherDays;
              const dayOptions = [...days.map((day) => planDayName(planStartDate, day)), 'Cancel'];
              ActionSheetIOS.showActionSheetWithOptions(
                {
                  options: dayOptions,
                  cancelButtonIndex: dayOptions.length - 1,
                  title: 'Move to another day',
                },
                (dayIndex) => {
                  if (dayIndex < days.length) handleMoveToDay(slot, days[dayIndex]);
                },
              );
            } else if (index === 3) {
              const slots = mealTypes.filter((type) => type !== slot.mealType);
              const slotOptions = [...slots.map((type) => capitalize(type)), 'Cancel'];
              ActionSheetIOS.showActionSheetWithOptions(
                {
                  options: slotOptions,
                  cancelButtonIndex: slotOptions.length - 1,
                  title: 'Change meal slot',
                },
                (slotIndex) => {
                  if (slotIndex < slots.length) handleMoveToSlot(slot, slots[slotIndex]);
                },
              );
            } else if (index === 4) {
              handleRemove(slot, meal);
            }
          },
        );
        return;
      }
      setSheet({ kind: 'meal', slot, meal });
    },
    [
      completedSlots,
      handleToggleDone,
      handleViewRecipe,
      handleRemove,
      handleMoveToDay,
      handleMoveToSlot,
      otherDays,
      mealTypes,
      planStartDate,
    ],
  );

  /** Weekly reset: record the choice, then nudge the pantry update. */
  const handleResetChoice = useCallback(
    (choice: 'new' | 'reuse') => {
      if (!plan) return;
      void dismissResetPrompt(plan.planId, planStartDate);
      if (choice === 'reuse') {
        startNewWeekWithSamePlan();
        // Fresh week, fresh overlays.
        setCompletedSlots(new Set());
        setRemovedSlots(new Set());
      }
      setPendingResetChoice(choice);
      setResetStep('pantry');
    },
    [plan, planStartDate, startNewWeekWithSamePlan],
  );

  const handlePantryNudge = useCallback(
    (go: boolean) => {
      const choice = pendingResetChoice;
      setPendingResetChoice(null);
      setResetStep(null);
      if (go) {
        router.push('/pantry');
      } else if (choice === 'new') {
        router.push('/meals/questionnaire');
      }
    },
    [pendingResetChoice, router],
  );

  const renderSheetContent = () => {
    if (!sheet) return null;
    const { slot, meal } = sheet;
    const done = completedSlots.has(slotKey(slot));

    if (sheet.kind === 'moveDay') {
      return (
        <View style={styles.sheetBody}>
          <Text style={uiText.subtitle}>Move to another day</Text>
          {otherDays.map((day) => (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`Move to ${planDayName(planStartDate, day)}`}
              onPress={() => {
                setSheet(null);
                handleMoveToDay(slot, day);
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
              <Text style={styles.sheetRowText}>{planDayName(planStartDate, day)}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to meal options"
            onPress={() => setSheet({ kind: 'meal', slot, meal })}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
            <Text style={[styles.sheetRowText, styles.sheetBack]}>‹ Back</Text>
          </Pressable>
        </View>
      );
    }

    if (sheet.kind === 'moveSlot') {
      return (
        <View style={styles.sheetBody}>
          <Text style={uiText.subtitle}>Change meal slot</Text>
          {mealTypes
            .filter((type) => type !== slot.mealType)
            .map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${capitalize(type)}`}
                onPress={() => {
                  setSheet(null);
                  handleMoveToSlot(slot, type);
                }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
                <Text style={styles.sheetRowText}>{capitalize(type)}</Text>
              </Pressable>
            ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to meal options"
            onPress={() => setSheet({ kind: 'meal', slot, meal })}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
            <Text style={[styles.sheetRowText, styles.sheetBack]}>‹ Back</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.sheetBody}>
        <Text style={uiText.subtitle} numberOfLines={2}>
          {meal.title}
        </Text>
        <SheetRow
          icon={done ? 'back' : 'checkCircle'}
          label={done ? 'Mark as Not Completed' : 'Mark as Completed'}
          onPress={() => {
            setSheet(null);
            handleToggleDone(slot, !done);
          }}
        />
        <SheetRow
          icon="doc"
          label="View Recipe"
          onPress={() => {
            setSheet(null);
            handleViewRecipe(meal);
          }}
        />
        <SheetRow
          icon="calendar"
          label="Move to Another Day"
          onPress={() => setSheet({ kind: 'moveDay', slot, meal })}
        />
        <SheetRow
          icon="next"
          label="Change Meal Slot"
          onPress={() => setSheet({ kind: 'moveSlot', slot, meal })}
        />
        <SheetRow
          icon="trash"
          label="Remove Meal"
          destructive
          onPress={() => {
            setSheet(null);
            handleRemove(slot, meal);
          }}
        />
      </View>
    );
  };

  const cartCount = app.cart.length;

  return (
    <View style={styles.screen}>
      <MealPlanHeader onShare={handleShare} sharing={sharing} canShare={plan !== null} />

      <WeekStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: plan ? FLOATING_TAB_BAR_HEIGHT + 170 : FLOATING_TAB_BAR_HEIGHT + 40 },
        ]}
        showsVerticalScrollIndicator={false}>
        {isLoadingPlan && !plan ? (
          <View style={styles.loadingWrap} accessibilityRole="progressbar">
            <ActivityIndicator size="large" color={HiveColors.green} />
          </View>
        ) : (
          <>
            {error ? (
              <PlanError
                error={error}
                onRetry={() => {
                  clearError();
                  void loadCurrent();
                }}
              />
            ) : null}

            <Text style={styles.dayLabel}>{dayHeadingLabel(selectedDate)}</Text>

            {!plan ? (
              <NoPlanState onGenerate={() => router.push('/meals/questionnaire')} />
            ) : dayRows.length === 0 ? (
              <EmptyDayState />
            ) : (
              <>
                <View style={styles.hintRow}>
                  <HiveIcon name="handTap" size={11} color={HiveColors.green} />
                  <Text style={styles.hintText}>
                    Press and hold any meal to move it to another day, change its slot, or remove
                    it.
                  </Text>
                </View>
                {dayRows.map(({ mealType, meal }) => {
                  const slot: MealSlot = { day: selectedDay ?? 0, mealType };
                  return (
                    <MealCard
                      key={mealType}
                      mealType={mealType}
                      meal={meal}
                      done={completedSlots.has(slotKey(slot))}
                      onPress={() => handleViewRecipe(meal)}
                      onLongPress={() => openMealActions(slot, meal)}
                    />
                  );
                })}
              </>
            )}

            <View style={styles.scrollSpacer} />
          </>
        )}
      </ScrollView>

      {plan ? (
        <View style={[styles.shopBar, { bottom: barSpace + 12 }]}>
          {cartCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Shopping cart, ${cartCount} items. Tap to clear.`}
              onPress={app.clearCart}
              style={({ pressed }) => [styles.cartPill, pressed && styles.pressed]}>
              <HiveIcon name="cart" size={14} color={HiveColors.green} />
              <Text style={styles.cartPillText}>{cartCount} in cart</Text>
              <HiveIcon name="close" size={12} color={HiveColors.green} />
            </Pressable>
          ) : null}
          <View style={styles.shopButtons}>
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
      ) : null}

      <ModalSheet visible={sheet !== null} onClose={() => setSheet(null)}>
        {renderSheetContent()}
      </ModalSheet>

      <ModalSheet visible={resetStep !== null} onClose={() => handlePantryNudge(false)}>
        {resetStep === 'choice' ? (
          <View style={styles.resetBody}>
            <Text style={uiText.subtitle}>This week is done! 🎉</Text>
            <Text style={uiText.body}>
              Nice cooking. Start a fresh week with Penny, or keep going with last week&apos;s plan.
            </Text>
            <AppButton title="Start a new week" onPress={() => handleResetChoice('new')} />
            <AppButton
              title="Reuse last week's plan"
              variant="secondary"
              onPress={() => handleResetChoice('reuse')}
            />
          </View>
        ) : (
          <View style={styles.resetBody}>
            <Text style={uiText.subtitle}>Update your pantry?</Text>
            <Text style={uiText.body}>
              A week of cooking changes what&apos;s on hand. Take a minute to update your pantry
              inventory so next week&apos;s plan uses what you have.
            </Text>
            <AppButton title="Update my pantry" onPress={() => handlePantryNudge(true)} />
            <AppButton
              title="Skip for now"
              variant="secondary"
              onPress={() => handlePantryNudge(false)}
            />
          </View>
        )}
      </ModalSheet>
    </View>
  );
}

/** Header matching the Swift design: title + Penny, subtitle, share button. */
function MealPlanHeader({
  onShare,
  sharing,
  canShare,
}: {
  onShare: () => void;
  sharing: boolean;
  canShare: boolean;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Meals for the Week</Text>
          <PennyImage source={pennyHeaderSource} size={48} />
        </View>
        <Text style={styles.headerSubtitle}>Budget-friendly meals, planned your way.</Text>
      </View>
      {canShare ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share this week's recipes"
          onPress={onShare}
          disabled={sharing}
          style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
          {sharing ? (
            <ActivityIndicator size="small" color={HiveColors.green} />
          ) : (
            <HiveIcon name="share" size={15} color={HiveColors.green} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Week strip matching `MealPlanTabView.weekCalendarStrip`. */
function WeekStrip({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const week = useMemo(() => sundayAnchoredWeek(selectedDate), [selectedDate]);
  const today = new Date();

  const shiftWeek = useCallback(
    (deltaDays: number) => {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + deltaDays);
      onSelectDate(next);
    },
    [selectedDate, onSelectDate],
  );

  return (
    <View style={styles.stripCard}>
      <View style={styles.stripNavRow}>
        <Text style={styles.stripMonth}>{monthYearLabel(week)}</Text>
        <View style={styles.stripNavButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            onPress={() => shiftWeek(-7)}
            style={({ pressed }) => [styles.stripNavCircle, pressed && styles.pressed]}>
            <HiveIcon name="back" size={13} color={HiveColors.green} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next week"
            onPress={() => shiftWeek(7)}
            style={({ pressed }) => [styles.stripNavCircle, pressed && styles.pressed]}>
            <HiveIcon name="next" size={13} color={HiveColors.green} />
          </Pressable>
        </View>
      </View>
      <View style={styles.stripDays}>
        {week.map((date, index) => {
          const selected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);
          return (
            <Pressable
              key={date.toISOString()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={dayHeadingLabel(date)}
              onPress={() => onSelectDate(date)}
              style={styles.stripDayCell}>
              <Text style={[styles.stripDayLetter, selected && styles.stripDayLetterSelected]}>
                {WEEKDAY_LETTERS[index]}
              </Text>
              <View
                style={[
                  styles.stripDayCircle,
                  selected && styles.stripDayCircleSelected,
                  !selected && isToday && styles.stripDayCircleToday,
                ]}>
                <Text
                  style={[
                    styles.stripDayNumber,
                    selected && styles.stripDayNumberSelected,
                    !selected && isToday && styles.stripDayNumberToday,
                  ]}>
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Penny + CTA when the user has no plan yet. */
function NoPlanState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <PennyImage source={pennyEmptySource} size={96} />
      <Text style={styles.emptyTitle}>You don&apos;t have a meal plan yet.</Text>
      <Text style={styles.emptySubtitle}>
        Penny can build a week of budget-friendly meals for your household in about a minute.
      </Text>
      <AppButton
        title="Generate My Meal Plan 🐝"
        onPress={onGenerate}
        style={styles.generateButton}
      />
    </View>
  );
}

/** Fork/knife + line when the plan has no meals for the selected day. */
function EmptyDayState() {
  return (
    <View style={styles.emptyWrap}>
      <HiveIcon name="fork" size={32} color={HiveColors.border} />
      <Text style={styles.emptyDayText}>No meals planned for this day</Text>
    </View>
  );
}

/** One meal card: slot header row + thumbnail + name + meta. */
function MealCard({
  mealType,
  meal,
  done,
  onPress,
  onLongPress,
}: {
  mealType: MealSlot['mealType'];
  meal: PlannedMeal;
  done: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const accent = MealAccents[mealType] ?? HiveColors.green;
  const icon = SLOT_ICONS[mealType] ?? 'fork';
  const costLabel =
    meal.incrementalCheckoutCost != null ? `Est. $${meal.incrementalCheckoutCost.toFixed(2)}` : '';

  return (
    <View>
      <View style={styles.cardHeader}>
        <HiveIcon name={icon} size={16} color={accent} />
        <Text style={styles.cardSlot}>{capitalize(mealType)}</Text>
        {done ? (
          <View style={styles.completedBadge}>
            <HiveIcon name="checkCircle" size={10} color={HiveColors.green} />
            <Text style={styles.completedText}>Completed</Text>
          </View>
        ) : null}
        {costLabel ? <Text style={styles.costLabel}>{costLabel}</Text> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${capitalize(mealType)}: ${meal.title}. Tap to see the recipe. Press and hold for more options.`}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}>
        <View style={styles.thumb}>
          <LinearGradient
            colors={[hexToRgba(accent, 0.2), hexToRgba(accent, 0.08)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.thumbGradient}
          />
          <HiveIcon name="fork" size={26} color={hexToRgba(accent, 0.45)} />
          <View style={styles.tagChip}>
            <Text style={styles.tagText}>{mealType.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardText}>
          <Text style={[styles.mealName, done && styles.mealNameDone]}>{meal.title}</Text>
          <View style={styles.metaRow}>
            {meal.totalTimeMinutes ? (
              <View style={styles.metaItem}>
                <HiveIcon name="clock" size={12} color={HiveColors.textSecondary} />
                <Text style={styles.meta}>{meal.totalTimeMinutes} min</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <HiveIcon name="users" size={12} color={HiveColors.textSecondary} />
              <Text style={styles.meta}>{Math.round(meal.servingsPlanned)} servings</Text>
            </View>
          </View>
        </View>
      </Pressable>

      <View style={styles.cardDivider} />
    </View>
  );
}

function SheetRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: HiveIconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
      <HiveIcon name={icon} size={18} color={destructive ? HiveColors.danger : HiveColors.text} />
      <Text style={[styles.sheetRowText, destructive && styles.sheetDestructive]}>{label}</Text>
    </Pressable>
  );
}

function PlanError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { message, retryable } = describeError(error);
  return (
    <View style={styles.errorCard}>
      <Text style={uiText.subtitle}>We couldn&apos;t load your meal plan</Text>
      <Text style={uiText.muted}>{message}</Text>
      {retryable ? <AppButton title="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HiveColors.white },
  content: {},
  scrollSpacer: { height: 24 },
  pressed: { opacity: 0.75 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerText: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: HiveColors.text, fontSize: 24, fontWeight: '700' },
  headerSubtitle: { color: HiveColors.textSecondary, fontSize: 14, marginTop: 2 },
  shareButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Week strip
  stripCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    paddingTop: 12,
    backgroundColor: HiveColors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HiveColors.border,
  },
  stripNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  stripMonth: { flex: 1, color: HiveColors.text, fontSize: 16, fontWeight: '700' },
  stripNavButtons: { flexDirection: 'row', gap: 8 },
  stripNavCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: HiveColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripDays: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 12 },
  stripDayCell: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 2 },
  stripDayLetter: { fontSize: 12, fontWeight: '500', color: HiveColors.textSecondary },
  stripDayLetterSelected: { color: HiveColors.green },
  stripDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripDayCircleSelected: { backgroundColor: HiveColors.green },
  stripDayCircleToday: { borderWidth: 1.5, borderColor: HiveColors.green },
  stripDayNumber: { fontSize: 15, color: HiveColors.text },
  stripDayNumberSelected: { color: HiveColors.white, fontWeight: '600' },
  stripDayNumberToday: { color: HiveColors.green, fontWeight: '600' },

  // Day heading + hint
  dayLabel: {
    color: HiveColors.text,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  hintText: { flex: 1, color: HiveColors.textSecondary, fontSize: 12, lineHeight: 16 },

  // Empty states
  emptyWrap: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: HiveColors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: {
    color: HiveColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyDayText: { color: HiveColors.textSecondary, fontSize: 15, fontWeight: '600' },
  generateButton: { alignSelf: 'stretch', marginHorizontal: 8, marginTop: 6, minHeight: 50 },

  // Meal card
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  cardSlot: { color: HiveColors.text, fontSize: 16, fontWeight: '600' },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: HiveColors.greenLight,
  },
  completedText: { color: HiveColors.green, fontSize: 10, fontWeight: '700' },
  costLabel: { marginLeft: 'auto', color: HiveColors.textSecondary, fontSize: 13 },
  cardBody: { flexDirection: 'row', gap: 14, paddingHorizontal: 20 },
  thumb: {
    width: 110,
    height: 88,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbGradient: { ...StyleSheet.absoluteFill },
  tagChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: HiveColors.green,
  },
  tagText: { color: HiveColors.white, fontSize: 9, fontWeight: '700' },
  cardText: { flex: 1, gap: 6, paddingTop: 2 },
  mealName: { color: HiveColors.text, fontSize: 15, fontWeight: '600' },
  mealNameDone: { textDecorationLine: 'line-through', color: HiveColors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { color: HiveColors.textSecondary, fontSize: 12 },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: HiveColors.border,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 8,
  },

  // Action sheet rows (Android)
  sheetBody: { gap: 4, paddingHorizontal: 4, paddingBottom: 8 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: Radii.md,
  },
  sheetRowText: { color: HiveColors.text, fontSize: 15, fontWeight: '500' },
  sheetDestructive: { color: HiveColors.danger },
  sheetBack: { color: HiveColors.green, fontWeight: '700' },

  // Error
  errorCard: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    padding: 16,
    borderRadius: Radii.lg,
    backgroundColor: HiveColors.card,
    borderWidth: 1,
    borderColor: HiveColors.border,
    gap: 6,
  },

  // Shopping bar
  shopBar: { position: 'absolute', left: 16, right: 16, gap: 8 },
  cartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: HiveColors.greenLight,
  },
  cartPillText: { color: HiveColors.green, fontSize: 13, fontWeight: '700' },
  shopButtons: { flexDirection: 'row', gap: 10 },
  shopButton: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 8, paddingVertical: 8 },
  instacartButton: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 8 },

  // Reset prompt
  resetBody: { gap: 12, paddingHorizontal: 4, paddingBottom: 8 },
});
