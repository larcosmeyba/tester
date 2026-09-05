# Help The Hive Auth

Better Auth service for the Expo app. It owns authentication users, accounts,
sessions, verification records, and JWT signing keys in PostgreSQL. The Go API
continues to own application profiles and verifies short-lived JWTs through the
auth service's JWKS endpoint.

## Local setup

```bash
cp apps/auth/.env.example apps/auth/.env
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET`, then start PostgreSQL and apply
the auth schema:

```bash
docker compose -f apps/server/docker-compose.yml up -d postgres
pnpm auth:migrate
```

Email verification and password reset use Resend when `RESEND_API_KEY` and
`AUTH_EMAIL_FROM` are set. Without a Resend key, local development uses a safe
capture transport that logs only a generated message ID; it never prints an
actionable link. `MOBILE_AUTH_CALLBACK_URL` defaults to `helpthehive://auth`.

Start the auth service from the workspace root:

```bash
pnpm auth:dev
```

It listens on port `3000` by default. Useful endpoints are:

- `GET /` — service status and endpoint index
- `GET /healthz`
- `GET /readyz`
- `GET /api/auth/ok`
- `GET /api/auth/jwks`
- Better Auth routes under `/api/auth/*`

The checked-in SQL file under `migrations/` is generated for review and
deployment. Regenerate it after changing Better Auth plugins or models:

```bash
pnpm --filter @helpthehive/auth schema:generate
```

The generated diff is written to `migrations/pending.sql`; review and rename it
to the next numbered migration before applying it.

When enabling required email verification in an environment that already has
sessions, invalidate them once so every user signs in again after verification:

```bash
pnpm --filter @helpthehive/auth sessions:invalidate
```

## Hosted Better Auth dashboard

Create a project at [dash.better-auth.com](https://dash.better-auth.com), copy
its API key into `BETTER_AUTH_API_KEY` in `apps/auth/.env`, and restart the auth
service. The dashboard plugin is optional for local development, but the auth
service requires its API key whenever `NODE_ENV=production`.

The integration tracks authentication events and updates `lastActiveAt` at most
once every five minutes for active users. `BETTER_AUTH_API_URL` and
`BETTER_AUTH_KV_URL` should normally remain unset so the official hosted
endpoints are used.

For a physical phone, change `EXPO_PUBLIC_BETTER_AUTH_URL` and
`EXPO_PUBLIC_API_URL` in `apps/mobile/.env` from `localhost` to the development
machine's LAN address. Android Emulator commonly uses `10.0.2.2` instead.
