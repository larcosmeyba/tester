/**
 * The per-application Submission Guide (audit Section 3b).
 *
 * Rendered inside a full-screen modal from the Ready view and from the
 * review screen. Every fact comes from existing data:
 *
 * - Documents to bring: the program catalog's `requirements`.
 * - Where to submit: the form's backend `agencyUrl`, when the backend
 *   provides one. Nothing is invented — no guessed addresses, phone numbers,
 *   or URLs; a missing URL renders explicit fallback copy.
 * - The no-SSN warning and the hand-completion rows restate the standing
 *   product rule: Help The Hive never asks for or stores Social Security
 *   numbers, so the SSN boxes stay blank for the applicant to fill in by hand.
 */
import { Linking, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppHeader, Card, HiveIcon, ScrollScreen, uiText } from '@/components/hive-ui';
import { HiveColors, Spacing } from '@/constants/theme';

import { programCatalog } from './benefits-program-catalog';
import type { BenefitsApplication } from './benefits-repository';

function normaliseProgram(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function BenefitsSubmissionGuide({
  application,
  onClose,
}: {
  application: BenefitsApplication;
  onClose: () => void;
}) {
  const catalogEntry = programCatalog.find(
    (entry) => normaliseProgram(entry.id) === normaliseProgram(application.form.program),
  );
  const documents = catalogEntry?.requirements ?? [];
  const agencyUrl = application.form.agencyUrl?.trim() || null;
  const programName = catalogEntry?.name ?? application.form.program;

  return (
    <ScrollScreen>
      <AppHeader title="Submission Guide" onBack={onClose} />
      <View style={styles.body}>
        <Text style={uiText.title}>Your application is ready</Text>
        <Text style={uiText.muted}>
          {programName}
          {application.form.state ? ` · ${application.form.state}` : ''}
        </Text>

        <Card style={styles.noSsn}>
          <View style={styles.warningRow}>
            <HiveIcon name="shield" size={20} color={HiveColors.danger} />
            <Text style={styles.noSsnTitle}>Do not write your Social Security number in this app</Text>
          </View>
          <Text style={uiText.muted}>
            Help The Hive never asks for or stores Social Security numbers. The SSN boxes on your
            printed form are left blank on purpose — complete them by hand after printing.
          </Text>
        </Card>

        <Card>
          <Text style={uiText.subtitle}>Review your application</Text>
          <Text style={uiText.muted}>
            Read through every page of the printed form. If anything is wrong, fix your answers and
            print again — never cross things out on the copy you submit.
          </Text>
        </Card>

        <Card>
          <Text style={uiText.subtitle}>Print your application</Text>
          <Text style={uiText.muted}>
            Print every page, single-sided. Keep one full copy for yourself before you submit.
          </Text>
        </Card>

        <Card>
          <Text style={uiText.subtitle}>Sign your application</Text>
          <Text style={uiText.muted}>
            Sign and date the form by hand where it asks for a signature. Help The Hive does not
            sign applications — an unsigned form will be sent back.
          </Text>
        </Card>

        <Card>
          <Text style={uiText.subtitle}>Complete by hand</Text>
          <View style={styles.handRow}>
            <Text style={styles.handLabel}>Social Security number</Text>
            <Text style={styles.handValue}>Complete manually</Text>
          </View>
          <Text style={uiText.muted}>
            This is the only identifier the printed kit asks you to add yourself, and the app will
            never fill it in for you.
          </Text>
        </Card>

        <Card>
          <Text style={uiText.subtitle}>Bring these with you</Text>
          {documents.length > 0 ? (
            documents.map((document) => (
              <Text key={document} style={styles.bullet}>
                · {document}
              </Text>
            ))
          ) : (
            <Text style={uiText.muted}>
              This program did not list required documents in the app catalog. Check the
              agency&apos;s website for what to bring.
            </Text>
          )}
        </Card>

        <Card>
          <Text style={uiText.subtitle}>How to submit</Text>
          {agencyUrl ? (
            <>
              <Text style={uiText.muted}>
                Submit through the {catalogEntry?.agency ?? 'program agency'}:
              </Text>
              <AppButton
                title="Open the agency application site"
                variant="plain"
                onPress={() => void Linking.openURL(agencyUrl)}
              />
              <Text style={styles.urlNote}>{agencyUrl}</Text>
            </>
          ) : (
            <Text style={uiText.muted}>
              {/* TODO (Section 3b): the backend did not provide an agencyUrl for
                  this form, so there is no verified submission link to show.
                  Do not invent one — wire the agency's application portal URL
                  through BenefitsForm.agencyUrl instead. */}
              The agency&apos;s online application link is not available for this form yet. Search
              for the {programName} application portal for{' '}
              {application.form.state ? `your state (${application.form.state})` : 'your state'}{' '}
              on the agency&apos;s official website, or call the number printed on the form.
            </Text>
          )}
        </Card>

        <AppButton title="Done" onPress={onClose} />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  noSsn: { backgroundColor: '#FDECEA', borderColor: HiveColors.danger, borderWidth: 1 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.one },
  noSsnTitle: { color: HiveColors.danger, fontSize: 16, fontWeight: '800', flex: 1 },
  handRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
    paddingVertical: Spacing.one,
    borderTopWidth: 1,
    borderTopColor: HiveColors.border,
  },
  handLabel: { color: HiveColors.text, fontSize: 15 },
  handValue: { color: HiveColors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  bullet: { color: HiveColors.text, fontSize: 14, marginTop: 4 },
  urlNote: { color: HiveColors.textSecondary, fontSize: 12, marginTop: 4 },
});
