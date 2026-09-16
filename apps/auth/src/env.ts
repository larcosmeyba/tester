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
