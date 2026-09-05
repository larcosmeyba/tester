/**
 * Developer preview sign-in.
 *
 * Standing up real authentication needs Postgres and the Better Auth server
 * running locally. When you only want to walk the app's screens, this stands in
 * for a signed-in user so the shell renders.
 *
 * It is a local UI convenience and nothing more:
 *
 *  - It grants NO access to any server. There is no token, so every real API
 *    call still fails exactly as it would signed out. Screens backed by the
 *    GraphQL server show their normal empty or error states.
 *  - It is compiled out of any release build. `__DEV__` is false there, so the
 *    flag cannot be switched on in production even if the variable is set.
 *
 * Enable it by putting this in `apps/mobile/.env.local`:
 *
 *     EXPO_PUBLIC_DEV_PREVIEW_AUTH=true
 *
 * and restarting Metro. Leave it off to exercise the real sign-in flow.
 */

export const DEV_PREVIEW_AUTH_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_PREVIEW_AUTH === 'true';

/**
 * A stand-in user. The id is deliberately not a real identifier — anything that
 * reaches a server with it will be rejected, which is the point.
 */
export const DEV_PREVIEW_USER = {
  id: 'dev-preview-user',
  name: 'Dev Preview',
  email: 'dev-preview@localhost',
  emailVerified: true,
  image: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} as const;
