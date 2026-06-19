#!/usr/bin/env node
/**
 * build-master-seed.mjs — Build the BAFA master product seed
 *
 * Master seed = reference baseline snapshot ∪ products newly observed in later snapshots.
 *
 * BAFA List status (simple, factual, no cause inferred):
 *   bafa_list_status = "yes"  — present in latest active BAFA snapshot
 *   bafa_list_status = "no"   — absent from latest active BAFA snapshot
 *
 * Products with BAFA List: No remain in the master seed as reference candidates.
 * Do not infer or store any cause for absence.
 *
 * Usage:
 *   node scripts/bafa/build-master-seed.mjs [options]
 *   --baseline YYYY-MM   Reference baseline snapshot (default: 2026-03)
 *   --latest   YYYY-MM   Latest active snapshot (default: auto-detect latest parsed)
 *   --out      YYYY-MM   Output subdirectory label (default: same as --latest)
 *   --dry-run            Print summary only — write no files
 *
 * Output (gitignored — see .gitignore pattern data_sources/bafa/master_seed/YYYY-MM):
 *   data_sources/bafa/master_seed/YYYY-MM/bafa-master-seed.json
 *   data_sources/bafa/master_seed/YYYY-MM/_summary.json
 *
 * Also updates:
 *   data_sources/bafa/manifest.json  (known_master_seeds section)
 *
 * Backward compatibility:
 *   Does not modify scraper/, public/data/, or any app-facing files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BAFA_ROOT = path.join(REPO_ROOT, 'data_sources', 'bafa');
const PARSED_DIR = path.join(BAFA_ROOT, 'parsed');
const SEED_DIR = path.join(BAFA_ROOT, 'master_seed');
const MANIFEST_FILE = path.join(BAFA_ROOT, 'manifest.json');

// ── Safety guard ───────────────────────────────────────────────────────────
function assertInsideBafaRoot(p) {
  const rel = path.relative(BAFA_ROOT, p);
  if (rel.startsWith('..')) throw new Error(`Path escape attempt blocked: ${p}`);
}

// ── CLI args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const MODE_DRY_RUN = argv.includes('--dry-run');

function getArg(flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? (argv[idx + 1] ?? null) : null;
}

const BASELINE_ARG = getArg('--baseline');
const LATEST_ARG = getArg('--latest');
const OUT_ARG = getArg('--out');

const DEFAULT_BASELINE = '2026-03';

// Auto-detect latest parsed snapshot (newest YYYY-MM dir that is not the baseline)
function detectLatestParsed(baseline) {
  if (!fs.existsSync(PARSED_DIR)) return null;
  return fs.readdirSync(PARSED_DIR)
    .filter(d => /^\d{4}-\d{2}$/.test(d) && d !== baseline)
    .sort()
    .reverse()[0] ?? null;
}

// ── Load parsed snapshot ───────────────────────────────────────────────────
function loadParsed(snapshotId) {
  const p = path.join(PARSED_DIR, snapshotId, 'bafa-normalized.json');
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return d.items ?? [];
  } catch (err) {
    throw new Error(`Failed to read parsed/${snapshotId}/bafa-normalized.json: ${err.message}`);
  }
}

// Index items by stable key (source_id → bafa_id → uuid)
function indexByKey(items) {
  const m = new Map();
  for (const item of items) {
    const k = item.source_id || item.bafa_id || item.uuid;
    if (k && !m.has(k)) m.set(k, item);
  }
  return m;
}

// Simple normalized manufacturer (uppercase trim for grouping/sort)
function normalizeManufacturer(raw) {
  if (!raw) return null;
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const BASELINE = BASELINE_ARG ?? DEFAULT_BASELINE;
  const LATEST   = LATEST_ARG ?? detectLatestParsed(BASELINE);
  const OUT      = OUT_ARG ?? LATEST;

  console.log('\n=== BAFA Master Seed Builder ===');
  console.log(`Reference baseline : ${BASELINE}`);
  console.log(`Latest snapshot    : ${LATEST ?? '(none detected)'}`);
  console.log(`Output label       : ${OUT ?? '(none)'}`);
  console.log(`Mode               : ${MODE_DRY_RUN ? 'dry-run (no files written)' : 'WRITE'}\n`);

  if (!LATEST) {
    console.error('ERROR: No latest snapshot detected. Run parse first or pass --latest YYYY-MM.');
    process.exit(1);
  }
  if (BASELINE >= LATEST) {
    console.error(`ERROR: --baseline (${BASELINE}) must be earlier than --latest (${LATEST}).`);
    process.exit(1);
  }
  if (!OUT) {
    console.error('ERROR: Cannot determine output label. Pass --out YYYY-MM.');
    process.exit(1);
  }

  // ── Load snapshots ───────────────────────────────────────────────────────
  console.log(`Loading baseline (${BASELINE})...`);
  const baselineItems = loadParsed(BASELINE);
  if (!baselineItems) {
    console.error(`ERROR: Baseline snapshot not found: parsed/${BASELINE}/bafa-normalized.json`);
    console.error(`Run: node scripts/bafa/parse-bafa-raw.mjs --snapshot ${BASELINE}`);
    process.exit(1);
  }

  console.log(`Loading latest (${LATEST})...`);
  const latestItems = loadParsed(LATEST);
  if (!latestItems) {
    console.error(`ERROR: Latest snapshot not found: parsed/${LATEST}/bafa-normalized.json`);
    console.error(`Run: node scripts/bafa/parse-bafa-raw.mjs --snapshot ${LATEST}`);
    process.exit(1);
  }

  console.log(`Baseline : ${baselineItems.length} records`);
  console.log(`Latest   : ${latestItems.length} records\n`);

  const baselineMap = indexByKey(baselineItems);
  const latestMap   = indexByKey(latestItems);

  // ── Build union key set ──────────────────────────────────────────────────
  const allKeys = new Set([...baselineMap.keys(), ...latestMap.keys()]);

  const seedItems = [];
  let dupCount = 0;
  const seenIds = new Set();

  for (const key of allKeys) {
    if (seenIds.has(key)) { dupCount++; continue; }
    seenIds.add(key);

    const baselineRec = baselineMap.get(key) ?? null;
    const latestRec   = latestMap.get(key)   ?? null;

    // Use the most recent available record for technical product fields
    const primary = latestRec ?? baselineRec;

    const seen_in_reference_baseline     = !!baselineRec;
    const present_in_latest_bafa_snapshot = !!latestRec;

    const first_seen_snapshot = seen_in_reference_baseline ? BASELINE : LATEST;
    const last_seen_snapshot  = present_in_latest_bafa_snapshot ? LATEST : BASELINE;

    seedItems.push({
      // ── Identity ────────────────────────────────────────────────────────
      source_id:      key,
      bafa_id:        primary.bafa_id        ?? null,
      country:        'DE',
      primary_source: 'BAFA',

      // ── Product fields (from most recent available record) ───────────────
      manufacturer:            primary.manufacturer            ?? null,
      manufacturer_normalized: normalizeManufacturer(primary.manufacturer),
      model:                   primary.model                   ?? null,
      type:                    primary.type                    ?? null,
      refrigerant:             primary.refrigerant             ?? null,
      power_35C_kw:            primary.power_35C_kw            ?? null,
      power_55C_kw:            primary.power_55C_kw            ?? null,
      cop_A7W35:               primary.cop_A7W35               ?? null,
      scop:                    primary.scop                    ?? null,
      noise_outdoor_dB:        primary.noise_outdoor_dB        ?? null,

      // ── Snapshot tracking ────────────────────────────────────────────────
      seen_in_reference_baseline,
      reference_baseline_snapshot: BASELINE,
      first_seen_snapshot,
      last_seen_snapshot,

      // ── BAFA List status (simple, factual — no cause inferred) ───────────
      present_in_latest_bafa_snapshot,
      bafa_list_current: present_in_latest_bafa_snapshot,
      bafa_list_status:  present_in_latest_bafa_snapshot ? 'yes' : 'no',
      bafa_list_current_as_of: LATEST,

      // ── Hashes ──────────────────────────────────────────────────────────
      latest_source_record_hash:   (latestRec ?? baselineRec)?.source_record_hash ?? null,
      baseline_source_record_hash: baselineRec?.source_record_hash ?? null,
    });
  }

  // Sort stable: manufacturer → model
  seedItems.sort((a, b) => {
    const m = (a.manufacturer_normalized ?? '').localeCompare(b.manufacturer_normalized ?? '');
    return m !== 0 ? m : (a.model ?? '').localeCompare(b.model ?? '');
  });

  // ── Counts ───────────────────────────────────────────────────────────────
  const counts = {
    total_master_seed_products:       seedItems.length,
    baseline_products:                seedItems.filter(i => i.seen_in_reference_baseline).length,
    newly_observed_after_baseline:    seedItems.filter(i => !i.seen_in_reference_baseline).length,
    bafa_list_yes:                    seedItems.filter(i => i.bafa_list_status === 'yes').length,
    bafa_list_no:                     seedItems.filter(i => i.bafa_list_status === 'no').length,
    seen_in_reference_baseline_true:  seedItems.filter(i => i.seen_in_reference_baseline === true).length,
    seen_in_reference_baseline_false: seedItems.filter(i => i.seen_in_reference_baseline === false).length,
    duplicate_source_ids:             dupCount,
    missing_required_fields:          seedItems.filter(i =>
      !i.source_id || !i.country || !i.primary_source || !i.bafa_list_status
    ).length,
    generated_at: new Date().toISOString(),
    latest_snapshot: LATEST,
    reference_baseline_snapshot: BASELINE,
  };

  console.log('=== Master Seed Counts ===');
  console.log(`Total products             : ${counts.total_master_seed_products}`);
  console.log(`  From baseline (${BASELINE})  : ${counts.baseline_products}`);
  console.log(`  Newly observed after it  : ${counts.newly_observed_after_baseline}`);
  console.log(`BAFA List Yes              : ${counts.bafa_list_yes}`);
  console.log(`BAFA List No               : ${counts.bafa_list_no}`);
  console.log(`seen_in_ref_baseline=true  : ${counts.seen_in_reference_baseline_true}`);
  console.log(`seen_in_ref_baseline=false : ${counts.seen_in_reference_baseline_false}`);
  console.log(`Duplicate source IDs       : ${counts.duplicate_source_ids}`);
  console.log(`Missing required fields    : ${counts.missing_required_fields}`);

  if (MODE_DRY_RUN) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const outDir = path.join(SEED_DIR, OUT);
  assertInsideBafaRoot(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  // bafa-master-seed.json (large, gitignored)
  const seedPath = path.join(outDir, 'bafa-master-seed.json');
  assertInsideBafaRoot(seedPath);

  const seedOutput = {
    _meta: {
      schema: 'bafa_master_seed_v1',
      reference_baseline_snapshot: BASELINE,
      latest_snapshot: LATEST,
      out_label: OUT,
      generated_at: counts.generated_at,
      build_script: 'scripts/bafa/build-master-seed.mjs',
      total_products: seedItems.length,
      status_policy: 'bafa_list_status = "yes" (present in latest BAFA active snapshot) | "no" (absent). No cause inferred. Products with bafa_list_status="no" remain in seed as reference candidates.',
    },
    counts,
    items: seedItems,
  };

  const tmp = seedPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(seedOutput, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, seedPath);

  const sizeKb = (fs.statSync(seedPath).size / 1024).toFixed(1);
  console.log(`\nWrote: ${path.relative(REPO_ROOT, seedPath)} (${sizeKb} KB)`);

  // _summary.json (small metadata file, gitignored with the rest of master_seed/20*/)
  const summaryPath = path.join(outDir, '_summary.json');
  assertInsideBafaRoot(summaryPath);

  const validation = {
    counts_sum_ok:       counts.baseline_products + counts.newly_observed_after_baseline === counts.total_master_seed_products ? 'PASS' : 'FAIL',
    bafa_list_sum_ok:    counts.bafa_list_yes + counts.bafa_list_no === counts.total_master_seed_products ? 'PASS' : 'FAIL',
    ref_baseline_sum_ok: counts.seen_in_reference_baseline_true + counts.seen_in_reference_baseline_false === counts.total_master_seed_products ? 'PASS' : 'FAIL',
    no_missing_fields:   counts.missing_required_fields === 0 ? 'PASS' : 'FAIL',
    no_duplicates:       counts.duplicate_source_ids === 0 ? 'PASS' : 'FAIL',
  };

  const allPass = Object.values(validation).every(v => v === 'PASS');
  console.log(`\nValidation: ${allPass ? 'PASS (all checks)' : 'FAIL — see _summary.json'}`);
  for (const [k, v] of Object.entries(validation)) {
    if (v !== 'PASS') console.log(`  FAIL: ${k}`);
  }

  fs.writeFileSync(summaryPath, JSON.stringify({ ...counts, validation, size_kb: parseFloat(sizeKb) }, null, 2) + '\n', 'utf8');
  console.log(`Wrote: ${path.relative(REPO_ROOT, summaryPath)}`);

  // ── Update manifest ───────────────────────────────────────────────────────
  if (fs.existsSync(MANIFEST_FILE)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    if (!manifest.known_master_seeds) manifest.known_master_seeds = [];

    const entry = {
      out_label: OUT,
      reference_baseline_snapshot: BASELINE,
      latest_snapshot: LATEST,
      generated_at: counts.generated_at,
      total_products: seedItems.length,
      bafa_list_yes: counts.bafa_list_yes,
      bafa_list_no: counts.bafa_list_no,
      output_file: `master_seed/${OUT}/bafa-master-seed.json`,
      build_script: 'scripts/bafa/build-master-seed.mjs',
      validation_overall: allPass ? 'PASS' : 'FAIL',
    };

    const idx = manifest.known_master_seeds.findIndex(s => s.out_label === OUT);
    if (idx !== -1) Object.assign(manifest.known_master_seeds[idx], entry);
    else manifest.known_master_seeds.push(entry);

    manifest.next_recommended_step = `Master seed ready at master_seed/${OUT}/. Review schema before app integration.`;
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Updated: ${path.relative(REPO_ROOT, MANIFEST_FILE)}`);
  }

  console.log('\n=== Build complete ===');
  console.log(`  data_sources/bafa/master_seed/${OUT}/bafa-master-seed.json  (${sizeKb} KB, gitignored)`);
  console.log(`  data_sources/bafa/master_seed/${OUT}/_summary.json          (gitignored)`);
}

main().catch(err => { console.error('\nBuild failed:', err.message); process.exit(1); });
