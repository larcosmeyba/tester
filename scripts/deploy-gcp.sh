#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <auth|api> <dev|prod> [project-id]" >&2
  exit 2
}

SERVICE_KIND="${1:-}"
ENVIRONMENT="${2:-}"
PROJECT_ID="${3:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"

[[ "$SERVICE_KIND" == "auth" || "$SERVICE_KIND" == "api" ]] || usage
[[ "$ENVIRONMENT" == "dev" || "$ENVIRONMENT" == "prod" ]] || usage
[[ -n "$PROJECT_ID" && "$PROJECT_ID" != "(unset)" ]] || usage

PREFIX="helpthehive-$ENVIRONMENT"
REPOSITORY="$PREFIX-containers"
INSTANCE_CONNECTION_NAME="$(
  gcloud sql instances describe "$PREFIX-postgres" \
    --project="$PROJECT_ID" \
    --format='value(connectionName)'
)"
BUILD_SERVICE_ACCOUNT="projects/$PROJECT_ID/serviceAccounts/$PREFIX-build@$PROJECT_ID.iam.gserviceaccount.com"

if [[ "$ENVIRONMENT" == "dev" ]]; then
  DEFAULT_MAX_INSTANCES=2
  DEFAULT_CORS_ORIGIN=https://dev.example.invalid
else
  DEFAULT_MAX_INSTANCES=5
  DEFAULT_CORS_ORIGIN=https://example.invalid
fi

MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-$DEFAULT_MAX_INSTANCES}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-$DEFAULT_CORS_ORIGIN}"

if [[ "$CORS_ALLOWED_ORIGINS" == *,* ]]; then
  echo "CORS_ALLOWED_ORIGINS cannot contain commas in the manual deployment wrapper." >&2
  echo "Use one browser origin per deployment or submit Cloud Build directly with escaped substitutions." >&2
  exit 2
fi

COMMON_SUBSTITUTIONS="_REGION=$REGION,_REPOSITORY=$REPOSITORY,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,_MIN_INSTANCES=$MIN_INSTANCES,_MAX_INSTANCES=$MAX_INSTANCES"

if [[ "$SERVICE_KIND" == "auth" ]]; then
  MIGRATIONS_DIRECTORY=apps/auth/migrations
  CONFIG=cloudbuild.auth.yaml
  SUBSTITUTIONS="$COMMON_SUBSTITUTIONS,_SERVICE=$PREFIX-auth,_MIGRATION_JOB=$PREFIX-auth-migrate,_DATABASE_SECRET=$PREFIX-auth-database-url,_RUNTIME_SERVICE_ACCOUNT=$PREFIX-auth-run@$PROJECT_ID.iam.gserviceaccount.com,_MIGRATION_SERVICE_ACCOUNT=$PREFIX-auth-migrate@$PROJECT_ID.iam.gserviceaccount.com,_BETTER_AUTH_SECRET=$PREFIX-better-auth-secret,_BETTER_AUTH_API_KEY=$PREFIX-better-auth-api-key,_RESEND_API_KEY=$PREFIX-resend-api-key,_APPLE_CLIENT_ID=$PREFIX-apple-client-id,_APPLE_TEAM_ID=$PREFIX-apple-team-id,_APPLE_KEY_ID=$PREFIX-apple-key-id,_APPLE_PRIVATE_KEY=$PREFIX-apple-private-key,_APPLE_APP_BUNDLE_IDENTIFIER=$PREFIX-apple-app-bundle-identifier,_GOOGLE_CLIENT_ID=$PREFIX-google-client-id,_GOOGLE_CLIENT_SECRET=$PREFIX-google-client-secret,_BETTER_AUTH_AUDIENCE=helpthehive-api,_AUTH_CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS,_MOBILE_AUTH_CALLBACK_URL=${MOBILE_AUTH_CALLBACK_URL:-helpthehive://auth},_AUTH_EMAIL_FROM=${AUTH_EMAIL_FROM:-Help The Hive <auth@example.com>}"
else
  MIGRATIONS_DIRECTORY=apps/server/migrations
  CONFIG=cloudbuild.server.yaml
  SUBSTITUTIONS="$COMMON_SUBSTITUTIONS,_SERVICE=$PREFIX-api,_AUTH_SERVICE=$PREFIX-auth,_MIGRATION_JOB=$PREFIX-api-migrate,_DATABASE_SECRET=$PREFIX-app-database-url,_RUNTIME_SERVICE_ACCOUNT=$PREFIX-api-run@$PROJECT_ID.iam.gserviceaccount.com,_MIGRATION_SERVICE_ACCOUNT=$PREFIX-api-migrate@$PROJECT_ID.iam.gserviceaccount.com,_BETTER_AUTH_AUDIENCE=helpthehive-api,_CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS"
fi

MIGRATIONS_SHA="$(
  find "$MIGRATIONS_DIRECTORY" -type f -exec shasum -a 256 {} + \
    | LC_ALL=C sort \
    | shasum -a 256 \
    | cut -c1-40
)"
SUBSTITUTIONS="$SUBSTITUTIONS,_MIGRATIONS_SHA=$MIGRATIONS_SHA"

gcloud builds submit . \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --config="$CONFIG" \
  --service-account="$BUILD_SERVICE_ACCOUNT" \
  --substitutions="$SUBSTITUTIONS"
