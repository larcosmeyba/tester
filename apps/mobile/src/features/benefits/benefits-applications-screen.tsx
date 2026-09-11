// Applications tab: the user's benefit applications, tracked in one place.
//
// Reads the server's application list (drafts, submitted, completed) and
// groups it the way a user thinks about paperwork: what still needs work,
// what has been sent off, and what needs attention. Starting a new
// application re-enters the existing benefits flow at the programs screen;
// the questionnaire → review-and-sign → portal handoff flow itself is
// untouched.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native';

import {
  AppButton,
  AppHeader,
  EmptyState,
  HiveIcon,
  uiText,
} from '@/components/hive-ui';
import { FLOATING_TAB_BAR_HEIGHT } from '@/components/hive-navigation';
import { HiveColors } from '@/constants/theme';
import { sharedStyles } from '@/features/app/app-shared';
import type { Navigation } from '@/features/app/navigation-types';
import {
  type BenefitsApplication,
  fetchBenefitsApplications,
} from '@/features/benefits/benefits-repository';

function statusOf(application: BenefitsApplication): string {
  return (application.status ?? '').toUpperCase();
}

export function isApplicationInProgress(application: BenefitsApplication): boolean {
  const status = statusOf(application);
  return status === 'DRAFT' || status === 'NEEDS_INFORMATION' || status === 'READY_FOR_REVIEW';
}

function isInProgress(application: BenefitsApplication): boolean {
  return isApplicationInProgress(application);
}

function isSubmitted(application: BenefitsApplication): boolean {
  return statusOf(application) === 'COMPLETED';
}

function isFailed(application: BenefitsApplication): boolean {
  return statusOf(application) === 'FAILED';
}

export function applicationPercentComplete(application: BenefitsApplication): number {
  const filled = application.filledFields?.length ?? 0;
  const missing = application.missingFields?.length ?? 0;
  const total = filled + missing;
  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function programLabel(application: BenefitsApplication): string {
  return applicationProgramLabel(application);
}

export function applicationProgramLabel(application: BenefitsApplication): string {
  return application.form?.program || application.form?.formTitle || 'Benefits application';
}

function ApplicationRow({
  application,
  nav,
}: {
  application: BenefitsApplication;
  nav: Navigation;
}) {
  const submitted = isSubmitted(application);
  const failed = isFailed(application);
  const pct = applicationPercentComplete(application);

  const open = () =>
    nav.push(submitted || failed ? 'benefitsReview' : 'benefitsQuestionnaire', {
      applicationId: application.id,
    });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${programLabel(application)} application`}
      onPress={open}
      style={({ pressed }) => [styles.row, pressed && sharedStyles.pressed]}>
      <View style={styles.rowIcon}>
        <HiveIcon name="doc" size={22} color={HiveColors.green} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{programLabel(application)}</Text>
        {failed ? (
          <Text style={styles.rowFailed}>
            {application.failureReason || 'This application needs attention.'}
          </Text>
        ) : submitted ? (
          <Text style={uiText.muted}>
            Submitted
            {application.confirmationNumber ? ` · #${application.confirmationNumber}` : ''}
            {application.signedAt ? ` · ${formatDate(application.signedAt)}` : ''}
          </Text>
        ) : (
          <Text style={uiText.muted}>
            {pct}% complete{application.updatedAt ? ` · Updated ${formatDate(application.updatedAt)}` : ''}
          </Text>
        )}
        {!submitted && !failed ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
      </View>
      <HiveIcon name="next" size={18} color={HiveColors.textSecondary} />
    </Pressable>
  );
}

export function ApplicationsScreen({ nav }: { nav: Navigation }) {
  const [applications, setApplications] = useState<BenefitsApplication[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    fetchBenefitsApplications()
      .then((list) => setApplications(list ?? []))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load your applications.'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inProgress = (applications ?? []).filter(isInProgress);
  const submitted = (applications ?? []).filter(isSubmitted);
  const failed = (applications ?? []).filter(isFailed);

  return (
    <View style={sharedStyles.tabScreen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title="Applications" />

        {applications === null && error === '' ? (
          <Text style={uiText.muted}>Loading…</Text>
        ) : error !== '' ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <AppButton title="Try again" onPress={load} />
          </View>
        ) : applications !== null && applications.length === 0 ? (
          <EmptyState
            icon="doc"
            title="No applications yet"
            subtitle="Penny will prepare your paperwork — you just review and sign."
            actionLabel="Check what you qualify for"
            onAction={() => nav.push('government')}
          />
        ) : (
          <View style={styles.sections}>
            {inProgress.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>In progress</Text>
                {inProgress.map((application) => (
                  <ApplicationRow key={application.id} application={application} nav={nav} />
                ))}
              </View>
            ) : null}

            {failed.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>Needs attention</Text>
                {failed.map((application) => (
                  <ApplicationRow key={application.id} application={application} nav={nav} />
                ))}
              </View>
            ) : null}

            {submitted.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>Submitted</Text>
                {submitted.map((application) => (
                  <ApplicationRow key={application.id} application={application} nav={nav} />
                ))}
              </View>
            ) : null}

            <AppButton
              title="Start new application"
              onPress={() => nav.push('government')}
              style={styles.newButton}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + 40,
    gap: 12,
  },
  sections: { gap: 18 },
  sectionTitle: {
    color: HiveColors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: HiveColors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: HiveColors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: HiveColors.text, fontSize: 15, fontWeight: '700' },
  rowFailed: { color: HiveColors.danger, fontSize: 13 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: HiveColors.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: HiveColors.green },
  newButton: { marginTop: 4 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  error: { color: HiveColors.danger, textAlign: 'center' },
});
