# Help The Hive

Help The Hive is organized as a pnpm workspace.

## Layout

```txt
apps/
  auth/                Better Auth server
  mobile/              Expo React Native app
  server/              Go Server
packages/
  api-contract/        Future shared GraphQL schema/types package
  config/              Future shared tooling/config package
docs/
  server-api-inventory.md
```

[Better Auth documentation](apps/auth/README.md)

[Google Cloud deployment](docs/deployment/gcp.md)
[Server documentation](apps/server/README.md)

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
