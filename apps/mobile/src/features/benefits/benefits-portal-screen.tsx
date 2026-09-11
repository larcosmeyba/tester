/**
 * The handoff: from prepared paperwork to the official application site.
 *
 * The single hardest rule in this file is the one the whole submission phase
 * rests on: the app prepares paperwork, the applicant applies. Submission
 * happens on the state's own website, in the user's own session — Help The
 * Hive never sees their login and never submits for them.
 *
 * The portal URL comes from the server, verified against an official .gov
 * source, or it is null and the screen shows fallback guidance instead. A
 * URL is never invented here.
 *
 * The fallback options stay on this screen too: the guided checklist, the
 * printable draft PDF, and the filing kit (the printable answer sheet for
 * forms the app cannot auto-fill).
 */
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  type BenefitsApplication,
  type BenefitsPortal,
  benefitsDocumentUrl,
  benefitsFilingKitUrl,
  fetchBenefitsApplication,
  fetchBenefitsPortal,
} from '@/features/benefits/benefits-repository';
import {
  useBenefitsParams,
  useBenefitsRouter,
} from '@/features/benefits/benefits-shell-bridge';

// The federal benefits directory. A directory, not a program portal: it is
// the official starting point when a state has no verified application URL
// on file, and it is the one URL this screen is allowed to know by heart.
const BENEFITS_GOV_URL = 'https://www.benefits.gov';

export default function BenefitsPortalScreen() {
  const router = useBenefitsRouter();
  const { applicationId, state } = useBenefitsParams<{
    applicationId?: string;
    state?: string;
  }>();

  const [application, setApplication] = useState<BenefitsApplication | null>(null);
  const [portal, setPortal] = useState<BenefitsPortal | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await fetchBenefitsApplication(applicationId);
        if (cancelled) return;
        if (!loaded) {
          setError('That application could not be found.');
          return;
        }
        setApplication(loaded);
        const portalState = state ?? loaded.form.state ?? '';
        if (portalState !== '') {
          const found = await fetchBenefitsPortal(loaded.form.program, portalState);
          if (!cancelled) setPortal(found);
        }
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load the official portal.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId, state]);

  if (!applicationId) {
    return (
      <ScrollScreen>
        <AppHeader title="Official portal" onBack={router.back} />
        <View style={styles.body}>
          <Text style={styles.error}>No application was selected.</Text>
        </View>
      </ScrollScreen>
    );
  }

  if (loading || (!application && error === '')) {
    return (
      <ScrollScreen>
        <AppHeader title="Official portal" onBack={router.back} />
        <View style={styles.body}>
          <Text style={uiText.muted}>Loading…</Text>
        </View>
      </ScrollScreen>
    );
  }

  if (!application) {
    return (
      <ScrollScreen>
        <AppHeader title="Official portal" onBack={router.back} />
        <View style={styles.body}>
          <Text style={styles.error}>{error !== '' ? error : 'That application could not be found.'}</Text>
        </View>
      </ScrollScreen>
    );
  }

  const portalState = state ?? application.form.state ?? '';
  const documentPath = application.finalDocumentPath ?? application.draftDocumentPath;
  const checklistHref =
    `/resources/benefits-checklist?program=${encodeURIComponent(application.form.program)}` +
    (portalState !== '' ? `&state=${encodeURIComponent(portalState)}` : '');

  return (
    <ScrollScreen>
      <AppHeader title="Apply on the official site" onBack={router.back} />
      <View style={styles.body}>
        <Text style={uiText.muted}>
          Your {application.form.program} paperwork is ready. You apply on the state&apos;s
          website — Help The Hive never sees your login and never submits for you.
        </Text>

        {error !== '' && !portal ? <Text style={styles.error}>{error}</Text> : null}

        {portal?.url ? (
          <Card style={styles.portalCard}>
            <Text style={uiText.subtitle}>
              {portal.program} · {portal.state}
            </Text>
            {portal.verified ? (
              <Text style={styles.verified}>Verified official application site</Text>
            ) : null}
            <Text style={uiText.muted}>
              This opens the state&apos;s own application site in your browser. You sign in
              there yourself — nothing you type there comes back to Help The Hive.
            </Text>
            <AppButton title="Open official portal" onPress={() => Linking.openURL(portal.url!)} />
          </Card>
        ) : (
          <Card style={styles.fallbackCard}>
            <Text style={uiText.subtitle}>No verified application link yet</Text>
            <Text style={uiText.muted}>
              {portal?.fallbackGuidance !== '' && portal?.fallbackGuidance != null
                ? portal.fallbackGuidance
                : `We don't have a verified application link for ${application.form.program} in ${portalState || 'your state'} yet, so we won't guess one. Start at the federal benefits directory and pick your state there.`}
            </Text>
            <AppButton
              title="Open benefits.gov directory"
              onPress={() => Linking.openURL(BENEFITS_GOV_URL)}
            />
          </Card>
        )}

        <Card>
          <Text style={uiText.subtitle}>Before you go</Text>
          <Text style={uiText.muted}>
            A short checklist of what to have ready — documents, numbers, and what happens
            after you apply.
          </Text>
          <AppButton
            title="View the application checklist"
            variant="plain"
            onPress={() => router.push(checklistHref)}
          />
        </Card>

        <Card>
          <Text style={uiText.subtitle}>Prefer paper or fax?</Text>
          {documentPath ? (
            <AppButton
              title="Print or download the draft PDF"
              variant="plain"
              onPress={() => Linking.openURL(benefitsDocumentUrl(documentPath))}
            />
          ) : null}
          <AppButton
            title="Download the filing kit"
            variant="plain"
            onPress={() => Linking.openURL(benefitsFilingKitUrl(application.id))}
          />
          <Text style={uiText.muted}>
            The filing kit is a printable answer sheet with everything you told us, ready to
            copy onto the official paper form. If your county office lists a fax number on
            the official portal, you can fax the printed application there.
          </Text>
        </Card>

        <AppButton
          title="I've applied — save my confirmation"
          onPress={() =>
            router.push(`/resources/benefits-confirmation?applicationId=${application.id}`)
          }
        />
        <Text style={styles.footnote}>
          Apply first, then come back: the confirmation number the portal gives you is what
          keeps your renewal reminders on schedule.
        </Text>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  portalCard: { backgroundColor: HiveColors.greenLight },
  fallbackCard: { backgroundColor: HiveColors.warningBg },
  verified: { color: HiveColors.green, fontSize: 12, fontWeight: '600', marginTop: 2 },
  error: { color: HiveColors.danger, fontSize: 13 },
  footnote: { color: HiveColors.textSecondary, fontSize: 12 },
});
