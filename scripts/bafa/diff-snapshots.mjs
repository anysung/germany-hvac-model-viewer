#!/usr/bin/env node
/**
 * diff-snapshots.mjs — Compare two parsed BAFA snapshots
 *
 * Usage:
 *   node scripts/bafa/diff-snapshots.mjs --from YYYY-MM --to YYYY-MM
 *
 * Reads:
 *   data_sources/bafa/parsed/YYYY-MM/bafa-normalized.json  (both snapshots)
 *
 * Writes:
 *   data_sources/bafa/diffs/YYYY-MM/diff-from-YYYY-MM-to-YYYY-MM.json
 *   data_sources/bafa/listing_history.json   (updated, gitignored)
 *   data_sources/bafa/fetch-log.md           (appended)
 *   data_sources/bafa/manifest.json          (updated)
 *
 * Terminology note:
 *   The BAFA API only returns currently-active products (date filter is mandatory).
 *   "Absent from latest snapshot" does NOT definitively mean delisted — the product
 *   may have had its funding dates changed or re-applied. Use safe wording:
 *     missing_from_latest_snapshot  — present in FROM, absent from TO
 *     newly_listed                  — absent from FROM, present in TO
 *     still_listed                  — present in both
 *     relisted_candidate            — returned after being missing (requires 3+ snapshots)
 *     changed_specs                 — same source_id, different source_record_hash
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_ROOT = path.join(REPO_ROOT, 'data_sources', 'bafa');
const MANIFEST_FILE = path.join(OUT_ROOT, 'manifest.json');
const LOG_FILE = path.join(OUT_ROOT, 'fetch-log.md');
const HISTORY_FILE = path.join(OUT_ROOT, 'listing_history.json');

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const toIdx = args.indexOf('--to');

if (fromIdx === -1 || toIdx === -1) {
  console.error('Usage: node scripts/bafa/diff-snapshots.mjs --from YYYY-MM --to YYYY-MM');
  process.exit(1);
}

const FROM = args[fromIdx + 1];
const TO = args[toIdx + 1];

if (!/^\d{4}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}$/.test(TO)) {
  console.error('Snapshot IDs must be in YYYY-MM format.');
  process.exit(1);
}

if (FROM >= TO) {
  console.error(`--from (${FROM}) must be earlier than --to (${TO}).`);
  process.exit(1);
}

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

// ── Listing history helpers ────────────────────────────────────────────────
function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (_) { return {}; }
}

function saveHistory(h) {
  assertInsideOutRoot(HISTORY_FILE);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2) + '\n', 'utf8');
}

// ── Changed fields detection ───────────────────────────────────────────────
const COMPARABLE_FIELDS = [
  'manufacturer', 'model', 'type', 'refrigerant', 'refrigerant_2',
  'refrigerant_amount_kg', 'refrigerant_2_amount_kg',
  'power_35C_kw', 'power_55C_kw', 'cop_A7W35', 'cop_A2W35', 'cop_AMinus7W35', 'cop_A10W35',
  'scop', 'seer', 'noise_outdoor_dB', 'noise_indoor_dB',
  'max_electric_power_kw', 'num_compressors', 'grid_ready', 'grid_ready_type',
  'drive_type', 'power_control', 'website',
];

function findChangedFields(fromRec, toRec) {
  const changed = [];
  for (const f of COMPARABLE_FIELDS) {
    const a = fromRec[f] ?? null;
    const b = toRec[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changed.push({ field: f, from: a, to: b });
    }
  }
  return changed;
}

// ── Load parsed snapshot ───────────────────────────────────────────────────
function loadParsed(snapshotId) {
  const p = path.join(OUT_ROOT, 'parsed', snapshotId, 'bafa-normalized.json');
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { meta: d._meta, items: d.items || [] };
  } catch (err) {
    console.error(`Failed to parse ${path.relative(REPO_ROOT, p)}: ${err.message}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== BAFA Snapshot Diff ===');
  console.log(`FROM : ${FROM}`);
  console.log(`TO   : ${TO}\n`);

  // Load snapshots
  const fromSnap = loadParsed(FROM);
  const toSnap = loadParsed(TO);

  if (!fromSnap) {
    console.error(`FROM snapshot not parsed: data_sources/bafa/parsed/${FROM}/bafa-normalized.json`);
    console.error(`Parse first: node scripts/bafa/parse-bafa-raw.mjs --snapshot ${FROM}`);
    process.exit(1);
  }
  if (!toSnap) {
    console.error(`TO snapshot not parsed: data_sources/bafa/parsed/${TO}/bafa-normalized.json`);
    console.error(`Parse first: node scripts/bafa/parse-bafa-raw.mjs --snapshot ${TO}`);
    process.exit(1);
  }

  console.log(`FROM snapshot: ${fromSnap.items.length} records (fetched ${fromSnap.meta?.bafa_snapshot_fetched_at ?? 'unknown'})`);
  console.log(`TO   snapshot: ${toSnap.items.length} records (fetched ${toSnap.meta?.bafa_snapshot_fetched_at ?? 'unknown'})`);

  log(`diff start: from=${FROM} (${fromSnap.items.length}) to=${TO} (${toSnap.items.length})`);

  // Index by source_id (bafa_id preferred; uuid as fallback)
  function indexByKey(items) {
    const m = new Map();
    for (const item of items) {
      const k = item.source_id || item.bafa_id || item.uuid;
      if (!k) continue;
      if (m.has(k)) {
        // Keep first occurrence; flag duplicate
        if (!m.get(k)._duplicate_count) m.get(k)._duplicate_count = 1;
        m.get(k)._duplicate_count++;
      } else {
        m.set(k, item);
      }
    }
    return m;
  }

  const fromMap = indexByKey(fromSnap.items);
  const toMap = indexByKey(toSnap.items);

  // ── Classify ────────────────────────────────────────────────────────────
  const newly_listed = [];
  const missing_from_latest = [];
  const still_listed = [];
  const changed_specs = [];
  const unchanged = [];

  // Products in FROM
  for (const [key, fromRec] of fromMap) {
    const toRec = toMap.get(key);
    if (!toRec) {
      missing_from_latest.push({
        source_id: key,
        bafa_id: fromRec.bafa_id,
        uuid: fromRec.uuid,
        manufacturer: fromRec.manufacturer,
        model: fromRec.model,
        from_hash: fromRec.source_record_hash,
        last_seen_snapshot: FROM,
        status: 'missing_from_latest_snapshot',
        status_note: 'Present in FROM snapshot; absent from TO snapshot. Cannot confirm delisting — BAFA date filters may have changed. Re-check in next snapshot.',
      });
    } else {
      const hashChanged = fromRec.source_record_hash !== toRec.source_record_hash;
      const changedFields = hashChanged ? findChangedFields(fromRec, toRec) : [];

      const entry = {
        source_id: key,
        bafa_id: toRec.bafa_id,
        uuid: toRec.uuid,
        manufacturer: toRec.manufacturer,
        model: toRec.model,
        status: hashChanged ? 'changed_specs' : 'still_listed',
        from_hash: fromRec.source_record_hash,
        to_hash: toRec.source_record_hash,
      };
      if (hashChanged) {
        entry.changed_fields = changedFields;
        changed_specs.push(entry);
      } else {
        unchanged.push(entry);
      }
      still_listed.push(entry);
    }
  }

  // Products in TO but not FROM (newly listed)
  for (const [key, toRec] of toMap) {
    if (!fromMap.has(key)) {
      newly_listed.push({
        source_id: key,
        bafa_id: toRec.bafa_id,
        uuid: toRec.uuid,
        manufacturer: toRec.manufacturer,
        model: toRec.model,
        to_hash: toRec.source_record_hash,
        first_seen_snapshot: TO,
        status: 'newly_listed',
      });
    }
  }

  // Duplicate detection
  const fromDuplicates = fromSnap.items.filter(i => i._duplicate_count > 1).length;
  const toDuplicates = toSnap.items.filter(i => i._duplicate_count > 1).length;

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n=== Diff Results ===');
  console.log(`Still listed (unchanged specs) : ${unchanged.length}`);
  console.log(`Still listed (changed specs)   : ${changed_specs.length}`);
  console.log(`Newly listed                   : ${newly_listed.length}`);
  console.log(`Missing from latest snapshot   : ${missing_from_latest.length}`);
  console.log(`FROM duplicates detected       : ${fromDuplicates}`);
  console.log(`TO   duplicates detected       : ${toDuplicates}`);

  if (changed_specs.length > 0 && changed_specs.length <= 10) {
    console.log('\nChanged specs (top 10):');
    for (const c of changed_specs.slice(0, 10)) {
      console.log(`  ${c.source_id} ${c.manufacturer} ${c.model}`);
      for (const f of (c.changed_fields || [])) {
        console.log(`    ${f.field}: ${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}`);
      }
    }
  }

  // ── Write diff JSON ──────────────────────────────────────────────────────
  const diffDir = path.join(OUT_ROOT, 'diffs', TO);
  assertInsideOutRoot(diffDir);
  fs.mkdirSync(diffDir, { recursive: true });

  const diffFileName = `diff-from-${FROM}-to-${TO}.json`;
  const diffPath = path.join(diffDir, diffFileName);
  assertInsideOutRoot(diffPath);

  const diffOutput = {
    _summary: {
      diff_type: 'bafa_active_snapshot',
      from_snapshot: FROM,
      to_snapshot: TO,
      from_fetched_at: fromSnap.meta?.bafa_snapshot_fetched_at ?? null,
      to_fetched_at: toSnap.meta?.bafa_snapshot_fetched_at ?? null,
      from_count: fromSnap.items.length,
      to_count: toSnap.items.length,
      diff_generated_at: new Date().toISOString(),
      diff_script: 'scripts/bafa/diff-snapshots.mjs',
      counts: {
        still_listed: still_listed.length,
        unchanged_specs: unchanged.length,
        changed_specs: changed_specs.length,
        newly_listed: newly_listed.length,
        missing_from_latest_snapshot: missing_from_latest.length,
        from_duplicates: fromDuplicates,
        to_duplicates: toDuplicates,
      },
      terminology_note: 'missing_from_latest_snapshot = present in FROM but absent from TO. This does NOT confirm delisting — BAFA active-snapshot fetch only returns products with active funding dates at the time of extraction. Re-check in the next monthly snapshot before treating as delisted.',
    },
    newly_listed,
    missing_from_latest_snapshot: missing_from_latest,
    changed_specs,
    still_listed_sample: still_listed.slice(0, 5).map(r => ({ source_id: r.source_id, manufacturer: r.manufacturer, model: r.model, status: r.status })),
  };

  fs.writeFileSync(diffPath, JSON.stringify(diffOutput, null, 2) + '\n', 'utf8');
  console.log(`\nWrote: ${path.relative(REPO_ROOT, diffPath)}`);

  log(`diff complete: from=${FROM} to=${TO} still_listed=${still_listed.length} changed_specs=${changed_specs.length} newly_listed=${newly_listed.length} missing_from_latest=${missing_from_latest.length}`);

  // ── Update listing_history.json ──────────────────────────────────────────
  const history = loadHistory();

  // Process still-listed (update last_seen)
  for (const r of still_listed) {
    const k = r.source_id;
    if (!history[k]) {
      history[k] = {
        source_id: k,
        bafa_id: r.bafa_id,
        uuid: r.uuid,
        manufacturer: r.manufacturer,
        model: r.model,
        first_seen_snapshot: FROM,
        last_seen_snapshot: TO,
        latest_status: r.status,
        seen_snapshots: [FROM, TO],
        missing_since_snapshot: null,
        relisted_count: 0,
        latest_hash: r.to_hash,
      };
    } else {
      history[k].last_seen_snapshot = TO;
      history[k].latest_status = r.status;
      history[k].latest_hash = r.to_hash;
      history[k].missing_since_snapshot = null;
      if (!history[k].seen_snapshots) history[k].seen_snapshots = [];
      if (!history[k].seen_snapshots.includes(TO)) history[k].seen_snapshots.push(TO);
    }
    if (r.changed_fields) history[k].latest_changed_fields = r.changed_fields;
  }

  // Process newly listed
  for (const r of newly_listed) {
    const k = r.source_id;
    const wasEverSeen = !!history[k];
    if (!history[k]) {
      history[k] = {
        source_id: k,
        bafa_id: r.bafa_id,
        uuid: r.uuid,
        manufacturer: r.manufacturer,
        model: r.model,
        first_seen_snapshot: TO,
        last_seen_snapshot: TO,
        latest_status: 'newly_listed',
        seen_snapshots: [TO],
        missing_since_snapshot: null,
        relisted_count: 0,
        latest_hash: r.to_hash,
      };
    } else {
      // Was seen before but missing for at least one snapshot — this is a relist candidate
      history[k].last_seen_snapshot = TO;
      history[k].latest_status = 'relisted_candidate';
      history[k].relisted_count = (history[k].relisted_count || 0) + 1;
      history[k].latest_hash = r.to_hash;
      history[k].missing_since_snapshot = null;
      if (!history[k].seen_snapshots) history[k].seen_snapshots = [];
      if (!history[k].seen_snapshots.includes(TO)) history[k].seen_snapshots.push(TO);
    }
  }

  // Process missing from latest
  for (const r of missing_from_latest) {
    const k = r.source_id;
    if (!history[k]) {
      history[k] = {
        source_id: k,
        bafa_id: r.bafa_id,
        uuid: r.uuid,
        manufacturer: r.manufacturer,
        model: r.model,
        first_seen_snapshot: FROM,
        last_seen_snapshot: FROM,
        latest_status: 'missing_from_latest_snapshot',
        seen_snapshots: [FROM],
        missing_since_snapshot: TO,
        relisted_count: 0,
        latest_hash: r.from_hash,
      };
    } else {
      history[k].latest_status = 'missing_from_latest_snapshot';
      if (!history[k].missing_since_snapshot) history[k].missing_since_snapshot = TO;
    }
  }

  saveHistory(history);
  console.log(`Updated: ${path.relative(REPO_ROOT, HISTORY_FILE)} (${Object.keys(history).length} total products tracked)`);

  // ── Update manifest ──────────────────────────────────────────────────────
  const manifest = loadManifest();
  if (manifest) {
    if (!manifest.known_diffs) manifest.known_diffs = [];
    const diffKey = `${FROM}-to-${TO}`;
    const existingDiff = manifest.known_diffs.find(d => d.diff_key === diffKey);
    const diffEntry = {
      diff_key: diffKey,
      from_snapshot: FROM,
      to_snapshot: TO,
      generated_at: new Date().toISOString(),
      output_file: `diffs/${TO}/${diffFileName}`,
      newly_listed: newly_listed.length,
      missing_from_latest: missing_from_latest.length,
      changed_specs: changed_specs.length,
      still_listed: still_listed.length,
    };
    if (existingDiff) {
      Object.assign(existingDiff, diffEntry);
    } else {
      manifest.known_diffs.push(diffEntry);
    }

    upsertSnapshotInManifest(manifest, {
      snapshot_id: TO,
      diff_available: true,
      last_diff_from: FROM,
    });

    manifest.next_recommended_step = `Fetch next snapshot: node scripts/bafa/fetch-bafa-raw.mjs --snapshot <next-YYYY-MM> --fetch`;
    saveManifest(manifest);
    console.log(`Updated: ${path.relative(REPO_ROOT, MANIFEST_FILE)}`);
  }

  // ── Final ────────────────────────────────────────────────────────────────
  console.log('\n=== Diff complete ===');
  console.log(`  Newly listed                : ${newly_listed.length}`);
  console.log(`  Missing from latest snapshot: ${missing_from_latest.length}`);
  console.log(`  Changed specs               : ${changed_specs.length}`);
  console.log(`  Unchanged                   : ${unchanged.length}`);
  console.log(`  Total tracked in history    : ${Object.keys(history).length}`);
}

main().catch(err => { console.error('\nDiff failed:', err.message); process.exit(1); });
