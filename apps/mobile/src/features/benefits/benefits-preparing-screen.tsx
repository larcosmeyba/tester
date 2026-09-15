/**
 * Page 4 — Penny is preparing your applications (audit Section 3b).
 *
 * This screen is also the flow container for Pages 4–6: the AppRoot shell
 * owns the route table and has no routes for the Ready view, the Submission
 * Guide, or the submission-status sheet, so once the backend reports the
 * applications ready this screen swaps to the Ready view instead of pushing
 * a new route.
 *
 * TODO (Section 3b): the shell renders this screen without forwarding route
 * params (app-root.tsx `benefitsPreparing` case ignores `route.params`), so
 * the `applicationIds`/`state` pushed by the group questionnaire never
 * arrive. Until the shell forwards them, this screen falls back to polling
 * all of the user's applications.
 *
 * Penny asset: penny-money.png is the approved stand-in.
 * TODO (Section 3b): replace with the Penny-working-at-computer illustration
 * once Marcos approves it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeader, PennyImage, ProgressBar, Screen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import type { Navigation } from '@/features/app/navigation-types';

import { BenefitsReadyView } from './benefits-ready-screen';
import {
  fetchBenefitsApplications,
  type BenefitsApplication,
} from './benefits-repository';

const pennySource = require('@/assets/images/hive/penny-money.png');

const PROGRESS_MESSAGES = [
  'Reading your answers…',
  'Filling in your forms…',
  'Checking for missing information…',
  'Preparing your submission guides…',
  'Almost done…',
] as const;

const MESSAGE_INTERVAL_MS = 2400;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90000;

/**
 * The backend readiness signal. An application counts as ready when the
 * server has generated a PDF for it (draft or final) or the applicant has
 * approved it (COMPLETED).
 *
 * TODO (Section 3b): confirm this is the exact ready signal with the
 * backend owner — e.g. whether a dedicated status or event should replace
 * the draftDocumentPath heuristic.
 */
function isReady(application: BenefitsApplication): boolean {
  return (
    application.status === 'COMPLETED' ||
    application.draftDocumentPath != null ||
    application.finalDocumentPath != null
  );
}

export function BenefitsPreparingScreen({
  nav,
  applicationIds,
  state,
}: {
  nav: Navigation;
  applicationIds?: string[];
  state?: string;
}) {
  const [phase, setPhase] = useState<'preparing' | 'ready'>('preparing');
  const [applications, setApplications] = useState<BenefitsApplication[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState('');
  const attempts = useRef(0);

  const wantedIds = useMemo(() => applicationIds ?? [], [applicationIds]);
  const stateLabel = state ?? '';

  // Rotate the progress messages while Penny works.
  useEffect(() => {
    if (phase !== 'preparing') return;
    const timer = setInterval(() => {
      setMessageIndex((index) => (index + 1) % PROGRESS_MESSAGES.length);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase]);

  // Poll the existing repository until every application is ready.
  useEffect(() => {
    if (phase !== 'preparing') return;
    let cancelled = false;

    async function poll() {
      attempts.current += 1;
      try {
        const all = await fetchBenefitsApplications();
        const relevant =
          wantedIds.length > 0
            ? all.filter((application) => wantedIds.includes(application.id))
            : all;
        if (cancelled) return;
        const failed = relevant.find((application) => application.status === 'FAILED');
        if (failed) {
          setError(
            failed.failureReason ??
              'One of your applications could not be prepared. Your answers are saved — try again from the questionnaire.',
          );
          return;
        }
        setApplications(relevant);
        if (relevant.length > 0 && relevant.every(isReady)) {
          setPhase('ready');
          return;
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not check your applications.');
        }
        return;
      }
      if (!cancelled && attempts.current * POLL_INTERVAL_MS < POLL_TIMEOUT_MS) {
        setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } else if (!cancelled) {
        // Timed out waiting: advance anyway with whatever the backend has so
        // the user is never stuck on a spinner. The Ready view renders each
        // application's real status, including ones still preparing.
        setPhase('ready');
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [phase, wantedIds]);

  if (phase === 'ready') {
    return (
      <BenefitsReadyView
        nav={nav}
        initialApplications={applications}
        applicationIds={wantedIds.length > 0 ? wantedIds : applications.map((app) => app.id)}
        state={stateLabel}
      />
    );
  }

  return (
    <Screen>
      <AppHeader title="" onBack={nav.back} />
      <View style={styles.body}>
        <PennyImage source={pennySource} size={120} />
        <Text style={[uiText.title, styles.center]}>Penny is preparing your applications.</Text>
        <Text style={[uiText.muted, styles.center]}>
          We&apos;re filling in your forms with the information you provided.
        </Text>
        <View style={styles.progress}>
          <ProgressBar current={messageIndex + 1} total={PROGRESS_MESSAGES.length} />
          <Text style={[uiText.muted, styles.center]}>{PROGRESS_MESSAGES[messageIndex]}</Text>
        </View>
        {error !== '' ? <Text style={[styles.error, styles.center]}>{error}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
  },
  center: { textAlign: 'center' },
  progress: { width: '100%', gap: Spacing.one, marginTop: Spacing.two },
  error: { color: HiveColors.danger, fontSize: 13 },
});
