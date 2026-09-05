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
export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

/**
 * Whether services with no backend behind them yet fall back to the local
 * development mock. Never true in a production build, whatever the env var says.
 *
 * The meal-plan system is the current case: the GraphQL server has no meal
 * schema, so the mock lets the questionnaire, plan and grocery screens be built
 * and tested against the real contract while the backend work is pending.
 */
export const useMockServices =
  !isProduction && process.env.EXPO_PUBLIC_USE_MOCK_SERVICES !== 'false';
