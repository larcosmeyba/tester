function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string) {
  return process.env[name]?.trim() || undefined;
}

const apple = {
  clientId: optional("APPLE_CLIENT_ID"),
  teamId: optional("APPLE_TEAM_ID"),
  keyId: optional("APPLE_KEY_ID"),
  privateKey: optional("APPLE_PRIVATE_KEY"),
  appBundleIdentifier: optional("APPLE_APP_BUNDLE_IDENTIFIER"),
};

const configuredAppleValues = Object.values(apple).filter(Boolean).length;
if (configuredAppleValues > 0 && configuredAppleValues < Object.keys(apple).length) {
  throw new Error(
    "APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, and APPLE_APP_BUNDLE_IDENTIFIER must all be set together",
  );
}

const appleConfig = configuredAppleValues === Object.keys(apple).length
  ? {
      clientId: apple.clientId!,
      teamId: apple.teamId!,
      keyId: apple.keyId!,
      privateKey: apple.privateKey!,
      appBundleIdentifier: apple.appBundleIdentifier!,
    }
  : undefined;

const google = {
  clientId: optional("GOOGLE_CLIENT_ID"),
  clientSecret: optional("GOOGLE_CLIENT_SECRET"),
};

const configuredGoogleValues = Object.values(google).filter(Boolean).length;
if (configuredGoogleValues > 0 && configuredGoogleValues < Object.keys(google).length) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
}

const googleConfig = configuredGoogleValues === Object.keys(google).length
  ? { clientId: google.clientId!, clientSecret: google.clientSecret! }
  : undefined;

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseURL: required("DATABASE_URL"),
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  betterAuthURL: required("BETTER_AUTH_URL"),
  betterAuthAudience: required("BETTER_AUTH_AUDIENCE"),
  betterAuthAPIKey: optional("BETTER_AUTH_API_KEY"),
  betterAuthAPIURL: optional("BETTER_AUTH_API_URL"),
  betterAuthKVURL: optional("BETTER_AUTH_KV_URL"),
  resendAPIKey: optional("RESEND_API_KEY"),
  authEmailFrom: optional("AUTH_EMAIL_FROM"),
  apple: appleConfig,
  google: googleConfig,
  mobileAuthCallbackURL: process.env.MOBILE_AUTH_CALLBACK_URL?.trim() || "helpthehive://auth",
  corsAllowedOrigins: (process.env.AUTH_CORS_ALLOWED_ORIGINS ?? "http://localhost:8081")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

if (env.resendAPIKey && !env.authEmailFrom) {
  throw new Error("AUTH_EMAIL_FROM is required when RESEND_API_KEY is set");
}

if (!URL.canParse(env.mobileAuthCallbackURL)) {
  throw new Error("MOBILE_AUTH_CALLBACK_URL must be a valid URL");
}

if (process.env.NODE_ENV === "production" && !env.betterAuthAPIKey) {
  throw new Error("BETTER_AUTH_API_KEY is required in production");
}

if (process.env.NODE_ENV === "production" && (!env.resendAPIKey || !env.authEmailFrom)) {
  throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM are required in production");
}

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}
