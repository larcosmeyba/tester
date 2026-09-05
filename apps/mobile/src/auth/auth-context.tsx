import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import {
  authClient,
  invalidateGraphQLAuthToken,
  passwordResetCallbackURL,
  verificationCallbackURL,
} from '@/auth/auth-client';

type SignUpInput = {
  name: string;
  email: string;
  password: string;
};

type SignInInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  isReady: boolean;
  isAuthenticated: boolean;
  user: NonNullable<ReturnType<typeof authClient.useSession>['data']>['user'] | null;
  signUp: (input: SignUpInput) => Promise<{ verificationRequired: true; email: string }>;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  confirmPassword: (password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  sendVerificationEmail: (email: string) => Promise<void>;
  changeEmail: (newEmail: string) => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthErrorCode =
  | 'verification_required'
  | 'invalid_or_expired_token'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

export class AuthFlowError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

function authError(
  error: { code?: string; message?: string; status?: number; statusText?: string } | null,
  fallback: string
) {
  const code = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (error?.status === 403 && (code.includes('email') || code.includes('verif'))) {
    return new AuthFlowError('verification_required', 'Please verify your email before signing in.');
  }
  if (error?.status === 429) {
    return new AuthFlowError('rate_limited', 'Too many attempts. Please wait and try again.');
  }
  if (code.includes('token') || code.includes('expired')) {
    return new AuthFlowError('invalid_or_expired_token', 'This link is invalid or has expired.');
  }
  if (!error?.status) {
    return new AuthFlowError('network_error', 'Unable to reach the authentication service.');
  }
  return new AuthFlowError('unknown', error.message || fallback);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const previousUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const userId = session.data?.user.id;
    if (previousUserId.current !== userId) {
      invalidateGraphQLAuthToken();
      previousUserId.current = userId;
    }
  }, [session.data?.user.id]);

  const signUp = useCallback(async (input: SignUpInput) => {
    const email = input.email.trim().toLowerCase();
    const result = await authClient.signUp.email({ ...input, email, callbackURL: verificationCallbackURL });
    if (result.error) {
      throw authError(result.error, 'Unable to create your account.');
    }
    return { verificationRequired: true as const, email };
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    const result = await authClient.signIn.email({
      ...input,
      email: input.email.trim().toLowerCase(),
    });
    if (result.error) {
      throw authError(result.error, 'Unable to sign in.');
    }
    await session.refetch();
  }, [session]);

  const signInWithApple = useCallback(async () => {
    const result = await authClient.signIn.social({
      provider: 'apple',
      callbackURL: '/',
    });
    if (result.error) {
      throw authError(result.error, 'Unable to sign in with Apple.');
    }
    invalidateGraphQLAuthToken();
    await session.refetch();
  }, [session]);

  const signInWithGoogle = useCallback(async () => {
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/',
    });
    if (result.error) {
      throw authError(result.error, 'Unable to sign in with Google.');
    }
    invalidateGraphQLAuthToken();
    await session.refetch();
  }, [session]);

  const signOut = useCallback(async () => {
    const result = await authClient.signOut();
    if (result.error) {
      throw authError(result.error, 'Unable to sign out.');
    }
    invalidateGraphQLAuthToken();
    await session.refetch();
  }, [session]);

  const confirmPassword = useCallback(async (password: string) => {
    const email = session.data?.user.email;
    if (!email) {
      throw new AuthFlowError('unknown', 'Your current account could not be identified.');
    }
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      throw authError(result.error, 'The current password is incorrect.');
    }
    invalidateGraphQLAuthToken();
    await session.refetch();
  }, [session]);

  const deleteAccount = useCallback(async (password: string) => {
    const result = await authClient.deleteUser({ password });
    if (result.error) {
      throw authError(result.error, 'Unable to delete your account.');
    }
    invalidateGraphQLAuthToken();
    await session.refetch();
  }, [session]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const result = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: passwordResetCallbackURL,
    });
    if (result.error) {
      throw authError(result.error, 'Unable to request a password reset.');
    }
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    const result = await authClient.resetPassword({ token, newPassword });
    if (result.error) {
      throw authError(result.error, 'Unable to reset your password.');
    }
    await session.refetch();
  }, [session]);

  const sendVerificationEmail = useCallback(async (email: string) => {
    const result = await authClient.sendVerificationEmail({
      email: email.trim().toLowerCase(),
      callbackURL: verificationCallbackURL,
    });
    if (result.error) {
      throw authError(result.error, 'Unable to send a verification email.');
    }
  }, []);

  const changeEmail = useCallback(async (newEmail: string) => {
    const result = await authClient.changeEmail({
      newEmail: newEmail.trim().toLowerCase(),
      callbackURL: `${verificationCallbackURL}?flow=email-change`,
    });
    if (result.error) {
      throw authError(result.error, 'Unable to change your login email.');
    }
  }, []);

  const refreshSession = useCallback(async () => {
    await session.refetch();
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady: !session.isPending,
      isAuthenticated: Boolean(session.data?.session),
      user: session.data?.user ?? null,
      signUp,
      signIn,
      signInWithApple,
      signInWithGoogle,
      signOut,
      confirmPassword,
      deleteAccount,
      requestPasswordReset,
      resetPassword,
      sendVerificationEmail,
      changeEmail,
      refreshSession,
    }),
    [changeEmail, confirmPassword, deleteAccount, refreshSession, requestPasswordReset, resetPassword, sendVerificationEmail, session.data, session.isPending, signIn, signInWithApple, signInWithGoogle, signOut, signUp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
