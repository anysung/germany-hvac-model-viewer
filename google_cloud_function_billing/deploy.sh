#!/bin/bash
# =============================================================================
# Deploy: HeatPump DB account & billing function (accountBilling).
#
# Separate from google_cloud_function/ (news pipeline) — deploying this never
# touches the news function or its env vars.
#
# Env vars this script SETS (redeploying with plain `gcloud functions deploy`
# and no --set-env-vars preserves whatever is live):
#   PADDLE_WEBHOOK_SECRET  — from the Paddle dashboard (Notifications → Webhooks).
#                            Empty = webhook endpoint rejects everything (safe).
#   ALLOWED_ORIGINS        — extra browser origins (comma-separated), on top of
#                            the defaults baked into index.js. Part of the
#                            market-expansion checklist.
#
# After the FIRST deploy also create the Firestore TTL policy that auto-deletes
# expired email-history entries (1 year after account deletion):
#   gcloud firestore fields ttls update retentionUntil \
#     --collection-group=emailRegistry --enable-ttl --project=$PROJECT_ID
#
# The client needs the function URL as VITE_BILLING_FN_URL at build time —
# until that is set, the app keeps the legacy pending/approval signup flow.
# =============================================================================
set -e

PROJECT_ID="gen-lang-client-0324244302"
REGION="europe-west1"
FUNCTION_NAME="accountBilling"
RUNTIME="nodejs20"

PADDLE_WEBHOOK_SECRET="${PADDLE_WEBHOOK_SECRET:-}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"

echo "Deploying ${FUNCTION_NAME} to ${PROJECT_ID} (${REGION})..."

gcloud functions deploy "${FUNCTION_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --runtime="${RUNTIME}" \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=accountBilling \
  --source=. \
  --memory=256MB \
  --timeout=60s \
  --set-env-vars "PADDLE_WEBHOOK_SECRET=${PADDLE_WEBHOOK_SECRET},ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"

echo ""
echo "Done. Function URL:"
gcloud functions describe "${FUNCTION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(serviceConfig.uri)' 2>/dev/null || \
gcloud functions describe "${FUNCTION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(httpsTrigger.url)'
