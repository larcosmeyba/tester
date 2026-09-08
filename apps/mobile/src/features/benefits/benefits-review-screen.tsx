/**
 * The review screen: everything that will be written on the form, before it is.
 *
 * This is the last point at which a person sees the application as a person,
 * and it is the reason the whole system is built the way it is. What is shown
 * is exactly what the server resolved — no value is composed here — and it is
 * grouped by page so it can be read against the printed form.
 *
 * Approving is what flattens the document. The server refuses while anything
 * required is missing, so the button is disabled and the outstanding questions
 * are shown instead of a failure after the fact.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton, AppHeader, Card, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';
import {
  type BenefitsApplication,
  approveBenefitsApplication,
  benefitsDocumentUrl,
  fetchBenefitsApplication,
  requiredQuestionsToAsk,
} from '@/features/benefits/benefits-repository';

export default function BenefitsReviewScreen() {
  const router = useRouter();
  const { programId } = useLocalSearchParams<{ programId?: string }>();
  const applicationId = programId;

  const [application, setApplication] = useState<BenefitsApplication | null>(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    // Nothing to fetch without an id; the screen renders its own message for
    // that case rather than setting state from inside this effect.
    if (!applicationId) {
      return;
    }
    let cancelled = false;
    fetchBenefitsApplication(applicationId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError('That application could not be found.');
          return;
        }
        setApplication(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the application.');
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const outstanding = useMemo(
    () => (application ? requiredQuestionsToAsk(application) : []),
    [application],
  );

  const pages = useMemo(() => {
    if (!application) return [];
    const byPage = new Map<number, BenefitsApplication['filledFields']>();
    for (const field of application.filledFields) {
      const existing = byPage.get(field.page);
      if (existing) existing.push(field);
      else byPage.set(field.page, [field]);
    }
    return [...byPage.entries()].sort(([a], [b]) => a - b);
  }, [application]);

  const approve = useCallback(async () => {
    if (!application) return;
    setApproving(true);
    setError('');
    try {
      setApplication(await approveBenefitsApplication(application.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This application could not be approved.');
    } finally {
      setApproving(false);
    }
  }, [application]);

  if (application === null) {
    const message = !applicationId
      ? 'No application was selected.'
      : error !== ''
        ? error
        : 'Loading…';
    return (
      <ScrollScreen>
        <AppHeader title="Review application" onBack={router.back} />
        <View style={styles.body}>
          <Text style={message === 'Loading…' ? uiText.muted : styles.error}>{message}</Text>
        </View>
      </ScrollScreen>
    );
  }

  const approved = application.status === 'APPROVED';
  const documentPath = approved ? application.finalDocumentPath : application.draftDocumentPath;

  return (
    <ScrollScreen>
      <AppHeader title={application.form.formTitle} onBack={router.back} />

      <View style={styles.body}>
        <Text style={styles.meta}>
          {application.form.program}
          {application.form.state ? ` · ${application.form.state}` : ''} ·{' '}
          {application.form.formCode} · {application.form.pageCount} pages
        </Text>

        {outstanding.length > 0 ? (
          <Card style={styles.warning}>
            <Text style={uiText.subtitle}>
              {outstanding.length} {outstanding.length === 1 ? 'answer is' : 'answers are'} still needed
            </Text>
            <Text style={uiText.muted}>
              These boxes stay blank until you answer them. Nothing is filled in on your behalf.
            </Text>
            {outstanding.slice(0, 6).map((field) => (
              <Text key={field.fieldPath} style={styles.outstanding}>
                · {field.label}
              </Text>
            ))}
            <AppButton
              title="Answer these"
              onPress={() =>
                router.push(`/resources/benefits-questionnaire?applicationId=${application.id}`)
              }
            />
          </Card>
        ) : null}

        {application.problems.length > 0 ? (
          <Card style={styles.warning}>
            <Text style={uiText.subtitle}>Needs a look</Text>
            {application.problems.map((problem) => (
              <Text key={problem.fieldId} style={styles.outstanding}>
                · {problem.reason}
              </Text>
            ))}
          </Card>
        ) : null}

        {pages.map(([page, fields]) => (
          <Card key={page}>
            <Text style={uiText.subtitle}>Page {page}</Text>
            {fields.map((field) => (
              <View key={field.fieldId} style={styles.row}>
                <Text style={styles.rowLabel}>{field.label || field.fieldId}</Text>
                <Text style={styles.rowValue}>
                  {field.isCheckbox ? (field.checked ? 'Ticked' : 'Not ticked') : field.text}
                </Text>
                {field.source === 'DERIVED' ? (
                  <Text style={styles.rowNote}>Worked out from your other answers</Text>
                ) : null}
                {field.source === 'MAPPING_CONSTANT' ? (
                  <Text style={styles.rowNote}>Fixed by this form</Text>
                ) : null}
              </View>
            ))}
          </Card>
        ))}

        <Card>
          <Text style={uiText.subtitle}>Signature</Text>
          <Text style={uiText.muted}>
            The signature and the date beside it are left blank on purpose. Help The Hive does not
            sign an application for you — you sign it, and you submit it to the agency yourself.
          </Text>
        </Card>

        {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

        {documentPath ? (
          <AppButton
            title={approved ? 'Open the completed PDF' : 'Open the draft PDF'}
            onPress={() => Linking.openURL(benefitsDocumentUrl(documentPath))}
          />
        ) : null}

        {approved ? (
          <Text style={styles.approved}>
            Approved. The completed PDF is final and can no longer be edited.
          </Text>
        ) : (
          <AppButton
            title={approving ? 'Finishing…' : 'Approve and finish'}
            onPress={approve}
            disabled={approving || outstanding.length > 0 || application.problems.length > 0}
          />
        )}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  meta: { color: HiveColors.textSecondary, fontSize: 12 },
  warning: { backgroundColor: HiveColors.warningBg },
  outstanding: { color: HiveColors.text, fontSize: 13, marginTop: 2 },
  row: { marginTop: Spacing.one },
  rowLabel: { color: HiveColors.textSecondary, fontSize: 12 },
  rowValue: { color: HiveColors.text, fontSize: 15 },
  rowNote: { color: HiveColors.textSecondary, fontSize: 11, fontStyle: 'italic' },
  error: { color: HiveColors.danger, fontSize: 13 },
  approved: { color: HiveColors.success, fontSize: 13 },
});
