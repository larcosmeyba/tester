# Help The Hive

Help The Hive is organized as a pnpm workspace.

## Layout

```txt
apps/
  auth/                Better Auth server
  mobile/              Expo React Native app
  penny/               Penny agent service (FastAPI + LangGraph)
  server/              Go Server
packages/
  api-contract/        Future shared GraphQL schema/types package
  config/              Future shared tooling/config package
docs/
  penny-architecture.md
  server-api-inventory.md
```

[Better Auth documentation](apps/auth/README.md)

[Google Cloud deployment](docs/deployment/gcp.md)
[Server documentation](apps/server/README.md)
[Penny architecture](docs/penny-architecture.md)

## Commands

Install dependencies from the workspace root:

```bash
pnpm install
```

Run the mobile app:

```bash
pnpm start
```

Run platform-specific mobile commands:

```bash
pnpm ios
pnpm android
pnpm web
```

Validate the mobile app:

```bash
pnpm typecheck
pnpm lint
```

Run a mobile package script directly:

```bash
pnpm --filter @helpthehive/mobile <script>
```

Generate the shared GraphQL operation types:

```bash
pnpm api:generate
```

Run the Go server checks:

```bash
pnpm server:generate
pnpm server:test
```

Start the Go server after setting the required server environment variables:

```bash
pnpm server
```

## Mobile Routes

The Expo app lives in `apps/mobile`. Its `src/app` directory now has the target route groups for auth, onboarding, tabs, pantry, account, meals, videos, resources, and finance. The current route files intentionally render the existing migrated app root while the UI is gradually split into feature screens.

## Penny

Penny is the conversational assistant. She runs as a separate service in
`apps/penny`, deployed **without database credentials** — every read and every
write goes back through the Go backend, so "the model cannot modify the
database" is a fact about the deployment rather than a rule to remember.

Run the agent locally:

```bash
cd apps/penny && pip install -e '.[dev]' && uvicorn penny.main:app --port 8081
```

It defaults to a fake provider that needs no API key, so the whole path works
end to end with no vendor involved. Set `PENNY_AGENT_URL=http://localhost:8081`
on the Go server to switch Penny on; leave it unset and the rest of the app is
unaffected.

Run its tests and evals:

```bash
cd apps/penny && pytest
```
