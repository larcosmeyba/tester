/**
 * Questionnaire drop-off reminder (audit Section 3, Page 3).
 *
 * If the user leaves the group questionnaire before finishing, a local
 * notification nudges them back: "You're almost done completing your benefits
 * application. Pick up where you left off." The tap payload carries the exact
 * section to resume at.
 *
 * Only notification identifiers are stored in AsyncStorage — never answers or
 * any benefits data. Answers themselves live on the server (saved per
 * section), so resuming is just a matter of opening the right section.
 *
 * NOTE for the deep-link handler (features/notifications/
 * notification-deep-link-handler.tsx, owned by another slice): handle the
 * payload below by routing to
 *   nav.push('benefitsGroupQuestionnaire', { applicationIds, state, resumeSection })
 * Payload shape:
 *   { kind: 'benefits_questionnaire', applicationIds: string[], state: string, resumeSection: number }
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export const QUESTIONNAIRE_REMINDER_PAYLOAD_KIND = 'benefits_questionnaire';

/** Hours after drop-off before the nudge fires. Matches the audit's 24h cadence. */
const REMINDER_DELAY_HOURS = 24;

const STORAGE_PREFIX = 'helpthehive.benefitsDropOffReminder:';

function storageKey(applicationIds: string[]): string {
  return `${STORAGE_PREFIX}${[...applicationIds].sort().join(',')}`;
}

export type QuestionnaireReminderTarget = {
  applicationIds: string[];
  state: string;
  resumeSection: number;
};

/**
 * Schedules the drop-off nudge. No-ops when notification permission is not
 * granted — this screen never prompts; the native prompt lives in onboarding.
 * Returns the scheduled notification id, or null when nothing was scheduled.
 */
export async function scheduleQuestionnaireDropOffReminder(
  target: QuestionnaireReminderTarget,
): Promise<string | null> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      return null;
    }
    await cancelQuestionnaireDropOffReminders(target.applicationIds);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "You're almost done",
        body: "You're almost done completing your benefits application. Pick up where you left off.",
        data: {
          kind: QUESTIONNAIRE_REMINDER_PAYLOAD_KIND,
          applicationIds: target.applicationIds,
          state: target.state,
          resumeSection: target.resumeSection,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_DELAY_HOURS * 3600,
        repeats: false,
      },
    });
    await AsyncStorage.setItem(storageKey(target.applicationIds), id);
    return id;
  } catch {
    return null;
  }
}

/** Cancels any pending drop-off nudge for these applications (e.g. on completion). */
export async function cancelQuestionnaireDropOffReminders(applicationIds: string[]): Promise<void> {
  try {
    const key = storageKey(applicationIds);
    const id = await AsyncStorage.getItem(key);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(key);
    }
  } catch {
    // Best effort: a stale scheduled nudge is harmless — its tap just
    // reopens the questionnaire, which will show "nothing left to ask".
  }
}
