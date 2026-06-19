#!/usr/bin/env node
/**
 * fetch-bafa-raw.mjs — BAFA Wärmepumpen versioned snapshot fetcher
 *
 * Modes:
 *   (default)         dry-run: probe API, print record count, exit — no files written
 *   --fetch           download full active snapshot to data_sources/bafa/raw/YYYY-MM/
 *   --snapshot YYYY-MM  override snapshot label (default: current UTC month)
 *   --force           overwrite existing snapshot for the same month
 *   --test N          fetch only N items (default 20) — for quick validation
 *
 * Output:
 *   data_sources/bafa/raw/YYYY-MM/bafa-luft-wasser.json   (raw API items)
 *   data_sources/bafa/raw/YYYY-MM/_meta.json
 *   data_sources/bafa/manifest.json                        (updated)
 *   data_sources/bafa/fetch-log.md                        (appended)
 *
 * API notes (confirmed 2026-06-19):
 *   - Endpoint: https://elan1.bafa.bund.de/zvi-api/wep/waermepumpen
 *   - No authentication required (public API)
 *   - Date filters are MANDATORY — unfiltered fetch returns HTTP 400
 *   - foerderungAb/foerderungBis are filter-only params; NOT returned in response items
 *   - Raw API field names are German (anlagennummer, markeHersteller, etc.)
 *   - Page size: max 100; pagination via seite (0-based) + anzahl
 *
 * Backward compatibility:
 *   - scraper/bafa-scraper.cjs is NOT modified. It continues to write to
 *     scraper/bafa-luft-wasser.json for the existing app-facing pipeline.
 *   - This script writes to data_sources/bafa/ for versioned snapshot tracking only.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_ROOT = path.join(REPO_ROOT, 'data_sources', 'bafa');
const MANIFEST_FILE = path.join(OUT_ROOT, 'manifest.json');
const LOG_FILE = path.join(OUT_ROOT, 'fetch-log.md');

// ── BAFA API configuration ─────────────────────────────────────────────────
const API_BASE = 'https://elan1.bafa.bund.de/zvi-api/wep/waermepumpen';
const PAGE_SIZE = 100;
const DELAY_MS = 300;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// Active-snapshot filter (the only viable BAFA fetch mode — see fetch-log.md)
function buildFilter(date) {
  return [
    `foerderungAb=le="${date}"`,
    `foerderungBis=ge="${date}"`,
    'einzelabnahme==false',
    'pumpentyp==LUFT_WASSER',
  ].join(';');
}

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const MODE_FETCH = args.includes('--fetch');
const MODE_FORCE = args.includes('--force');
const snapshotIdx = args.indexOf('--snapshot');
const snapshotArg = snapshotIdx !== -1 ? args[snapshotIdx + 1] : undefined;
const testIdx = args.indexOf('--test');
const TEST_LIMIT = testIdx !== -1 ? (parseInt(args[testIdx + 1], 10) || 20) : null;

function currentSnapshot() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const SNAPSHOT = snapshotArg ?? currentSnapshot();
const FETCH_DATE = `${SNAPSHOT}-19`; // mid-month; actual date not critical for filter

// ── Safety guard ───────────────────────────────────────────────────────────
function assertInsideOutRoot(p) {
  const rel = path.relative(OUT_ROOT, p);
  if (rel.startsWith('..')) throw new Error(`Path escape attempt blocked: ${p}`);
}

// ── HTTP helpers (Node 18+ built-in fetch) ─────────────────────────────────
async function fetchPageWithRetry(pageNum, filterStr) {
  const url = `${API_BASE}?filter=${encodeURIComponent(filterStr)}&seite=${pageNum}&anzahl=${PAGE_SIZE}&sortierung=${encodeURIComponent('markeHersteller,asc;uuid,asc')}`;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await globalThis.fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS) throw err;
      console.log(`      Retry ${attempt}/${RETRY_ATTEMPTS}: ${err.message}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  // Sort newest first
  snapshots.sort((a, b) => b.snapshot_id.localeCompare(a.snapshot_id));
  manifest.known_snapshots = snapshots;
}

// ── Checkpoint ─────────────────────────────────────────────────────────────
function checkpointPath(outDir) { return path.join(outDir, '.fetch-checkpoint.json'); }

function loadCheckpoint(outDir) {
  const p = checkpointPath(outDir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function saveCheckpoint(outDir, data) {
  fs.writeFileSync(checkpointPath(outDir), JSON.stringify(data));
}

function clearCheckpoint(outDir) {
  const p = checkpointPath(outDir);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const fetchDate = new Date().toISOString().split('T')[0];
  const filterStr = buildFilter(fetchDate);

  console.log('\n=== BAFA Raw Snapshot Fetcher ===');
  console.log(`Snapshot : ${SNAPSHOT}`);
  console.log(`Mode     : ${MODE_FETCH ? (TEST_LIMIT ? `TEST (${TEST_LIMIT} items)` : 'FULL FETCH') : 'dry-run'}`);
  console.log(`Filter   : ${filterStr}`);
  console.log(`API      : ${API_BASE}\n`);

  // ── 1. Probe (always) ────────────────────────────────────────────────────
  console.log('Probing BAFA API (page 0, 1 item)...');
  let probeData;
  try {
    probeData = await fetchPageWithRetry(0, filterStr);
  } catch (err) {
    console.error(`Probe failed: ${err.message}`);
    process.exit(1);
  }

  const totalAvailable = probeData.total ?? 0;
  console.log(`HTTP OK — total records available: ${totalAvailable}`);
  console.log(`Page size: ${PAGE_SIZE}`);
  console.log(`Estimated pages: ${Math.ceil(totalAvailable / PAGE_SIZE)}`);

  if (!MODE_FETCH) {
    log(`dry-run: probe OK — snapshot=${SNAPSHOT} filter="${filterStr}" total=${totalAvailable}`);
    console.log(`\nDry-run complete. Use --fetch to download the full snapshot.`);
    console.log(`  node scripts/bafa/fetch-bafa-raw.mjs --snapshot ${SNAPSHOT} --fetch`);
    return;
  }

  // ── 2. Guard: no overwrite unless --force ────────────────────────────────
  const outDir = path.join(OUT_ROOT, 'raw', SNAPSHOT);
  assertInsideOutRoot(outDir);
  const outFile = path.join(outDir, 'bafa-luft-wasser.json');

  if (fs.existsSync(outFile) && !MODE_FORCE) {
    console.error(`\nSnapshot already exists: ${path.relative(REPO_ROOT, outFile)}`);
    console.error('Use --force to overwrite an existing snapshot.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const startTime = Date.now();
  const effectiveTotal = TEST_LIMIT ? Math.min(TEST_LIMIT, totalAvailable) : totalAvailable;
  const totalPages = Math.ceil(effectiveTotal / PAGE_SIZE);

  log(`fetch start: snapshot=${SNAPSHOT} filter="${filterStr.substring(0, 60)}..." total=${totalAvailable} pages=${totalPages}${TEST_LIMIT ? ` TEST_LIMIT=${TEST_LIMIT}` : ''}`);

  // ── 3. Resume from checkpoint if available ───────────────────────────────
  let items = [];
  let startPage = 0;

  const cp = loadCheckpoint(outDir);
  if (cp && cp.snapshot_id === SNAPSHOT && cp.items && cp.nextPage != null) {
    items = cp.items;
    startPage = cp.nextPage;
    console.log(`\nResuming from page ${startPage} (${items.length} items already collected)`);
  } else {
    // Page 0 was already fetched in probe — extract its items
    const firstPageItems = probeData.inhalt || [];
    items.push(...firstPageItems);
    startPage = 1;
    console.log(`\nPage 0: ${firstPageItems.length} items`);
    saveCheckpoint(outDir, { snapshot_id: SNAPSHOT, items, nextPage: 1, total: totalAvailable });
  }

  // ── 4. Paginate ──────────────────────────────────────────────────────────
  console.log(`Fetching pages ${startPage} to ${totalPages - 1}...\n`);

  for (let page = startPage; page < totalPages; page++) {
    if (TEST_LIMIT && items.length >= TEST_LIMIT) break;

    const t0 = Date.now();
    const data = await fetchPageWithRetry(page, filterStr);
    const pageItems = data.inhalt || [];
    items.push(...pageItems);

    const pct = ((items.length / effectiveTotal) * 100).toFixed(1);
    process.stdout.write(
      `  Page ${String(page).padStart(3)}/${totalPages - 1}  |  ${String(items.length).padStart(5)}/${effectiveTotal}  |  ${pct}%  |  ${Date.now() - t0}ms\n`
    );

    saveCheckpoint(outDir, { snapshot_id: SNAPSHOT, items, nextPage: page + 1, total: totalAvailable });

    if (page < totalPages - 1) await sleep(DELAY_MS);
  }

  if (TEST_LIMIT && items.length > TEST_LIMIT) items = items.slice(0, TEST_LIMIT);

  // ── 5. Build and write output ────────────────────────────────────────────
  const fetchedAt = new Date().toISOString();
  const output = {
    _meta: {
      snapshot_id: SNAPSHOT,
      source: 'BAFA Wärmepumpen Database',
      country: 'DE',
      primary_source: 'BAFA',
      api_endpoint: API_BASE,
      fetch_filter: filterStr,
      fetch_mode: 'active_snapshot',
      fetch_date: fetchDate,
      fetched_at: fetchedAt,
      record_count: items.length,
      total_available: totalAvailable,
      page_size: PAGE_SIZE,
      extraction_time_seconds: Math.round((Date.now() - startTime) / 1000),
      format: 'raw_api',
      format_note: 'Raw API response items (German field names). foerderungAb/foerderungBis are filter-only params not present in response items.',
      test_mode: TEST_LIMIT != null,
      schema_version: '2.0',
      fetch_script: 'scripts/bafa/fetch-bafa-raw.mjs',
    },
    items,
  };

  assertInsideOutRoot(outFile);
  const tmp = outFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(output, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, outFile);
  clearCheckpoint(outDir);

  const fileSizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  log(`fetch complete: snapshot=${SNAPSHOT} records=${items.length} total_available=${totalAvailable} time=${Math.round((Date.now()-startTime)/1000)}s size=${fileSizeKb}KB${TEST_LIMIT ? ' (TEST MODE)' : ''}`);

  // ── 6. Write _meta.json ──────────────────────────────────────────────────
  const metaPath = path.join(outDir, '_meta.json');
  assertInsideOutRoot(metaPath);
  const metaObj = {
    snapshot_id: SNAPSHOT,
    source: 'BAFA Wärmepumpen Database',
    country: 'DE',
    primary_source: 'BAFA',
    api_endpoint: API_BASE,
    fetch_filter: filterStr,
    fetch_mode: 'active_snapshot',
    fetched_at: fetchedAt,
    extracted_date: fetchDate,
    record_count: items.length,
    total_available: totalAvailable,
    format: 'raw_api',
    test_mode: TEST_LIMIT != null,
    complete: !TEST_LIMIT,
    fetch_script: 'scripts/bafa/fetch-bafa-raw.mjs',
  };
  fs.writeFileSync(metaPath, JSON.stringify(metaObj, null, 2) + '\n');

  // ── 7. Update manifest ───────────────────────────────────────────────────
  const manifest = loadManifest();
  if (manifest) {
    upsertSnapshotInManifest(manifest, {
      snapshot_id: SNAPSHOT,
      fetched_at: fetchedAt,
      record_count: items.length,
      total_available: totalAvailable,
      format: 'raw_api',
      test_mode: TEST_LIMIT != null,
      complete: !TEST_LIMIT,
      fetch_script: 'scripts/bafa/fetch-bafa-raw.mjs v2.0',
      parse_complete: false,
      diff_available: false,
    });
    manifest.next_recommended_step = `Parse this snapshot: node scripts/bafa/parse-bafa-raw.mjs --snapshot ${SNAPSHOT}`;
    saveManifest(manifest);
    console.log(`\nUpdated: ${path.relative(REPO_ROOT, MANIFEST_FILE)}`);
  }

  // ── 8. Summary ───────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const manufacturers = new Set(items.map(i => (i.markeHersteller || '').trim().toUpperCase())).size;
  const withR290 = items.filter(i => (i.kaeltemittel1 || '') === 'R290').length;
  const withScop = items.filter(i => i.scop != null).length;

  console.log('\n=== Fetch Complete ===');
  console.log(`  Records        : ${items.length} / ${totalAvailable}`);
  console.log(`  Manufacturers  : ${manufacturers}`);
  console.log(`  R290           : ${withR290} (${(withR290/items.length*100).toFixed(1)}%)`);
  console.log(`  With SCOP      : ${withScop} (${(withScop/items.length*100).toFixed(1)}%)`);
  console.log(`  Time           : ${elapsed}s`);
  console.log(`  Output         : ${path.relative(REPO_ROOT, outFile)}`);
  console.log(`  Size           : ${fileSizeKb} KB`);
  console.log(`\nNext: node scripts/bafa/parse-bafa-raw.mjs --snapshot ${SNAPSHOT}`);
}

main().catch(err => { console.error('\nFetch failed:', err.message); process.exit(1); });
