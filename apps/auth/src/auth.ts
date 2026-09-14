import "dotenv/config";

import { expo } from "@better-auth/expo";
import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { Pool } from "pg";

import { env } from "./env.js";
import {
  DevelopmentEmailDispatcher,
  dispatchAuthEmail,
  emailChangeVerificationEmail,
  passwordResetEmail,
  ResendEmailDispatcher,
  verificationEmail,
} from "./email.js";

export const pool = new Pool({ connectionString: env.databaseURL });
const emailDispatcher = env.resendAPIKey && env.authEmailFrom
  ? new ResendEmailDispatcher(env.resendAPIKey, env.authEmailFrom)
  : new DevelopmentEmailDispatcher();
export const auth = betterAuth({
  appName: "Help The Hive",
  database: pool,
  emailAndPassword: {
    enabled: true,
    // The app's one-time verification codes (API requestVerificationCode /
    // verifyCode) are the single verification of record — see the Sign Up /
    // Login / Onboarding v2 spec. better-auth must not gate sign-in or send
    // its own verification emails, or new users can never establish a
    // session. (Marcos: confirm; auth service needs a redeploy.)
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      dispatchAuthEmail(emailDispatcher, passwordResetEmail(user.email, url));
    },
  },
  emailVerification: {
    expiresIn: 60 * 60,
    // Disabled: the API's verification codes are the single verification
    // flow. (Explicit changeEmail verification still uses
    // sendVerificationEmail below.)
    sendOnSignUp: false,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      const message = user.emailVerified
        ? emailChangeVerificationEmail(user.email, url)
        : verificationEmail(user.email, url);
      dispatchAuthEmail(emailDispatcher, message);
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
  },
  trustedOrigins: [
    "helpthehive://",
    "helpthehive://*",
    env.mobileAuthCallbackURL,
    `${env.mobileAuthCallbackURL}/*`,
    ...env.corsAllowedOrigins,
    ...(process.env.NODE_ENV === "production" ? [] : ["exp://", "exp://**"]),
  ],
  plugins: [
    expo(),
    jwt({
      jwt: {
        issuer: env.betterAuthURL,
        audience: env.betterAuthAudience,
        expirationTime: "15m",
        definePayload: ({ user }) => ({ email: user.email, emailVerified: user.emailVerified }),
      },
    }),
    ...(env.betterAuthAPIKey
      ? [
          dash({
            apiKey: env.betterAuthAPIKey,
            apiUrl: env.betterAuthAPIURL,
            kvUrl: env.betterAuthKVURL,
            activityTracking: {
              enabled: true,
              updateInterval: 5 * 60 * 1000,
            },
          }),
        ]
      : []),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
