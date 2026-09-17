/**
 * Vexo engagement-analytics client (Help The Hive mobile app).
 *
 * What this module does:
 * - Initializes the Vexo SDK (session replay + performance monitoring) in
 *   production builds only, and only after the user has explicitly opted in.
 * - Applies a defensive default: text inputs are always masked, and sensitive
 *   screens are wrapped in <SensitiveScreen> (a VexoMask wrapper), so
 *   session-replay frames never carry readable personal data.
 *
 * Consent model:
 * - Analytics are OFF by default. The user opts in from the Settings screen
 *   ("Analytics" toggle), which persists `analyticsConsentGranted` in app
 *   state (AsyncStorage) and calls `syncAnalyticsConsent`.
 * - Turning the toggle off calls `disableTracking()`, which also stops any
 *   in-flight replay recording immediately.
 * - Dev builds (__DEV__) never initialize: no analytics in development.
 *
 * API key:
 * - The Vexo project API key is a public build-time value read from
 *   `EXPO_PUBLIC_VEXO_API_KEY` (EAS build environment). It is NOT a secret —
 *   it ships inside the JS bundle — but it must never be hardcoded here.
 * - If the key is missing, the module no-ops and the Settings toggle renders
 *   disabled with an honest "not configured" subtitle.
 */

import { disableTracking, enableTracking, vexo } from 'vexo-analytics';

/**
 * Build-time Vexo project API key. Read lazily (not at module import) so the
 * value is always the one baked into the current build, and so tests can
 * control it via process.env without module-registry tricks. Empty until
 * Marcos provisions it.
 */
function vexpoApiKey(): string {
  return process.env.EXPO_PUBLIC_VEXO_API_KEY ?? '';
}

/** Whether analytics can actually run in this build (key provisioned). */
export function isAnalyticsConfigured(): boolean {
  return vexpoApiKey().length > 0;
}

// --- Recording-indicator state -------------------------------------------
// Module-level so any component can subscribe without touching app state.
// Only ever true in a production build with consent granted and a key
// configured — the exact conditions under which replay is recording.

type RecordingListener = (recording: boolean) => void;

const recordingListeners = new Set<RecordingListener>();
let recordingActive = false;

function setRecordingActive(active: boolean): void {
  if (recordingActive === active) return;
  recordingActive = active;
  recordingListeners.forEach((listener) => listener(active));
}

/** Subscribe to "session replay is actively recording". Returns unsubscribe. */
export function subscribeRecordingActive(listener: RecordingListener): () => void {
  recordingListeners.add(listener);
  return () => {
    recordingListeners.delete(listener);
  };
}

/** Current "session replay is actively recording" value (for initial render). */
export function isRecordingActive(): boolean {
  return recordingActive;
}

/**
 * Bring the Vexo SDK in line with the user's consent choice.
 *
 * - granted === true: (re-)initialize with replay + performance on, tracking
 *   enabled. Re-running vexo() wins on re-init (documented by the SDK), so
 *   toggling consent on/off repeatedly is safe.
 * - granted === false: initialize with replay off, then disableTracking() to
 *   stop any in-flight recording and mark tracking off.
 *
 * Safe to call any number of times. Never initializes in __DEV__ or without
 * a configured API key.
 */
export async function syncAnalyticsConsent(granted: boolean): Promise<void> {
  if (__DEV__) return;
  const apiKey = vexpoApiKey();
  if (apiKey.length === 0) return;

  vexo(apiKey, {
    sessionReplay: granted,
    performance: granted,
    masking: {
      // Belt and suspenders: text inputs are masked natively by default,
      // and every sensitive screen additionally wraps its body in
      // <SensitiveScreen> (VexoMask). Never enable maskAllText globally —
      // it would also hide the app's own UI from legitimate support replays.
      maskAllTextInputs: true,
    },
  });

  if (granted) {
    await enableTracking();
    setRecordingActive(true);
  } else {
    await disableTracking();
    setRecordingActive(false);
  }
}
