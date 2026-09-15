/**
 * Pending deep link for notification taps that target the custom nav stack.
 *
 * The benefits renewal deep link uses expo-router paths, but the benefits
 * questionnaire screens live in AppRoot's custom stack, which expo-router
 * can't reach. So the notification handler stashes the parsed payload here
 * and AppRoot consumes it (cold start) or subscribes to it (warm tap).
 */
import type { QuestionnaireReminderPushData } from '@/features/notifications/notification-service';

let pending: QuestionnaireReminderPushData | null = null;

type Listener = (data: QuestionnaireReminderPushData) => void;
const listeners = new Set<Listener>();

export function setPendingQuestionnaireDeepLink(data: QuestionnaireReminderPushData): void {
  pending = data;
  listeners.forEach((listener) => listener(data));
}

export function consumePendingQuestionnaireDeepLink(): QuestionnaireReminderPushData | null {
  const data = pending;
  pending = null;
  return data;
}

export function subscribeQuestionnaireDeepLink(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
