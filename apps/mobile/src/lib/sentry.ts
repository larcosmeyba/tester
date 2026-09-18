/**
 * Sentry crash reporting — side-effect import.
 *
 * Initializes Sentry ONLY when `EXPO_PUBLIC_SENTRY_DSN` is set (inlined at
 * build time, same pattern as the other `EXPO_PUBLIC_*` values in
 * `constants/env.ts`). A missing DSN is a silent no-op: crash reporting is
 * simply off, and the app never throws because of it.
 *
 * Scope is deliberately crash reporting only:
 *  - No tracing / performance monitoring (`tracesSampleRate` unset).
 *  - No `Sentry.setUser` — crash reports are never linked to a user identity
 *    (this is what the App Store privacy manifest and Play Data safety
 *    declarations state: crash data collected, not linked).
 *  - `debug` is on only in `__DEV__`.
 *
 * Import this module for its side effects at the very top of the root layout
 * (`src/app/_layout.tsx`) so the native crash handler is installed before
 * anything else runs.
 */

import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Crash reporting only — no performance/tracing data.
    tracesSampleRate: 0,
    // Never attach user identity to crash reports.
    // (Deliberately no Sentry.setUser anywhere in the app.)
    debug: __DEV__,
    // Keep the default native crash handler enabled so fatal native crashes
    // (not just JS exceptions) are captured.
    enableNativeCrashHandling: true,
    // Don't send the report until the user restarts into a healthy state is
    // overkill here; send on next launch (Sentry default) — no PII involved.
  });
}

export const sentryEnabled = Boolean(dsn);
