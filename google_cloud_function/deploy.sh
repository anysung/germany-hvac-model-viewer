#!/bin/bash
# =============================================================================
# Deploy script: HeatPump DB Auto-Updater (news/policies for all markets)
# Markets served per run: MARKETS in index.js (DE/GB/FR/PL/IT); narrow a manual
# run with ?countries=GB.
#
# ⚠ READ BEFORE RUNNING (hardened after the 2026-08-01 incident)
#   1. For a routine CODE deploy, DO NOT use this script. Use:
#        gcloud functions deploy autoUpdateDatabase --region=us-central1 --gen2 \
#          --source=. --runtime=nodejs20 --trigger-http --entry-point=autoUpdateDatabase
#      A plain deploy PRESERVES the live env vars; this script OVERWRITES them,
#      so running it without the real secrets exported silently breaks the
#      pipeline (wrong GEMINI_API_KEY / SECRET_KEY).
#   2. The scheduler section is OFF by default. The production job already
#      exists and is correct; recreating it is how the 2026-08-01 duplicate-
#      pipeline incident became possible. Opt in only on purpose:
#        DEPLOY_SCHEDULER=true ./deploy.sh
#   3. The scheduler must POST {"newsOnly": true}. An empty body {} runs the
#      LEGACY manufacturer-research path, which writes to countries/DE/products
#      — a collection the app does not read.
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# CONFIGURATION — edit these before running
# ---------------------------------------------------------------------------
PROJECT_ID="gen-lang-client-0324244302"
REGION="us-central1"
FUNCTION_NAME="autoUpdateDatabase"
RUNTIME="nodejs20"

# Secret values — set these as environment variables before running this script
# or replace the placeholders below
GEMINI_API_KEY="${GEMINI_API_KEY:-YOUR_GEMINI_API_KEY}"
SECRET_KEY="${SECRET_KEY:-YOUR_SECRET_KEY}"
BUDGET_LIMIT_USD="${BUDGET_LIMIT_USD:-14}"

# Auto-update toggle. Production is "true"; defaulting to "false" here would
# silently disable the live pipeline on the next deploy.
AUTO_UPDATE_ENABLED="${AUTO_UPDATE_ENABLED:-true}"

# Cloud Scheduler — these MUST mirror the live job (verified 2026-08-02):
#   monthly-news-policies · europe-west1 · "3 6 2 * *" Europe/Berlin
#   body {"newsOnly": true}
# The job lives in europe-west1 even though the function is in us-central1.
DEPLOY_SCHEDULER="${DEPLOY_SCHEDULER:-false}"
SCHEDULER_JOB="monthly-news-policies"
SCHEDULER_REGION="europe-west1"
SCHEDULE="3 6 2 * *"
SCHEDULER_BODY='{"newsOnly": true}'
TIMEZONE="Europe/Berlin"

# ---------------------------------------------------------------------------
echo "=== Deploying Cloud Function: ${FUNCTION_NAME} ==="
echo "Project: ${PROJECT_ID} | Region: ${REGION}"

gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --runtime="${RUNTIME}" \
  --source=. \
  --entry-point="${FUNCTION_NAME}" \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512MB \
  --timeout=540s \
  --set-env-vars="GEMINI_API_KEY=${GEMINI_API_KEY},SECRET_KEY=${SECRET_KEY},BUDGET_LIMIT_USD=${BUDGET_LIMIT_USD},AUTO_UPDATE_ENABLED=${AUTO_UPDATE_ENABLED}"

echo "=== Cloud Function deployed ==="

# ---------------------------------------------------------------------------
# Get the deployed function URL
FUNCTION_URL=$(gcloud functions describe "${FUNCTION_NAME}" \
  --gen2 \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(serviceConfig.uri)")

echo "Function URL: ${FUNCTION_URL}"

# ---------------------------------------------------------------------------
if [ "${DEPLOY_SCHEDULER}" != "true" ]; then
  echo ""
  echo "=== Cloud Scheduler: SKIPPED ==="
  echo "The production job (${SCHEDULER_JOB}, ${SCHEDULER_REGION}) already exists and is correct."
  echo "To manage it from this script anyway: DEPLOY_SCHEDULER=true ./deploy.sh"
  exit 0
fi

echo "=== Setting up Cloud Scheduler job: ${SCHEDULER_JOB} ==="

# Check if job already exists — update if so, create if not
if gcloud scheduler jobs describe "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" &>/dev/null; then
  echo "Job already exists — updating..."
  gcloud scheduler jobs update http "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --schedule="${SCHEDULE}" \
    --uri="${FUNCTION_URL}" \
    --message-body="${SCHEDULER_BODY}" \
    --update-headers "X-Cloudscheduler=true" \
    --update-headers "Content-Type=application/json" \
    --time-zone="${TIMEZONE}"
else
  echo "Creating new scheduler job..."
  gcloud scheduler jobs create http "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --schedule="${SCHEDULE}" \
    --uri="${FUNCTION_URL}" \
    --message-body="${SCHEDULER_BODY}" \
    --headers "X-Cloudscheduler=true" \
    --headers "Content-Type=application/json" \
    --time-zone="${TIMEZONE}"
fi

echo ""
echo "==================================================================="
if [ "${AUTO_UPDATE_ENABLED}" = "true" ]; then
  echo "DONE! Monthly auto-update is ENABLED."
  echo "Schedule:     ${SCHEDULE} (${TIMEZONE})"
  echo "              = 3:00 AM on the 1st of every month"
else
  echo "DONE! Auto-update is DISABLED (scheduler calls will be rejected)."
  echo "The Cloud Scheduler job still exists but the function will skip its calls."
  echo "Set AUTO_UPDATE_ENABLED=true and redeploy to re-enable."
fi
echo ""
echo "Function URL: ${FUNCTION_URL}"
echo ""
echo "To trigger manually (always works regardless of AUTO_UPDATE_ENABLED):"
echo "  curl -X POST '${FUNCTION_URL}' -H 'X-Api-Key: ${SECRET_KEY}'"
echo ""
echo "To view logs:"
echo "  gcloud functions logs read ${FUNCTION_NAME} --gen2 --region=${REGION} --limit=50"
echo "==================================================================="
