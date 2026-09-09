# Deploying the import service

It follows the pattern already used by `cloudbuild.server.yaml` and
`cloudbuild.auth.yaml`: build a container, push it to Artifact Registry, deploy
a Cloud Run service. `cloudbuild.transcriber.yaml` in this repo is a starting
point that matches those substitutions.

## Ingress must be internal

This is the one non-negotiable part. The service authenticates the Go server
with a shared secret and then trusts the `ownerUserId` it is given. Exposed
publicly, anyone holding the secret could import into any account.

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
  --concurrency=4 \
  --cpu=1 --memory=2Gi \
  --timeout=600
```

The API server reaches it over the VPC connector by its internal URL, which
becomes `RECIPE_IMPORT_URL` on the server side alongside the same
`IMPORT_SHARED_SECRET`.

## Why these numbers

| Setting | Reason |
| --- | --- |
| `--min-instances=1 --max-instances=1` | Jobs are in-memory. Two instances cannot see each other's jobs; see integration.md. |
| `--concurrency=4` | Matches `IMPORT_MAX_CONCURRENCY`. Each import can hold an audio file and an ffmpeg process. |
| `--memory=2Gi` | ffmpeg plus a downloaded audio track. 512Mi is not enough for a long video. |
| `--timeout=600` | A no-captions import on a long video runs for minutes. |
| `--cpu=1` | ffmpeg is the only CPU-bound part and it is brief. |

`APP_ENV=production` makes authentication mandatory: without
`IMPORT_SHARED_SECRET` the service fails closed with a 500 rather than serving
an open endpoint.

## Secrets

Two, both in Secret Manager, neither ever in the repo or in an `EXPO_PUBLIC_*`
variable:

- `recipe-ai-api-key` — the extraction/transcription provider key
- `import-shared-secret` — shared with the Go API server only

Rotating the shared secret means updating both services. Deploy the server with
the new value first if you want a window where both are accepted; otherwise
expect a brief 401 window.

## Cost

Every import without captions is one audio transcription plus one extraction
call. YouTube videos usually have captions, which skips the expensive half —
this is why the captions-first ordering inherited from the upstream project
matters commercially and not just for quality. Instagram and TikTok almost
never do, so they cost meaningfully more per import.

`IMPORT_MAX_DURATION_SECONDS` is the backstop against somebody pasting a
three-hour stream.

## Operations

- `GET /healthz` — liveness. Cheap, says nothing about whether imports work.
- `GET /readyz` — readiness. `503` when the provider key is missing, which is
  the failure worth catching at deploy time rather than on the first import.

Use `/readyz` as the Cloud Run startup probe so a revision with a missing
secret never takes traffic.
