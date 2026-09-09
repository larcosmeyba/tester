/**
 * Environment configuration.
 *
 * Follows the same pattern as `graphql/client.ts`: public values come from
 * `EXPO_PUBLIC_*` variables, which Expo inlines at build time.
 *
 * SECURITY: nothing here may be a server secret. No LLM keys, no database
 * credentials, no Resend keys, no private third-party keys — the JavaScript
 * bundle is readable by anyone who installs the app. Those integrations belong
 * behind the Help The Hive backend.
 */

import { DEV_PREVIEW_AUTH_ENABLED } from '@/auth/dev-preview';

export type AppEnvironment = 'development' | 'staging' | 'production';

function resolveEnvironment(): AppEnvironment {
  const declared = process.env.EXPO_PUBLIC_ENVIRONMENT;
  if (declared === 'staging' || declared === 'production' || declared === 'development') {
    return declared;
  }
  return __DEV__ ? 'development' : 'production';
}

export const environment: AppEnvironment = resolveEnvironment();

export const isProduction = environment === 'production';

/** Base URL for REST endpoints that are not part of the GraphQL schema. */
const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
if (!rawApiBaseUrl && !__DEV__) {
  throw new Error(
    '[env] EXPO_PUBLIC_API_BASE_URL is not set. Production builds require it ' +
      '(set it in the EAS "production" environment). Refusing to fall back to ' +
      'http://localhost:8080, which would be unreachable in a shipped app.',
  );
}
export const apiBaseUrl = (rawApiBaseUrl ?? 'http://localhost:8080').replace(/\/+$/, '');

/**
 * Whether the meal services fall back to the local development mock instead of
 * the Help The Hive GraphQL server.
 *
 * The server now implements the meal schema, so the real backend is the
 * default. The mock stays available for two cases:
 *
 *  - `EXPO_PUBLIC_USE_MOCK_SERVICES=true`, for working on the meal screens with
 *    no server running.
 *  - Developer preview sign-in, which grants no token at all. Every real call
 *    would fail as unauthorized, so the mock is used rather than showing an
 *    error state that says nothing about the screen being worked on.
 *
 * Never true in a production build, whatever the variables say.
 */
export const useMockServices =
  !isProduction &&
  (process.env.EXPO_PUBLIC_USE_MOCK_SERVICES === 'true' || DEV_PREVIEW_AUTH_ENABLED);
