/**
 * The submission-status control (audit Section 3b, Page 6).
 *
 * "Did you submit your applications?" with the three required buttons.
 * "Yes" is session-only: there is no backend mutation that persists
 * submission status, so it must never be presented as saved server truth.
 * "Not yet" / "I plan to this week" keep submission reminders active.
 *
 * TODO (Section 3b): add a markBenefitsApplicationSubmitted mutation. Until
 * then, `onSubmitted` should only flip local UI state and must not claim
 * the submission was recorded anywhere.
 */
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, uiText } from '@/components/hive-ui';
import { Spacing } from '@/constants/theme';

export function BenefitsSubmissionControl({
  onSubmitted,
  onDismiss,
}: {
  /** The user answered "Yes, I submitted". Session-only until the backend mutation exists. */
  onSubmitted: () => void;
  /** "Not yet" / "I plan to this week" — reminders stay active. */
  onDismiss: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={uiText.subtitle}>Did you submit your applications?</Text>
      <Text style={uiText.muted}>
        Submission happens with the agency, not in this app — tell us where things stand so we
        know whether to keep reminding you.
      </Text>
      <AppButton title="Yes, I submitted" onPress={onSubmitted} />
      <AppButton title="Not yet" variant="secondary" onPress={onDismiss} />
      <AppButton title="I plan to this week" variant="secondary" onPress={onDismiss} />
      <Text style={uiText.small}>
        Answering here only updates this session. “Not yet” and “I plan to this week” keep your
        submission reminders active.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, paddingBottom: Spacing.three },
});
