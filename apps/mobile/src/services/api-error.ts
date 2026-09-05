/**
 * One error type for REST calls that sit outside the GraphQL schema, so screens
 * can render a consistent error state with a retry affordance instead of each
 * caller inventing its own.
 *
 * GraphQL calls keep using `GraphQLRequestError` from `graphql/client`.
 */

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'parse'
  | 'not_implemented'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  override readonly cause?: unknown;

  constructor(kind: ApiErrorKind, message: string, options: { status?: number | null; cause?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.cause = options.cause;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable() {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server' || this.kind === 'rate_limited';
  }

  /** Safe to show a user. Never leaks a stack trace or a raw server payload. */
  get userMessage() {
    switch (this.kind) {
      case 'network':
        return "We couldn't reach Help The Hive. Check your connection and try again.";
      case 'timeout':
        return 'That took longer than expected. Please try again.';
      case 'unauthorized':
        return 'Your session has expired. Please sign in again.';
      case 'forbidden':
        return "You don't have access to that.";
      case 'not_found':
        return "We couldn't find what you were looking for.";
      case 'validation':
        return this.message;
      case 'rate_limited':
        return "You've made a lot of requests. Please wait a moment and try again.";
      case 'not_implemented':
        return "That feature isn't available yet.";
      default:
        return 'Something went wrong on our end. Please try again.';
    }
  }
}

/**
 * Thrown by a service whose backend does not exist yet. Screens render these as
 * a clearly-labelled pending state, never as a crash.
 */
export class BackendIntegrationRequiredError extends ApiError {
  constructor(readonly feature: string) {
    super('not_implemented', `BACKEND INTEGRATION REQUIRED: ${feature}`);
    this.name = 'BackendIntegrationRequiredError';
  }
}

/** Turns any thrown value into copy that is safe to put in front of a user. */
export function describeError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ApiError) {
    return { message: error.userMessage, retryable: error.isRetryable };
  }
  if (error instanceof Error && error.message) {
    return { message: 'Something went wrong. Please try again.', retryable: true };
  }
  return { message: 'Something went wrong. Please try again.', retryable: true };
}
