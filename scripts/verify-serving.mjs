#!/usr/bin/env node
/**
 * verify-serving.mjs — validate the datasets PRODUCTION IS ACTUALLY SERVING
 * (docs/DATASET_ROLLBACK_AND_PANIC.md).
 *
 * The dataset gate validates the CANDIDATE files before publish; this script
 * validates the SERVED bytes after publish. The check logic itself lives in
 * google_cloud_function_billing/datasetChecks.js — the SAME module the Panic
 * Button uses pre/post-restore, so "verified" means one thing everywhere.
 *
 * Failure discipline (owner-approved): INFRA-type failures (download/network)
 * are retried 2× with a pause — a transient blip must never trigger a
 * rollback. DATA-type failures (parse, structure, counts, canary) fail
 * immediately — retrying cannot change bytes. Exit 1 on any persistent
 * failure; the caller (upload-datasets.mjs) then restores the run's snapshot
 * IN FULL. This script itself never mutates anything.
 *
 * Count baseline: data_manifests/stable-release.json — the LAST verified
 * release (upload-datasets writes it only AFTER this verification passes, so
 * a new release is always compared against the previous stable one).
 *
 * Usage: node scripts/verify-serving.mjs
 * Requires: gcloud auth with read access to the bucket.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { DATASETS, checkDataset, simulateMarket } =
  require(join(ROOT, 'google_cloud_function_billing/datasetChecks.js'));

const BUCKET = 'gs://heatpumpdb-datasets';
const CANARIES = JSON.parse(readFileSync(join(ROOT, 'scripts/canary/canary-records.json'), 'utf8'));
const manifestPath = join(ROOT, 'data_manifests/stable-release.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const expectedItems = new Map((manifest?.objects ?? []).map(o => [o.path, o.items]));

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Download stored bytes (INFRA errors throw; caller retries). */
function download(objectPath) {
  return execFileSync('gcloud', ['storage', 'cat', `${BUCKET}/${objectPath}`],
    { maxBuffer: 256 * 1024 * 1024 });
}

/** Decode stored bytes → parsed JSON. DATA errors throw (no retry value). */
function decode(buf) {
  let text;
  try { text = gunzipSync(buf).toString('utf8'); }
  catch { text = buf.toString('utf8'); }
  return JSON.parse(text);
}

// ── Run ─────────────────────────────────────────────────────────────────────
let failedAny = false;
const parsedBySegment = {};

for (const [cc, files] of Object.entries(DATASETS)) {
  parsedBySegment[cc] = {};
  for (const [segment, file] of Object.entries(files)) {
    const objectPath = `datasets/${cc}/${file}`;
    let ok = false;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {   // download retries: INFRA only
      let buf;
      try {
        buf = download(objectPath);
      } catch {
        lastErr = new Error(`download failed (attempt ${attempt})`);
        if (attempt < 3) await sleep(3000);
        continue;
      }
      try {
        const data = decode(buf);
        const { items, manufacturers } = checkDataset(data, {
          cc, segment,
          canaryId: CANARIES[cc]?.[segment]?.bafa_id,
          expectedItems: expectedItems.get(objectPath),
        });
        parsedBySegment[cc][segment] = items;
        console.log(`✓ ${objectPath} — ${items.length} items, ${manufacturers} manufacturers`);
        ok = true;
      } catch (e) {
        lastErr = e;   // DATA failure — retrying cannot help
      }
      break;
    }
    if (!ok) {
      console.error(`✗ ${objectPath} — ${lastErr?.message}`);
      failedAny = true;
    }
  }

  if (parsedBySegment[cc].residential && parsedBySegment[cc].commercial) {
    try {
      simulateMarket(cc, parsedBySegment[cc].residential, parsedBySegment[cc].commercial);
      console.log(`✓ ${cc} functional simulation (split / search / lookup)`);
    } catch (e) {
      console.error(`✗ ${cc} functional simulation — ${e.message}`);
      failedAny = true;
    }
  }
}

if (failedAny) {
  console.error('\n✗ SERVING VERIFICATION FAILED — do not declare this release stable.');
  process.exit(1);
}
console.log('\n✓ Serving verification passed — the published set is healthy.');
