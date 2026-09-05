import "dotenv/config";

import { expo } from "@better-auth/expo";
import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { Pool } from "pg";

import { generateAppleClientSecret } from "./apple.js";
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
const apple = env.apple;
const google = env.google;

export const auth = betterAuth({
  appName: "Help The Hive",
  database: pool,
  socialProviders: {
    ...(apple
      ? {
          apple: async () => ({
            clientId: apple.clientId,
            clientSecret: await generateAppleClientSecret(
              apple.clientId,
              apple.teamId,
              apple.keyId,
              apple.privateKey,
            ),
            appBundleIdentifier: apple.appBundleIdentifier,
          }),
        }
      : {}),
    ...(google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            prompt: "select_account",
          },
        }
      : {}),
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      dispatchAuthEmail(emailDispatcher, passwordResetEmail(user.email, url));
    },
  },
  emailVerification: {
    expiresIn: 60 * 60,
    sendOnSignUp: true,
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
    "https://appleid.apple.com",
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
