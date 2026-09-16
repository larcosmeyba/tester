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

import { AppButton, Card, EmptyState, HiveIcon, uiText, type HiveIconName } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { type Navigation } from '@/features/app/navigation-types';
import { programDisplayName, submittedDateLabel } from '@/features/resources/resources-application-names';
import {
  type BenefitsApplication,
  fetchBenefitsApplications,
} from '@/features/benefits/benefits-repository';
import { downloadAndSharePdf, printPdf } from '@/features/benefits/benefits-document-actions';
import { productStatusFor, type BenefitsProductStatus } from '@/features/benefits/benefits-status';
import { BenefitsSubmissionGuide } from '@/features/benefits/benefits-submission-guide';

/**
 * Per-program accent for the application card, matching the Resources tab
 * design reference: a tinted icon tile plus a tinted "View Application"
 * button with accent-colored text. Unknown programs fall back to hive green.
 */
const PROGRAM_ACCENT: Record<string, { tile: string; accent: string; icon: HiveIconName }> = {
  snap: { tile: '#E4F2E4', accent: '#1F7A2E', icon: 'cart' },
  wic: { tile: '#FBEEDF', accent: '#A05A1A', icon: 'child' },
  medicaid: { tile: '#E3ECFB', accent: '#2B5CB8', icon: 'heart' },
  liheap: { tile: '#FBF3DF', accent: '#8A5A00', icon: 'bolt' },
  tanf: { tile: '#EFE7FA', accent: '#5B3E9E', icon: 'dollar' },
  va_disability: { tile: '#E7EAFB', accent: '#3B4E9E', icon: 'shield' },
  va_pension: { tile: '#E7EAFB', accent: '#3B4E9E', icon: 'bank' },
  va_healthcare: { tile: '#E7EAFB', accent: '#3B4E9E', icon: 'heart' },
};

const DEFAULT_ACCENT: { tile: string; accent: string; icon: HiveIconName } = {
  tile: HiveColors.greenLight,
  accent: HiveColors.green,
  icon: 'doc',
};

function accentFor(programId: string) {
  return PROGRAM_ACCENT[programId.toLowerCase()] ?? DEFAULT_ACCENT;
}

function StatusPill({ status }: { status: BenefitsProductStatus }) {
  const pillStyle =
    status === 'Submitted'
      ? styles.statusPillSubmitted
      : status === 'Ready to Submit'
        ? styles.statusPillReady
        : styles.statusPillNeutral;
  const textStyle =
    status === 'Submitted'
      ? styles.statusPillTextSubmitted
      : status === 'Ready to Submit'
        ? styles.statusPillTextReady
        : styles.statusPillTextNeutral;
  return (
    <View style={[styles.statusPill, pillStyle]}>
      <Text style={[styles.statusPillText, textStyle]}>{status}</Text>
    </View>
  );
}

function ApplicationCard({ application }: { application: BenefitsApplication }) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);
  const [submittedOn, setSubmittedOn] = useState<Date | null>(null);
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [actionError, setActionError] = useState('');

  const status = productStatusFor(application, submittedOn != null);
  const documentPath = application.finalDocumentPath ?? application.draftDocumentPath ?? null;
  const accent = accentFor(application.form.program);

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
        <View style={[styles.programTile, { backgroundColor: accent.tile }]}>
          <HiveIcon name={accent.icon} size={22} color={accent.accent} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{programDisplayName(application.form.program)} Application</Text>
          <Text style={uiText.muted}>{application.form.state}</Text>
        </View>
        <StatusPill status={status} />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/resources/applications/${application.id}`)}
          style={[styles.actionButton, { backgroundColor: accent.tile }]}>
          <Text style={[styles.actionButtonText, { color: accent.accent }]}>View Application</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setGuideOpen(true)}
          style={[styles.actionButton, styles.guideButton]}>
          <Text style={[styles.actionButtonText, styles.guideButtonText]}>Submission Guide</Text>
        </Pressable>
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
        <View style={styles.submittedRow}>
          <HiveIcon name="checkCircle" size={18} color={HiveColors.green} />
          <Text style={styles.submittedLabel}>Submitted — {submittedDateLabel(submittedOn)}</Text>
        </View>
      ) : (
        <View style={styles.submitBlock}>
          <Text style={uiText.muted}>Have you submitted this application?</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark as Submitted"
            onPress={() => setSubmittedOn(new Date())}
            style={styles.markSubmittedButton}>
            <View style={styles.markSubmittedCheckbox}>
              <HiveIcon name="check" size={12} color={HiveColors.white} />
            </View>
            <Text style={styles.markSubmittedButtonText}>Mark as Submitted</Text>
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
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  programTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    ...uiText.subtitle,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillSubmitted: {
    backgroundColor: '#DDEEDF',
  },
  statusPillReady: {
    backgroundColor: '#E3ECFB',
  },
  statusPillNeutral: {
    backgroundColor: HiveColors.card,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPillTextSubmitted: {
    color: HiveColors.green,
  },
  statusPillTextReady: {
    color: '#2B5CB8',
  },
  statusPillTextNeutral: {
    color: HiveColors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  guideButton: {
    backgroundColor: '#F2F2F5',
  },
  guideButtonText: {
    color: HiveColors.text,
  },
  submitBlock: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  markSubmittedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: HiveColors.green,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
  },
  markSubmittedCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: HiveColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSubmittedButtonText: {
    color: HiveColors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  submittedRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submittedLabel: {
    color: HiveColors.green,
    fontWeight: '600',
    fontSize: 14,
  },
  error: {
    color: HiveColors.danger,
    marginTop: Spacing.one,
  },
});
