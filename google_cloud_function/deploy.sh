#!/bin/bash
# =============================================================================
# Deploy script: Germany Heat Pump Auto-Updater
# Deploys the Cloud Function and sets up monthly Cloud Scheduler
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

# Auto-update toggle: set to "true" to allow Cloud Scheduler triggers.
# Default "false" = scheduler calls are rejected; manual API-key calls still work.
AUTO_UPDATE_ENABLED="${AUTO_UPDATE_ENABLED:-false}"

# Cloud Scheduler: run at 03:00 on the 1st of every month (Europe/Berlin)
SCHEDULER_JOB="monthly-heatpump-update"
SCHEDULE="0 3 1 * *"
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
echo "=== Setting up Cloud Scheduler job: ${SCHEDULER_JOB} ==="

# Check if job already exists — update if so, create if not
if gcloud scheduler jobs describe "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" &>/dev/null; then
  echo "Job already exists — updating..."
  gcloud scheduler jobs update http "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --uri="${FUNCTION_URL}" \
    --message-body='{}' \
    --update-headers "X-Cloudscheduler=true" \
    --update-headers "Content-Type=application/json" \
    --time-zone="${TIMEZONE}"
else
  echo "Creating new scheduler job..."
  gcloud scheduler jobs create http "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --uri="${FUNCTION_URL}" \
    --message-body='{}' \
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
