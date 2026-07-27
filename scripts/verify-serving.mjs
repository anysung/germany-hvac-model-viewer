#!/usr/bin/env node
/**
 * verify-serving.mjs — validate the datasets PRODUCTION IS ACTUALLY SERVING
 * (docs/DATASET_ROLLBACK_AND_PANIC.md, 2026-07-27).
 *
 * The dataset gate validates the CANDIDATE files before publish; this script
 * validates the SERVED bytes after publish — download, decode, parse, and a
 * Node-level functional simulation of what the app does with them. It is the
 * self-check the upload pipeline runs before declaring a release stable, and
 * it can be run standalone at any time.
 *
 * Failure discipline (owner-approved): INFRA-type failures (download/network)
 * are retried 2× with a pause — a transient blip must never trigger a
 * rollback. DATA-type failures (parse, structure, counts, canary) fail
 * immediately — retrying cannot change bytes. Exit 1 on any persistent
 * failure; the caller (upload-datasets.mjs) then restores the run's snapshot
 * IN FULL. This script itself never mutates anything.
 *
 * Usage: node scripts/verify-serving.mjs
 * Requires: gcloud auth with read access to the bucket.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'gs://heatpumpdb-datasets';

const DATASETS = {
  DE: { residential: 'products.json',    commercial: 'products-commercial.json' },
  GB: { residential: 'products-gb.json', commercial: 'products-commercial-gb.json' },
  FR: { residential: 'products-fr.json', commercial: 'products-commercial-fr.json' },
  PL: { residential: 'products-pl.json', commercial: 'products-commercial-pl.json' },
  IT: { residential: 'products-it.json', commercial: 'products-commercial-it.json' },
};

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
  // Served objects are gzip-stored (Content-Encoding: gzip); `gcloud storage
  // cat` returns the stored bytes. Accept plain JSON too (pre-gzip objects).
  let text;
  try { text = gunzipSync(buf).toString('utf8'); }
  catch { text = buf.toString('utf8'); }
  return JSON.parse(text);
}

/** Canonical rated capacity — mirror of src/config/segmentation.ts. */
const ratedKw = p => p.power_35C_kw ?? p.power_55C_kw ?? p.declared_capacity_kw ?? null;

/**
 * All DATA checks for one served object. Throws with a reason on failure.
 * `data` is the parsed served file; `cc`/`segment` identify what it MUST be.
 */
function check(objectPath, data, cc, segment) {
  if (!data || typeof data !== 'object') throw new Error('not an object');
  if (!data._meta) throw new Error('missing _meta');
  if (!Array.isArray(data.items)) throw new Error('missing items array');
  const items = data.items;
  if (items.length < 100) throw new Error(`only ${items.length} items (floor 100)`);

  // Count vs stable manifest (±20% — monthly growth/shrink beyond that is a
  // publication accident until proven otherwise).
  const expected = expectedItems.get(objectPath);
  if (expected && (items.length < expected * 0.8 || items.length > expected * 1.2)) {
    throw new Error(`item count ${items.length} outside ±20% of stable ${expected}`);
  }

  // Canary present AND is THIS market/segment's canary — one check that
  // proves both file integrity and country/segment identity.
  const canaryId = CANARIES[cc]?.[segment]?.bafa_id;
  if (!canaryId) throw new Error(`no canary defined for ${cc}/${segment}`);
  if (!items.some(i => String(i.bafa_id ?? i.source_id) === String(canaryId))) {
    throw new Error(`canary ${canaryId} missing — wrong file or truncated upload`);
  }

  // Required identity fields + null ratio on a spread sample.
  const step = Math.max(1, Math.floor(items.length / 200));
  let nullId = 0;
  for (let i = 0; i < items.length; i += step) {
    const p = items[i];
    if (!p.manufacturer || !p.model) nullId++;
  }
  const sampled = Math.ceil(items.length / step);
  if (nullId / sampled > 0.01) throw new Error(`identity-null ratio ${(nullId / sampled * 100).toFixed(1)}% (>1%)`);

  // Duplicate-id scan (source_id-level; small tolerance for shared ids).
  const ids = items.map(i => i.source_id ?? i.bafa_id).filter(Boolean);
  const dupes = ids.length - new Set(ids).size;
  if (dupes > 5) throw new Error(`${dupes} duplicate ids`);

  // Manufacturer diversity — a partial/filtered file collapses this first.
  const mfrs = new Set(items.map(i => i.manufacturer).filter(Boolean));
  if (mfrs.size < 20) throw new Error(`only ${mfrs.size} manufacturers (floor 20)`);

  return { items, mfrs: mfrs.size };
}

/**
 * Functional simulation — what the app does with a market's pool:
 * 23 kW re-split, a sample model search, id lookup. Throws on failure.
 */
function simulateApp(cc, resItems, comItems) {
  const pool = [...resItems, ...comItems];
  const res = pool.filter(p => { const kw = ratedKw(p); return kw != null && kw <= 23; });
  const com = pool.filter(p => { const kw = ratedKw(p); return kw != null && kw > 23; });
  if (res.length < 100) throw new Error(`${cc}: residential split ${res.length} (floor 100)`);
  if (com.length < 20) throw new Error(`${cc}: commercial split ${com.length} (floor 20)`);

  // Sample search: a mid-list model's first token must find itself.
  const probe = res[Math.floor(res.length / 2)];
  const needle = String(probe.model ?? '').split(' ')[0]?.toLowerCase();
  if (!needle || needle.length < 2) throw new Error(`${cc}: unusable probe model "${probe.model}"`);
  const hits = pool.filter(p => `${p.model} ${p.manufacturer}`.toLowerCase().includes(needle));
  if (hits.length === 0) throw new Error(`${cc}: sample search "${needle}" returned nothing`);

  // Id lookup map builds and resolves.
  const byId = new Map(pool.map(p => [String(p.source_id ?? p.bafa_id), p]));
  if (!byId.get(String(probe.source_id ?? probe.bafa_id))) throw new Error(`${cc}: id lookup failed`);
}

// ── Run ─────────────────────────────────────────────────────────────────────
let failedAny = false;
const parsedBySegment = {};   // cc → { residential: items, commercial: items }

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
      } catch (e) {
        lastErr = new Error(`download failed (attempt ${attempt})`);
        if (attempt < 3) await sleep(3000);
        continue;
      }
      try {
        const data = decode(buf);
        const { items, mfrs } = check(objectPath, data, cc, segment);
        parsedBySegment[cc][segment] = items;
        console.log(`✓ ${objectPath} — ${items.length} items, ${mfrs} manufacturers`);
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
      simulateApp(cc, parsedBySegment[cc].residential, parsedBySegment[cc].commercial);
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
