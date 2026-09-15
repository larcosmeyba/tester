/**
 * Page 5 — Applications Ready (audit Section 3b).
 *
 * Rendered as a phase inside the preparing flow: the AppRoot shell owns the
 * route table and has no route for this page, so the preparing screen swaps
 * to this view once the backend reports the applications ready rather than
 * pushing a new route.
 *
 * - One card per application: program, state, product status pill, expandable
 *   answer review, an "I reviewed my application" confirmation gate, and the
 *   generated-PDF actions (Download / Print) plus the Submission Guide.
 * - Download / Print stay disabled until the review box is ticked AND a
 *   generated PDF actually exists; where no PDF exists the card says so
 *   honestly instead of offering a dead button.
 * - "Edit answers" opens the edit modal and resets every review confirmation,
 *   because the confirmed answers are no longer the ones on the form.
 * - Continue opens the Page 6 submission-status sheet.
 */
import { useCallback, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppHeader,
  Card,
  CheckboxRow,
  Chip,
  ModalSheet,
  ScrollScreen,
  uiText,
} from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import type { Navigation } from '@/features/app/navigation-types';
import { useAppState } from '@/state/app-state';

import { requiredQuestionsToAsk } from './benefits-answers';
import { downloadAndSharePdf, printPdf } from './benefits-document-actions';
import { BenefitsEditAnswers } from './benefits-edit-answers';
import { BenefitsSubmissionControl } from './benefits-submission-control';
import {
  fetchBenefitsApplication,
  type BenefitsApplication,
} from './benefits-repository';
import {
  countRequiredMissing,
  productStatusFor,
  statusToneFor,
} from './benefits-status';
import { BenefitsSubmissionGuide } from './benefits-submission-guide';

function programNameFor(application: BenefitsApplication): string {
  return application.form.formTitle || application.form.program;
}

export function BenefitsReadyView({
  nav,
  initialApplications,
  applicationIds,
  state,
}: {
  nav: Navigation;
  initialApplications: BenefitsApplication[];
  applicationIds: string[];
  state: string;
}) {
  const [applications, setApplications] = useState<BenefitsApplication[]>(initialApplications);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [guideFor, setGuideFor] = useState<BenefitsApplication | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusSheet, setStatusSheet] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const app = useAppState();

  const missingTotal = useMemo(() => countRequiredMissing(applications), [applications]);

  /**
   * TODO (Section 3b): Penny has no context handoff — there is no parameter,
   * persistence, or API that tells Penny which applications the user was
   * looking at. Until one exists, this just opens the Penny tab; do not
   * invent a context-passing mechanism.
   */
  function askPenny() {
    app.setSelectedTab(2);
    nav.reset('main');
  }

  const refresh = useCallback(async () => {
    const fresh: BenefitsApplication[] = [];
    for (const applicationId of applicationIds) {
      const application = await fetchBenefitsApplication(applicationId);
      if (application) fresh.push(application);
    }
    setApplications(fresh);
  }, [applicationIds]);

  function toggleExpanded(applicationId: string) {
    setExpanded((current) => ({ ...current, [applicationId]: !current[applicationId] }));
  }

  function toggleReviewed(applicationId: string) {
    setReviewed((current) => ({ ...current, [applicationId]: !current[applicationId] }));
  }

  /** Editing answers invalidates every review confirmation. */
  function handleSaved() {
    setEditing(false);
    setReviewed({});
    void refresh().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not refresh your applications.');
    });
  }

  async function handleDownload(application: BenefitsApplication) {
    const documentPath = application.finalDocumentPath ?? application.draftDocumentPath;
    if (!documentPath) return;
    setBusy((current) => ({ ...current, [application.id]: 'download' }));
    setError('');
    try {
      await downloadAndSharePdf(documentPath, `${application.form.program}-application.pdf`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the PDF.');
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[application.id];
        return next;
      });
    }
  }

  async function handlePrint(application: BenefitsApplication) {
    const documentPath = application.finalDocumentPath ?? application.draftDocumentPath;
    if (!documentPath) return;
    setBusy((current) => ({ ...current, [application.id]: 'print' }));
    setError('');
    try {
      await printPdf(documentPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not print the PDF.');
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[application.id];
        return next;
      });
    }
  }

  /**
   * Page 6 — "Yes, I submitted" is session-only. There is no backend mutation
   * that persists submission status, so this must not be presented as saved.
   * TODO (Section 3b): add a markBenefitsApplicationSubmitted mutation; until
   * then the Submitted pill below lives only in this session and submission
   * reminders stay active.
   */
  function markSubmitted() {
    setSubmitted(Object.fromEntries(applications.map((application) => [application.id, true])));
    setStatusSheet(false);
  }

  return (
    <ScrollScreen>
      <AppHeader title="Applications Ready" onBack={nav.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          We&apos;ve completed your applications. Review each one before downloading or printing.
        </Text>

        <AppButton title="Ask Penny for help" variant="plain" onPress={askPenny} />

        {missingTotal > 0 ? (
          <Card style={styles.warning}>
            <Text style={uiText.subtitle}>Still needed: {missingTotal}</Text>
            {applications.flatMap((application) =>
              requiredQuestionsToAsk(application).map((field) => (
                <Text key={`${application.id}:${field.fieldPath}`} style={styles.bullet}>
                  · {field.label} ({programNameFor(application)})
                </Text>
              )),
            )}
            <Text style={uiText.muted}>
              These boxes stay blank on the printed form until you answer them.
            </Text>
            <AppButton title="Edit answers" variant="secondary" onPress={() => setEditing(true)} />
          </Card>
        ) : null}

        {applications.map((application) => {
          const status = productStatusFor(application, submitted[application.id] ?? false);
          const isReviewed = reviewed[application.id] ?? false;
          const documentPath = application.finalDocumentPath ?? application.draftDocumentPath;
          const canAct = isReviewed && documentPath != null;
          const busyKind = busy[application.id];
          const isExpanded = expanded[application.id] ?? false;
          return (
            <Card key={application.id}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={uiText.subtitle}>{programNameFor(application)}</Text>
                  <Text style={uiText.small}>
                    {application.form.program}
                    {state ? ` · ${state}` : application.form.state ? ` · ${application.form.state}` : ''}
                  </Text>
                </View>
                <Chip label={status} tone={statusToneFor(status)} />
              </View>

              <AppButton
                title={isExpanded ? 'Hide review' : 'Review'}
                variant="plain"
                onPress={() => toggleExpanded(application.id)}
              />
              {isExpanded ? (
                <View style={styles.preview}>
                  {application.filledFields.length === 0 ? (
                    <Text style={uiText.muted}>No filled fields yet.</Text>
                  ) : (
                    application.filledFields.slice(0, 12).map((field) => (
                      <View key={field.fieldId} style={styles.previewRow}>
                        <Text style={styles.previewLabel}>{field.label || field.fieldId}</Text>
                        <Text style={styles.previewValue}>
                          {field.isCheckbox ? (field.checked ? 'Ticked' : 'Not ticked') : field.text}
                        </Text>
                      </View>
                    ))
                  )}
                  {application.filledFields.length > 12 ? (
                    <Text style={uiText.small}>
                      …and {application.filledFields.length - 12} more on the full review.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <CheckboxRow
                title="I reviewed my application"
                subtitle="Confirm the answers above are correct."
                selected={isReviewed}
                onPress={() => toggleReviewed(application.id)}
              />

              {documentPath ? (
                <View style={styles.actions}>
                  <AppButton
                    title={busyKind === 'download' ? 'Preparing…' : 'Download PDF'}
                    variant="secondary"
                    disabled={!canAct || busyKind != null}
                    onPress={() => void handleDownload(application)}
                  />
                  <AppButton
                    title={busyKind === 'print' ? 'Printing…' : 'Print'}
                    variant="secondary"
                    disabled={!canAct || busyKind != null}
                    onPress={() => void handlePrint(application)}
                  />
                </View>
              ) : (
                <Text style={uiText.muted}>
                  The PDF for this application has not been generated yet. It will appear here as
                  soon as it is ready.
                </Text>
              )}
              {!isReviewed && documentPath ? (
                <Text style={uiText.small}>
                  Tick “I reviewed my application” to unlock downloading and printing.
                </Text>
              ) : null}

              <View style={styles.actions}>
                <AppButton
                  title="Submission Guide"
                  variant="plain"
                  onPress={() => setGuideFor(application)}
                />
                <AppButton
                  title="Edit Answers"
                  variant="plain"
                  onPress={() => setEditing(true)}
                />
              </View>
            </Card>
          );
        })}

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton title="Continue" onPress={() => setStatusSheet(true)} />
      </View>

      <Modal visible={guideFor !== null} animationType="slide" onRequestClose={() => setGuideFor(null)}>
        {guideFor ? (
          <BenefitsSubmissionGuide application={guideFor} onClose={() => setGuideFor(null)} />
        ) : null}
      </Modal>

      <Modal visible={editing} animationType="slide" onRequestClose={() => setEditing(false)}>
        <BenefitsEditAnswers
          applicationIds={applicationIds}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      </Modal>

      <ModalSheet visible={statusSheet} onClose={() => setStatusSheet(false)}>
        <BenefitsSubmissionControl
          onSubmitted={markSubmitted}
          onDismiss={() => setStatusSheet(false)}
        />
      </ModalSheet>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  warning: { backgroundColor: HiveColors.warningBg },
  bullet: { color: HiveColors.text, fontSize: 13, marginTop: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  cardTitleWrap: { flex: 1 },
  preview: { marginTop: Spacing.one, gap: 6 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  previewLabel: { color: HiveColors.textSecondary, fontSize: 12, flex: 1 },
  previewValue: { color: HiveColors.text, fontSize: 13, flex: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  error: { color: HiveColors.danger, fontSize: 13 },
});
