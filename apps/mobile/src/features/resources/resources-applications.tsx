/**
 * The Applications section of the Resources tab (Audit Section 8).
 *
 * The Resources tab owns application statuses, submission tracking, saved
 * PDFs, and submission guides. This is the canonical applications *list* —
 * the per-application review screen at
 * app/resources/applications/[programId].tsx stays the single-application
 * view; nothing is duplicated here, cards link out to it.
 *
 * Submission state is session-only: marking "Yes, I submitted" flips the
 * card to "Submitted — [date]" via productStatusFor's submittedLocally flag.
 * There is no backend mutation persisting it yet (see the TODO in
 * benefits-submission-control.tsx), and the UI never claims otherwise.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppButton, Card, Chip, EmptyState, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type Navigation } from '@/features/app/navigation-types';
import { programDisplayName, submittedDateLabel } from '@/features/resources/resources-application-names';
import {
  type BenefitsApplication,
  fetchBenefitsApplications,
} from '@/features/benefits/benefits-repository';
import { downloadAndSharePdf, printPdf } from '@/features/benefits/benefits-document-actions';
import { productStatusFor, statusToneFor } from '@/features/benefits/benefits-status';
import { BenefitsSubmissionGuide } from '@/features/benefits/benefits-submission-guide';

function ApplicationCard({ application }: { application: BenefitsApplication }) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);
  const [submittedOn, setSubmittedOn] = useState<Date | null>(null);
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [actionError, setActionError] = useState('');

  const status = productStatusFor(application, submittedOn != null);
  const documentPath = application.finalDocumentPath ?? application.draftDocumentPath ?? null;

  const runDocumentAction = async (action: 'download' | 'print') => {
    if (!documentPath) return;
    setActionError('');
    if (action === 'download') setSharing(true);
    else setPrinting(true);
    try {
      if (action === 'download') {
        await downloadAndSharePdf(documentPath, `${application.form.program}-application.pdf`);
      } else {
        await printPdf(documentPath);
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not open the PDF.');
    } finally {
      setSharing(false);
      setPrinting(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{programDisplayName(application.form.program)} Application</Text>
          <Text style={uiText.muted}>{application.form.state}</Text>
        </View>
        <Chip label={status} tone={statusToneFor(status)} />
      </View>

      <View style={styles.buttonRow}>
        <AppButton
          title="View Application"
          variant="secondary"
          onPress={() => router.push(`/resources/applications/${application.id}`)}
        />
        <AppButton title="Submission Guide" variant="secondary" onPress={() => setGuideOpen(true)} />
      </View>

      {documentPath ? (
        <View style={styles.buttonRow}>
          <AppButton
            title={sharing ? 'Preparing…' : 'Download'}
            variant="secondary"
            onPress={() => runDocumentAction('download')}
          />
          <AppButton
            title={printing ? 'Printing…' : 'Print'}
            variant="secondary"
            onPress={() => runDocumentAction('print')}
          />
        </View>
      ) : (
        <Text style={uiText.muted}>Your PDF will appear here once it&apos;s ready.</Text>
      )}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      {submittedOn ? (
        <Text style={styles.submittedLabel}>Submitted — {submittedDateLabel(submittedOn)}</Text>
      ) : (
        <View style={styles.submitRow}>
          <Text style={uiText.muted}>Have you submitted this application?</Text>
          <Pressable onPress={() => setSubmittedOn(new Date())} accessibilityRole="button">
            <Text style={styles.markSubmitted}>Mark as Submitted</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={guideOpen} animationType="slide" onRequestClose={() => setGuideOpen(false)}>
        <BenefitsSubmissionGuide application={application} onClose={() => setGuideOpen(false)} />
      </Modal>
    </Card>
  );
}

export function ResourcesApplicationsSection({ nav }: { nav: Navigation }) {
  const [applications, setApplications] = useState<BenefitsApplication[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchBenefitsApplications()
      .then((result) => {
        if (!cancelled) setApplications(result ?? []);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load your applications.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Your Applications</Text>
      {error ? (
        <Card style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </Card>
      ) : applications == null ? (
        <Card style={styles.card}>
          <Text style={uiText.muted}>Loading your applications…</Text>
        </Card>
      ) : applications.length === 0 ? (
        <Card style={styles.card}>
          <EmptyState title="No applications yet." icon="doc" />
          <AppButton
            title="Start Your Benefits Application"
            onPress={() => nav.push('benefitsState')}
          />
        </Card>
      ) : (
        applications.map((application) => (
          <ApplicationCard key={application.id} application={application} />
        ))
      )}
      {/* TODO (Section 8 detailed corrections): the approved layout may add
          renewal-deadline chips and per-program document checklists to these
          cards. Add them here — not in benefits-review-screen.tsx — so this
          stays the one canonical applications list. */}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.three,
  },
  sectionTitle: {
    ...uiText.subtitle,
    marginBottom: Spacing.one,
  },
  card: {
    marginBottom: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.one,
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: Spacing.one,
  },
  cardTitle: {
    ...uiText.subtitle,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  submitRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  markSubmitted: {
    color: HiveColors.green,
    fontWeight: '600',
  },
  submittedLabel: {
    marginTop: Spacing.two,
    color: HiveColors.green,
    fontWeight: '600',
  },
  error: {
    color: HiveColors.danger,
    marginTop: Spacing.one,
  },
});
