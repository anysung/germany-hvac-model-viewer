# Dataset Rollback & Panic Button (owner-approved scope, 2026-07-27)

The monthly update's worst failure mode is not "the update fails" — the gate
already blocks bad candidates — but "something bad reaches the serving bucket
and users see it". This document fixes the approved design; any session or
model executing this work follows THIS scope.

## Principles (binding)

- **Restore unit = a complete, verified snapshot SET.** Never restore
  individual object generations — the 10 objects upload sequentially, so
  per-object "previous version" can mix update epochs (dangerous within a
  market: residential+commercial from different releases can duplicate or
  drop models across the 23 kW re-split).
- **Auto-rollback is slow to trigger, fast to execute**: infra-type failures
  (download/auth/timeout) are retried (2×) before any rollback decision;
  data-type failures (parse, counts, schema) fail immediately. Rollback
  always restores the WHOLE stable set.
- **Panic Button is the owner's manual override**, not a replacement for the
  automatic path: for semantically-wrong data the checks can't see, customer
  reports, or when the automatic path itself is broken. Owner-only, typed
  confirmation, audited, idempotent.
- Object Versioning stays enabled as a last-ditch safety net (accidental
  deletion), but the operational restore path is snapshots only.

## Mechanics

1. **Snapshots** — `scripts/upload-datasets.mjs` copies every live object to
   `gs://heatpumpdb-datasets/snapshots/<runId>/…` (server-side copy) BEFORE
   the first upload of a run. `<runId>` = UTC `YYYYMMDD-HHmmss`. The snapshot
   is self-consistent because it captures the set that was actually serving.
   Metadata (contentType/encoding/cacheControl) rides along with the copy.
2. **Stable manifest** — `data_manifests/stable-release.json` (committed)
   records the current stable set: runId, publish time, per-object md5 +
   item counts, and the pre-update snapshot prefix. **Promoted ONLY after
   the serving verification passes** (2026-07-28 review #3): while a new
   release is being verified, the manifest still describes the previous
   stable set — which is exactly the ±20% count baseline the verifier needs.
   A failed release never becomes "stable".
3. **Self-check** — `scripts/verify-serving.mjs` validates the SERVED bytes
   (not the local files): download, gunzip if needed, JSON parse, `_meta` +
   `items`, counts vs manifest tolerance, required fields, duplicate-id scan,
   canary presence, country/segment identity, null-ratio and
   manufacturer-count sanity, plus a Node-level functional simulation
   (23 kW segment re-split, manufacturer counts, sample search, id lookup).
   No browser e2e in the unattended path — that would add its own flakiness;
   the attended checklist keeps the real-browser pass.
   Failed objects get 2 re-checks (infra errors only) → persistent failure
   restores the run's snapshot in full and exits non-zero.
4. **Panic Button** — admin console (ops build) card backed by the
   accountBilling function. ONE check module for everything:
   `google_cloud_function_billing/datasetChecks.js` is used verbatim by the
   post-publish self-check (verify-serving), the automatic fallback, and the
   Panic pre/post-restore validation — "verified" means the same thing at
   all three points (2026-07-28 review #2).
   - `POST /rollbackStatus` (owner token): live object listing (md5, updated,
     size), the 5 newest snapshots (older sets stay reachable via the manual
     runbook — a panic moment is no time to scroll history), lock state.
   - `POST /panicRollback { snapshotId, confirm: "ROLLBACK" }` (owner token),
     three phases (2026-07-28 review #1):
     1. PROVE the snapshot is a complete valid set BEFORE touching live —
        exactly the 10 canonical paths (no missing, no extras) and every
        file passes the full shared checks incl. per-market simulation;
        any failure → HTTP 400, nothing restored.
     2. Copy the entire set to live.
     3. Re-run the full shared checks against the LIVE objects; failure →
        HTTP 500 (the operator then restores a different snapshot).
     Lock: Firestore single-flight, 15 min TTL + job id (only the owning job
     releases it). Failures return real HTTP codes (400/409/500) with a JSON
     body. Audit: `opsAuditLog` (including a `degraded` flag when the canary
     id file was unavailable and that check was skipped).
   - UI requires typing `ROLLBACK`, shows which snapshot the restore targets,
     and displays the post-restore verification result.
   - Auth: Firebase ID token + owner (custom claim / verified owner email).
     App Check deliberately NOT required (monitoring-only policy).
5. **Client cache** — dbService revalidation now parses + sanity-checks a
   fresh download BEFORE caching it, so a bad published file cannot poison
   the IndexedDB copy. After any rollback the md5 check refreshes clients on
   their next visit automatically (bad-data exposure window ≤ one session).
6. **Bucket versioning + lifecycle** — versioning ON; noncurrent versions
   kept ≤ 10 or 120 days; `snapshots/` objects auto-deleted after 180 days.

## Manual runbook (Layer 4 — when everything else is down)

All commands run as the owner's gcloud account.

```bash
# 1. What is live right now?
gcloud storage ls -L gs://heatpumpdb-datasets/datasets/'**' | grep -E 'gs://|md5|Update time'

# 2. Which snapshots exist?
gcloud storage ls gs://heatpumpdb-datasets/snapshots/

# 3. Restore a full snapshot to live (REPLACES all 10 objects):
gcloud storage cp -r 'gs://heatpumpdb-datasets/snapshots/<runId>/datasets/*' \
    gs://heatpumpdb-datasets/datasets/
# (copy preserves content-encoding/content-type metadata)

# 4. Verify serving after restore:
node scripts/verify-serving.mjs

# 5. Last-ditch (no snapshot): object versioning —
gcloud storage ls -a gs://heatpumpdb-datasets/datasets/DE/products.json   # list generations
gcloud storage cp gs://heatpumpdb-datasets/datasets/DE/products.json#<generation> \
    gs://heatpumpdb-datasets/datasets/DE/products.json
# ONLY as a full-set operation per market pair — never leave mixed epochs.
```

## Deferred (separate approval)

Release-directory + `current` pointer publishing (atomic flip; removes the
overwrite-in-place model entirely) and releaseId-keyed client cache.
