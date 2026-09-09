/**
 * Benefits due: the renewals the server is tracking for this user.
 *
 * A renewal is the server's memory of a completed application — program,
 * state, and when the certification period ends. Tapping one explains what it
 * is, where the deadline came from, and offers the one-tap renewal draft.
 * Program names appear here freely; they never appear in push copy.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, EmptyState, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  type BenefitsRenewal,
  dismissBenefitsRenewal,
  fetchBenefitsRenewals,
  startBenefitsRenewalApplication,
} from '@/features/benefits/benefits-repository';
import {
  daysRemainingLabel,
  formatRenewalDate,
  renewalNeedsAttention,
  renewalSourceLabel,
  renewalStatusLabel,
  renewalUrgency,
  type RenewalUrgency,
} from '@/features/benefits/benefits-renewals';

const urgencyColors: Record<RenewalUrgency, { bg: string; fg: string }> = {
  calm: { bg: HiveColors.greenLight, fg: HiveColors.green },
  soon: { bg: HiveColors.warningBg, fg: HiveColors.warningText },
  urgent: { bg: '#FCE8E6', fg: HiveColors.danger },
  overdue: { bg: '#FCE8E6', fg: HiveColors.danger },
};

function UrgencyChip({ daysRemaining }: { daysRemaining: number }) {
  const urgency = renewalUrgency(daysRemaining);
  const colors = urgencyColors[urgency];
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.chipText, { color: colors.fg }]}>{daysRemainingLabel(daysRemaining)}</Text>
    </View>
  );
}

export default function BenefitsRenewalsScreen() {
  const router = useRouter();
  const { renewalId } = useLocalSearchParams<{ renewalId?: string }>();

  const [renewals, setRenewals] = useState<BenefitsRenewal[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // The detail opens from the list (local state) or from a deep link such as
  // a renewal push tap (the renewalId param). No effect syncs the param into
  // state: the param is read directly so a link always lands on the detail.
  const effectiveId = selectedId ?? renewalId ?? null;

  const load = useCallback(async () => {
    try {
      setRenewals(await fetchBenefitsRenewals());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your renewals.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBenefitsRenewals()
      .then((result) => {
        if (!cancelled) setRenewals(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load your renewals.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => renewals?.find((renewal) => renewal.id === effectiveId) ?? null,
    [renewals, effectiveId],
  );

  const goBack = useCallback(() => {
    if (selectedId) {
      setSelectedId(null);
      return;
    }
    if (renewalId) {
      router.setParams({ renewalId: undefined });
      return;
    }
    router.back();
  }, [router, renewalId, selectedId]);

  const startRenewal = useCallback(async () => {
    if (!selected || starting) return;
    setStarting(true);
    setError('');
    try {
      const application = await startBenefitsRenewalApplication(selected.id);
      router.push(`/resources/applications/${application.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the renewal application.');
    } finally {
      setStarting(false);
    }
  }, [router, selected, starting]);

  const dismiss = useCallback(async () => {
    if (!selected || dismissing) return;
    setDismissing(true);
    setError('');
    try {
      await dismissBenefitsRenewal(selected.id);
      setSelectedId(null);
      router.setParams({ renewalId: undefined });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not dismiss this renewal.');
    } finally {
      setDismissing(false);
    }
  }, [dismissing, load, router, selected]);

  const active = useMemo(() => renewals?.filter(renewalNeedsAttention) ?? [], [renewals]);

  return (
    <ScrollScreen>
      <AppHeader title={selected ? 'Renewal details' : 'Benefits due'} onBack={goBack} />

      <View style={styles.body}>
        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        {renewals === null ? (
          <Text style={uiText.muted}>Loading renewals…</Text>
        ) : selected ? (
          <RenewalDetail
            renewal={selected}
            onStart={startRenewal}
            onDismiss={dismiss}
            starting={starting}
            dismissing={dismissing}
          />
        ) : renewals.length === 0 ? (
          <EmptyState
            title="No renewals tracked yet"
            subtitle="No renewals tracked yet — they'll appear here after you complete an application."
          />
        ) : (
          <View style={styles.list}>
            {active.length > 0 ? (
              <Text style={uiText.muted}>
                {active.length} {active.length === 1 ? 'renewal needs' : 'renewals need'} your
                attention.
              </Text>
            ) : null}
            {renewals.map((renewal) => (
              <Pressable
                key={renewal.id}
                accessibilityRole="button"
                onPress={() => setSelectedId(renewal.id)}
                style={({ pressed }) => [pressed && styles.pressed]}>
                <Card>
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={uiText.subtitle}>{renewal.program}</Text>
                      <Text style={styles.meta}>
                        {renewal.state} · due {formatRenewalDate(renewal.renewalDueAt)}
                      </Text>
                      <Text style={styles.status}>{renewalStatusLabel(renewal.status)}</Text>
                    </View>
                    <UrgencyChip daysRemaining={renewal.daysRemaining} />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollScreen>
  );
}

/**
 * What the renewal is, where the deadline came from, and the way to act on
 * it. A renewal exists because a completed application was filed; the deadline
 * is the typical certification period unless the user confirmed their own.
 */
function RenewalDetail({
  renewal,
  onStart,
  onDismiss,
  starting,
  dismissing,
}: {
  renewal: BenefitsRenewal;
  onStart: () => void;
  onDismiss: () => void;
  starting: boolean;
  dismissing: boolean;
}) {
  return (
    <View style={styles.list}>
      <Card>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={uiText.subtitle}>{renewal.program}</Text>
            <Text style={styles.meta}>{renewal.state}</Text>
          </View>
          <UrgencyChip daysRemaining={renewal.daysRemaining} />
        </View>
        <Text style={styles.detail}>
          This renewal tracks the certification period from a completed {renewal.program}{' '}
          application. Acting before the deadline keeps the paperwork on time.
        </Text>
      </Card>

      <Card>
        <Text style={uiText.subtitle}>Deadline</Text>
        <Text style={styles.deadline}>{formatRenewalDate(renewal.renewalDueAt)}</Text>
        <Text style={uiText.muted}>{renewalSourceLabel(renewal)}</Text>
      </Card>

      <AppButton
        title={starting ? 'Starting…' : 'Start renewal application'}
        onPress={onStart}
        disabled={starting || dismissing}
      />
      <Text style={uiText.muted}>
        Starts a new application from your saved answers, pre-filled with what Help The Hive
        already knows.
      </Text>

      <AppButton
        title={dismissing ? 'Dismissing…' : 'Dismiss this renewal'}
        variant="plain"
        onPress={onDismiss}
        disabled={starting || dismissing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  rowText: { flex: 1, gap: 2 },
  meta: { color: HiveColors.textSecondary, fontSize: 13 },
  status: { color: HiveColors.textSecondary, fontSize: 12 },
  detail: { color: HiveColors.text, fontSize: 14, marginTop: Spacing.two, lineHeight: 20 },
  deadline: { color: HiveColors.text, fontSize: 20, marginVertical: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  error: { color: HiveColors.danger, fontSize: 13 },
});
