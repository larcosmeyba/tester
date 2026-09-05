/**
 * The meal-planning questionnaire wizard (product Doc 04).
 *
 * Walks the thirteen sections, then hands the collected `PlanRequest` to the
 * backend. On success it routes to the **main meal plan page** — the user is
 * never left inside the generator.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, ProgressBar, ScrollScreen, uiText } from '@/components/hive-ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-context';
import { MealPlanGenerating } from '@/features/meals/meal-plan-generating';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import {
  AllergiesSection,
  BudgetSection,
  DietSection,
  EquipmentSection,
  HouseholdSection,
  LeftoversSection,
  MealsSection,
  NutritionSection,
  PantrySection,
  PreferencesSection,
  StyleSection,
  TimeSection,
  type SectionProps,
} from '@/features/meals/questionnaire-sections';
import { QuestionnaireReview } from '@/features/meals/questionnaire-review';
import {
  QUESTIONNAIRE_STEPS,
  canAdvance,
  type QuestionnaireStepId,
} from '@/features/meals/questionnaire-steps';

const SECTION_COMPONENTS: Partial<Record<QuestionnaireStepId, (props: SectionProps) => React.ReactElement>> = {
  household: HouseholdSection,
  meals: MealsSection,
  budget: BudgetSection,
  pantry: PantrySection,
  diet: DietSection,
  allergies: AllergiesSection,
  nutrition: NutritionSection,
  preferences: PreferencesSection,
  time: TimeSection,
  equipment: EquipmentSection,
  style: StyleSection,
  leftovers: LeftoversSection,
};

export function MealQuestionnaire() {
  const router = useRouter();
  const auth = useAuth();
  const { request, updateRequest, generate, isGenerating, error, clearError } = useMealPlan();
  const [stepIndex, setStepIndex] = useState(0);

  const step = QUESTIONNAIRE_STEPS[stepIndex]!;
  const isReview = step.id === 'review';
  const Section = SECTION_COMPONENTS[step.id];

  const canContinue = useMemo(() => canAdvance(step.id, request), [step.id, request]);

  const goTo = useCallback((id: QuestionnaireStepId) => {
    const index = QUESTIONNAIRE_STEPS.findIndex((candidate) => candidate.id === id);
    if (index >= 0) setStepIndex(index);
  }, []);

  const back = useCallback(() => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((current) => current - 1);
  }, [stepIndex, router]);

  async function submit() {
    clearError();
    try {
      await generate(auth.user?.id ?? 'anonymous');
      // Straight to the plan — never leave the user inside the generator.
      // `/meals/plan` is the real route; the meal tab renders the same screen.
      router.replace('/meals/plan');
    } catch {
      // The failure is held in context and rendered by MealPlanGenerating,
      // which offers a retry. Nothing to do here.
      return;
    }
  }

  if (isGenerating || (error && isReview)) {
    return (
      <MealPlanGenerating
        error={error}
        onRetry={() => void submit()}
        onCancel={() => {
          clearError();
          goTo('household');
        }}
      />
    );
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Build your meal plan" onBack={back} />
      <View style={styles.body}>
        <ProgressBar current={stepIndex + 1} total={QUESTIONNAIRE_STEPS.length} />

        <View style={styles.heading}>
          <Text style={uiText.subtitle}>{step.title}</Text>
          {step.subtitle ? <Text style={uiText.muted}>{step.subtitle}</Text> : null}
        </View>

        {isReview ? (
          <QuestionnaireReview request={request} onEdit={goTo} />
        ) : Section ? (
          <Section request={request} update={updateRequest} />
        ) : null}

        <View style={styles.actions}>
          {isReview ? (
            <AppButton title="Let Penny plan my week" onPress={() => void submit()} />
          ) : (
            <>
              <AppButton
                title="Next"
                disabled={!canContinue}
                onPress={() => setStepIndex((current) => current + 1)}
              />
              {!step.required ? (
                <AppButton
                  title="Skip"
                  variant="plain"
                  onPress={() => setStepIndex((current) => current + 1)}
                />
              ) : null}
            </>
          )}
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  heading: { gap: Spacing.one },
  actions: { gap: Spacing.two, marginTop: Spacing.four },
});
