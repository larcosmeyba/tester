# Help The Hive Server

Go GraphQL API for Help The Hive app-owned data. Auth flows are owned by Better Auth outside this service; this server only verifies Better Auth JWTs locally with JWKS.

## Requirements

- Go 1.23 at `/usr/local/go/bin/go` or on `PATH`.
- Docker for local Postgres.
- The workspace Better Auth service configured and running from `apps/auth`.

## Local Setup

```bash
cp .env.example .env
docker compose up -d postgres
cp ../auth/.env.example ../auth/.env
pnpm --dir ../auth migrate
export DATABASE_URL='postgres://helpthehive:helpthehive@localhost:54328/helpthehive?sslmode=disable'
make migrate-up
make run
```

The API listens on `HTTP_ADDR`, defaulting to `:8080`.

## Vector Support

The application database enables pgvector through the checked-in Goose
migrations. Cloud SQL supplies the extension binaries, but the extension must
be enabled independently in each database; it is enabled only in the app
database and not in the Better Auth database. Local development uses a pinned
PostgreSQL 18 image with pgvector preinstalled.

This is infrastructure support only. An embedding provider, fixed vector
dimension, distance metric, index, storage table, and GraphQL search contract
will be selected together when the first semantic-search feature is designed.

Run the Better Auth service on port `3000` before making authenticated GraphQL
requests. Its issuer, audience, and JWKS values must match this service's
`BETTER_AUTH_*` variables.

## Routes

- `GET /healthz`
- `GET /readyz`
- `POST /graphql`
- `GET /playground` when `APP_ENV=development`

## Auth Contract

Clients send Better Auth JWTs to GraphQL requests:

```txt
Authorization: Bearer <jwt>
```

The server validates signature, issuer, audience, expiration, not-before, and subject using:

- `BETTER_AUTH_ISSUER`
- `BETTER_AUTH_AUDIENCE`
- `BETTER_AUTH_JWKS_URL`

## Checks

```bash
make generate
make test
```

DB integration tests are skipped unless `TEST_DATABASE_URL` is set.
