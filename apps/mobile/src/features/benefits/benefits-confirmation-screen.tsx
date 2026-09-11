/**
 * After the applicant applies on the official portal: capture the
 * confirmation number the portal gave them.
 *
 * Recording it is what feeds the renewal schedule — the renewal for this
 * application becomes user-confirmed instead of rule-derived. Nothing here
 * claims anything was submitted: the applicant applied themselves, on the
 * official site, and this screen only writes down the receipt.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, AppTextField, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  type BenefitsApplication,
  fetchBenefitsApplication,
  recordBenefitsConfirmation,
} from '@/features/benefits/benefits-repository';
import {
  useBenefitsParams,
  useBenefitsRouter,
} from '@/features/benefits/benefits-shell-bridge';

export default function BenefitsConfirmationScreen() {
  const router = useBenefitsRouter();
  const { applicationId } = useBenefitsParams<{ applicationId?: string }>();

  const [application, setApplication] = useState<BenefitsApplication | null>(null);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    fetchBenefitsApplication(applicationId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError('That application could not be found.');
          return;
        }
        setApplication(result);
        if (result.confirmationNumber) setConfirmationNumber(result.confirmationNumber);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load the application.');
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const save = async () => {
    if (!applicationId || saving) return;
    const trimmed = confirmationNumber.trim();
    if (trimmed === '') {
      setError('Type the confirmation number the official portal gave you.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await recordBenefitsConfirmation(applicationId, trimmed);
      setApplication(updated);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the confirmation number.');
    } finally {
      setSaving(false);
    }
  };

  if (!applicationId) {
    return (
      <ScrollScreen>
        <AppHeader title="Confirmation" onBack={router.back} />
        <View style={styles.body}>
          <Text style={styles.error}>No application was selected.</Text>
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Confirmation" onBack={router.back} />
      <View style={styles.body}>
        {saved ? (
          <Card style={styles.savedCard}>
            <Text style={uiText.subtitle}>Saved — you&apos;re on the schedule</Text>
            <Text style={uiText.muted}>
              Your {application?.form.program ?? 'benefits'} renewal is now tracked from your
              own confirmation. We&apos;ll remind you before it&apos;s time to renew, and one
              tap turns the reminder into renewal paperwork.
            </Text>
            <AppButton
              title="See your renewals"
              onPress={() => router.push('/resources/benefits-renewals')}
            />
            <AppButton title="Back to start" variant="plain" onPress={() => router.push('/resources/government')} />
          </Card>
        ) : (
          <Card>
            <Text style={uiText.subtitle}>What was your confirmation number?</Text>
            <Text style={uiText.muted}>
              After you apply on the official portal, it gives you a confirmation or reference
              number. Type it here so your renewal reminders run on your real date instead
              of our estimate.
            </Text>
            <AppTextField
              label="Confirmation number"
              value={confirmationNumber}
              onChangeText={setConfirmationNumber}
              placeholder="e.g. CA-2026-048213"
              autoCapitalize="characters"
            />
            {error !== '' ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              title={saving ? 'Saving…' : 'Save confirmation number'}
              onPress={() => void save()}
              disabled={saving || confirmationNumber.trim() === ''}
            />
            <Text style={styles.footnote}>
              Can&apos;t find one? Some portals email it instead — check your inbox, then come
              back. Nothing is submitted from here either way.
            </Text>
          </Card>
        )}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  savedCard: { backgroundColor: HiveColors.greenLight },
  error: { color: HiveColors.danger, fontSize: 13 },
  footnote: { color: HiveColors.textSecondary, fontSize: 12, marginTop: Spacing.one },
});
