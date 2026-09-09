# Help The Hive — recipe import service

Turns a cooking video link into a **Standard HTH Recipe Object**, ready for
`UpsertRecipe` on the Go API server.

```
POST /v1/imports  { "url": "https://youtu.be/…" }
      │
      ├─ 1. transcript   captions if they exist, otherwise Whisper on the audio
      ├─ 2. extract      LLM, strict JSON schema, anti-hallucination rules
      └─ 3. normalize    record what the video never said; decide plannability
      │
      ▼
  a private draft Recipe with sourceType: video_import
```

This closes the gap named in `docs/meal-plan-backend-contract.md`:

> **Recipe import** (video and URL). The data model supports it — `sourceType`
> covers `video_import` and `url_import` — but no import path is built.

It is derived from [sleeper/recipe-extractor](https://github.com/sleeper/recipe-extractor)
(MIT). See [NOTICE](NOTICE) for what was carried over and what is new.

## Why the output is not the template's output

The upstream project returns a flat recipe:

```json
{ "title": "...", "ingredients": ["200g red lentils", "salt"], "steps": ["..."],
  "servings": "4", "healthiness": { "indicator": "healthy", "rationale": "..." } }
```

Help The Hive cannot plan a week from that. Ingredients are prose, so nothing
can be priced or added to a grocery list; `servings` is a string; and there is
no way to say *the video never mentioned how much*.

So the extraction was reshaped to emit the contract in
`packages/api-contract/meals.graphql`, and the one rule that matters most is
carried through end to end:

> A recipe line with no stated quantity keeps `quantity: null` and carries a
> `missingInformation` note. Nothing invents the number.

Concretely:

| The video says | What comes out |
| --- | --- |
| "200g of red lentils" | `quantity: 200, unit: "g"` |
| "a handful of coriander" | `quantity: null`, `missingInformation` on the line, `ingredient_quantities` on the recipe, `baseMealPlanEligible: false` |
| "salt to taste" | `quantity: null`, `isToTaste: true`, **not** missing information |
| nothing about servings | `servings: null`, `servingsConfidence: "missing"` |
| nothing about nutrition | `nutrition: null` — never estimated |

An import is always a **private draft** with `sourceType: video_import`,
whatever the caller asks for: it is a proposal to the person who requested it,
never library content. Attribution to the original creator travels with it.

## Quickstart

Requires Python 3.11+, [uv](https://docs.astral.sh/uv/) and FFmpeg
(`brew install ffmpeg`).

```bash
uv sync
cp .env.example .env      # then set RECIPE_AI_API_KEY
uv run pytest -q
uv run uvicorn hth_transcriber.api:app --reload --port 8090
```

One-off from the command line, which is the quickest way to see what an
extraction actually produces:

```bash
uv run hth-transcribe "https://youtu.be/…" -f markdown
```

Or with Docker, which brings its own FFmpeg:

```bash
docker compose up --build
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/imports` | Start an import. `202` with an `importId`. |
| `GET` | `/v1/imports/{id}` | Poll it. Carries the recipe when `succeeded`. |
| `POST` | `/v1/imports:sync` | Run to completion. Blocks 20–60s. |
| `GET` | `/healthz` | Liveness. |
| `GET` | `/readyz` | Readiness — `503` without a provider key. |

Imports are asynchronous because they are slow: downloading audio and
transcribing it dominate, and a video with no captions takes tens of seconds.

```bash
curl -XPOST localhost:8090/v1/imports \
  -H 'Authorization: Bearer $IMPORT_SHARED_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://youtu.be/…","ownerUserId":"user_123"}'

curl localhost:8090/v1/imports/<importId> \
  -H 'Authorization: Bearer $IMPORT_SHARED_SECRET'
```

Failures are named, never a bare 500, because each one is something a user can
be told in words:

| Code | Meaning |
| --- | --- |
| `UNSUPPORTED_SOURCE` | Not a host we import from |
| `VIDEO_UNAVAILABLE` | Private, deleted, region-locked or age-gated |
| `VIDEO_TOO_LONG` | Past `IMPORT_MAX_DURATION_SECONDS` |
| `NO_TRANSCRIPT` | No captions, description or audible speech |
| `NO_RECIPE_FOUND` | Not a cooking video |
| `PROVIDER_ERROR` | The AI provider failed |

## Configuration

See [.env.example](.env.example). The provider follows the `MEAL_AI_*`
convention already on the Go server — a base URL plus a model name — so
switching vendors is configuration rather than a code change.

Every value is a server secret or a server-side limit. None of it may appear in
an `EXPO_PUBLIC_*` variable: anyone who installs the mobile app can read that
bundle.

## Security posture

The mobile app must never call this service directly. It authenticates *the Go
server* with a shared secret and trusts the `ownerUserId` it is passed, because
the server has already verified the JWT. That trust is only safe behind
internal-only ingress — see [docs/deployment.md](docs/deployment.md).

`IMPORT_ALLOWED_HOSTS` is an allowlist, not a blocklist. The service fetches
whatever URL it is handed, so an open one would make it a request proxy into
any network it can reach.

## Next steps

- [docs/integration.md](docs/integration.md) — wiring it into the Go server and
  the GraphQL contract
- [docs/deployment.md](docs/deployment.md) — Cloud Run, matching the existing
  `cloudbuild.*.yaml` pattern
