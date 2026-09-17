/**
 * Help The Hive engagement analytics (Vexo).
 *
 * - vexo-client: consent-gated SDK init (production only, opt-in only).
 * - sensitive-screen: <SensitiveScreen> masks PII out of session replays.
 * - recording-indicator: persistent "recording" pill + useRecordingActive hook.
 */

export {
  isAnalyticsConfigured,
  isRecordingActive,
  subscribeRecordingActive,
  syncAnalyticsConsent,
} from './vexo-client';
export { SensitiveScreen } from './sensitive-screen';
export { AnalyticsRecordingIndicator, useRecordingActive } from './recording-indicator';
