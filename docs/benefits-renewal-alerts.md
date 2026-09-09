# Benefits renewal alerts — Cloud Scheduler wiring

The API exposes one internal endpoint that Cloud Scheduler calls daily. It is
not a client route: it authenticates with a shared secret, never with a user
token.

## Endpoint

```
POST https://<api-service-url>/internal/jobs/benefits-renewal-sweep
X-Job-Secret: <value of INTERNAL_JOB_SECRET>
```

- `POST` only; anything else gets 405.
- The secret is compared in constant time. A missing or wrong secret gets 403;
  an unconfigured server (no `INTERNAL_JOB_SECRET`) returns 503 and never
  runs the sweep.
- On success it returns the sweep counts: `{"due":N,"sent":N,"skipped":N,"failed":N}`.
- The sweep is at-most-once per (renewal, stage): claiming a send inserts a row
  into `benefits_renewal_sends` — unique on `(renewal_id, stage)` — and advances
  the reminder stage in one transaction that commits before the Expo HTTP send.
  A crashed or retried call finds the claim already taken and never sends
  twice. The accepted tradeoff: a crash between the claim commit and the send
  skips that reminder rather than risking a duplicate.

## Secrets

Create the container and seed one version per environment. Never commit a
value, never reuse the value between environments.

```bash
ENVIRONMENT=dev   # or prod
PREFIX="helpthehive-$ENVIRONMENT"

gcloud secrets create "$PREFIX-internal-job-secret" \
  --replication-policy="automatic"

# Generate 32 random bytes on the machine, never type a value.
openssl rand -hex 32 | \
  gcloud secrets versions add "$PREFIX-internal-job-secret" --data-file=-
```

Wire it into the API Cloud Run service as an environment variable (the
Terraform deployment reads it from Secret Manager; the variable name the
server expects is `INTERNAL_JOB_SECRET`):

```bash
gcloud run services update "helpthehive-$ENVIRONMENT-api" \
  --region=us-central1 \
  --set-secrets=INTERNAL_JOB_SECRET="$PREFIX-internal-job-secret:latest"
```

Rotation: add a new version, redeploy the API so the new revision pins
`latest`, then update the Scheduler job below with the same value.

## Cloud Scheduler job

The sweep must run at least once per day. Any fixed time works — the reminder
stages are 30/7/1 days, so exact timing does not matter. Pick a quiet hour in
the users' timezone, for example 9:00 AM America/Chicago.

```bash
ENVIRONMENT=dev   # or prod
PREFIX="helpthehive-$ENVIRONMENT"
API_URL="https://helpthehive-$ENVIRONMENT-api-XXXX-uc.a.run.app"  # real service URL
JOB_SECRET="$(gcloud secrets versions access latest --secret="$PREFIX-internal-job-secret")"

gcloud scheduler jobs create http "$PREFIX-benefits-renewal-sweep" \
  --project="$PROJECT_ID" \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --time-zone="America/Chicago" \
  --uri="$API_URL/internal/jobs/benefits-renewal-sweep" \
  --http-method=POST \
  --headers="X-Job-Secret=$JOB_SECRET" \
  --oidc-service-account-email="scheduler@$PROJECT_ID.iam.gserviceaccount.com"
```

Two notes on that command:

- The `--headers` value embeds the secret in the job definition, which anyone
  with `cloudscheduler.jobs.get` can read. That matches how the rest of this
  deployment passes secrets to jobs; if you prefer not to, store the secret
  and rotate it through Terraform instead.
- `--oidc-service-account-email` adds an OIDC identity token to the request
  for ingress-level checks, but the `X-Job-Secret` header is what authorizes
  the sweep — the endpoint does not validate OIDC. You can run the job without
  the OIDC flag and rely on the shared secret alone.

## Verification

Run the job once by hand and read the counts back:

```bash
gcloud scheduler jobs run "$PREFIX-benefits-renewal-sweep" \
  --location=us-central1
```

Then check the API logs for the count-only line — it never carries a user id,
a program name, or push token content:

```
benefits renewal sweep complete  due=12 sent=9 skipped=2 failed=1
```

A wrong secret shows up as `403` in the scheduler run history and in the API
access logs; a 503 means `INTERNAL_JOB_SECRET` is not set on the Cloud Run
revision the job is calling.

## Push delivery

Reminders are delivered through the Expo Push API (`notify.Client`), which is
server-side only — server secrets never use `EXPO_PUBLIC_*` variables. The
visible push text never names the program or contains eligibility language;
with the discreet lock-screen setting (on by default) it reads "Help The Hive
reminder / Time to review your benefits". Every server log line about the
sweep is count-only.
