# HELP THE HIVE SOURCE OF TRUTH

When two parts of this repository disagree, this document says which one wins.
It exists because Help The Hive is being assembled from several efforts at once,
and "which version is right" was costing more time than the work itself.

## Backend / Infrastructure

**Padraic's existing Go / GCP / Postgres architecture.**

That means `apps/server` (Go, gqlgen, sqlc, pgx), `apps/auth` (Better Auth),
the goose migrations under `apps/server/migrations`, `infra/terraform`, the
Cloud Build and Cloud Run configuration, and the JWT/JWKS ownership model.

New work extends these. It does not replace them, and it does not get rebuilt
because a newer pattern looks tidier.

## Visual Design / UX

**Marcos's Xcode app and the current Figma designs.**

The React Native screens follow the Xcode design. Padraic's original React
Native visual design is *not* the reference and is being retired screen by
screen.

What is preserved from the React Native side is the working parts: routes, API
calls, auth flow, state and business logic. What is replaced is the look.

## API Contract

**`packages/api-contract`.**

One contract, in one place. `schema.graphql` and `meals.graphql` there generate
the Go resolvers (via gqlgen) *and* the mobile TypeScript types (via
graphql-codegen), so a change that breaks one side fails the other's build.

Do not introduce a second, parallel type system — no hand-written REST DTOs
duplicating GraphQL types, and no mobile-only copies of server types.

## Database

**The existing Help The Hive PostgreSQL / Cloud SQL database.**

Schema changes are goose migrations in `apps/server/migrations`, numbered in
sequence. See `apps/server/migrations/README.md` for the ordering rules.

## New AI Services

**Penny and Transcriber extend the backend through controlled APIs. They do not
replace it, and they do not own the database.**

The pattern, already established and worth keeping:

| Piece | Where | What it is |
| --- | --- | --- |
| Penny service | `apps/penny` | A Python service. Talks to an AI provider. |
| Penny integration | `apps/server/internal/modules/penny` | The Go client, tool gateway and token issuer. |
| Transcriber integration | `apps/server/internal/modules/transcriber` | The Go client for the transcription service. |

Neither service connects to Postgres. They reach data only through the Go
server, which enforces ownership from the verified JWT — so an AI service
cannot read a user's data by accident, and cannot read another user's at all.

Provider keys live server-side. Nothing that reaches the mobile bundle may
contain one: the bundle is readable by anyone who installs the app.

## The rules that outrank convenience

These are enforced in code and in tests. They are not style preferences.

1. **Ownership is server-side.** Every query scopes to the user resolved from
   the token. The client never filters for privacy — by then the data has
   already been sent.
2. **Anything a viewer may not see is "not found", never "forbidden".**
   Confirming that another user's record exists is itself a disclosure.
3. **No submission of government forms.** Help The Hive prepares documents; the
   person files them. There is no submit path and no SUBMITTED status.
4. **Eligibility language is banned.** "You qualify", "you are eligible",
   "approved", "guaranteed" appear nowhere in user-facing output.
5. **AI output is validated before anyone sees it,** and carries no authority:
   the deterministic engine decides, the model only explains.
6. **Costs are ranges with a confidence,** never a bare number presented as
   fact.
