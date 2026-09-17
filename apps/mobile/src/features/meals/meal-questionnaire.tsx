/**
 * The AI meal-plan questionnaire wizard — Marcos's SwiftUI 7-step design
 * (`22_-_MealPlanQuestionnaireView`), rebuilt in React Native.
 *
 * Walks the seven steps, persists answers to AsyncStorage on every advance
 * (and on close), then hands the mapped `PlanRequest` to the real backend
 * generation. On success Penny's generating screen gives way to the plan
 * review; confirming routes to the meal plan. The user is never left inside
 * the generator.
 *
 * The free-tier gate (`AiLimitGate`) is shown only because the real
 * `ai-usage-limits` mechanism exists — no paywall gate is invented here.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton, HiveIcon, ModalSheet, ProgressBar, Screen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-context';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import { usePantry } from '@/features/pantry/pantry-context';
import { AiLimitGate } from '@/features/meals/ai-limit-gate';
import {
  getAiUsage,
  hasAiUsageRemaining,
  recordAiUsage,
  type AiUsage,
} from '@/features/meals/ai-usage-limits';
import {
  DietsStep,
  HealthStep,
  HouseholdStep,
  KitchenStep,
  PantryStep,
  PlanningStep,
  StepHeader,
  TasteStep,
  type QuestionnaireSectionProps,
} from '@/features/meals/questionnaire-sections';
import {
  QUESTIONNAIRE_STEPS,
  type QuestionnaireStepId,
} from '@/features/meals/questionnaire-steps';
import {
  DEFAULT_ANSWERS,
  toPlanRequest,
  type MealQuestionnaireAnswers,
} from '@/features/meals/questionnaire-answers';
import {
  clearQuestionnaireAnswers,
  loadQuestionnaireAnswers,
  saveQuestionnaireAnswers,
} from '@/features/meals/questionnaire-storage';
import {
  GeneratedPlanReview,
  GeneratingScreen,
  GenerationErrorScreen,
} from '@/features/meals/meal-plan-generating';
import type { PlanRequest } from '@/features/meals/meal-plan-model';

const STEP_COMPONENTS: Record<QuestionnaireStepId, (props: QuestionnaireSectionProps) => React.ReactElement> = {
  household: HouseholdStep,
  diets: DietsStep,
  health: HealthStep,
  taste: TasteStep,
  kitchen: KitchenStep,
  planning: PlanningStep,
  pantry: PantryStep,
};

type Phase = 'steps' | 'working' | 'review';

export function MealQuestionnaire() {
  const router = useRouter();
  const auth = useAuth();
  const { generate, error, clearError } = useMealPlan();
  const { activeItems } = usePantry();

  const [answers, setAnswers] = useState<MealQuestionnaireAnswers>(DEFAULT_ANSWERS);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('steps');
  const [limitGate, setLimitGate] = useState<AiUsage | null>(null);

  // Reload saved answers once, like the Swift view's UserDefaults init.
  useEffect(() => {
    let alive = true;
    loadQuestionnaireAnswers().then((loaded) => {
      if (alive) setAnswers(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<MealQuestionnaireAnswers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
  }, []);

  const step = QUESTIONNAIRE_STEPS[stepIndex]!;
  const isLastStep = stepIndex === QUESTIONNAIRE_STEPS.length - 1;
  const Section = STEP_COMPONENTS[step.id];

  function backToSteps() {
    clearError();
    setStepIndex(0);
    setPhase('steps');
  }

  function close() {
    // The Swift view saves on dismiss via its X button.
    void saveQuestionnaireAnswers(answers);
    router.back();
  }

  async function runGeneration() {
    clearError();
    // The gate fires AT the limit — checked before any AI work is requested.
    if (!(await hasAiUsageRemaining('ai_plan'))) {
      setLimitGate(await getAiUsage('ai_plan'));
      return;
    }
    const request: PlanRequest = toPlanRequest(
      answers,
      activeItems.map((item) => item.name),
    );
    setPhase('working');
    try {
      await generate(auth.user?.id ?? 'anonymous', request);
      // The AI work succeeded — this is what consumes the allowance.
      await recordAiUsage('ai_plan');
      setPhase('review');
    } catch {
      // The failure is held in context and rendered by GenerationErrorScreen,
      // which offers a retry. Nothing else to do here.
    }
  }

  async function advance() {
    await saveQuestionnaireAnswers(answers);
    if (!isLastStep) {
      setStepIndex((current) => current + 1);
      return;
    }
    await runGeneration();
  }

  async function confirmPlan() {
    // Fresh answers next time; the generated plan lives in context.
    await clearQuestionnaireAnswers();
    // Swift flow: review → grocery choice (GroceryChoiceView).
    router.replace('/meals/grocery-list');
  }

  if (phase === 'working') {
    return (
      <Screen>
        {error ? (
          <GenerationErrorScreen
            error={error}
            onRetry={() => void runGeneration()}
            onCancel={backToSteps}
          />
        ) : (
          <GeneratingScreen />
        )}
      </Screen>
    );
  }

  if (phase === 'review') {
    return (
      <Screen>
        <GeneratedPlanReview onConfirm={() => void confirmPlan()} onBack={backToSteps} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close questionnaire"
            onPress={close}
            style={styles.closeButton}>
            <HiveIcon name="close" size={16} color={HiveColors.text} />
          </Pressable>
          <Text style={styles.navTitle}>Create Your Meal Plan</Text>
          <View style={styles.closeButton} />
        </View>

        <View style={styles.progress}>
          <ProgressBar current={stepIndex + 1} total={QUESTIONNAIRE_STEPS.length} />
          <Text style={[uiText.small, styles.stepCount]}>
            Step {stepIndex + 1} of {QUESTIONNAIRE_STEPS.length}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <StepHeader step={step} />
          <Section answers={answers} update={update} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={styles.bottomButtons}>
            {stepIndex > 0 ? (
              <AppButton
                title="Back"
                variant="secondary"
                onPress={() => setStepIndex((current) => current - 1)}
                style={styles.backButton}
              />
            ) : null}
            <AppButton
              title={isLastStep ? 'Generate' : 'Continue'}
              onPress={() => void advance()}
              style={styles.continueButton}
            />
          </View>
        </View>
      </View>

      <ModalSheet visible={limitGate !== null} onClose={() => setLimitGate(null)}>
        {limitGate ? <AiLimitGate usage={limitGate} onClose={() => setLimitGate(null)} /> : null}
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: HiveColors.text },
  progress: { paddingHorizontal: 24, paddingTop: 8, gap: 8 },
  stepCount: { textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: HiveColors.border,
    backgroundColor: HiveColors.white,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  bottomButtons: { flexDirection: 'row', gap: 12 },
  backButton: { flex: 1 },
  continueButton: { flex: 2 },
});
