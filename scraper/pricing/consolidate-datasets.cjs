#!/usr/bin/env node
/**
 * consolidate-datasets.cjs v2.0
 *
 * Consolidates all product-model data into two final active files:
 *   1. product-residential.json  — residential_core items (app-facing)
 *   2. product-commercial.json   — light_commercial + commercial_project items
 *
 * Source: dataset-enriched-full.json (most complete: BAFA + pricing + physical specs)
 * Mapping: manufacturer-short-names.json (display names)
 *
 * Safety-checked field list — all meaningful fields preserved including:
 *   - package_scope_confidence (was missing in v1)
 *   - review_flags (was missing in v1)
 *   - physical_specs_last_checked_at (was missing in v1)
 *   - physical_specs_quarantine_reason (was missing in v1)
 *
 * Legacy _enrichment (all 6 sub-fields are null across 6514 items) is dropped.
 * Nested _pricing and _physical_specs are flattened to top-level.
 * Internal market_segment values preserved: residential_core, light_commercial, commercial_project.
 */

const fs = require('fs');
const path = require('path');

// --- Paths ---
const ENRICHED_FULL = path.join(__dirname, 'output', 'dataset-enriched-full.json');
const SHORT_NAMES   = path.join(__dirname, 'manufacturer-short-names.json');
const BAFA_RAW      = path.join(__dirname, '..', 'bafa-luft-wasser.json');
const OUTPUT_DIR    = path.join(__dirname, 'output');
const PUBLIC_DIR    = path.join(__dirname, '..', '..', 'public', 'data');

// --- Load sources ---
console.log('Loading dataset-enriched-full.json...');
const enrichedFull = JSON.parse(fs.readFileSync(ENRICHED_FULL, 'utf-8'));
const shortNames   = JSON.parse(fs.readFileSync(SHORT_NAMES, 'utf-8')).mapping;

// --- BAFA snapshot provenance metadata ---
// Read extracted_at from the raw BAFA scraper output so each product record
// carries the timestamp of when BAFA API was actually queried.
let bafaMetaExtractedAt = null;
if (fs.existsSync(BAFA_RAW)) {
  try {
    const bafaRaw = JSON.parse(fs.readFileSync(BAFA_RAW, 'utf-8'));
    bafaMetaExtractedAt = bafaRaw._meta?.extracted_at ?? null;
    console.log(`  BAFA snapshot fetched_at: ${bafaMetaExtractedAt}`);
  } catch (_) {
    console.log('  BAFA snapshot fetched_at: could not read (bafa-luft-wasser.json parse error)');
  }
} else {
  console.log('  BAFA snapshot fetched_at: not available (bafa-luft-wasser.json missing)');
}

// --- Consolidation run timestamp (set once, propagated to every output record) ---
const now = new Date().toISOString();

console.log(`  Total items: ${enrichedFull.items.length}`);

// --- Complete standard field order (safety-checked) ---
const STANDARD_FIELDS = [
  // ── Identity ──
  'bafa_id', 'uuid',
  'manufacturer', 'manufacturer_normalized', 'manufacturer_short',
  'model', 'type',

  // ── Refrigerant ──
  'refrigerant', 'refrigerant_2',
  'refrigerant_amount_kg', 'refrigerant_2_amount_kg',

  // ── Performance ──
  'power_35C_kw', 'efficiency_35C_percent', 'power_design_35C_kw',
  'power_55C_kw', 'efficiency_55C_percent', 'power_design_55C_kw',
  'cop_A7W35', 'cop_A2W35', 'cop_AMinus7W35', 'cop_A10W35',
  'scop', 'seer', 'cooling_efficiency', 'cooling_capacity_kw',

  // ── Noise & Electrical ──
  'noise_outdoor_dB', 'noise_indoor_dB', 'max_electric_power_kw',

  // ── System ──
  'drive_type', 'power_control', 'num_compressors',
  'grid_ready', 'grid_ready_type',
  'ee_display', 'ee_display_type',
  'heat_meter', 'defrost_tested', 'defrost_type', 'temp_diff',
  'website',

  // ── Segmentation (kept for commercial/residential split) ──
  'market_segment', 'installation_type',

  // ── Physical Specs ──
  'width_mm', 'height_mm', 'depth_mm', 'weight_kg',
  'dimensions_raw', 'weight_raw',
  'physical_specs_confidence', 'physical_specs_estimated',
  'physical_specs_source_type', 'physical_specs_source_note',
  'physical_specs_match_type', 'physical_specs_family',
  'physical_specs_quarantined', 'physical_specs_quarantine_reason',  // <-- reason was missing in v1
  'physical_specs_last_checked_at',                                   // <-- was missing in v1

  // ── Source Provenance (Phase 1) ──
  // These fields make each product record self-describing about its origin.
  // source_id / country / primary_source: multi-country identity fields.
  // bafa_listing_status: 'listed_in_snapshot' for all current BAFA records;
  //   future values ('not_in_latest_snapshot', 'funding_period_ended', 'relisted')
  //   are reserved for Phase 2 delisting/diff tracking.
  // bafa_foerderung_von / bafa_foerderung_bis: BAFA funding period dates,
  //   preserved for reference only — NOT a claim of current subsidy eligibility.
  // bafa_snapshot_fetched_at: when the BAFA API was queried (from scraper _meta).
  // source_snapshot_generated_at: when this pipeline consolidation run completed.
  'source_id',
  'country',
  'primary_source',
  'bafa_listing_status',
  'bafa_foerderung_von',
  'bafa_foerderung_bis',
  'bafa_snapshot_fetched_at',
  'source_snapshot_generated_at',
];

/**
 * Flatten a single enriched-full item into the standard schema.
 * Merges _pricing and _physical_specs to top-level, drops _enrichment.
 */
function flattenItem(src) {
  const pricing   = src._pricing || {};
  const physSpecs = src._physical_specs || {};

  const out = {};
  for (const field of STANDARD_FIELDS) {
    // Special: review_flags comes from _pricing._review_flags
    if (field === 'review_flags') {
      out[field] = pricing._review_flags || [];
      continue;
    }

    // Priority: top-level scalar > _pricing > _physical_specs
    if (field in src) {
      const val = src[field];
      // Skip nested containers (but keep null, booleans, arrays, strings, numbers)
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        // This is a nested object like _enrichment — skip
      } else {
        out[field] = val;
        continue;
      }
    }

    if (field in pricing) {
      out[field] = pricing[field];
    } else if (field in physSpecs) {
      out[field] = physSpecs[field];
    } else {
      out[field] = null;
    }
  }

  // Add manufacturer_short from mapping
  const norm = src.manufacturer_normalized;
  out.manufacturer_short = shortNames[norm] || src.manufacturer_short || src.manufacturer;

  // ── Source provenance injection (Phase 1) ──
  // The loop above sets these to null when absent from enrichedFull items
  // (which were generated before Phase 1). Override with correct values.
  // When future scraper runs populate source_id/country/primary_source/
  // bafa_listing_status on individual items, those values will be picked up
  // by the loop above and these fallbacks will not override them (null ?? x = x,
  // but a real value ?? x = real value because ?? only replaces null/undefined).
  out.source_id            = out.source_id           ?? src.bafa_id ?? null;
  out.country              = out.country              ?? 'DE';
  out.primary_source       = out.primary_source       ?? 'BAFA';
  out.bafa_listing_status  = out.bafa_listing_status  ?? 'listed_in_snapshot';
  // bafa_foerderung_von/bis: null for records generated before Phase 1 scraper
  // update; will be populated from BAFA API in future scraper runs.
  out.bafa_foerderung_von  = out.bafa_foerderung_von  ?? null;
  out.bafa_foerderung_bis  = out.bafa_foerderung_bis  ?? null;
  out.bafa_snapshot_fetched_at     = bafaMetaExtractedAt ?? null;
  out.source_snapshot_generated_at = now;

  return out;
}

// --- Flatten all items ---
console.log('Flattening items...');
const allFlat = enrichedFull.items.map(flattenItem);

// --- Split by segment (preserving original segment values) ---
const residential       = allFlat.filter(i => i.market_segment === 'residential_core');
const lightCommercial   = allFlat.filter(i => i.market_segment === 'light_commercial');
const commercialProject = allFlat.filter(i => i.market_segment === 'commercial_project');
const commercial        = [...lightCommercial, ...commercialProject];

console.log(`  Residential (residential_core): ${residential.length}`);
console.log(`  Light commercial: ${lightCommercial.length}`);
console.log(`  Commercial project: ${commercialProject.length}`);
console.log(`  Total commercial: ${commercial.length}`);
console.log(`  Grand total: ${residential.length + commercial.length}`);

if (residential.length + commercial.length !== enrichedFull.items.length) {
  console.error('FATAL: Item count mismatch after segment split!');
  process.exit(1);
}

// --- Residential: suppress quarantined physical specs for DISPLAY values only ---
// Internal metadata (quarantined flag, reason, confidence, family, etc.) is preserved.
const DISPLAY_PHYS_FIELDS = ['width_mm', 'height_mm', 'depth_mm', 'weight_kg'];
let suppressed = 0;
for (const item of residential) {
  if (item.physical_specs_quarantined) {
    for (const f of DISPLAY_PHYS_FIELDS) {
      item[f] = null;
    }
    suppressed++;
  }
}
console.log(`  Residential display-suppressed (quarantined): ${suppressed}`);

// --- Build output files ---
const residentialOutput = {
  _meta: {
    generated: now,
    generator: 'consolidate-datasets.cjs v2.1',
    dataset: 'residential',
    description: 'Final consolidated residential product dataset. All BAFA, pricing, and physical spec fields flattened to top-level. Quarantined physical specs have display values (width/height/depth/weight) nulled but metadata preserved. Phase 1: source provenance fields added.',
    total_items: residential.length,
    source: 'dataset-enriched-full.json',
    field_standard: 'See product-model-standard.json',
    segments_included: ['residential_core'],
    bafa_snapshot_fetched_at: bafaMetaExtractedAt,
    physical_specs_coverage: {
      with_dimensions: residential.filter(i => i.width_mm !== null).length,
      with_weight: residential.filter(i => i.weight_kg !== null).length,
      quarantined_display_suppressed: suppressed,
    },
  },
  items: residential,
};

const commercialOutput = {
  _meta: {
    generated: now,
    generator: 'consolidate-datasets.cjs v2.1',
    dataset: 'commercial',
    description: 'Final consolidated commercial product dataset. Includes light_commercial and commercial_project segments. Internal market_segment values preserved. Commercial N/A items have null prices. Phase 1: source provenance fields added.',
    total_items: commercial.length,
    source: 'dataset-enriched-full.json',
    field_standard: 'See product-model-standard.json',
    segments_included: ['light_commercial', 'commercial_project'],
    bafa_snapshot_fetched_at: bafaMetaExtractedAt,
    segment_breakdown: {
      light_commercial: lightCommercial.length,
      commercial_project: commercialProject.length,
    },
  },
  items: commercial,
};

// --- Write files ---
const resPath = path.join(OUTPUT_DIR, 'product-residential.json');
const comPath = path.join(OUTPUT_DIR, 'product-commercial.json');
const appPath = path.join(PUBLIC_DIR, 'products.json');

fs.writeFileSync(resPath, JSON.stringify(residentialOutput, null, 2) + '\n', 'utf-8');
console.log(`\nSaved: ${path.relative(process.cwd(), resPath)} (${residential.length} items)`);

fs.writeFileSync(comPath, JSON.stringify(commercialOutput, null, 2) + '\n', 'utf-8');
console.log(`Saved: ${path.relative(process.cwd(), comPath)} (${commercial.length} items)`);

// Write app-facing residential copy
fs.writeFileSync(appPath, JSON.stringify(residentialOutput, null, 2) + '\n', 'utf-8');
console.log(`Saved: ${path.relative(process.cwd(), appPath)} (app copy, ${residential.length} items)`);

// Write app-facing commercial copy
const appComPath = path.join(PUBLIC_DIR, 'products-commercial.json');
fs.writeFileSync(appComPath, JSON.stringify(commercialOutput, null, 2) + '\n', 'utf-8');
console.log(`Saved: ${path.relative(process.cwd(), appComPath)} (app copy, ${commercial.length} items)`);

// ========================================================
// VALIDATION
// ========================================================
console.log('\n========== VALIDATION ==========\n');
let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) { console.log(`  [PASS] ${label}`); pass++; }
  else           { console.log(`  [FAIL] ${label}`); fail++; }
}

// 1. Item counts
check('Residential count = 4387', residential.length === 4387);
check('Commercial count = 2127', commercial.length === 2127);
check('Total = 6514', residential.length + commercial.length === 6514);

// 2. Segment values preserved
const resSegs = [...new Set(residential.map(i => i.market_segment))];
const comSegs = [...new Set(commercial.map(i => i.market_segment))].sort();
check('Residential segments = [residential_core]', resSegs.length === 1 && resSegs[0] === 'residential_core');
check('Commercial segments = [commercial_project, light_commercial]',
  comSegs.length === 2 && comSegs[0] === 'commercial_project' && comSegs[1] === 'light_commercial');

// 3. All bafa_ids preserved
const origIds = new Set(enrichedFull.items.map(i => i.bafa_id));
const finalIds = new Set([...residential.map(i => i.bafa_id), ...commercial.map(i => i.bafa_id)]);
const missingIds = [...origIds].filter(id => !finalIds.has(id));
check(`All bafa_ids preserved (missing: ${missingIds.length})`, missingIds.length === 0);

// 4. No duplicate bafa_ids across files
const allIds = [...residential.map(i => i.bafa_id), ...commercial.map(i => i.bafa_id)];
check('No duplicate bafa_ids', allIds.length === new Set(allIds).size);

// 5. Field count
const expectedFieldCount = STANDARD_FIELDS.length;
const actualResFields = Object.keys(residential[0]).length;
const actualComFields = Object.keys(commercial[0]).length;
check(`Residential field count = ${expectedFieldCount} (got ${actualResFields})`, actualResFields === expectedFieldCount);
check(`Commercial field count = ${expectedFieldCount} (got ${actualComFields})`, actualComFields === expectedFieldCount);

// 6. No nested objects remain
const hasNested = allFlat.some(i => '_enrichment' in i || '_pricing' in i || '_physical_specs' in i);
check('No nested _enrichment/_pricing/_physical_specs containers', !hasNested);

// 7. Manufacturer fields
check('All items have manufacturer', allFlat.every(i => i.manufacturer));
check('All items have manufacturer_normalized', allFlat.every(i => i.manufacturer_normalized));
check('All items have manufacturer_short', allFlat.every(i => i.manufacturer_short));

// 8. Physical specs internal metadata preserved even when display nulled
const quarantinedRes = residential.filter(i => i.physical_specs_quarantined);
if (quarantinedRes.length > 0) {
  const sample = quarantinedRes[0];
  check('Quarantined item: display width_mm = null', sample.width_mm === null);
  check('Quarantined item: metadata quarantined = true', sample.physical_specs_quarantined === true);
  check('Quarantined item: metadata family preserved', sample.physical_specs_family !== undefined);
  check('Quarantined item: quarantine_reason preserved', sample.physical_specs_quarantine_reason !== undefined);
}

// 9. Cross-check: BAFA source fields preserved
const srcItem = enrichedFull.items[0];
const srcTopLevel = Object.keys(srcItem).filter(k => !['_enrichment', '_pricing', '_physical_specs'].includes(k));
const srcPhysSpecs = Object.keys(srcItem._physical_specs || {});

// Check all source top-level BAFA fields are in output (pricing fields were intentionally removed)
const flatItem = allFlat[0];
const INTENTIONALLY_EXCLUDED = new Set([
  'manufacturer_short',
  // Pricing engine fields — intentionally removed
  'market_segment', // included via _pricing; present in output as segmentation field
]);
const missingTop = srcTopLevel.filter(f => !(f in flatItem) && !INTENTIONALLY_EXCLUDED.has(f));
check(`All source top-level BAFA fields mapped (missing: ${missingTop.join(',') || 'none'})`, missingTop.length === 0);

// Check all _physical_specs fields are in output
const missingPhys = srcPhysSpecs.filter(f => !(f in flatItem));
check(`All _physical_specs fields mapped (missing: ${missingPhys.join(',') || 'none'})`, missingPhys.length === 0);

// _enrichment and _pricing price fields intentionally dropped
const enrichmentHasData = enrichedFull.items.some(i => {
  const e = i._enrichment;
  return e && Object.values(e).some(v => v !== null);
});
check('_enrichment safely dropped (all values null)', !enrichmentHasData);

console.log(`\n  Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('\n  CONSOLIDATION HAS FAILURES — review before proceeding.');
  process.exit(1);
}
console.log('\n  All validations passed. Consolidation complete.');
