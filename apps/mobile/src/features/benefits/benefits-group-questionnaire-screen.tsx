/**
 * Benefits flow, Page 3 — Universal Autofill Questionnaire (audit Section 3).
 *
 * One guided questionnaire across every application the user picked on Page 2.
 * The question list is the union of the server-reported outstanding questions
 * for all selected applications, deduplicated by fieldPath: a question asked
 * once fills every form that needs it, because answers are stored once on the
 * benefits profile and shared across applications.
 *
 * Audit rules honoured here:
 * - Only questions required by the selected PDFs are asked (the union of each
 *   application's server-computed missing fields, minus derived fields).
 * - No question is asked twice.
 * - SSN is never asked: the server's NeverAsk policy is authoritative, and a
 *   client-side belt-and-braces filter below drops anything SSN-shaped too.
 * - Every answer is saved to the server before moving on (autosave); answers
 *   live server-side, never in local storage.
 * - Leaving returns the user to the exact point via the drop-off reminder,
 *   which carries the first section that still has unanswered questions.
 * - Before the final continue, a missing-information checklist names every
 *   required question that still needs an answer.
 *
 * On completion the user lands on the "Penny is preparing your applications"
 * screen (route 'benefitsPreparing'), which the next slice builds out fully.
 */
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  AppTextField,
  Card,
  Chip,
  ProgressBar,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type Navigation } from '@/features/app/navigation-types';
import {
  type BenefitsApplication,
  type BenefitsMissingField,
  answerFrom,
  fetchBenefitsApplication,
  groupQuestions,
  noneAnswer,
  refillBenefitsApplication,
  saveBenefitsAnswers,
} from '@/features/benefits/benefits-repository';
import { excludeNeverAskQuestions, unionMissingFields } from './benefits-flow-state';
import {
  cancelQuestionnaireDropOffReminders,
  scheduleQuestionnaireDropOffReminder,
} from './benefits-reminder';

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

function isAnswered(
  question: BenefitsMissingField,
  answers: Record<string, string>,
  declaredNone: Record<string, boolean>,
): boolean {
  return declaredNone[question.fieldPath] === true || (answers[question.fieldPath] ?? '').trim() !== '';
}

export function BenefitsGroupQuestionnaireScreen({
  nav,
  applicationIds,
  state,
  resumeSection = 0,
}: {
  nav: Navigation;
  applicationIds: string[];
  state: string;
  resumeSection?: number;
}) {
  const [applications, setApplications] = useState<BenefitsApplication[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [declaredNone, setDeclaredNone] = useState<Record<string, boolean>>({});
  const [sectionIndex, setSectionIndex] = useState(resumeSection);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [jumpNotice, setJumpNotice] = useState('');

  // Marks the run finished so the unmount drop-off check stays silent.
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await Promise.all(applicationIds.map((id) => fetchBenefitsApplication(id)));
        if (cancelled) return;
        const missing = loaded.findIndex((application) => application == null);
        if (missing !== -1) {
          throw new Error('Could not load your applications.');
        }
        setApplications(
          loaded.filter((application): application is BenefitsApplication => application != null),
        );
      } catch (cause) {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'Could not load your applications.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // One-shot load: the application set is fixed for this questionnaire run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const questions = useMemo(
    () =>
      applications === null
        ? []
        : excludeNeverAskQuestions(unionMissingFields(applications)),
    [applications],
  );

  const sections = useMemo(() => groupQuestions(questions), [questions]);

  // Clamp the resume section: if the reminder payload is stale, start at the
  // first section instead of crashing.
  const safeSectionIndex =
    sections.length === 0 ? 0 : Math.min(Math.max(sectionIndex, 0), sections.length - 1);
  const section = sections[safeSectionIndex];

  // Drop-off reminder: leaving the screen unfinished schedules the nudge that
  // brings the user back to the first section that still needs answers.
  // useEffectEvent always sees the latest questions/answers, so the unmount
  // cleanup below needs no ref syncing.
  const maybeScheduleDropOff = useEffectEvent(() => {
    if (finishedRef.current) return;
    const incomplete = firstSectionWithUnansweredRequired(sections, answers, declaredNone);
    if (incomplete === null) return;
    void scheduleQuestionnaireDropOffReminder({
      applicationIds,
      state,
      resumeSection: incomplete,
    });
  });

  useEffect(() => {
    return () => {
      maybeScheduleDropOff();
    };
  }, []);

  // If every application is already fully answered, skip straight ahead —
  // there is nothing to ask and nothing to remind about.
  useEffect(() => {
    if (applications !== null && questions.length === 0 && !finishedRef.current) {
      finishedRef.current = true;
      (async () => {
        for (const id of applicationIds) {
          await refillBenefitsApplication(id);
        }
        nav.push('benefitsPreparing', { applicationIds, state });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, questions.length]);

  function firstIncompleteSectionIndex(): number | null {
    return firstSectionWithUnansweredRequired(sections, answers, declaredNone);
  }

  async function saveCurrentSection(): Promise<boolean> {
    if (!section) return false;
    setSaving(true);
    setSaveError('');
    try {
      const payload = section.questions.map((question) =>
        declaredNone[question.fieldPath]
          ? noneAnswer(question.fieldPath)
          : answerFrom(question, answers[question.fieldPath]),
      );
      // Profile-level save: one call stores the answers once, and every
      // selected application shares them.
      await saveBenefitsAnswers(payload);
      return true;
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save your answers.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onContinue() {
    const saved = await saveCurrentSection();
    if (!saved) return;
    const isLast = safeSectionIndex >= sections.length - 1;
    if (!isLast) {
      setJumpNotice('');
      setSectionIndex(safeSectionIndex + 1);
      return;
    }
    // Final continue: every required question must have an answer. If any are
    // still open, jump back to the first incomplete section instead of
    // leaving a hole in the applications.
    const incomplete = firstIncompleteSectionIndex();
    if (incomplete !== null && incomplete !== safeSectionIndex) {
      setJumpNotice(
        'A few required questions still need answers — let’s finish those first.',
      );
      setSectionIndex(incomplete);
      return;
    }
    finishedRef.current = true;
    await cancelQuestionnaireDropOffReminders(applicationIds);
    for (const id of applicationIds) {
      await refillBenefitsApplication(id);
    }
    nav.push('benefitsPreparing', { applicationIds, state });
  }

  if (loadError !== '') {
    return (
      <ScrollScreen>
        <AppHeader title="Benefits Questionnaire" onBack={nav.back} />
        <View style={styles.body}>
          <Text style={uiText.body}>{loadError}</Text>
          <AppButton title="Go back" variant="secondary" onPress={nav.back} />
        </View>
      </ScrollScreen>
    );
  }

  if (!section) {
    return (
      <ScrollScreen>
        <AppHeader title="Benefits Questionnaire" onBack={nav.back} />
        <View style={styles.body}>
          <Text style={uiText.body}>Loading your questions…</Text>
        </View>
      </ScrollScreen>
    );
  }

  const totalQuestions = questions.length;
  const percent = Math.round((safeSectionIndex / sections.length) * 100);
  const isLast = safeSectionIndex >= sections.length - 1;
  // Missing-information checklist: required questions with no answer yet,
  // outside the section the user is answering now.
  const missingElsewhere = questions.filter(
    (question) =>
      question.strength === 'REQUIRED' &&
      !section.questions.includes(question) &&
      !isAnswered(question, answers, declaredNone),
  );

  return (
    <ScrollScreen>
      <AppHeader title="Benefits Questionnaire" onBack={nav.back} />
      <View style={styles.progress}>
        <ProgressBar current={safeSectionIndex + 1} total={sections.length} />
        <Text style={styles.progressLabel}>
          Step {safeSectionIndex + 1} of {sections.length} · {totalQuestions}{' '}
          {totalQuestions === 1 ? 'question' : 'questions'} · {percent}% complete
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={uiText.title}>{groupTitles[section.group] ?? section.group}</Text>
        {jumpNotice !== '' ? <Text style={styles.jumpNotice}>{jumpNotice}</Text> : null}
        {section.questions.map((question) => (
          <QuestionField
            key={question.fieldPath}
            question={question}
            value={answers[question.fieldPath] ?? ''}
            none={declaredNone[question.fieldPath] === true}
            onChange={(text) =>
              setAnswers((current) => ({ ...current, [question.fieldPath]: text }))
            }
            onDeclareNone={() =>
              setDeclaredNone((current) => ({
                ...current,
                [question.fieldPath]: !current[question.fieldPath],
              }))
            }
          />
        ))}

        {isLast && missingElsewhere.length > 0 ? (
          <Card>
            <Text style={uiText.subtitle}>Still to answer</Text>
            <Text style={styles.checklistHint}>
              These required questions need answers before we can prepare your applications:
            </Text>
            {missingElsewhere.map((question) => (
              <Text key={question.fieldPath} style={styles.checklistItem}>
                • {question.question}
              </Text>
            ))}
          </Card>
        ) : null}

        {saveError !== '' ? <Text style={styles.saveError}>{saveError}</Text> : null}
        <Text style={styles.footnote}>
          Your answers save automatically as you go, and one answer fills every application that
          needs it.
        </Text>
        <AppButton
          title={saving ? 'Saving…' : isLast ? 'Save and review' : 'Save and continue'}
          onPress={onContinue}
          disabled={saving}
        />
      </View>
    </ScrollScreen>
  );
}

/** Index of the first section with an unanswered required question, or null. */
function firstSectionWithUnansweredRequired(
  sections: { group: string; questions: BenefitsMissingField[] }[],
  answers: Record<string, string>,
  declaredNone: Record<string, boolean>,
): number | null {
  for (let index = 0; index < sections.length; index += 1) {
    const open = sections[index].questions.some(
      (question) =>
        question.strength === 'REQUIRED' && !isAnswered(question, answers, declaredNone),
    );
    if (open) return index;
  }
  return null;
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

      {!required ? (
        <Chip label={none ? '✓ I have none' : 'I have none'} selected={none} onPress={onDeclareNone} />
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
  required: { color: HiveColors.danger, fontSize: 12, fontWeight: '700' },
  sensitive: { color: HiveColors.textSecondary, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.two },
  jumpNotice: {
    backgroundColor: HiveColors.greenLight,
    borderRadius: 12,
    padding: Spacing.three,
    color: HiveColors.text,
    fontSize: 14,
  },
  checklistHint: { color: HiveColors.textSecondary, fontSize: 13, marginBottom: Spacing.one },
  checklistItem: { color: HiveColors.text, fontSize: 14, marginBottom: 4 },
  saveError: { color: HiveColors.danger, fontSize: 13 },
  footnote: { color: HiveColors.textSecondary, fontSize: 12 },
});
