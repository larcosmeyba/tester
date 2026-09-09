/**
 * The review screen: everything that will be written on the form, before it is.
 *
 * This is the last point at which a person sees the application as a person,
 * and it is the reason the whole system is built the way it is. What is shown
 * is exactly what the server resolved — no value is composed here — and it is
 * grouped by page so it can be read against the printed form.
 *
 * Approving is what flattens the document. The server refuses while anything
 * required is missing, so the button is disabled and the outstanding questions
 * are shown instead of a failure after the fact.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton, AppHeader, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { BenefitsDatePicker } from '@/features/benefits/benefits-date-picker';
import {
  type BenefitsApplication,
  approveBenefitsApplication,
  benefitsDocumentUrl,
  confirmBenefitsRenewalDeadline,
  fetchBenefitsApplication,
  fetchBenefitsProgramRules,
  fetchBenefitsRenewals,
  requiredQuestionsToAsk,
} from '@/features/benefits/benefits-repository';
import {
  ruleDerivedDeadline,
  ruleForProgram,
  typicalPeriodLabel,
} from '@/features/benefits/benefits-renewals';

export default function BenefitsReviewScreen() {
  const router = useRouter();
  const { programId } = useLocalSearchParams<{ programId?: string }>();
  const applicationId = programId;

  const [application, setApplication] = useState<BenefitsApplication | null>(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  // The post-approval deadline prompt. Shown once, right after approval, so the
  // user can confirm the certification end that the renewal schedule will use.
  // Skipping is safe: the renewal already exists with the rule-derived default.
  const [deadlinePrompt, setDeadlinePrompt] = useState<{
    renewalId: string;
    program: string;
    certMonths: number | null;
    picked: Date;
  } | null>(null);
  const [confirmingDeadline, setConfirmingDeadline] = useState(false);

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
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the application.');
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const outstanding = useMemo(
    () => (application ? requiredQuestionsToAsk(application) : []),
    [application],
  );

  const pages = useMemo(() => {
    if (!application) return [];
    const byPage = new Map<number, BenefitsApplication['filledFields']>();
    for (const field of application.filledFields) {
      const existing = byPage.get(field.page);
      if (existing) existing.push(field);
      else byPage.set(field.page, [field]);
    }
    return [...byPage.entries()].sort(([a], [b]) => a - b);
  }, [application]);

  /**
   * After approval the server creates the renewal with a rule-derived deadline.
   * Offer the user one question — when their certification ends — pre-filled
   * with that default. Best-effort: if the renewal or the rules are not
   * available, the renewal simply keeps its rule-derived default.
   */
  const promptForRenewalDeadline = useCallback(async (approved: BenefitsApplication) => {
    try {
      const [rules, renewals] = await Promise.all([
        fetchBenefitsProgramRules(approved.form.program),
        fetchBenefitsRenewals(),
      ]);
      const renewal = renewals.find(
        (candidate) =>
          candidate.program === approved.form.program &&
          candidate.state === approved.form.state &&
          (candidate.status === 'scheduled' || candidate.status === 'reminded'),
      );
      if (!renewal) return;
      const rule = ruleForProgram(rules, approved.form.program, approved.form.state);
      const base = approved.approvedAt ? new Date(approved.approvedAt) : new Date();
      // Programs without a fixed certification period (certPeriodMonths null)
      // keep the server's existing deadline; there is nothing to pre-fill.
      const picked =
        rule && rule.certPeriodMonths != null
          ? ruleDerivedDeadline(base, rule.certPeriodMonths)
          : new Date(renewal.renewalDueAt);
      setDeadlinePrompt({
        renewalId: renewal.id,
        program: approved.form.program,
        certMonths: rule?.certPeriodMonths ?? null,
        picked,
      });
    } catch {
      // The renewal exists with the rule-derived default; the prompt is optional.
    }
  }, []);

  const approve = useCallback(async () => {
    if (!application) return;
    setApproving(true);
    setError('');
    try {
      const approved = await approveBenefitsApplication(application.id);
      setApplication(approved);
      if (approved.status === 'COMPLETED') {
        void promptForRenewalDeadline(approved);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This application could not be approved.');
    } finally {
      setApproving(false);
    }
  }, [application, promptForRenewalDeadline]);

  const confirmDeadline = useCallback(async () => {
    if (!deadlinePrompt || confirmingDeadline) return;
    setConfirmingDeadline(true);
    setError('');
    try {
      const iso = deadlinePrompt.picked.toISOString();
      await confirmBenefitsRenewalDeadline(deadlinePrompt.renewalId, iso, iso);
      setDeadlinePrompt(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your deadline.');
    } finally {
      setConfirmingDeadline(false);
    }
  }, [confirmingDeadline, deadlinePrompt]);

  if (application === null) {
    const message = !applicationId
      ? 'No application was selected.'
      : error !== ''
        ? error
        : 'Loading…';
    return (
      <ScrollScreen>
        <AppHeader title="Review application" onBack={router.back} />
        <View style={styles.body}>
          <Text style={message === 'Loading…' ? uiText.muted : styles.error}>{message}</Text>
        </View>
      </ScrollScreen>
    );
  }

  const approved = application.status === 'COMPLETED';
  const documentPath = approved ? application.finalDocumentPath : application.draftDocumentPath;

  return (
    <ScrollScreen>
      <AppHeader title={application.form.formTitle} onBack={router.back} />

      <View style={styles.body}>
        <Text style={styles.meta}>
          {application.form.program}
          {application.form.state ? ` · ${application.form.state}` : ''} ·{' '}
          {application.form.formCode} · {application.form.pageCount} pages
        </Text>

        {deadlinePrompt ? (
          <Card>
            <Text style={uiText.subtitle}>When does your certification end?</Text>
            <Text style={uiText.muted}>
              {deadlinePrompt.certMonths != null
                ? typicalPeriodLabel(deadlinePrompt.program, deadlinePrompt.certMonths)
                : 'Confirm the end of your certification period. We will remind you before it is time to renew.'}
            </Text>
            <BenefitsDatePicker
              value={deadlinePrompt.picked}
              minimumDate={new Date()}
              onChange={(date) => setDeadlinePrompt({ ...deadlinePrompt, picked: date })}
            />
            <AppButton
              title={confirmingDeadline ? 'Saving…' : 'Confirm deadline'}
              onPress={() => void confirmDeadline()}
              disabled={confirmingDeadline}
            />
            <AppButton
              title="I'll do this later"
              variant="plain"
              onPress={() => setDeadlinePrompt(null)}
              disabled={confirmingDeadline}
            />
          </Card>
        ) : null}

        {outstanding.length > 0 ? (
          <Card style={styles.warning}>
            <Text style={uiText.subtitle}>
              {outstanding.length} {outstanding.length === 1 ? 'answer is' : 'answers are'} still needed
            </Text>
            <Text style={uiText.muted}>
              These boxes stay blank until you answer them. Nothing is filled in on your behalf.
            </Text>
            {outstanding.slice(0, 6).map((field) => (
              <Text key={field.fieldPath} style={styles.outstanding}>
                · {field.label}
              </Text>
            ))}
            <AppButton
              title="Answer these"
              onPress={() =>
                router.push(`/resources/benefits-questionnaire?applicationId=${application.id}`)
              }
            />
          </Card>
        ) : null}

        {application.status === 'FAILED' && application.failureReason ? (
          <Card style={styles.warning}>
            <Text style={uiText.subtitle}>This application could not be produced</Text>
            <Text style={uiText.muted}>{application.failureReason}</Text>
            <Text style={uiText.muted}>
              Your answers are saved. Answering what is outstanding and trying again is usually
              enough; if it is not, this is one for support.
            </Text>
          </Card>
        ) : null}

        {application.problems.length > 0 ? (
          <Card style={styles.warning}>
            <Text style={uiText.subtitle}>Needs a look</Text>
            {application.problems.map((problem) => (
              <Text key={problem.fieldId} style={styles.outstanding}>
                · {problem.reason}
              </Text>
            ))}
          </Card>
        ) : null}

        {pages.map(([page, fields]) => (
          <Card key={page}>
            <Text style={uiText.subtitle}>Page {page}</Text>
            {fields.map((field) => (
              <View key={field.fieldId} style={styles.row}>
                <Text style={styles.rowLabel}>{field.label || field.fieldId}</Text>
                <Text style={styles.rowValue}>
                  {field.isCheckbox ? (field.checked ? 'Ticked' : 'Not ticked') : field.text}
                </Text>
                {field.source === 'DERIVED' ? (
                  <Text style={styles.rowNote}>Worked out from your other answers</Text>
                ) : null}
                {field.source === 'MAPPING_CONSTANT' ? (
                  <Text style={styles.rowNote}>Fixed by this form</Text>
                ) : null}
              </View>
            ))}
          </Card>
        ))}

        <Card>
          <Text style={uiText.subtitle}>Signature</Text>
          <Text style={uiText.muted}>
            The signature and the date beside it are left blank on purpose. Help The Hive does not
            sign an application for you — you sign it, and you submit it to the agency yourself.
          </Text>
        </Card>

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        {documentPath ? (
          <AppButton
            title={approved ? 'Open the completed PDF' : 'Open the draft PDF'}
            onPress={() => Linking.openURL(benefitsDocumentUrl(documentPath))}
          />
        ) : null}

        {approved ? (
          <Text style={styles.approved}>
            Approved. The completed PDF is final and can no longer be edited.
          </Text>
        ) : (
          <AppButton
            title={approving ? 'Finishing…' : 'Approve and finish'}
            onPress={approve}
            disabled={approving || outstanding.length > 0 || application.problems.length > 0}
          />
        )}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  meta: { color: HiveColors.textSecondary, fontSize: 12 },
  warning: { backgroundColor: HiveColors.warningBg },
  outstanding: { color: HiveColors.text, fontSize: 13, marginTop: 2 },
  row: { marginTop: Spacing.one },
  rowLabel: { color: HiveColors.textSecondary, fontSize: 12 },
  rowValue: { color: HiveColors.text, fontSize: 15 },
  rowNote: { color: HiveColors.textSecondary, fontSize: 11, fontStyle: 'italic' },
  error: { color: HiveColors.danger, fontSize: 13 },
  approved: { color: HiveColors.success, fontSize: 13 },
});
