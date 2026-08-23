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
# Env vars this script now UPDATES rather than REPLACES, and only for values it
# was actually GIVEN. Two separate ways to lose a live credential were possible
# here: --set-env-vars wipes every variable it is not handed (so a deploy
# without PADDLE_API_KEY exported removed it), and --update-env-vars with an
# empty value overwrites the variable with an empty string, which for
# PADDLE_WEBHOOK_SECRET means the webhook endpoint starts rejecting every real
# Paddle notification. So an unset variable is now OMITTED from the update
# rather than sent as empty: to change one, export it; to keep it, don't.
#
# MEMBER EMAIL (support@heatpumpdb.eu, Zoho SMTP) — the mailbox password is a
# credential that can send as the company, so it lives in Secret Manager and is
# mounted, never passed on a command line or stored in an env var here.
# One-time setup:
#   1. Zoho Mail → support@heatpumpdb.eu → Security → App Passwords → create
#      one for "HeatPump DB function" (SMTP access must be enabled on the plan).
#   2. printf '%s' '<app-password>' | gcloud secrets create heatpumpdb-smtp-pass \
#        --data-file=- --project=$PROJECT_ID
#   3. Grant the function's runtime service account access:
#      gcloud secrets add-iam-policy-binding heatpumpdb-smtp-pass \
#        --member="serviceAccount:$(gcloud functions describe accountBilling \
#          --region=$REGION --project=$PROJECT_ID \
#          --format='value(serviceConfig.serviceAccountEmail)')" \
#        --role=roles/secretmanager.secretAccessor --project=$PROJECT_ID
#   Rotating the password = add a new secret version; no redeploy needed.
#   Without the secret the endpoint returns 503 and records the failure — it
#   never silently drops a message.
#
#   WHICH ACCOUNT AUTHENTICATES is not always the address we send AS. In Zoho,
#   support@heatpumpdb.eu can be either its own user or an ALIAS on another
#   user (mail addressed to it then lands in that user's inbox). SMTP AUTH
#   always uses a real user; the alias may only appear in From. So:
#     SUPPORT_FROM  the address members see and reply to   (support@heatpumpdb.eu)
#     SMTP_USER     the mailbox that authenticates          (defaults to SUPPORT_FROM;
#                   set it to the owning user when the support address is an alias)
#   Export them before deploying if either differs from the default, e.g.
#     SMTP_USER=admin@deutsch180.com ./deploy.sh
#   Getting this wrong shows up as a 535 (auth) or 553 (From not permitted) in
#   the failure this function records — not as a silent drop.
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
# nodejs20 is decommissioned by Cloud Functions on 2026-10-30 —
# both live functions were moved to 22 on 2026-08-06.
RUNTIME="nodejs22"

PADDLE_WEBHOOK_SECRET="${PADDLE_WEBHOOK_SECRET:-}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
SUPPORT_FROM="${SUPPORT_FROM:-support@heatpumpdb.eu}"
SMTP_USER="${SMTP_USER:-$SUPPORT_FROM}"
SMTP_HOST="${SMTP_HOST:-smtppro.zoho.eu}"
SMTP_PORT="${SMTP_PORT:-465}"

# Mail settings always travel (they have safe defaults). A credential only
# travels when this run was explicitly given one.
ENV_UPDATES="SUPPORT_FROM=${SUPPORT_FROM},SMTP_USER=${SMTP_USER},SMTP_HOST=${SMTP_HOST},SMTP_PORT=${SMTP_PORT}"
if [ -n "${PADDLE_WEBHOOK_SECRET}" ]; then
  ENV_UPDATES="${ENV_UPDATES},PADDLE_WEBHOOK_SECRET=${PADDLE_WEBHOOK_SECRET}"
else
  echo "note: PADDLE_WEBHOOK_SECRET not exported — leaving the live value untouched."
fi
if [ -n "${ALLOWED_ORIGINS}" ]; then
  ENV_UPDATES="${ENV_UPDATES},ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
fi

echo "Deploying ${FUNCTION_NAME} to ${PROJECT_ID} (${REGION})..."

# Canary ids for the Panic Button's dataset validation — single source stays
# scripts/canary/canary-records.json; this copy ships with the function only
# (gitignored). Missing copy = checks run degraded (canary skipped, flagged).
cp ../scripts/canary/canary-records.json ./canary-records.json

# Letterhead images, regenerated from the CANONICAL brand assets every deploy so
# a rebrand cannot leave a stale logo in the mail. Resizing is all that happens
# here — the mark and the lockup are never redrawn (brand-assets/README.md).
# If sips or a source file is missing we keep whatever is already there and say
# so, rather than shipping a mail with a broken image.
mkdir -p ./mail-assets
if command -v sips >/dev/null 2>&1 \
   && [ -f ../brand-assets/png/heatpumpdb-3a-lockup-light-4x.png ] \
   && [ -f ../public/icons/eu-192.png ]; then
  sips -Z 360 ../brand-assets/png/heatpumpdb-3a-lockup-light-4x.png --out ./mail-assets/logo.png >/dev/null
  sips -Z 132 ../public/icons/eu-192.png                            --out ./mail-assets/mark.png >/dev/null
  echo "letterhead images regenerated from brand-assets/"
else
  echo "note: could not regenerate letterhead images — shipping the existing copies."
fi

gcloud functions deploy "${FUNCTION_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --runtime="${RUNTIME}" \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=accountBilling \
  --source=. \
  --memory=512MB \
  --timeout=300s \
  --update-env-vars "${ENV_UPDATES}" \
  --set-secrets "SMTP_PASS=heatpumpdb-smtp-pass:latest"

echo ""
echo "Done. Function URL:"
gcloud functions describe "${FUNCTION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(serviceConfig.uri)' 2>/dev/null || \
gcloud functions describe "${FUNCTION_NAME}" --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(httpsTrigger.url)'
