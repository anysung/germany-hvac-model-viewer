/**
 * build-app-products-from-master-seed.mjs  v2.0
 *
 * Generates public/data/products.json (residential) and
 * public/data/products-commercial.json (commercial) from BAFA master seed v2.
 *
 * Primary source:  data_sources/bafa/master_seed/2026-06/bafa-master-seed.json
 * Overlay source:  scraper/pricing/output/dataset-enriched-full.json
 *   – Provides: installation_type, physical specs, uuid (display-only fields only)
 *   – market_segment is derived from power_35C_kw — NOT from the overlay
 *   – This file is gitignored and must exist locally.
 *
 * Segmentation (capacity-based, v2.0 policy):
 *   power_35C_kw ≤ 20.99 kW  → residential_core  → products.json
 *   21 – 45 kW               → light_commercial   → products-commercial.json
 *   > 45 kW                  → commercial_project → products-commercial.json
 *   null / invalid           → excluded; written to segmentation-pending report
 *
 * Output field count: 65 (matching existing schema)
 * BAFA List Yes filter: bafa_list_current === true (default export only)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const MARCH_SNAPSHOT_FETCHED_AT = '2026-03-19T12:07:14.787Z';
const JUNE_SNAPSHOT_FETCHED_AT = '2026-06-19T05:17:14.627Z';
const EXPECTED_FIELD_COUNT = 65;
const PRICE_KEY_FRAGMENTS = ['price', 'brand_tier', 'price_confidence', 'package_scope', 'capacity_band', 'refrigerant_group'];

function loadJSON(relPath) {
  const abs = resolve(ROOT, relPath);
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    console.error(`Failed to load ${relPath}: ${err.message}`);
    process.exit(1);
  }
}

// ── Capacity-based segmentation (v2.0 policy) ─────────────────────────────────

function classifySegment(power_kw) {
  if (power_kw === null || power_kw === undefined || !Number.isFinite(Number(power_kw))) return null;
  const p = Number(power_kw);
  if (p <= 20.99) return 'residential_core';
  if (p <= 45)   return 'light_commercial';
  return 'commercial_project';
}

// ── Load sources ──────────────────────────────────────────────────────────────

const seed = loadJSON('data_sources/bafa/master_seed/2026-06/bafa-master-seed.json');
const enriched = loadJSON('scraper/pricing/output/dataset-enriched-full.json');
const shortNamesFile = loadJSON('scraper/pricing/manufacturer-short-names.json');
const shortNameMap = new Map(Object.entries(shortNamesFile.mapping));

// ── Build enriched-dataset lookup keyed by bafa_id ───────────────────────────

const enrichedByBafaId = new Map();
for (const item of enriched.items) {
  enrichedByBafaId.set(String(item.bafa_id), item);
}

// ── Filter to BAFA List Yes products ─────────────────────────────────────────

const bafaListYes = seed.items.filter(s => s.bafa_list_current === true);

const generatedAt = new Date().toISOString();

// ── Build a single output item (65 fields) ────────────────────────────────────

function buildItem(s) {
  const legacy = enrichedByBafaId.get(String(s.bafa_id)) ?? null;
  const pricing = legacy?._pricing ?? {};
  const phys = legacy?._physical_specs ?? {};

  return {
    // ── Identity ────────────────────────────────────────────────────────────
    bafa_id: s.bafa_id ?? null,
    uuid: legacy?.uuid ?? null,

    // ── Product info ────────────────────────────────────────────────────────
    manufacturer: s.manufacturer ?? null,
    manufacturer_normalized: s.manufacturer_normalized ?? null,
    manufacturer_short: shortNameMap.get(s.manufacturer_normalized) ?? null,
    model: s.model ?? null,
    type: s.type ?? null,

    // ── Refrigerant ─────────────────────────────────────────────────────────
    refrigerant: s.refrigerant ?? null,
    refrigerant_2: s.refrigerant_2 ?? null,
    refrigerant_amount_kg: s.refrigerant_amount_kg ?? null,
    refrigerant_2_amount_kg: s.refrigerant_2_amount_kg ?? null,

    // ── Heating performance ─────────────────────────────────────────────────
    power_35C_kw: s.power_35C_kw ?? null,
    efficiency_35C_percent: s.efficiency_35C_percent ?? null,
    power_design_35C_kw: s.power_design_35C_kw ?? null,
    power_55C_kw: s.power_55C_kw ?? null,
    efficiency_55C_percent: s.efficiency_55C_percent ?? null,
    power_design_55C_kw: s.power_design_55C_kw ?? null,

    // ── COP / SCOP / SEER ──────────────────────────────────────────────────
    cop_A7W35: s.cop_A7W35 ?? null,
    cop_A2W35: s.cop_A2W35 ?? null,
    cop_AMinus7W35: s.cop_AMinus7W35 ?? null,
    cop_A10W35: s.cop_A10W35 ?? null,
    scop: s.scop ?? null,
    seer: s.seer ?? null,

    // ── Cooling ─────────────────────────────────────────────────────────────
    cooling_efficiency: s.cooling_efficiency ?? null,
    cooling_capacity_kw: s.cooling_capacity_kw ?? null,

    // ── Noise & electrical ──────────────────────────────────────────────────
    noise_outdoor_dB: s.noise_outdoor_dB ?? null,
    noise_indoor_dB: s.noise_indoor_dB ?? null,
    max_electric_power_kw: s.max_electric_power_kw ?? null,

    // ── System ──────────────────────────────────────────────────────────────
    drive_type: s.drive_type ?? null,
    power_control: s.power_control ?? null,
    num_compressors: s.num_compressors ?? null,
    grid_ready: s.grid_ready ?? false,
    grid_ready_type: s.grid_ready_type ?? null,
    ee_display: s.ee_display ?? null,
    ee_display_type: s.ee_display_type ?? null,
    heat_meter: s.heat_meter ?? null,
    defrost_tested: s.defrost_tested ?? null,
    defrost_type: s.defrost_type ?? null,
    temp_diff: s.temp_diff ?? null,
    website: s.website ?? null,

    // ── Segmentation (capacity-derived, v2.0) ───────────────────────────────
    market_segment: classifySegment(s.power_35C_kw),
    installation_type: pricing.installation_type ?? null,  // display-only from overlay

    // ── Physical specs (overlay: enriched dataset) ──────────────────────────
    width_mm: phys.width_mm ?? null,
    height_mm: phys.height_mm ?? null,
    depth_mm: phys.depth_mm ?? null,
    weight_kg: phys.weight_kg ?? null,
    dimensions_raw: phys.dimensions_raw ?? null,
    weight_raw: phys.weight_raw ?? null,
    physical_specs_confidence: phys.physical_specs_confidence ?? null,
    physical_specs_estimated: phys.physical_specs_estimated ?? null,
    physical_specs_source_type: phys.physical_specs_source_type ?? null,
    physical_specs_source_note: phys.physical_specs_source_note ?? null,
    physical_specs_match_type: phys.physical_specs_match_type ?? null,
    physical_specs_family: phys.physical_specs_family ?? null,
    physical_specs_quarantined: phys.physical_specs_quarantined ?? null,
    physical_specs_quarantine_reason: phys.physical_specs_quarantine_reason ?? null,
    physical_specs_last_checked_at: phys.physical_specs_last_checked_at ?? null,

    // ── Provenance ──────────────────────────────────────────────────────────
    source_id: String(s.bafa_id),
    country: 'DE',
    primary_source: 'BAFA',
    bafa_listing_status: 'listed_in_snapshot',
    bafa_foerderung_von: null,
    bafa_foerderung_bis: null,
    bafa_snapshot_fetched_at: s.seen_in_reference_baseline
      ? MARCH_SNAPSHOT_FETCHED_AT
      : JUNE_SNAPSHOT_FETCHED_AT,
    source_snapshot_generated_at: generatedAt,
  };
}

// ── Build all output items ────────────────────────────────────────────────────

const allItems = bafaListYes.map(buildItem);

// ── Validate ──────────────────────────────────────────────────────────────────

const fieldCount = Object.keys(allItems[0]).length;
if (fieldCount !== EXPECTED_FIELD_COUNT) {
  console.error(`Field count mismatch: expected ${EXPECTED_FIELD_COUNT}, got ${fieldCount}`);
  console.error('Fields:', Object.keys(allItems[0]).join(', '));
  process.exit(1);
}

const priceKeysFound = Object.keys(allItems[0]).filter(k =>
  PRICE_KEY_FRAGMENTS.some(frag => k.includes(frag))
);
if (priceKeysFound.length > 0) {
  console.error('FAIL: price-like keys present:', priceKeysFound.join(', '));
  process.exit(1);
}

const missingProvenance = allItems.filter(i =>
  !i.bafa_id || !i.source_id || !i.country || !i.primary_source || !i.bafa_snapshot_fetched_at
);
if (missingProvenance.length > 0) {
  console.error(`FAIL: ${missingProvenance.length} items missing required provenance`);
  process.exit(1);
}

// ── Split by capacity-derived segment ────────────────────────────────────────

const residential = allItems.filter(i => i.market_segment === 'residential_core');
const commercial  = allItems.filter(i => i.market_segment === 'light_commercial' || i.market_segment === 'commercial_project');
const pending     = allItems.filter(i => i.market_segment === null);

// ── Write output ──────────────────────────────────────────────────────────────

function writeOutput(relPath, items, dataset, segmentsIncluded) {
  const payload = {
    _meta: {
      generated: generatedAt,
      generator: 'build-app-products-from-master-seed.mjs v2.0',
      dataset,
      description: 'BAFA master seed v2 export. Segmentation: capacity-based (power_35C_kw). Overlay source: dataset-enriched-full.json for installation_type, physical specs, uuid.',
      total_items: items.length,
      primary_source: 'data_sources/bafa/master_seed/2026-06/bafa-master-seed.json',
      overlay_source: 'scraper/pricing/output/dataset-enriched-full.json',
      segments_included: segmentsIncluded,
      segmentation_policy: 'capacity_v2: ≤20.99kW=residential_core, 21-45kW=light_commercial, >45kW=commercial_project',
      bafa_list_yes_total: bafaListYes.length,
      bafa_snapshot_march_fetched_at: MARCH_SNAPSHOT_FETCHED_AT,
      bafa_snapshot_june_fetched_at: JUNE_SNAPSHOT_FETCHED_AT,
    },
    items,
  };
  writeFileSync(resolve(ROOT, relPath), JSON.stringify(payload));
  console.log(`Wrote ${items.length} items → ${relPath}`);
}

writeOutput('public/data/products.json', residential, 'residential', ['residential_core']);
writeOutput('public/data/products-commercial.json', commercial, 'commercial', ['light_commercial', 'commercial_project']);

// ── Write pending report (null power_35C_kw) ─────────────────────────────────

if (pending.length > 0) {
  const pendingDir = resolve(ROOT, 'data_sources/bafa/segmentation-pending');
  mkdirSync(pendingDir, { recursive: true });
  const pendingReport = {
    _meta: {
      generated: generatedAt,
      description: 'BAFA List Yes products excluded from app export due to null or invalid power_35C_kw. These cannot be capacity-classified and require manual review.',
      total_excluded: pending.length,
      policy: 'Capacity-only segmentation v2.0: power_35C_kw is required for segment assignment.',
    },
    items: pending.map(i => ({
      source_id: i.source_id,
      bafa_id: i.bafa_id,
      manufacturer: i.manufacturer,
      model: i.model,
      power_35C_kw: i.power_35C_kw,
      bafa_list_current: true,
      reason: 'power_35C_kw is null or non-numeric',
    })),
  };
  const pendingPath = resolve(pendingDir, '2026-06-capacity-missing.json');
  writeFileSync(pendingPath, JSON.stringify(pendingReport, null, 2));
  console.log(`Wrote ${pending.length} pending items → data_sources/bafa/segmentation-pending/2026-06-capacity-missing.json`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const withOverlay = allItems.filter(i => enrichedByBafaId.has(String(i.bafa_id))).length;
const withoutOverlay = allItems.length - withOverlay;
const lightCommercial = commercial.filter(i => i.market_segment === 'light_commercial').length;
const commProject = commercial.filter(i => i.market_segment === 'commercial_project').length;

console.log('');
console.log('── Build summary ──────────────────────────────────────────');
console.log(`BAFA List Yes:        ${bafaListYes.length}`);
console.log(`  with enriched overlay:  ${withOverlay}`);
console.log(`  no overlay (new 2026-06): ${withoutOverlay}`);
console.log(`Segmentation (capacity-based, v2.0):`);
console.log(`  Residential (≤20.99 kW):  ${residential.length}  → products.json`);
console.log(`  Light Commercial (21-45):  ${lightCommercial}`);
console.log(`  Commercial Project (>45):  ${commProject}`);
console.log(`  Commercial total:          ${commercial.length}  → products-commercial.json`);
console.log(`  Pending (null capacity):   ${pending.length}  → segmentation-pending report`);
console.log(`Field count:          ${fieldCount} ✓`);
console.log(`No price keys:        ✓`);
console.log(`Provenance complete:  ✓`);
console.log('──────────────────────────────────────────────────────────');
