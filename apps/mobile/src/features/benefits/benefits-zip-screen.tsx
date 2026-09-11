/**
 * Where the paperwork meets the real world: which state to apply in.
 *
 * The applicant types their ZIP (pre-filled from their profile when they
 * gave one) and the server detects the state — or returns state: null for a
 * ZIP it does not recognize, which the screen reports honestly rather than
 * routing somewhere plausible. The detected state is what the portal screen
 * uses to find the official application site.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, AppTextField, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  type BenefitsStateLookup,
  fetchBenefitsApplication,
  fetchStateFromZip,
} from '@/features/benefits/benefits-repository';
import {
  useBenefitsParams,
  useBenefitsRouter,
} from '@/features/benefits/benefits-shell-bridge';
import { useAppState } from '@/state/app-state';

export default function BenefitsZipScreen() {
  const router = useBenefitsRouter();
  const { applicationId } = useBenefitsParams<{ applicationId?: string }>();
  const app = useAppState();

  const [zip, setZip] = useState(app.profile.zip ?? '');
  const [lookup, setLookup] = useState<BenefitsStateLookup | null>(null);
  const [program, setProgram] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState('');

  const zipDigits = useMemo(() => zip.replace(/\D/g, '').slice(0, 5), [zip]);
  const zipValid = zipDigits.length === 5;

  const detect = async () => {
    if (!zipValid || lookingUp) return;
    setLookingUp(true);
    setError('');
    setLookup(null);
    try {
      const [result, application] = await Promise.all([
        fetchStateFromZip(zipDigits),
        applicationId ? fetchBenefitsApplication(applicationId).catch(() => null) : Promise.resolve(null),
      ]);
      setLookup(result);
      if (application) setProgram(application.form.program);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not look up that ZIP code.');
    } finally {
      setLookingUp(false);
    }
  };

  const detectedState = lookup?.state ?? null;

  return (
    <ScrollScreen keyboard>
      <AppHeader title="Where do you live?" onBack={router.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          {program !== ''
            ? `Your ${program} paperwork is ready. Every state runs its own application site, so we use your ZIP code to find the right official one.`
            : 'Every state runs its own application site, so we use your ZIP code to find the right official one.'}
        </Text>

        <Card>
          <Text style={uiText.subtitle}>Your ZIP code</Text>
          <AppTextField
            label="ZIP code"
            value={zip}
            onChangeText={setZip}
            placeholder="90210"
            keyboardType="number-pad"
          />
          <AppButton
            title={lookingUp ? 'Looking up…' : 'Find my state'}
            onPress={() => void detect()}
            disabled={!zipValid || lookingUp}
          />
          {!zipValid && zip !== '' ? (
            <Text style={styles.hint}>Enter the 5-digit ZIP code where you live.</Text>
          ) : null}
        </Card>

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        {lookup ? (
          <Card style={detectedState ? styles.found : styles.notFound}>
            {detectedState ? (
              <>
                <Text style={uiText.subtitle}>Found: {detectedState}</Text>
                <Text style={uiText.muted}>
                  ZIP {lookup.zip} is in {detectedState}. We&apos;ll open that state&apos;s
                  official application site next.
                </Text>
                {lookup.detail !== '' ? <Text style={styles.detail}>{lookup.detail}</Text> : null}
                <AppButton
                  title="Continue to the official portal"
                  onPress={() =>
                    router.push(
                      `/resources/benefits-portal?applicationId=${encodeURIComponent(applicationId ?? '')}&state=${encodeURIComponent(detectedState)}`,
                    )
                  }
                  disabled={!applicationId}
                />
              </>
            ) : (
              <>
                <Text style={uiText.subtitle}>We couldn&apos;t match that ZIP</Text>
                <Text style={uiText.muted}>
                  {lookup.detail !== ''
                    ? lookup.detail
                    : 'That ZIP code isn\u2019t in our directory, so we won\u2019t guess a state for you.'}
                </Text>
                <Text style={uiText.muted}>
                  Double-check the digits, or continue and pick your state&apos;s site yourself on
                  the next screen.
                </Text>
              </>
            )}
          </Card>
        ) : null}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  hint: { color: HiveColors.textSecondary, fontSize: 12, marginTop: Spacing.one },
  detail: { color: HiveColors.textSecondary, fontSize: 12, marginTop: Spacing.one },
  error: { color: HiveColors.danger, fontSize: 13 },
  found: { backgroundColor: HiveColors.greenLight },
  notFound: { backgroundColor: HiveColors.warningBg },
});
