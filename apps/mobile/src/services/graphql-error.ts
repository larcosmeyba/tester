/**
 * Turns a GraphQL failure into the `ApiError` the meal screens already render.
 *
 * The server writes its own validation messages to be safe to show a user and
 * never echoes stored data back, so those are passed through. Anything the
 * server did not classify becomes a generic message rather than a raw payload.
 */
import { GraphQLRequestError } from '@/graphql/client';
import { ApiError, type ApiErrorKind } from '@/services/api-error';

function kindFromCode(code: unknown, status: number): ApiErrorKind {
  if (code === 'NOT_FOUND') return 'not_found';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'validation';
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof GraphQLRequestError) {
    const detail = error.graphQLErrors[0];
    const code = detail?.extensions?.code;

    // The Go middleware rejects an unverified token before a resolver runs, and
    // a resolver rejects a missing identity. Both mean: sign in again.
    if (/authentication required|unauthorized/i.test(error.message)) {
      return new ApiError('unauthorized', error.message, { status: error.status });
    }
    return new ApiError(kindFromCode(code, error.status), error.message, {
      status: error.status,
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    // fetch rejects with a TypeError when the device cannot reach the server.
    return new ApiError('network', 'Could not reach Help The Hive.', { cause: error });
  }
  return new ApiError('unknown', 'Something went wrong.', { cause: error });
}
