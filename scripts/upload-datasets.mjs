#!/usr/bin/env node
/**
 * upload-datasets.mjs — ship the built product catalogues to the
 * auth-protected Storage bucket (gs://heatpumpdb-datasets/datasets/<CC>/…).
 *
 * Anti-scraping (2026-07-12): datasets are NO LONGER served as public
 * hosting files (/data/*.json is excluded from hosting deploys). The app
 * downloads them through the Firebase Storage SDK, and storage.rules only
 * admits signed-in, admin-approved accounts.
 *
 * On the way up, one fictitious residential + commercial CANARY record per
 * market (scripts/canary/canary-records.json) is appended to the served
 * copy — the committed/built source files stay clean. A canary surfacing in
 * third-party data is hard evidence of extraction (see the canary file).
 *
 * Usage: node scripts/upload-datasets.mjs [--dry-run]
 * Requires: gcloud auth (Application Default) with access to the bucket.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'gs://heatpumpdb-datasets';
const DRY = process.argv.includes('--dry-run');
// Set only after the gate was run with an explicit, recorded --override.
const GATE_PASSED = process.argv.includes('--gate-passed');

const CANARIES = JSON.parse(readFileSync(join(ROOT, 'scripts/canary/canary-records.json'), 'utf8'));

/** market → { segment → local dataset file } (mirrors countryProfiles.datasetPaths) */
const DATASETS = {
  DE: { residential: 'products.json',    commercial: 'products-commercial.json' },
  GB: { residential: 'products-gb.json', commercial: 'products-commercial-gb.json' },
  FR: { residential: 'products-fr.json', commercial: 'products-commercial-fr.json' },
  PL: { residential: 'products-pl.json', commercial: 'products-commercial-pl.json' },
  IT: { residential: 'products-it.json', commercial: 'products-commercial-it.json' },
};

/**
 * Browser-payload minimization (2026-07-19 security audit follow-up).
 *
 * These fields are internal PIPELINE metadata — matching/normalization internals,
 * per-snapshot provenance timestamps, physical-specs quarantine/source bookkeeping —
 * plus the dimensions/weight cluster that was removed from the UI. NONE of them are
 * referenced anywhere in src/ (verified field-by-field, word-boundary matched), so
 * removing them from the SERVED bucket copy changes no app behaviour while it stops
 * shipping internal bookkeeping to every browser.
 *
 * This projection applies ONLY to the served copy uploaded here. The committed
 * build artifacts (public/data/*.json), raw/canonical/intermediate data, provenance
 * records and the dataset gate all keep the full field set. To revert: delete
 * PUBLIC_STRIP_FIELDS + the .map(projectPublic) call — nothing else depends on it.
 *
 * KEPT deliberately (do not add here): every measured spec even if undisplayed
 * (noise_indoor_dB, seer, cooling_*, refrigerant_2*, grid_ready_type, cop_A10W35,
 * temp_diff, defrost_*, drive_type, power_control, num_compressors, max_electric_power_kw),
 * all registry facts (bafa_listing_status, bafa_foerderung_*, bafa_snapshot_fetched_at,
 * pel_snapshot_fetched_at, source_snapshot_generated_at), and every field the app reads
 * (ids, listing status/id, gse_ratings/gse_snapshot/gse_entry_key/gse_match_method,
 * component models, european_reference_id, bafa_reference_id, …).
 */
const PUBLIC_STRIP_FIELDS = new Set([
  // internal ids / normalization
  'uuid', 'manufacturer_normalized', 'primary_source', 'market_segment',
  // matching internals (identity kept: eprel_registration_number, *_id, *_match_status)
  'eprel_model', 'eprel_match_type',
  'outdoor_side_identified', 'outdoor_side_display_kind',
  'european_reference_model', 'european_reference_match_type',
  'bafa_reference_model', 'bafa_reference_match_type',
  'gse_temp_assignment', 'gse_catalogue', 'gse_brand', 'gse_model',
  'gse_match_confidence', 'gse_snapshot_fetched_at', 'gse_first_matched_at', 'gse_last_confirmed_at',
  'pel_source_id', 'pel_match_method', 'pel_match_confidence',
  'pel_first_matched_at', 'pel_last_confirmed_at', 'pel_snapshot',
  'zum_snapshot', 'zum_snapshot_fetched_at', 'zum_first_matched_at', 'zum_last_confirmed_at',
  'zum_match_confidence', 'zum_match_method', 'zum_product_name', 'zum_category', 'zum_class_55c',
  // physical-specs provenance bookkeeping (the dimensions themselves are UI-removed)
  'physical_specs_confidence', 'physical_specs_estimated', 'physical_specs_source_type',
  'physical_specs_source_note', 'physical_specs_match_type', 'physical_specs_family',
  'physical_specs_quarantined', 'physical_specs_quarantine_reason', 'physical_specs_last_checked_at',
  // dimensions / weight (removed from the UI; never reintroduced)
  'dimensions_raw', 'weight_raw', 'width_mm', 'height_mm', 'depth_mm', 'weight_kg',
]);

/** Drop internal-only keys from a served record (browser copy only). */
function projectPublic(record) {
  const out = {};
  for (const k of Object.keys(record)) if (!PUBLIC_STRIP_FIELDS.has(k)) out[k] = record[k];
  return out;
}

/**
 * Build the canary as a schema-perfect clone of a real record: copy a
 * mid-list record from the same dataset (guarantees every field the app
 * expects exists), then overwrite identity/spec fields and null out any
 * external references that could be "verified" against real registries.
 */
function makeCanary(items, overrides) {
  const skeleton = JSON.parse(JSON.stringify(items[Math.floor(items.length / 2)]));
  const NULL_KEYS = [
    'uuid', 'eprel_registration_number', 'eprel_model', 'eprel_match_type',
    'bafa_reference_id', 'bafa_reference_model', 'bafa_reference_match_type',
    'nf_pac_reference', 'website',
    'outdoor_unit_model', 'idu_model', 'control_box_model', 'tank_model',
    'tower_model', 'hydraulic_module_model', 'indoor_side_equipment_model',
    'outdoor_side_display_model',
    'width_mm', 'height_mm', 'depth_mm', 'weight_kg', 'dimensions_raw', 'weight_raw',
    'physical_specs_confidence', 'physical_specs_estimated', 'physical_specs_source_type',
    'physical_specs_source_note', 'physical_specs_match_type', 'physical_specs_family',
    'scop', 'seer', 'cooling_efficiency', 'cooling_capacity_kw',
    'power_design_35C_kw', 'power_design_55C_kw', 'cop_A10W35',
    'max_electric_power_kw', 'refrigerant_2', 'refrigerant_2_amount_kg',
    'mcs_number', 'mcs_number_base', 'mcs_model_suffix', 'product_name',
  ];
  for (const k of NULL_KEYS) if (k in skeleton) skeleton[k] = null;
  if ('outdoor_side_identified' in skeleton) skeleton.outdoor_side_identified = false;
  if ('outdoor_side_display_kind' in skeleton) skeleton.outdoor_side_display_kind = null;
  return { ...skeleton, ...overrides };
}

/**
 * PUBLICATION GATE — generate → validate → review → publish.
 *
 * Uploading is the ONLY step that touches production, so it is the one step that
 * must not be reachable by accident. The gate re-validates the candidate datasets
 * against the last approved manifest (counts, duplicates, segment integrity, local
 * matching, source-country leakage) and exits non-zero on anything alarming. A
 * failed or half-finished update therefore leaves the live datasets untouched,
 * because we never get here.
 *
 * Override lives in the gate itself (--override --reason="…"), where it is recorded.
 */
if (!DRY && !GATE_PASSED) {
  console.log('Running the dataset gate before publishing…\n');
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/dataset-gate.mjs')], { stdio: 'inherit' });
  } catch {
    console.error('\n✗ Dataset gate FAILED — nothing was uploaded. Production is unchanged.');
    console.error('  Fix the cause, or record an override:');
    console.error('  node scripts/dataset-gate.mjs --override --reason="…"  &&  node scripts/upload-datasets.mjs --gate-passed');
    process.exit(1);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'hpdb-datasets-'));
let failed = false;

for (const [cc, files] of Object.entries(DATASETS)) {
  for (const [segment, file] of Object.entries(files)) {
    const local = join(ROOT, 'public/data', file);
    let data;
    try {
      data = JSON.parse(readFileSync(local, 'utf8'));
    } catch (e) {
      console.error(`✗ ${cc}/${segment}: cannot read ${local} — ${e.message}`);
      failed = true;
      continue;
    }
    const overrides = CANARIES[cc]?.[segment];
    if (!overrides) { console.error(`✗ ${cc}/${segment}: no canary defined`); failed = true; continue; }
    if (data.items.some(i => i.bafa_id === overrides.bafa_id || (i.model === overrides.model && i.manufacturer === overrides.manufacturer))) {
      console.error(`✗ ${cc}/${segment}: canary id/model collides with a real record — pick a new id`);
      failed = true;
      continue;
    }
    const served = {
      ...data,
      _meta: { ...data._meta, total_items: (data._meta?.total_items ?? data.items.length) + 1 },
      // Strip internal-only fields from the browser-facing copy (the canary is
      // projected too, so every served record has one consistent public shape).
      items: [...data.items, makeCanary(data.items, overrides)].map(projectPublic),
    };
    const json = JSON.stringify(served);
    const dest = `${BUCKET}/datasets/${cc}/${file}`;
    // ALL datasets ship gzip'd (2026-07-27 first-load latency fix). The IT
    // residential object piloted this for months (2026-07-19, Option 2a): GCS
    // serves Content-Encoding: gzip and the browser HTTP stack transparently
    // decompresses, so getBlob → blob.text() sees plain JSON — content and
    // client behaviour are unchanged. The win is dramatic because the records
    // are highly repetitive: e.g. DE residential 11 MB → ~0.45 MB on the wire.
    // Reversible per object: set false and re-upload for plain JSON.
    const gzip = true;
    const out = join(tmp, `${cc}-${file}${gzip ? '.gz' : ''}`);
    writeFileSync(out, gzip ? gzipSync(Buffer.from(json)) : json);
    if (DRY) {
      console.log(`[dry-run] would upload ${served.items.length} items → ${dest}${gzip ? ' (gzip)' : ''}`);
      continue;
    }
    const args = [
      'storage', 'cp', out, dest,
      '--cache-control=private, max-age=3600',
      '--content-type=application/json',
    ];
    if (gzip) args.push('--content-encoding=gzip');
    execFileSync('gcloud', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`✓ ${dest}  (${served.items.length} items incl. canary${gzip ? ', gzip' : ''})`);
  }
}

rmSync(tmp, { recursive: true, force: true });
if (failed) process.exit(1);
