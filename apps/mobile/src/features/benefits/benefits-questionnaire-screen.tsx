/**
 * The questionnaire.
 *
 * It asks exactly the questions the server says are outstanding, in the wording
 * the server supplies, and nothing more. There is no hardcoded list of
 * questions here: adding one is a change to the field vocabulary on the server.
 *
 * Two rules the screen exists to honour.
 *
 * A blank box is not an answer. Leaving a field empty records nothing at all,
 * and the question comes back next time. Saying "I have none of these" is a
 * separate button, because on a benefits form "no income" and "we never asked"
 * are different claims and only one of them may be printed.
 *
 * Some outstanding values cannot be asked for. A household's total monthly
 * income is computed from its income sources, so it is filtered out of the
 * questions and filled by answering the ones it is derived from.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  AppTextField,
  AskPennyLink,
  Card,
  Chip,
  ProgressBar,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  useBenefitsParams,
  useBenefitsRouter,
} from '@/features/benefits/benefits-shell-bridge';
import {
  type BenefitsApplication,
  type BenefitsMissingField,
  answerFrom,
  fetchBenefitsApplication,
  groupQuestions,
  noneAnswer,
  prefillAnswersFromProfile,
  questionsToAsk,
  refillBenefitsApplication,
  saveBenefitsAnswers,
} from '@/features/benefits/benefits-repository';
import { useAppState } from '@/state/app-state';

const groupTitles: Record<string, string> = {
  applicant: 'About you',
  contact: 'How to reach you',
  address: 'Where you live',
  household: 'Your household',
  employment: 'Work',
  income: 'Money coming in',
  housing: 'Housing',
  utilities: 'Utilities',
  expenses: 'What you pay out',
  resources: 'Savings and vehicles',
  benefits: 'Benefits you already get',
  program: 'About this application',
};

export default function BenefitsQuestionnaireScreen() {
  const router = useBenefitsRouter();
  const { applicationId } = useBenefitsParams<{ applicationId?: string }>();
  const app = useAppState();
  // Scalar fields, not the profile object, so the load effect only re-runs
  // when something the prefill actually uses changes.
  const { firstName, lastName, phone, zip, householdSize } = app.profile;
  const prefillProfile = useMemo(
    () => ({ firstName, lastName, phone, zip, householdSize }),
    [firstName, lastName, phone, zip, householdSize],
  );

  const [application, setApplication] = useState<BenefitsApplication | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [declaredNone, setDeclaredNone] = useState<Record<string, boolean>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Nothing to fetch without an id; the screen renders its own message for
    // that case rather than setting state from inside this effect.
    if (!applicationId) {
      return;
    }
    let cancelled = false;
    fetchBenefitsApplication(applicationId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError('That application could not be found.');
          return;
        }
        setApplication(result);
        // Pre-fill from what the user already gave in onboarding or their
        // profile, before the first save, so they don't retype it. The
        // seeded values stay editable like any other answer, and anything
        // already typed wins over the seed.
        setAnswers((current) => ({
          ...prefillAnswersFromProfile(questionsToAsk(result), prefillProfile, current),
          ...current,
        }));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the application.');
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, prefillProfile]);

  const sections = useMemo(
    () => (application ? groupQuestions(questionsToAsk(application)) : []),
    [application],
  );
  const section = sections[sectionIndex];

  const save = useCallback(async () => {
    if (!application || !section) return;
    setSaving(true);
    setError('');
    try {
      const payload = section.questions
        .map((question) => {
          if (declaredNone[question.fieldPath]) {
            return noneAnswer(question.fieldPath);
          }
          const typed = answers[question.fieldPath];
          // An untouched box is left alone rather than saved as blank.
          if (typed === undefined || typed.trim() === '') {
            return null;
          }
          return answerFrom(question, typed);
        })
        .filter((answer): answer is NonNullable<typeof answer> => answer !== null);

      if (payload.length > 0) {
        await saveBenefitsAnswers(payload);
      }

      const isLast = sectionIndex >= sections.length - 1;
      if (!isLast) {
        setSectionIndex((index) => index + 1);
        return;
      }

      // Re-running the fill is what turns new answers into a new draft, and it
      // is the server that decides whether anything is still outstanding.
      const refilled = await refillBenefitsApplication(application.id);
      setApplication(refilled);
      router.replace(`/resources/applications/${refilled.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Those answers could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [application, answers, declaredNone, router, section, sectionIndex, sections.length]);

  if (!applicationId) {
    return (
      <ScrollScreen>
        <AppHeader title="Benefits questionnaire" onBack={router.back} />
        <View style={styles.body}>
          <Text style={styles.error}>No application was selected.</Text>
        </View>
      </ScrollScreen>
    );
  }

  if (error !== '' && application === null) {
    return (
      <ScrollScreen>
        <AppHeader title="Benefits questionnaire" onBack={router.back} />
        <View style={styles.body}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </ScrollScreen>
    );
  }

  if (application === null) {
    return (
      <ScrollScreen>
        <AppHeader title="Benefits questionnaire" onBack={router.back} />
        <View style={styles.body}>
          <Text style={uiText.muted}>Loading…</Text>
        </View>
      </ScrollScreen>
    );
  }

  if (sections.length === 0) {
    return (
      <ScrollScreen>
        <AppHeader title="Benefits questionnaire" onBack={router.back} />
        <View style={styles.body}>
          <Text style={uiText.subtitle}>Nothing left to ask</Text>
          <Text style={uiText.muted}>
            Every question this form needs has an answer. The next step is to read through what
            will be written on it.
          </Text>
          <AppButton
            title="Review the application"
            onPress={() => router.replace(`/resources/applications/${application.id}`)}
          />
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title={groupTitles[section.group] ?? section.group} onBack={router.back} />
      <View style={styles.progress}>
        <ProgressBar current={sectionIndex + 1} total={sections.length} />
        <Text style={styles.progressLabel}>
          Section {sectionIndex + 1} of {sections.length}
        </Text>
        <AskPennyLink
          message="Confused by a question? Ask Penny"
          onPress={() => router.push('/penny')}
        />
      </View>

      <View style={styles.body}>
        {section.questions.map((question) => (
          <QuestionField
            key={question.fieldPath}
            question={question}
            value={answers[question.fieldPath] ?? ''}
            none={declaredNone[question.fieldPath] ?? false}
            onChange={(text) => {
              setAnswers((current) => ({ ...current, [question.fieldPath]: text }));
              setDeclaredNone((current) => ({ ...current, [question.fieldPath]: false }));
            }}
            onDeclareNone={() =>
              setDeclaredNone((current) => {
                const next = !current[question.fieldPath];
                if (next) {
                  setAnswers((values) => ({ ...values, [question.fieldPath]: '' }));
                }
                return { ...current, [question.fieldPath]: next };
              })
            }
          />
        ))}

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton
          title={
            saving
              ? 'Saving…'
              : sectionIndex >= sections.length - 1
                ? 'Save and review'
                : 'Save and continue'
          }
          onPress={save}
          disabled={saving}
        />
        <Text style={styles.footnote}>
          Anything you leave blank stays blank on the form, and we will ask again. Nothing is
          guessed on your behalf.
        </Text>
      </View>
    </ScrollScreen>
  );
}

function QuestionField({
  question,
  value,
  none,
  onChange,
  onDeclareNone,
}: {
  question: BenefitsMissingField;
  value: string;
  none: boolean;
  onChange: (text: string) => void;
  onDeclareNone: () => void;
}) {
  const required = question.strength === 'REQUIRED';

  return (
    <Card>
      <Text style={uiText.subtitle}>{question.question}</Text>
      {required ? <Text style={styles.required}>Needed for this form</Text> : null}
      {question.isSensitive ? (
        <Text style={styles.sensitive}>
          Kept encrypted on Help The Hive&apos;s server. We only ever show you the last four digits.
        </Text>
      ) : null}

      {question.answerKind === 'BOOLEAN' ? (
        <View style={styles.chips}>
          <Chip label="Yes" selected={value === 'yes'} onPress={() => onChange('yes')} />
          <Chip label="No" selected={value === 'no'} onPress={() => onChange('no')} />
        </View>
      ) : question.choices.length > 0 ? (
        <View style={styles.chips}>
          {question.choices.map((choice) => (
            <Chip
              key={choice}
              label={humanise(choice)}
              selected={value === choice}
              onPress={() => onChange(choice)}
            />
          ))}
        </View>
      ) : (
        <AppTextField
          label={question.label}
          value={none ? '' : value}
          onChangeText={onChange}
          keyboardType={keyboardFor(question.answerKind)}
          placeholder={placeholderFor(question.answerKind)}
        />
      )}

      {/* "I have none of these" is a real answer and is recorded as one — it is
          not the same as leaving the box empty. */}
      {!required ? (
        <Chip label={none ? "✓ I have none" : 'I have none'} selected={none} onPress={onDeclareNone} />
      ) : null}
    </Card>
  );
}

function keyboardFor(kind: string) {
  switch (kind) {
    case 'MONEY':
      return 'decimal-pad' as const;
    case 'NUMBER':
      return 'number-pad' as const;
    default:
      return 'default' as const;
  }
}

function placeholderFor(kind: string) {
  switch (kind) {
    case 'DATE':
      return 'YYYY-MM-DD';
    case 'MONEY':
      return '0.00';
    default:
      return undefined;
  }
}

function humanise(choice: string): string {
  const spaced = choice.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  progress: { paddingHorizontal: Spacing.three, gap: Spacing.one, paddingBottom: Spacing.two },
  progressLabel: { color: HiveColors.textSecondary, fontSize: 12 },
  required: { color: HiveColors.textSecondary, fontSize: 12, marginBottom: 2 },
  sensitive: { color: HiveColors.info, fontSize: 12, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  error: { color: HiveColors.danger, fontSize: 13 },
  footnote: { color: HiveColors.textSecondary, fontSize: 12, marginTop: Spacing.one },
});
