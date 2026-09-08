# Deploying video-to-recipe import

Two services. The Go API server you already run, and a Python extraction
service that downloads a video's audio, transcribes it and extracts a recipe.

```
mobile app ──GraphQL(JWT)──▶ API server ──HTTP(shared secret)──▶ extraction service
                                  │                                     │
                                  ▼                                yt-dlp + LLM
                            Postgres (recipe_imports)
```

Import is **optional**. With `RECIPE_IMPORT_URL` unset the API server runs
exactly as it does today and the import fields report themselves unavailable.
Nothing else changes, and `/readyz` is unaffected.

## The API server

| Variable | Required | Meaning |
| --- | --- | --- |
| `RECIPE_IMPORT_URL` | to enable import | Internal URL of the extraction service |
| `IMPORT_SHARED_SECRET` | with the above | Presented as `Authorization: Bearer …` |
| `RECIPE_IMPORT_START_TIMEOUT` | no | Default `10s`. Starting is a short call |
| `RECIPE_IMPORT_POLL_TIMEOUT` | no | Default `5s` |
| `RECIPE_IMPORT_POLL_ATTEMPTS` | no | Default `3`. Reads only — starts are never retried |
| `RECIPE_IMPORT_MAX_ATTEMPTS` | no | Default `3` extractions per import |
| `RECIPE_IMPORT_RATE_LIMIT` | no | Default `10` imports per user per window |
| `RECIPE_IMPORT_RATE_WINDOW` | no | Default `1h` |
| `RECIPE_IMPORT_STALE_AFTER` | no | Default `2m` before the worker picks up a quiet import |
| `RECIPE_IMPORT_RUNNING_TIMEOUT` | no | Default `15m` before a running import is treated as stuck |

Both secrets belong in Secret Manager. Neither may ever appear in an
`EXPO_PUBLIC_*` variable: anyone who installs the mobile app can read that
bundle.

Setting `RECIPE_IMPORT_URL` without `IMPORT_SHARED_SECRET` is a **start-up
failure**, not a surprise on the first import.

### The worker

Every API server instance runs an import worker that sweeps for imports which
have gone quiet, so an import finishes whether or not anyone is watching it.
Claiming is done in SQL (`FOR UPDATE SKIP LOCKED` inside the claiming UPDATE),
so **running several API instances is safe** — two workers sweeping at the same
instant take disjoint rows. No extra deployment unit, no queue to operate.

## The extraction service

Ships separately (see its own `README.md` and `docs/deployment.md`). It must
not be reachable from the public internet or from the mobile app: it
authenticates *this server* with the shared secret and trusts the
`ownerUserId` it is handed, which is only safe behind internal ingress.

```bash
gcloud run deploy hth-transcriber \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/transcriber:${TAG}" \
  --region="${REGION}" \
  --ingress=internal \
  --no-allow-unauthenticated \
  --service-account="hth-transcriber@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-env-vars=APP_ENV=production \
  --set-secrets=RECIPE_AI_API_KEY=recipe-ai-api-key:latest \
  --set-secrets=IMPORT_SHARED_SECRET=import-shared-secret:latest \
  --min-instances=1 --max-instances=1 \
  --concurrency=4 --cpu=1 --memory=2Gi --timeout=600
```

### Why those limits

| Setting | Reason |
| --- | --- |
| `--ingress=internal` | The service trusts this server to say who an import belongs to |
| `--max-instances=1` | Its job store is in memory; a poll routed to another instance finds nothing. The API server's worker recovers such imports, but one instance avoids the churn |
| `--concurrency=4` | Each import can hold a downloaded audio file and an ffmpeg process |
| `--memory=2Gi` | ffmpeg plus audio. 512Mi is not enough for a long video |
| `--timeout=600` | A no-captions import on a long video runs for minutes |

`--max-instances=1` is a simplification, not a correctness requirement: losing
that service's jobs is survivable because Postgres is the source of truth and
the worker retries what the service forgets.

## Health and readiness

| Endpoint | Service | Meaning |
| --- | --- | --- |
| `/healthz` | both | Liveness. Says nothing about whether imports work |
| `/readyz` | API server | Database only — **deliberately** not affected by import |
| `/readyz` | extraction | `503` without a provider key |

`/readyz` on the API server does not include the extraction service on purpose.
Import is optional and degrades to "unavailable"; failing readiness for it
would pull the whole API out of rotation over a feature the app can live
without. Instead the server probes the extraction service **once at start-up**
and logs `recipe import service is not ready` — so a wrong URL or a bad secret
is visible immediately rather than on somebody's first import.

Use the extraction service's `/readyz` as its Cloud Run startup probe, so a
revision with a missing provider key never takes traffic.

## Database

Migration `00011_recipe_imports.sql` creates `recipe_imports`. It is additive
and touches no existing table, so it deploys ahead of the server safely.

## Cost

Every attempt buys a transcription. Three things bound that:

- **one live import per user per video** — a partial unique index, so a
  double-tap cannot buy two;
- **`RECIPE_IMPORT_RATE_LIMIT`** per user per window;
- **`RECIPE_IMPORT_MAX_ATTEMPTS`** per import, enforced in SQL so two workers
  cannot each spend the last attempt.

Only transient faults are retried. A private or over-long video fails
permanently on the first attempt, because retrying buys the same answer twice.

YouTube usually has captions, which skips the expensive transcription half.
Instagram and TikTok rarely do and cost meaningfully more per import.
