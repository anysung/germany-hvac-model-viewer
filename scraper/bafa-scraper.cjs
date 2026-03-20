/**
 * BAFA Wärmepumpen Full Extractor
 *
 * Extracts all "Luft / Wasser" heat pump entries from the official BAFA database
 * via the public REST API (no browser needed).
 *
 * API: GET https://elan1.bafa.bund.de/zvi-api/wep/waermepumpen
 *   - Max page size: 100
 *   - Filter syntax: field==value; field=op="value"
 *   - Pagination: seite (0-based page), anzahl (page size)
 *
 * Features:
 *   - Resumable: saves progress after each page to a checkpoint file
 *   - Rate-limited: configurable delay between requests
 *   - Full output: single JSON file with metadata + items
 *
 * Usage:
 *   node scraper/bafa-scraper.cjs              # full extraction
 *   node scraper/bafa-scraper.cjs --resume     # resume interrupted run
 *   node scraper/bafa-scraper.cjs --test 20    # test with N items
 */
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const API_BASE = 'https://elan1.bafa.bund.de/zvi-api/wep/waermepumpen';
const PAGE_SIZE = 100;
const DELAY_MS = 300; // ms between API requests (be polite)
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

const OUT_DIR = path.join(__dirname);
const OUTPUT_FILE = path.join(OUT_DIR, 'bafa-luft-wasser.json');
const CHECKPOINT_FILE = path.join(OUT_DIR, '.bafa-checkpoint.json');

// --- CLI args ---
const args = process.argv.slice(2);
const isResume = args.includes('--resume');
const testIdx = args.indexOf('--test');
const testLimit = testIdx !== -1 ? parseInt(args[testIdx + 1], 10) || 20 : null;

// --- Data cleaning ---

const PUMPENTYP_MAP = {
  LUFT_WASSER: 'Luft / Wasser',
  SOLE_WASSER: 'Sole / Wasser',
  WASSER_WASSER: 'Wasser / Wasser',
  SORPTIONS: 'Sorption',
};

function toNum(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function cleanItem(raw) {
  const mfr = (raw.markeHersteller || '').trim();
  const model = (raw.geraetebezeichnung || '').trim();

  return {
    // --- Core identifiers ---
    bafa_id: raw.anlagennummer || null,
    uuid: raw.uuid || null,

    // --- Product info ---
    manufacturer: mfr || null,
    manufacturer_normalized: mfr.toUpperCase().replace(/\s+/g, ' ') || null,
    model: model || null,
    type: PUMPENTYP_MAP[raw.pumpentyp] || raw.pumpentyp || null,
    refrigerant: raw.kaeltemittel1 || null,
    refrigerant_2: raw.kaeltemittel2 || null,

    // --- Performance @ 35°C ---
    power_35C_kw: toNum(raw.heizleistungPrated35C),
    efficiency_35C_percent: toNum(raw.etas35C),
    power_design_35C_kw: toNum(raw.heizleistungPdesignh35C),

    // --- Performance @ 55°C ---
    power_55C_kw: toNum(raw.heizleistungPrated55C),
    efficiency_55C_percent: toNum(raw.etas55C),
    power_design_55C_kw: toNum(raw.heizleistungPdesignh55C),

    // --- COP values ---
    cop_A7W35: toNum(raw.copBeiA7W35),
    cop_A2W35: toNum(raw.copBeiA2W35B0W35W10W35),
    cop_AMinus7W35: toNum(raw.copBeiAMinus7W35),
    cop_A10W35: toNum(raw.copBeiA10W35),
    scop: toNum(raw.scop),

    // --- Cooling ---
    seer: toNum(raw.seer),
    cooling_efficiency: toNum(raw.effizienzKuehlen),
    cooling_capacity_kw: toNum(raw.kuehlleistung),

    // --- Noise ---
    noise_outdoor_dB: toNum(raw.schallemissionAussen),
    noise_indoor_dB: toNum(raw.schallemissionInnen),

    // --- Electrical ---
    max_electric_power_kw: toNum(raw.maxElektrischeLeistungsaufnahme),
    drive_type: raw.antriebsart || null,
    power_control: raw.leistungsregelungArt || null,
    num_compressors: toNum(raw.anzahlVerdichter),

    // --- Refrigerant quantities ---
    refrigerant_amount_kg: toNum(raw.mengeKaeltemittel1),
    refrigerant_2_amount_kg: toNum(raw.mengeKaeltemittel2),

    // --- Grid & compliance ---
    grid_ready: raw.netzdienlichkeit === 'JA',
    grid_ready_type: raw.netzdienlichkeitArt || null,
    ee_display: raw.eeAnzeige === 'JA',
    ee_display_type: raw.artEeAnzeige || null,
    heat_meter: raw.waermemengenzaehler || null,

    // --- Defrost ---
    defrost_tested: raw.abtauungGeprueft === 'JA',
    defrost_type: raw.abtauungArt || null,
    temp_diff: toNum(raw.temperaturdifferenz),

    // --- Metadata ---
    website: raw.webseite || null,

    // --- Enrichment placeholders (filled later, not from BAFA) ---
    _enrichment: {
      price_eur: null,
      dimensions: null,
      weight_kg: null,
      indoor_outdoor: null,
      matched_app_id: null,
      notes: null,
    },
  };
}

// --- API fetching ---

async function fetchPage(pageNum, filterStr) {
  const url = `${API_BASE}?filter=${encodeURIComponent(filterStr)}&seite=${pageNum}&anzahl=${PAGE_SIZE}&sortierung=${encodeURIComponent('markeHersteller,asc;uuid,asc')}`;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS) throw err;
      console.log(`      Retry ${attempt}/${RETRY_ATTEMPTS} after error: ${err.message}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Checkpoint management ---

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data), 'utf-8');
}

function clearCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// --- Main ---

async function extract() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];

  const filterStr = [
    `foerderungAb=le="${today}"`,
    `foerderungBis=ge="${today}"`,
    'einzelabnahme==false',
    'pumpentyp==LUFT_WASSER',
  ].join(';');

  console.log('=== BAFA Wärmepumpen Full Extractor ===');
  console.log(`Date: ${today}`);
  console.log(`Mode: ${testLimit ? `TEST (${testLimit} items)` : 'FULL'}`);
  console.log(`Output: ${OUTPUT_FILE}\n`);

  // Load checkpoint if resuming
  let items = [];
  let startPage = 0;
  let totalExpected = null;

  if (isResume) {
    const cp = loadCheckpoint();
    if (cp && cp.items && cp.nextPage != null) {
      items = cp.items;
      startPage = cp.nextPage;
      totalExpected = cp.total;
      console.log(`Resuming from page ${startPage} (${items.length} items already collected)\n`);
    } else {
      console.log('No valid checkpoint found. Starting fresh.\n');
    }
  }

  // Fetch first page to get total count
  if (totalExpected == null) {
    console.log('[1] Fetching page 0 to get total count...');
    const firstPage = await fetchPage(0, filterStr);
    totalExpected = firstPage.total;
    const pageItems = firstPage.inhalt.map(cleanItem);
    items.push(...pageItems);
    startPage = 1;
    console.log(`    Total "Luft / Wasser" entries: ${totalExpected}`);
    console.log(`    Page 0: ${pageItems.length} items\n`);
    saveCheckpoint({ items, nextPage: 1, total: totalExpected });
  }

  const effectiveTotal = testLimit ? Math.min(testLimit, totalExpected) : totalExpected;
  const totalPages = Math.ceil(effectiveTotal / PAGE_SIZE);

  console.log(`[2] Fetching remaining pages (${startPage} to ${totalPages - 1})...\n`);

  for (let page = startPage; page < totalPages; page++) {
    if (testLimit && items.length >= testLimit) break;

    const t0 = Date.now();
    const data = await fetchPage(page, filterStr);
    const pageItems = data.inhalt.map(cleanItem);
    items.push(...pageItems);

    const elapsed = Date.now() - t0;
    const pct = ((items.length / effectiveTotal) * 100).toFixed(1);
    process.stdout.write(
      `    Page ${String(page).padStart(3)}/${totalPages - 1}  |  ${String(items.length).padStart(5)}/${effectiveTotal} items  |  ${pct}%  |  ${elapsed}ms\n`
    );

    // Save checkpoint after every page
    saveCheckpoint({ items, nextPage: page + 1, total: totalExpected });

    // Rate limit
    if (page < totalPages - 1) await sleep(DELAY_MS);
  }

  // Trim to limit if test mode
  if (testLimit && items.length > testLimit) {
    items = items.slice(0, testLimit);
  }

  // Build output
  const output = {
    _meta: {
      source: 'BAFA Wärmepumpen Database',
      source_url: 'https://elan1.bafa.bund.de/zvi-ui/wep/waermepumpen',
      api_endpoint: API_BASE,
      filter: 'pumpentyp==LUFT_WASSER',
      extracted_at: new Date().toISOString(),
      extracted_date: today,
      total_available: totalExpected,
      total_extracted: items.length,
      extraction_time_seconds: Math.round((Date.now() - startTime) / 1000),
      schema_version: '1.0',
    },
    items,
  };

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  clearCheckpoint();

  // Stats
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const manufacturers = new Set(items.map((i) => i.manufacturer_normalized)).size;
  const withR290 = items.filter((i) => i.refrigerant === 'R290').length;
  const with55C = items.filter((i) => i.power_55C_kw != null).length;

  console.log('\n=== Extraction Complete ===');
  console.log(`  Items extracted: ${items.length} / ${totalExpected}`);
  console.log(`  Unique manufacturers: ${manufacturers}`);
  console.log(`  R290 refrigerant: ${withR290} (${((withR290 / items.length) * 100).toFixed(1)}%)`);
  console.log(`  With 55°C data: ${with55C} (${((with55C / items.length) * 100).toFixed(1)}%)`);
  console.log(`  Time: ${elapsed}s`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)} MB`);
}

extract().catch((err) => {
  console.error('\nExtraction failed:', err.message);
  console.error('Run with --resume to continue from last checkpoint.');
  process.exit(1);
});
