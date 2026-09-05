import { expoClient } from '@better-auth/expo/client';
import { dashClient } from '@better-auth/infra/native';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { jwtClient } from 'better-auth/client/plugins';
import { Platform } from 'react-native';

const webStorage = {
  getItem(name: string) {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(name);
  },
  async getItemAsync(name: string) {
    return webStorage.getItem(name);
  },
  setItem(name: string, value: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(name, value);
    }
  },
  async setItemAsync(name: string, value: string) {
    webStorage.setItem(name, value);
  },
};

const authURL = process.env.EXPO_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3000';
const authCallbackURL = process.env.EXPO_PUBLIC_AUTH_CALLBACK_URL ?? 'helpthehive://auth';

export const verificationCallbackURL = `${authCallbackURL}/verified`;
export const passwordResetCallbackURL = `${authCallbackURL}/reset-password`;

export const authClient = createAuthClient({
  baseURL: authURL,
  plugins: [
    expoClient({
      scheme: 'helpthehive',
      storagePrefix: 'helpthehive',
      storage: Platform.OS === 'web' ? webStorage : SecureStore,
    }),
    jwtClient(),
    dashClient(),
  ],
});

const TOKEN_EXPIRY_SKEW_MS = 60_000;

type CachedToken = {
  expiresAt: number;
  token: string;
};

export class GraphQLAuthTokenError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GraphQLAuthTokenError';
  }
}

let cachedToken: CachedToken | null = null;
let pendingToken: Promise<string> | null = null;
let tokenCacheGeneration = 0;

function getTokenExpiry(token: string) {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new GraphQLAuthTokenError('The auth server returned an invalid JWT');
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(paddedBase64)) as { exp?: unknown };
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) {
      throw new Error('JWT payload does not contain a valid exp claim');
    }
    return decoded.exp * 1000;
  } catch (error) {
    throw new GraphQLAuthTokenError(
      'The auth server returned a JWT with an invalid expiration',
      { cause: error },
    );
  }
}

function authErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return 'Unable to obtain an API authentication token';
}

/** Clears the API JWT cache. Call this whenever the authenticated session changes. */
export function invalidateGraphQLAuthToken() {
  tokenCacheGeneration += 1;
  cachedToken = null;
  pendingToken = null;
}

export function getGraphQLAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS > now) {
    return Promise.resolve(cachedToken.token);
  }

  if (!pendingToken) {
    const requestGeneration = tokenCacheGeneration;
    const request = authClient
      .token()
      .then(({ data, error }) => {
        if (error) {
          throw new GraphQLAuthTokenError(authErrorMessage(error));
        }
        if (!data?.token) {
          throw new GraphQLAuthTokenError(
            'The auth server did not return an API authentication token',
          );
        }

        const token = data.token;
        const expiresAt = getTokenExpiry(token);
        if (requestGeneration === tokenCacheGeneration) {
          cachedToken = { token, expiresAt };
        }
        return token;
      })
      .catch((error: unknown) => {
        if (error instanceof GraphQLAuthTokenError) {
          throw error;
        }
        throw new GraphQLAuthTokenError(
          'Unable to obtain an API authentication token',
          { cause: error },
        );
      })
      .finally(() => {
        if (pendingToken === request) {
          pendingToken = null;
        }
      });

    pendingToken = request;
  }
  return pendingToken;
}
