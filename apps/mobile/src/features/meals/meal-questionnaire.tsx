/**
 * The meal-planning questionnaire wizard: 5 steps, 15 questions.
 *
 * Answers live in `IosQuestionnaireAnswers` while the user moves through the
 * steps and are folded into `PlanRequest` (via `applyIosAnswers`) on every
 * change, so what the user sees and what gets posted to `POST /plans` can
 * never drift apart. On success it routes to the **main meal plan page** — the
 * user is never left inside the generator.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Radii } from '@/constants/theme';
import { useAuth } from '@/auth/auth-context';
import { MealPlanGenerating } from '@/features/meals/meal-plan-generating';
import { useMealPlan } from '@/features/meals/meal-plan-context';
import {
  BudgetStepSection,
  DietsStepSection,
  HealthStepSection,
  HouseholdStepSection,
  TasteStepSection,
  type IosSectionProps,
} from '@/features/meals/questionnaire-sections';
import {
  applyIosAnswers,
  canAdvance,
  DEFAULT_IOS_ANSWERS,
  QUESTIONNAIRE_STEPS,
  type IosQuestionnaireAnswers,
  type QuestionnaireStepId,
} from '@/features/meals/questionnaire-steps';

const SECTION_COMPONENTS: Record<
  QuestionnaireStepId,
  (props: IosSectionProps) => React.ReactElement
> = {
  household: HouseholdStepSection,
  diets: DietsStepSection,
  health: HealthStepSection,
  taste: TasteStepSection,
  budget: BudgetStepSection,
};

/** Icon tint per step, echoing the iOS header circles. */
const STEP_TINTS: Record<QuestionnaireStepId, { background: string; icon: string }> = {
  household: { background: '#E7F0FE', icon: '#2F7CF6' },
  diets: { background: HiveColors.greenLight, icon: HiveColors.greenDark },
  health: { background: '#FDE8EA', icon: '#E5484D' },
  taste: { background: '#FFF1DE', icon: '#F59E0B' },
  budget: { background: HiveColors.greenLight, icon: HiveColors.greenDark },
};

export function MealQuestionnaire() {
  const router = useRouter();
  const auth = useAuth();
  const { request, updateRequest, generate, isGenerating, error, clearError } = useMealPlan();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<IosQuestionnaireAnswers>(DEFAULT_IOS_ANSWERS);

  const step = QUESTIONNAIRE_STEPS[stepIndex]!;
  const isLast = stepIndex === QUESTIONNAIRE_STEPS.length - 1;
  const Section = SECTION_COMPONENTS[step.id];

  // Keep the context's PlanRequest in lock-step with the wizard answers.
  useEffect(() => {
    updateRequest(applyIosAnswers(request, answers));
    // `request` is intentionally read once per answers change; including it
    // would re-run on every context update and loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const canContinue = useMemo(() => canAdvance(step.id, answers), [step.id, answers]);

  const patch = useCallback((part: Partial<IosQuestionnaireAnswers>) => {
    setAnswers((current) => ({ ...current, ...part }));
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
      router.replace('/meals/plan');
    } catch {
      // The failure is held in context and rendered by MealPlanGenerating,
      // which offers a retry. Nothing to do here.
      return;
    }
  }

  if (isGenerating || error) {
    return (
      <MealPlanGenerating
        error={error}
        onRetry={() => void submit()}
        onCancel={() => {
          clearError();
          setStepIndex(0);
        }}
      />
    );
  }

  const tint = STEP_TINTS[step.id];

  return (
    <ScrollScreen keyboard>
      <View style={styles.body}>
        <View style={styles.progress}>
          {QUESTIONNAIRE_STEPS.map((candidate) => (
            <View
              key={candidate.id}
              style={[
                styles.segment,
                candidate.position <= step.position ? styles.segmentDone : styles.segmentTodo,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepCounter}>
          Step {step.position} of {QUESTIONNAIRE_STEPS.length}
        </Text>

        <View style={styles.heading}>
          <View style={[styles.iconCircle, { backgroundColor: tint.background }]}>
            <HiveIcon name={step.icon} size={34} color={tint.icon} />
          </View>
          <Text style={uiText.title}>{step.title}</Text>
          <Text style={uiText.muted}>{step.subtitle}</Text>
        </View>

        <Section answers={answers} onPatch={patch} />

        <View style={styles.actions}>
          {isLast ? (
            <View style={styles.finalRow}>
              <AppButton title="Back" variant="secondary" onPress={back} style={styles.backButton} />
              <AppButton
                title="Generate My Meal Plan 🐝"
                disabled={!canContinue}
                onPress={() => void submit()}
                style={styles.generateButton}
              />
            </View>
          ) : (
            <View style={styles.navRow}>
              {stepIndex > 0 ? (
                <AppButton title="Back" variant="secondary" onPress={back} style={styles.backButton} />
              ) : null}
              <AppButton
                title="Continue"
                disabled={!canContinue}
                onPress={() => setStepIndex((current) => current + 1)}
                style={stepIndex > 0 ? styles.continueButton : styles.continueFull}
              />
            </View>
          )}
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 20,
  },
  progress: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  segmentDone: { backgroundColor: HiveColors.greenDark },
  segmentTodo: { backgroundColor: HiveColors.border },
  stepCounter: {
    textAlign: 'center',
    color: HiveColors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  heading: {
    gap: 12,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: 8,
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
  },
  finalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
  },
  continueButton: {
    flex: 2,
  },
  continueFull: {
    flex: 1,
  },
  generateButton: {
    flex: 2,
    borderRadius: Radii.xl,
  },
});
