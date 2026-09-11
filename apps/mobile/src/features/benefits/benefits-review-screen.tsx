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

import { AppButton, AppHeader, AppTextField, AskPennyLink, Card, CheckboxRow, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { BenefitsDatePicker } from '@/features/benefits/benefits-date-picker';
import {
  useBenefitsParams,
  useBenefitsRouter,
} from '@/features/benefits/benefits-shell-bridge';
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
import { isSignatureComplete } from '@/features/benefits/benefits-signature';

export default function BenefitsReviewScreen() {
  const router = useBenefitsRouter();
  // The expo route is /resources/applications/[programId] (a legacy name —
  // the value has always been the application id); the shell passes
  // applicationId directly. Either is accepted.
  const { programId, applicationId: shellApplicationId } = useBenefitsParams<{
    programId?: string;
    applicationId?: string;
  }>();
  const applicationId = shellApplicationId ?? programId;

  const [application, setApplication] = useState<BenefitsApplication | null>(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  // The signature is typed, never pre-filled: the server refuses a blank
  // name, and pre-filling would sign the applicant's name for them.
  const [signedName, setSignedName] = useState('');
  const [attestationAccepted, setAttestationAccepted] = useState(false);
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
    // Belt and braces: the button is disabled until the signature is
    // complete, but the handler refuses anyway rather than trusting the UI.
    if (!isSignatureComplete(signedName, attestationAccepted)) return;
    setApproving(true);
    setError('');
    try {
      const approved = await approveBenefitsApplication(
        application.id,
        signedName.trim(),
        attestationAccepted,
      );
      setApplication(approved);
      if (approved.status === 'COMPLETED') {
        void promptForRenewalDeadline(approved);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This application could not be approved.');
    } finally {
      setApproving(false);
    }
  }, [application, attestationAccepted, promptForRenewalDeadline, signedName]);

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
        <AskPennyLink
          message="Questions about this form? Ask Penny"
          onPress={() => router.push('/penny')}
        />

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

        {approved ? (
          <Card>
            <Text style={uiText.subtitle}>Signature</Text>
            <Text style={uiText.muted}>
              Signed by {application.signedName ?? 'you'}
              {application.signedAt ? ` on ${new Date(application.signedAt).toLocaleDateString()}` : ''}.
              The completed PDF is final and can no longer be edited.
            </Text>
            <AppButton
              title="Continue to the official portal"
              onPress={() => router.push(`/resources/benefits-zip?applicationId=${application.id}`)}
            />
            <Text style={uiText.muted}>
              Nothing has been submitted to an agency. You apply on the state&apos;s own website —
              Help The Hive never sees your login and never submits for you.
            </Text>
          </Card>
        ) : (
          <Card>
            <Text style={uiText.subtitle}>Sign to finish</Text>
            <Text style={uiText.muted}>
              Type your full name exactly as it should appear on the application. It is never
              filled in for you — only you can sign.
            </Text>
            <AppTextField
              label="Full name"
              value={signedName}
              onChangeText={setSignedName}
              placeholder="Type your full name"
              autoCapitalize="words"
            />
            <CheckboxRow
              title="I've reviewed everything above"
              subtitle="I understand this prepares my application paperwork — it does not submit anything to an agency. I apply on the official portal myself."
              selected={attestationAccepted}
              onPress={() => setAttestationAccepted((current) => !current)}
            />
          </Card>
        )}

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        {documentPath ? (
          <AppButton
            title={approved ? 'Open the completed PDF' : 'Open the draft PDF'}
            onPress={() => Linking.openURL(benefitsDocumentUrl(documentPath))}
          />
        ) : null}

        {!approved ? (
          <AppButton
            title={approving ? 'Finishing…' : 'Approve and finish'}
            onPress={() => void approve()}
            disabled={
              approving ||
              outstanding.length > 0 ||
              application.problems.length > 0 ||
              !isSignatureComplete(signedName, attestationAccepted)
            }
          />
        ) : null}
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
});
