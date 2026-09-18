/**
 * Consent gating for the Vexo analytics client.
 *
 * The safety-critical property: the SDK must never initialize unless the
 * build is production, a Vexo API key is provisioned, and the user has
 * explicitly opted in. `vexo-analytics` resolves to the test double in
 * __mocks__ (via moduleNameMapper) — these tests assert our gating logic,
 * not the SDK's internals.
 */

import {
  disableTracking as mockDisableTracking,
  enableTracking as mockEnableTracking,
  vexo as mockVexo,
} from 'vexo-analytics';
import {
  isAnalyticsConfigured,
  isRecordingActive,
  subscribeRecordingActive,
  syncAnalyticsConsent,
} from '../vexo-client';

declare const global: typeof globalThis & { __DEV__?: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_VEXO_API_KEY;
  global.__DEV__ = false;
});

afterEach(() => {
  delete global.__DEV__;
});

describe('isAnalyticsConfigured', () => {
  it('is false when no API key is provisioned', () => {
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it('is true when the build-time key is present', () => {
    process.env.EXPO_PUBLIC_VEXO_API_KEY = 'test-key';
    expect(isAnalyticsConfigured()).toBe(true);
  });
});

describe('syncAnalyticsConsent', () => {
  it('never initializes in a dev build, even with consent and a key', async () => {
    global.__DEV__ = true;
    process.env.EXPO_PUBLIC_VEXO_API_KEY = 'test-key';
    await syncAnalyticsConsent(true);
    expect(mockVexo).not.toHaveBeenCalled();
    expect(mockEnableTracking).not.toHaveBeenCalled();
    expect(isRecordingActive()).toBe(false);
  });

  it('never initializes without an API key, even with consent', async () => {
    await syncAnalyticsConsent(true);
    expect(mockVexo).not.toHaveBeenCalled();
    expect(mockEnableTracking).not.toHaveBeenCalled();
    expect(isRecordingActive()).toBe(false);
  });

  it('initializes with replay on and enables tracking when consent is granted', async () => {
    process.env.EXPO_PUBLIC_VEXO_API_KEY = 'test-key';
    await syncAnalyticsConsent(true);
    expect(mockVexo).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({
        sessionReplay: true,
        performance: true,
        masking: expect.objectContaining({ maskAllTextInputs: true }),
      }),
    );
    expect(mockEnableTracking).toHaveBeenCalled();
    expect(mockDisableTracking).not.toHaveBeenCalled();
    expect(isRecordingActive()).toBe(true);
  });

  it('disables tracking and stops recording when consent is revoked', async () => {
    process.env.EXPO_PUBLIC_VEXO_API_KEY = 'test-key';
    await syncAnalyticsConsent(true);
    expect(isRecordingActive()).toBe(true);
    await syncAnalyticsConsent(false);
    expect(mockVexo).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ sessionReplay: false, performance: false }),
    );
    expect(mockDisableTracking).toHaveBeenCalled();
    expect(isRecordingActive()).toBe(false);
  });

  it('notifies recording subscribers on consent changes', async () => {
    process.env.EXPO_PUBLIC_VEXO_API_KEY = 'test-key';
    const seen: boolean[] = [];
    const unsubscribe = subscribeRecordingActive((active) => seen.push(active));
    await syncAnalyticsConsent(true);
    await syncAnalyticsConsent(false);
    unsubscribe();
    await syncAnalyticsConsent(true);
    // The listener fired for on then off, but not after unsubscribe.
    expect(seen).toEqual([true, false]);
  });
});
