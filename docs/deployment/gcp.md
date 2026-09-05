# Google Cloud deployment

The deployment runs Better Auth and the Go GraphQL API as separate public Cloud
Run services. Each environment has its own Cloud SQL PostgreSQL instance, with
separate databases and users for auth and application data. Cloud Run reaches
Cloud SQL through the managed `/cloudsql` Unix socket; the database has no
authorized client networks.

Terraform owns durable resources and creates placeholder Cloud Run revisions.
Cloud Build owns application revisions: it tests and publishes an immutable
image, runs the matching migration job, deploys only after migrations succeed,
and verifies the service.

The deployment helper hashes the selected service's migration directory and
stores that hash as the `hth-migrations-sha` Cloud Run label. A migration job
runs on the first deployment, whenever that hash changes, or when the label is
missing; code-only deployments skip the job. Tests and container compilation
run in parallel, while the image push remains gated on both succeeding. Each
service also maintains a registry-backed `buildcache` image tag to reuse stable
dependency and build layers across Cloud Build workers.

## Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` and Terraform 1.8 or newer authenticated to that project.
- A Better Auth dashboard project, a verified Resend sender, and their API keys.

## Bootstrap Terraform state

Create one versioned state bucket for both environments. Bucket names are
globally unique, so replace the example name.

```bash
PROJECT_ID=your-gcp-project-id
STATE_BUCKET="$PROJECT_ID-helpthehive-terraform-state"

gcloud storage buckets create "gs://$STATE_BUCKET" \
  --project="$PROJECT_ID" \
  --location=us-central1 \
  --uniform-bucket-level-access
gcloud storage buckets update "gs://$STATE_BUCKET" --versioning

cp infra/terraform/backend.hcl.example infra/terraform/backend.hcl
cp infra/terraform/environments/dev/terraform.tfvars.example \
  infra/terraform/environments/dev/terraform.tfvars
cp infra/terraform/environments/prod/terraform.tfvars.example \
  infra/terraform/environments/prod/terraform.tfvars
```

Set the bucket in `backend.hcl`, set the same project ID in both tfvars files,
and replace the placeholder web origins and sender addresses.

## Provision an environment

Run Terraform from the environment directory. Review every plan; do not use
automatic approval for production.

```bash
cd infra/terraform/environments/dev
terraform init -backend-config=../../backend.hcl
terraform fmt -check -recursive ../..
terraform validate
terraform plan -out=dev.tfplan
terraform apply dev.tfplan
```

Repeat from `environments/prod` when production is ready. Production deletion
protection is enabled by default. Both instances are initially zonal with
backups and point-in-time recovery; changing `availability_type` to regional is
a deliberate later availability/cost decision.

Terraform state contains generated database passwords and database connection
URLs. Restrict state bucket access to infrastructure administrators and keep
public access prevention enabled.

## Seed external secrets

Terraform creates external secret containers without versions. Add values
before submitting either deployment. Use the `dev` or `prod` prefix.

```bash
ENVIRONMENT=dev
PREFIX="helpthehive-$ENVIRONMENT"

read -r -s -p "Better Auth secret: " BETTER_AUTH_SECRET_VALUE
printf %s "$BETTER_AUTH_SECRET_VALUE" | \
  gcloud secrets versions add "$PREFIX-better-auth-secret" --data-file=-
unset BETTER_AUTH_SECRET_VALUE

read -r -s -p "Better Auth dashboard API key: " BETTER_AUTH_API_KEY_VALUE
printf %s "$BETTER_AUTH_API_KEY_VALUE" | \
  gcloud secrets versions add "$PREFIX-better-auth-api-key" --data-file=-
unset BETTER_AUTH_API_KEY_VALUE

read -r -s -p "Resend API key: " RESEND_API_KEY_VALUE
printf %s "$RESEND_API_KEY_VALUE" | \
  gcloud secrets versions add "$PREFIX-resend-api-key" --data-file=-
unset RESEND_API_KEY_VALUE

printf %s 'YOUR_SERVICES_ID' | \
  gcloud secrets versions add "$PREFIX-apple-client-id" --data-file=-
printf %s 'YOUR_TEAM_ID' | \
  gcloud secrets versions add "$PREFIX-apple-team-id" --data-file=-
printf %s 'YOUR_KEY_ID' | \
  gcloud secrets versions add "$PREFIX-apple-key-id" --data-file=-
gcloud secrets versions add "$PREFIX-apple-private-key" \
  --data-file=/absolute/path/to/AuthKey_YOUR_KEY_ID.p8
printf %s 'com.helpthehive.HelpTheHive' | \
  gcloud secrets versions add "$PREFIX-apple-app-bundle-identifier" --data-file=-

printf %s 'YOUR_GOOGLE_WEB_CLIENT_ID' | \
  gcloud secrets versions add "$PREFIX-google-client-id" --data-file=-
read -r -s -p "Google OAuth client secret: " GOOGLE_CLIENT_SECRET_VALUE
printf %s "$GOOGLE_CLIENT_SECRET_VALUE" | \
  gcloud secrets versions add "$PREFIX-google-client-secret" --data-file=-
unset GOOGLE_CLIENT_SECRET_VALUE
```

Generate `BETTER_AUTH_SECRET` with at least 32 random bytes and never reuse it
between environments. Rotation creates a new secret version; deploy auth again
to create a revision pinned through the `latest` reference.

## First deployment

Run auth first so the API can discover its issuer and JWKS URL. The helper
submits the current local workspace to Cloud Build; no GitHub connection or
commit is required.

```bash
./scripts/deploy-gcp.sh auth dev "$PROJECT_ID"
./scripts/deploy-gcp.sh api dev "$PROJECT_ID"
```

For production, replace `dev` with `prod`. The submitting account must be
allowed to start Cloud Builds and act as the environment's dedicated build
service account. Project owners normally already have those permissions.

The helper derives resource names and the Cloud SQL connection from the
Terraform-managed environment. Optional environment overrides include
`GCP_REGION`, `MIN_INSTANCES`, `MAX_INSTANCES`, `CORS_ALLOWED_ORIGINS`,
`MOBILE_AUTH_CALLBACK_URL`, and `AUTH_EMAIL_FROM`. Keep overrides consistent
with the corresponding Terraform variables.

The auth pipeline verifies `/healthz`, `/readyz`, `/api/auth/ok`, and JWKS. The
API pipeline verifies health/readiness and confirms unauthenticated GraphQL is
rejected. A failed migration stops deployment before traffic changes.

Retrieve client endpoints after deployment:

```bash
gcloud run services describe helpthehive-dev-auth \
  --project="$PROJECT_ID" --region=us-central1 --format='value(status.url)'
gcloud run services describe helpthehive-dev-api \
  --project="$PROJECT_ID" --region=us-central1 --format='value(status.url)'
```

Use those values for `EXPO_PUBLIC_BETTER_AUTH_URL` and
`EXPO_PUBLIC_API_URL` (with `/graphql`) in the matching EAS environment.

## Migration and rollback policy

- Auth migrations are ordered SQL files recorded in `_auth_migrations`. The
  runner holds a PostgreSQL advisory lock, validates applied checksums, and runs
  each new migration in its own transaction.
- API migrations continue to use Goose and its existing migration ledger.
- Automated migrations only move forward. Schema changes must use an
  expand/contract sequence compatible with the previous service revision.
- Roll back application code by routing traffic to a previous compatible Cloud
  Run revision; never automatically run a down migration.

## Local container checks

```bash
docker build -f Dockerfile.auth -t helpthehive-auth:local .
docker build -f Dockerfile.server -t helpthehive-api:local .

docker inspect helpthehive-auth:local --format '{{.Config.User}}'
docker inspect helpthehive-api:local --format '{{.Config.User}}'
```

Both images must report a non-root user. Full health checks require a reachable
PostgreSQL database and the environment variables documented in each service's
`.env.example`.
