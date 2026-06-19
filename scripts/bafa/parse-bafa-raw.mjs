#!/usr/bin/env node
/**
 * parse-bafa-raw.mjs — BAFA snapshot normalizer
 *
 * Usage:
 *   node scripts/bafa/parse-bafa-raw.mjs [--snapshot YYYY-MM]
 *
 * Reads:
 *   data_sources/bafa/raw/YYYY-MM/bafa-luft-wasser.json
 *   data_sources/bafa/raw/YYYY-MM/_meta.json
 *
 * Writes:
 *   data_sources/bafa/parsed/YYYY-MM/bafa-normalized.json
 *   data_sources/bafa/parsed/YYYY-MM/_summary.json
 *   data_sources/bafa/fetch-log.md  (appended)
 *   data_sources/bafa/manifest.json (updated)
 *
 * Format handling:
 *   'raw_api'            — new fetches via fetch-bafa-raw.mjs (German field names)
 *   'pre-phase2-cleaned' — March 2026 bootstrap snapshot (English field names from bafa-scraper.cjs)
 *
 * source_record_hash:
 *   SHA-256 over JSON-serialized canonical spec fields (sorted keys, no provenance fields).
 *   Used by diff-snapshots.mjs to detect changed product specifications.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_ROOT = path.join(REPO_ROOT, 'data_sources', 'bafa');
const MANIFEST_FILE = path.join(OUT_ROOT, 'manifest.json');
const LOG_FILE = path.join(OUT_ROOT, 'fetch-log.md');

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const snapshotIdx = args.indexOf('--snapshot');
const snapshotArg = snapshotIdx !== -1 ? args[snapshotIdx + 1] : undefined;

function currentSnapshot() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const SNAPSHOT = snapshotArg ?? currentSnapshot();

// ── Safety guard ───────────────────────────────────────────────────────────
function assertInsideOutRoot(p) {
  const rel = path.relative(OUT_ROOT, p);
  if (rel.startsWith('..')) throw new Error(`Path escape attempt blocked: ${p}`);
}

// ── Log ────────────────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString();
  const line = `- ${ts} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

// ── Manifest helpers ───────────────────────────────────────────────────────
function loadManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); } catch (_) { return null; }
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(m, null, 2) + '\n');
}

function upsertSnapshotInManifest(manifest, entry) {
  if (!manifest) return;
  const snapshots = manifest.known_snapshots || [];
  const idx = snapshots.findIndex(s => s.snapshot_id === entry.snapshot_id);
  if (idx !== -1) {
    snapshots[idx] = { ...snapshots[idx], ...entry };
  } else {
    snapshots.push(entry);
  }
  snapshots.sort((a, b) => b.snapshot_id.localeCompare(a.snapshot_id));
  manifest.known_snapshots = snapshots;
}

// ── Numeric coercion ───────────────────────────────────────────────────────
function toNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ── PUMPENTYP map ──────────────────────────────────────────────────────────
const PUMPENTYP_MAP = {
  LUFT_WASSER: 'Luft / Wasser',
  SOLE_WASSER: 'Sole / Wasser',
  WASSER_WASSER: 'Wasser / Wasser',
  SORPTIONS: 'Sorption',
};

// ── SHA-256 record hash ────────────────────────────────────────────────────
// Hash covers specification fields only — excludes provenance and derived fields
// so that the hash changes only when product specs actually change.
const SPEC_FIELDS_ORDER = [
  'bafa_id', 'uuid', 'manufacturer', 'model', 'type',
  'refrigerant', 'refrigerant_2', 'refrigerant_amount_kg', 'refrigerant_2_amount_kg',
  'power_35C_kw', 'power_55C_kw',
  'cop_A7W35', 'cop_A2W35', 'cop_AMinus7W35', 'cop_A10W35',
  'scop', 'seer',
  'cooling_capacity_kw', 'cooling_efficiency',
  'noise_outdoor_dB', 'noise_indoor_dB',
  'max_electric_power_kw', 'drive_type', 'power_control', 'num_compressors',
  'grid_ready', 'grid_ready_type',
  'ee_display', 'ee_display_type',
  'heat_meter', 'defrost_tested', 'defrost_type', 'temp_diff',
  'efficiency_35C_percent', 'efficiency_55C_percent',
  'power_design_35C_kw', 'power_design_55C_kw',
  'website',
];

function computeHash(record) {
  const canon = {};
  for (const k of SPEC_FIELDS_ORDER) {
    canon[k] = record[k] ?? null;
  }
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

// ── Normalize a raw-API-format item (German field names from fetch-bafa-raw.mjs) ──
function normalizeRawApiItem(raw, fetchedAt) {
  const mfr = (raw.markeHersteller || '').trim();
  const model = (raw.geraetebezeichnung || '').trim();

  const record = {
    bafa_id: raw.anlagennummer ? String(raw.anlagennummer) : null,
    uuid: raw.uuid || null,
    manufacturer: mfr || null,
    manufacturer_normalized: mfr.toUpperCase().replace(/\s+/g, ' ') || null,
    model: model || null,
    type: PUMPENTYP_MAP[raw.pumpentyp] || raw.pumpentyp || null,
    refrigerant: raw.kaeltemittel1 || null,
    refrigerant_2: raw.kaeltemittel2 || null,
    refrigerant_amount_kg: toNum(raw.mengeKaeltemittel1),
    refrigerant_2_amount_kg: toNum(raw.mengeKaeltemittel2),
    power_35C_kw: toNum(raw.heizleistungPrated35C),
    power_55C_kw: toNum(raw.heizleistungPrated55C),
    efficiency_35C_percent: toNum(raw.etas35C),
    efficiency_55C_percent: toNum(raw.etas55C),
    power_design_35C_kw: toNum(raw.heizleistungPdesignh35C),
    power_design_55C_kw: toNum(raw.heizleistungPdesignh55C),
    cop_A7W35: toNum(raw.copBeiA7W35),
    cop_A2W35: toNum(raw.copBeiA2W35B0W35W10W35),
    cop_AMinus7W35: toNum(raw.copBeiAMinus7W35),
    cop_A10W35: toNum(raw.copBeiA10W35),
    scop: toNum(raw.scop),
    seer: toNum(raw.seer),
    cooling_capacity_kw: toNum(raw.kuehlleistung),
    cooling_efficiency: toNum(raw.effizienzKuehlen),
    noise_outdoor_dB: toNum(raw.schallemissionAussen),
    noise_indoor_dB: toNum(raw.schallemissionInnen),
    max_electric_power_kw: toNum(raw.maxElektrischeLeistungsaufnahme),
    drive_type: raw.antriebsart || null,
    power_control: raw.leistungsregelungArt || null,
    num_compressors: toNum(raw.anzahlVerdichter),
    grid_ready: raw.netzdienlichkeit === 'JA',
    grid_ready_type: raw.netzdienlichkeitArt || null,
    ee_display: raw.eeAnzeige === 'JA',
    ee_display_type: raw.artEeAnzeige || null,
    heat_meter: raw.waermemengenzaehler || null,
    defrost_tested: raw.abtauungGeprueft === 'JA',
    defrost_type: raw.abtauungArt || null,
    temp_diff: toNum(raw.temperaturdifferenz),
    website: raw.webseite || null,
  };

  return record;
}

// ── Normalize a pre-Phase-2-cleaned item (English field names from bafa-scraper.cjs) ─
function normalizeCleanedItem(raw) {
  return {
    bafa_id: raw.bafa_id ? String(raw.bafa_id) : null,
    uuid: raw.uuid || null,
    manufacturer: raw.manufacturer || null,
    manufacturer_normalized: raw.manufacturer_normalized || null,
    model: raw.model || null,
    type: raw.type || null,
    refrigerant: raw.refrigerant || null,
    refrigerant_2: raw.refrigerant_2 || null,
    refrigerant_amount_kg: toNum(raw.refrigerant_amount_kg),
    refrigerant_2_amount_kg: toNum(raw.refrigerant_2_amount_kg),
    power_35C_kw: toNum(raw.power_35C_kw),
    power_55C_kw: toNum(raw.power_55C_kw),
    efficiency_35C_percent: toNum(raw.efficiency_35C_percent),
    efficiency_55C_percent: toNum(raw.efficiency_55C_percent),
    power_design_35C_kw: toNum(raw.power_design_35C_kw),
    power_design_55C_kw: toNum(raw.power_design_55C_kw),
    cop_A7W35: toNum(raw.cop_A7W35),
    cop_A2W35: toNum(raw.cop_A2W35),
    cop_AMinus7W35: toNum(raw.cop_AMinus7W35),
    cop_A10W35: toNum(raw.cop_A10W35),
    scop: toNum(raw.scop),
    seer: toNum(raw.seer),
    cooling_capacity_kw: toNum(raw.cooling_capacity_kw),
    cooling_efficiency: toNum(raw.cooling_efficiency),
    noise_outdoor_dB: toNum(raw.noise_outdoor_dB),
    noise_indoor_dB: toNum(raw.noise_indoor_dB),
    max_electric_power_kw: toNum(raw.max_electric_power_kw),
    drive_type: raw.drive_type || null,
    power_control: raw.power_control || null,
    num_compressors: toNum(raw.num_compressors),
    grid_ready: raw.grid_ready === true || raw.grid_ready === 'true',
    grid_ready_type: raw.grid_ready_type || null,
    ee_display: raw.ee_display === true || raw.ee_display === 'true',
    ee_display_type: raw.ee_display_type || null,
    heat_meter: raw.heat_meter || null,
    defrost_tested: raw.defrost_tested === true || raw.defrost_tested === 'true',
    defrost_type: raw.defrost_type || null,
    temp_diff: toNum(raw.temp_diff),
    website: raw.website || null,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const rawDir = path.join(OUT_ROOT, 'raw', SNAPSHOT);
  const rawFile = path.join(rawDir, 'bafa-luft-wasser.json');
  const metaFile = path.join(rawDir, '_meta.json');

  if (!fs.existsSync(rawFile)) {
    console.error(`Raw snapshot not found: ${path.relative(REPO_ROOT, rawFile)}`);
    console.error(`Fetch first: node scripts/bafa/fetch-bafa-raw.mjs --snapshot ${SNAPSHOT} --fetch`);
    console.error(`Or for 2026-03: the bootstrap snapshot was already migrated from scraper/bafa-luft-wasser.json`);
    process.exit(1);
  }

  // Load raw snapshot
  let rawSnap;
  try {
    rawSnap = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse raw snapshot: ${err.message}`);
    process.exit(1);
  }

  // Load _meta.json
  let rawMeta = rawSnap._meta || {};
  if (fs.existsSync(metaFile)) {
    try { rawMeta = { ...rawMeta, ...JSON.parse(fs.readFileSync(metaFile, 'utf8')) }; } catch (_) {}
  }

  const format = rawMeta.format || (rawSnap._meta && rawSnap._meta.format) || 'unknown';
  const fetchedAt = rawMeta.fetched_at || rawMeta.extracted_at || null;
  const rawItems = rawSnap.items || [];

  console.log(`\n=== BAFA Snapshot Parser ===`);
  console.log(`Snapshot      : ${SNAPSHOT}`);
  console.log(`Format        : ${format}`);
  console.log(`Fetched at    : ${fetchedAt}`);
  console.log(`Raw items     : ${rawItems.length}`);
  console.log(`Input         : ${path.relative(REPO_ROOT, rawFile)}\n`);

  log(`parse start: snapshot=${SNAPSHOT} format=${format} raw_items=${rawItems.length}`);

  if (rawItems.length === 0) {
    console.error('No items found in raw snapshot. Aborting.');
    process.exit(1);
  }

  // ── Normalize items ────────────────────────────────────────────────────
  const records = [];
  const malformed = [];

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    let spec;

    if (format === 'raw_api') {
      spec = normalizeRawApiItem(raw, fetchedAt);
    } else {
      // pre-phase2-cleaned or unknown: use English field name normalizer
      spec = normalizeCleanedItem(raw);
    }

    if (!spec.bafa_id && !spec.uuid) {
      malformed.push({ index: i, reason: 'missing bafa_id and uuid', raw: JSON.stringify(raw).substring(0, 120) });
      continue;
    }

    const source_record_hash = computeHash(spec);

    records.push({
      // Source identity
      source_id: spec.bafa_id || spec.uuid,
      bafa_id: spec.bafa_id,
      uuid: spec.uuid,
      country: 'DE',
      primary_source: 'BAFA',
      bafa_listing_status: 'listed_in_snapshot',
      bafa_snapshot_fetched_at: fetchedAt,
      bafa_snapshot_id: SNAPSHOT,
      // Spec fields
      ...spec,
      // Hash (after spec fields so we can see it clearly)
      source_record_hash,
    });
  }

  // ── Validation ─────────────────────────────────────────────────────────
  console.log('=== Validation ===');

  // Duplicate bafa_id check
  const idMap = {};
  for (const r of records) {
    const k = r.bafa_id || r.uuid;
    idMap[k] = (idMap[k] || 0) + 1;
  }
  const duplicates = Object.entries(idMap).filter(([, c]) => c > 1);
  console.log(`Duplicate bafa_id/uuid: ${duplicates.length}`);
  if (duplicates.length > 0 && duplicates.length <= 5) {
    console.log('  Duplicates:', duplicates.map(([k, v]) => `${k}×${v}`).join(', '));
  }

  // Missing required fields
  const missingId = records.filter(r => !r.bafa_id).length;
  const missingUuid = records.filter(r => !r.uuid).length;
  const missingMfr = records.filter(r => !r.manufacturer).length;
  const missingModel = records.filter(r => !r.model).length;
  const missingHash = records.filter(r => !r.source_record_hash).length;
  console.log(`Missing bafa_id  : ${missingId}`);
  console.log(`Missing uuid     : ${missingUuid}`);
  console.log(`Missing manufacturer: ${missingMfr}`);
  console.log(`Missing model    : ${missingModel}`);
  console.log(`Missing hash     : ${missingHash}`);
  console.log(`Malformed/skipped: ${malformed.length}`);

  // Distribution stats
  const withScop = records.filter(r => r.scop != null).length;
  const withCopA7 = records.filter(r => r.cop_A7W35 != null).length;
  const withNoise = records.filter(r => r.noise_outdoor_dB != null).length;
  const withR290 = records.filter(r => (r.refrigerant || '') === 'R290').length;
  const uniqueManufacturers = new Set(records.map(r => r.manufacturer_normalized)).size;
  console.log(`\nWith SCOP        : ${withScop} / ${records.length}`);
  console.log(`With COP A7/W35  : ${withCopA7} / ${records.length}`);
  console.log(`With noise data  : ${withNoise} / ${records.length}`);
  console.log(`R290 refrigerant : ${withR290} / ${records.length}`);
  console.log(`Manufacturers    : ${uniqueManufacturers}`);

  const allPass = missingHash === 0 && records.length > 0;
  console.log(`\nValidation: ${allPass ? 'PASS' : 'WARN — see above'}`);

  // ── Write normalized JSON ──────────────────────────────────────────────
  const parsedDir = path.join(OUT_ROOT, 'parsed', SNAPSHOT);
  assertInsideOutRoot(parsedDir);
  fs.mkdirSync(parsedDir, { recursive: true });

  const normalizedPath = path.join(parsedDir, 'bafa-normalized.json');
  assertInsideOutRoot(normalizedPath);
  const normalizedOut = {
    _meta: {
      snapshot_id: SNAPSHOT,
      source: 'BAFA Wärmepumpen Database',
      country: 'DE',
      primary_source: 'BAFA',
      parsed_at: new Date().toISOString(),
      bafa_snapshot_fetched_at: fetchedAt,
      raw_format: format,
      record_count: records.length,
      malformed_skipped: malformed.length,
      hash_fields: SPEC_FIELDS_ORDER,
    },
    items: records,
  };
  fs.writeFileSync(normalizedPath, JSON.stringify(normalizedOut, null, 2) + '\n', 'utf8');
  console.log(`\nWrote: ${path.relative(REPO_ROOT, normalizedPath)} (${records.length} records)`);

  // ── Write summary JSON ─────────────────────────────────────────────────
  const summary = {
    snapshot_id: SNAPSHOT,
    source_format: format,
    bafa_snapshot_fetched_at: fetchedAt,
    parsed_at: new Date().toISOString(),
    record_count: records.length,
    malformed_skipped: malformed.length,
    duplicates: duplicates.length,
    missing_bafa_id: missingId,
    missing_uuid: missingUuid,
    missing_manufacturer: missingMfr,
    missing_model: missingModel,
    missing_hash: missingHash,
    unique_manufacturers: uniqueManufacturers,
    with_scop: withScop,
    with_cop_a7w35: withCopA7,
    with_noise_outdoor: withNoise,
    with_r290: withR290,
    hash_algorithm: 'sha256',
    hash_fields: SPEC_FIELDS_ORDER,
    validation: {
      record_count: records.length > 0 ? 'PASS' : 'FAIL — zero records',
      hash_complete: missingHash === 0 ? 'PASS' : `WARN — ${missingHash} records missing hash`,
      malformed: malformed.length > 0 ? `WARN — ${malformed.length} skipped` : 'PASS',
      duplicates: duplicates.length > 0 ? `WARN — ${duplicates.length} duplicate ids` : 'PASS',
    },
  };

  const summaryPath = path.join(parsedDir, '_summary.json');
  assertInsideOutRoot(summaryPath);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  console.log(`Wrote: ${path.relative(REPO_ROOT, summaryPath)}`);

  log(`parse complete: snapshot=${SNAPSHOT} records=${records.length} malformed=${malformed.length} duplicates=${duplicates.length} missing_hash=${missingHash} manufacturers=${uniqueManufacturers}`);

  // ── Update manifest ────────────────────────────────────────────────────
  const manifest = loadManifest();
  if (manifest) {
    upsertSnapshotInManifest(manifest, {
      snapshot_id: SNAPSHOT,
      parse_complete: true,
      parsed_at: new Date().toISOString(),
      parsed_record_count: records.length,
      parse_validation: summary.validation,
    });
    const snapshots = (manifest.known_snapshots || []).filter(s => s.parse_complete);
    if (snapshots.length >= 2) {
      const sorted = [...snapshots].sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));
      const from = sorted[sorted.length - 2].snapshot_id;
      const to = sorted[sorted.length - 1].snapshot_id;
      manifest.next_recommended_step = `Run diff: node scripts/bafa/diff-snapshots.mjs --from ${from} --to ${to}`;
    } else {
      manifest.next_recommended_step = `Fetch next snapshot: node scripts/bafa/fetch-bafa-raw.mjs --snapshot ${currentSnapshot()} --fetch`;
    }
    saveManifest(manifest);
    console.log(`Updated: ${path.relative(REPO_ROOT, MANIFEST_FILE)}`);
  }

  console.log('\n=== Parse complete ===');
}

main().catch(err => { console.error('\nParse failed:', err.message); process.exit(1); });
