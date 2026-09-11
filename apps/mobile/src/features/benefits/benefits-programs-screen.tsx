/**
 * The government forms Help The Hive can prepare, and starting one.
 *
 * The list comes from the server: which forms exist is decided by the mapping
 * files installed there, not by anything hardcoded here, so adding a state is a
 * server change rather than an app release.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, EmptyState, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import { BenefitsRenewalBanner } from '@/features/benefits/benefits-renewal-banner';
import { useBenefitsRouter } from '@/features/benefits/benefits-shell-bridge';
import {
  type BenefitsForm,
  fetchBenefitsForms,
  startBenefitsApplication,
} from '@/features/benefits/benefits-repository';

export default function BenefitsProgramsScreen() {
  const router = useBenefitsRouter();
  const [forms, setForms] = useState<BenefitsForm[] | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchBenefitsForms()
      .then((result) => {
        if (!cancelled) setForms(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the forms.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(
    async (form: BenefitsForm) => {
      setStarting(form.id);
      setError('');
      try {
        const application = await startBenefitsApplication(form.id);
        router.push(`/resources/applications/${application.id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not start this application.');
      } finally {
        setStarting('');
      }
    },
    [router],
  );

  return (
    <ScrollScreen>
      <AppHeader title="Government Assistance" onBack={router.back} />

      <BenefitsRenewalBanner />

      <View style={styles.intro}>
        <Text style={uiText.muted}>
          Help The Hive fills in what it already knows and tells you exactly what is left. You
          review every answer, and you sign and submit the form yourself.
        </Text>
        <Text style={uiText.muted}>
          Whether you qualify for a program is decided by the agency that runs it, on the
          application you send them. Help The Hive does not and cannot decide that.
        </Text>
      </View>

      <View style={styles.linkWrap}>
        <Card onPress={() => router.push('/resources/benefits-renewals')}>
          <Text style={uiText.subtitle}>Benefits due</Text>
          <Text style={styles.coverage}>
            Renewal deadlines for your completed applications — confirm yours and start the
            renewal paperwork.
          </Text>
        </Card>
      </View>

      {error !== '' ? (
        <View style={styles.intro}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {forms === null ? (
        <View style={styles.intro}>
          <Text style={uiText.muted}>Loading forms…</Text>
        </View>
      ) : forms.length === 0 ? (
        <EmptyState
          title="No forms yet"
          subtitle="No government forms are installed on this server yet. Once one is, it will appear here."
        />
      ) : (
        <View style={styles.list}>
          {forms.map((form) => (
            <Card key={form.key}>
              <Text style={uiText.subtitle}>{form.formTitle}</Text>
              <Text style={styles.meta}>
                {form.program}
                {form.state ? ` · ${form.state}` : ''} · {form.formCode} · {form.pageCount} pages
              </Text>
              <Text style={styles.coverage}>
                {coverageLine(form)}
              </Text>
              <AppButton
                title={starting === form.id ? 'Starting…' : 'Start this application'}
                onPress={() => start(form)}
                disabled={starting !== ''}
              />
            </Card>
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}

/**
 * Says plainly how much of the form gets pre-filled. Most government forms have
 * sections no profile holds — criminal history, school enrolment — and the
 * applicant is better served knowing that up front than discovering it at the
 * review screen.
 */
function coverageLine(form: BenefitsForm): string {
  if (form.fillableFieldCount === 0) {
    return 'This form is filled by writing onto the page.';
  }
  const percent = Math.round((form.mappedFieldCount / form.fillableFieldCount) * 100);
  return `Help The Hive can fill about ${percent}% of this form (${form.mappedFieldCount} of ${form.fillableFieldCount} boxes). You complete the rest.`;
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.one },
  linkWrap: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.four },
  meta: { color: HiveColors.textSecondary, fontSize: 12, marginBottom: 4 },
  coverage: { color: HiveColors.textSecondary, fontSize: 13, marginBottom: Spacing.one },
  error: { color: HiveColors.danger, fontSize: 13 },
});
