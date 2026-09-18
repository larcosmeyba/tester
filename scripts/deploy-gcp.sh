#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <auth|api|penny|transcriber> <dev|prod> [project-id]" >&2
  exit 2
}

SERVICE_KIND="${1:-}"
ENVIRONMENT="${2:-}"
PROJECT_ID="${3:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"

[[ "$SERVICE_KIND" == "auth" || "$SERVICE_KIND" == "api" || "$SERVICE_KIND" == "penny" || "$SERVICE_KIND" == "transcriber" ]] || usage
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

if [[ "$SERVICE_KIND" == "auth" || "$SERVICE_KIND" == "api" ]] && [[ "$CORS_ALLOWED_ORIGINS" == *,* ]]; then
  echo "CORS_ALLOWED_ORIGINS cannot contain commas in the manual deployment wrapper." >&2
  echo "Use one browser origin per deployment or submit Cloud Build directly with escaped substitutions." >&2
  exit 2
fi

COMMON_SUBSTITUTIONS="_REGION=$REGION,_REPOSITORY=$REPOSITORY,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,_MIN_INSTANCES=$MIN_INSTANCES,_MAX_INSTANCES=$MAX_INSTANCES"
MIGRATIONS_DIRECTORY=""

if [[ "$SERVICE_KIND" == "auth" ]]; then
  MIGRATIONS_DIRECTORY=apps/auth/migrations
  CONFIG=cloudbuild.auth.yaml
  SUBSTITUTIONS="$COMMON_SUBSTITUTIONS,_SERVICE=$PREFIX-auth,_MIGRATION_JOB=$PREFIX-auth-migrate,_DATABASE_SECRET=$PREFIX-auth-database-url,_RUNTIME_SERVICE_ACCOUNT=$PREFIX-auth-run@$PROJECT_ID.iam.gserviceaccount.com,_MIGRATION_SERVICE_ACCOUNT=$PREFIX-auth-migrate@$PROJECT_ID.iam.gserviceaccount.com,_BETTER_AUTH_SECRET=$PREFIX-better-auth-secret,_BETTER_AUTH_API_KEY=$PREFIX-better-auth-api-key,_RESEND_API_KEY=$PREFIX-resend-api-key,_BETTER_AUTH_AUDIENCE=helpthehive-api,_AUTH_CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS,_MOBILE_AUTH_CALLBACK_URL=${MOBILE_AUTH_CALLBACK_URL:-helpthehive://auth},_AUTH_EMAIL_FROM=${AUTH_EMAIL_FROM:-Help The Hive <auth@example.com>}"
elif [[ "$SERVICE_KIND" == "api" ]]; then
  MIGRATIONS_DIRECTORY=apps/server/migrations
  CONFIG=cloudbuild.server.yaml
  SUBSTITUTIONS="$COMMON_SUBSTITUTIONS,_SERVICE=$PREFIX-api,_AUTH_SERVICE=$PREFIX-auth,_MIGRATION_JOB=$PREFIX-api-migrate,_DATABASE_SECRET=$PREFIX-app-database-url,_RUNTIME_SERVICE_ACCOUNT=$PREFIX-api-run@$PROJECT_ID.iam.gserviceaccount.com,_MIGRATION_SERVICE_ACCOUNT=$PREFIX-api-migrate@$PROJECT_ID.iam.gserviceaccount.com,_BETTER_AUTH_AUDIENCE=helpthehive-api,_CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS,_RESEND_API_KEY_SECRET=$PREFIX-resend-api-key,_MEAL_AI_API_KEY_SECRET=Meal_AI_API_KEY,_BENEFITS_AI_API_KEY_SECRET=BENEFITS_AI_API_KEY,_EMAIL_FROM=${EMAIL_FROM:-Help The Hive <noreply@auth.helpthehive.com>},_MEAL_AI_PROVIDER=openai_compatible,_MEAL_AI_BASE_URL=https://api.anthropic.com/v1,_MEAL_AI_MODEL=claude-haiku-4-5,_BENEFITS_AI_PROVIDER=openai_compatible,_BENEFITS_AI_BASE_URL=https://api.anthropic.com/v1,_BENEFITS_AI_MODEL=claude-haiku-4-5"
  # Phase 2: discover Penny and the transcriber if they are already deployed.
  # Empty URLs keep the integrations disabled in the Go server, so deploying
  # the API first and the AI services afterwards is safe.
  PENNY_URL="$(
    gcloud run services describe "$PREFIX-penny" \
      --project="$PROJECT_ID" --region="$REGION" \
      --format='value(status.url)' 2>/dev/null || true
  )"
  TRANSCRIBER_URL="$(
    gcloud run services describe "$PREFIX-transcriber" \
      --project="$PROJECT_ID" --region="$REGION" \
      --format='value(status.url)' 2>/dev/null || true
  )"
  # The API's own public base URL, used to build magic verification links
  # (APP_PUBLIC_URL). Discovered from the deployed service; override with
  # APP_PUBLIC_URL env when a custom domain fronts the API.
  API_PUBLIC_URL="$(
    gcloud run services describe "$PREFIX-api" \
      --project="$PROJECT_ID" --region="$REGION" \
      --format='value(status.url)' 2>/dev/null || true
  )"
  SUBSTITUTIONS="$SUBSTITUTIONS,_APP_PUBLIC_URL=${APP_PUBLIC_URL:-$API_PUBLIC_URL}"
  SUBSTITUTIONS="$SUBSTITUTIONS,_PENNY_AGENT_URL=$PENNY_URL,_RECIPE_IMPORT_URL=$TRANSCRIBER_URL"
  SUBSTITUTIONS="$SUBSTITUTIONS,_PENNY_SERVICE_TOKEN_SECRET=$PREFIX-penny-service-token"
  SUBSTITUTIONS="$SUBSTITUTIONS,_PENNY_TOOL_TOKEN_SECRET=$PREFIX-penny-tool-token-secret"
  SUBSTITUTIONS="$SUBSTITUTIONS,_IMPORT_SHARED_SECRET=$PREFIX-import-shared-secret"
  # Community resource lookup: the Google Places API key. Only wired when
  # RESOURCES_PLACES_API_KEY_SECRET_NAME names an existing Secret Manager
  # secret. Until the key is provisioned the deploy leaves it unset and
  # /resources/nearby returns an honest 503 — gcloud run deploy hard-fails
  # on a nonexistent secret, so this must stay opt-in.
  if [[ -n "${RESOURCES_PLACES_API_KEY_SECRET_NAME:-}" ]]; then
    SUBSTITUTIONS="$SUBSTITUTIONS,_RESOURCES_PLACES_API_KEY_SECRET=$RESOURCES_PLACES_API_KEY_SECRET_NAME"
  fi
elif [[ "$SERVICE_KIND" == "penny" ]]; then
  CONFIG=cloudbuild.penny.yaml
  BACKEND_URL="$(
    gcloud run services describe "$PREFIX-api" \
      --project="$PROJECT_ID" --region="$REGION" \
      --format='value(status.url)' 2>/dev/null || true
  )"
  SUBSTITUTIONS="$COMMON_SUBSTITUTIONS,_SERVICE=$PREFIX-penny"
  # cloudbuild.penny.yaml declares neither the Cloud SQL nor the scaling
  # substitutions (Penny has no database; --min/--max-instances are hardcoded
  # in the template), and Cloud Build rejects substitution keys the template
  # does not declare — drop them for the penny build.
  SUBSTITUTIONS="${SUBSTITUTIONS//,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME/}"
  SUBSTITUTIONS="${SUBSTITUTIONS//,_MIN_INSTANCES=$MIN_INSTANCES/}"
  SUBSTITUTIONS="${SUBSTITUTIONS//,_MAX_INSTANCES=$MAX_INSTANCES/}"
  SUBSTITUTIONS="$SUBSTITUTIONS,_SERVICE_ACCOUNT=$PREFIX-penny-run@$PROJECT_ID.iam.gserviceaccount.com"
  SUBSTITUTIONS="$SUBSTITUTIONS,_BACKEND_URL=$BACKEND_URL"
  SUBSTITUTIONS="$SUBSTITUTIONS,_PENNY_PROVIDER=${PENNY_PROVIDER:-anthropic}"
  SUBSTITUTIONS="$SUBSTITUTIONS,_PENNY_MODEL=${PENNY_MODEL:-claude-sonnet-5}"
  SUBSTITUTIONS="$SUBSTITUTIONS,_PENNY_BASE_URL=${PENNY_BASE_URL:-}"
  SUBSTITUTIONS="$SUBSTITUTIONS,_SERVICE_TOKEN_SECRET=$PREFIX-penny-service-token"
  SUBSTITUTIONS="$SUBSTITUTIONS,_API_KEY_SECRET=$PREFIX-penny-api-key"
else
  CONFIG=cloudbuild.transcriber.yaml
  SUBSTITUTIONS="$COMMON_SUBSTITUTIONS,_SERVICE=$PREFIX-transcriber"
  # cloudbuild.transcriber.yaml declares neither the Cloud SQL nor the scaling
  # substitutions (the transcriber has no database; --min/--max-instances are
  # hardcoded in the template), and Cloud Build rejects substitution keys the
  # template does not declare — drop them for the transcriber build.
  SUBSTITUTIONS="${SUBSTITUTIONS//,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME/}"
  SUBSTITUTIONS="${SUBSTITUTIONS//,_MIN_INSTANCES=$MIN_INSTANCES/}"
  SUBSTITUTIONS="${SUBSTITUTIONS//,_MAX_INSTANCES=$MAX_INSTANCES/}"
  SUBSTITUTIONS="$SUBSTITUTIONS,_SERVICE_ACCOUNT=$PREFIX-transcriber-run@$PROJECT_ID.iam.gserviceaccount.com"
  SUBSTITUTIONS="$SUBSTITUTIONS,_AI_KEY_SECRET=$PREFIX-recipe-ai-api-key"
  SUBSTITUTIONS="$SUBSTITUTIONS,_SHARED_SECRET=$PREFIX-import-shared-secret"
fi

if [[ -n "$MIGRATIONS_DIRECTORY" ]]; then
  MIGRATIONS_SHA="$(
    find "$MIGRATIONS_DIRECTORY" -type f -exec shasum -a 256 {} + \
      | LC_ALL=C sort \
      | shasum -a 256 \
      | cut -c1-40
  )"
  SUBSTITUTIONS="$SUBSTITUTIONS,_MIGRATIONS_SHA=$MIGRATIONS_SHA"
fi

gcloud builds submit . \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --config="$CONFIG" \
  --service-account="$BUILD_SERVICE_ACCOUNT" \
  --substitutions="$SUBSTITUTIONS"
