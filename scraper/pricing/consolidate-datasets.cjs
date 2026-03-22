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
const OUTPUT_DIR    = path.join(__dirname, 'output');
const PUBLIC_DIR    = path.join(__dirname, '..', '..', 'public', 'data');

// --- Load sources ---
console.log('Loading dataset-enriched-full.json...');
const enrichedFull = JSON.parse(fs.readFileSync(ENRICHED_FULL, 'utf-8'));
const shortNames   = JSON.parse(fs.readFileSync(SHORT_NAMES, 'utf-8')).mapping;

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

  // ── Pricing (raw engine output) ──
  'equipment_price_low_eur', 'equipment_price_typical_eur', 'equipment_price_high_eur',
  // ── Pricing (user-facing display: ±15% band around reference price, rounded to €50) ──
  'equipment_price_display_eur', 'equipment_price_display_low_eur', 'equipment_price_display_high_eur',
  'price_basis', 'price_confidence', 'brand_tier',
  'market_segment', 'residential_visibility_default', 'segment_confidence',
  'package_scope', 'package_scope_confidence',   // <-- was missing in v1
  'capacity_band', 'refrigerant_group', 'installation_type',
  'review_flags',                                 // <-- was missing in v1 (renamed from _review_flags)

  // ── Physical Specs ──
  'width_mm', 'height_mm', 'depth_mm', 'weight_kg',
  'dimensions_raw', 'weight_raw',
  'physical_specs_confidence', 'physical_specs_estimated',
  'physical_specs_source_type', 'physical_specs_source_note',
  'physical_specs_match_type', 'physical_specs_family',
  'physical_specs_quarantined', 'physical_specs_quarantine_reason',  // <-- reason was missing in v1
  'physical_specs_last_checked_at',                                   // <-- was missing in v1
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

  // ── Compute user-facing display price fields (±15% band around reference) ──
  // Reference = typical price; fallback = midpoint of low+high
  let ref = out.equipment_price_typical_eur;
  if (ref == null && out.equipment_price_low_eur != null && out.equipment_price_high_eur != null) {
    ref = Math.round((out.equipment_price_low_eur + out.equipment_price_high_eur) / 2);
  }
  if (ref != null) {
    out.equipment_price_display_eur      = ref;
    out.equipment_price_display_low_eur  = Math.round((ref * 0.85) / 50) * 50;
    out.equipment_price_display_high_eur = Math.round((ref * 1.15) / 50) * 50;
  } else {
    out.equipment_price_display_eur      = null;
    out.equipment_price_display_low_eur  = null;
    out.equipment_price_display_high_eur = null;
  }

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
const now = new Date().toISOString();

const residentialOutput = {
  _meta: {
    generated: now,
    generator: 'consolidate-datasets.cjs v2.0',
    dataset: 'residential',
    description: 'Final consolidated residential product dataset. All BAFA, pricing, and physical spec fields flattened to top-level. Quarantined physical specs have display values (width/height/depth/weight) nulled but metadata preserved.',
    total_items: residential.length,
    source: 'dataset-enriched-full.json',
    field_standard: 'See product-model-standard.json',
    segments_included: ['residential_core'],
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
    generator: 'consolidate-datasets.cjs v2.0',
    dataset: 'commercial',
    description: 'Final consolidated commercial product dataset. Includes light_commercial and commercial_project segments. Internal market_segment values preserved. Commercial N/A items have null prices.',
    total_items: commercial.length,
    source: 'dataset-enriched-full.json',
    field_standard: 'See product-model-standard.json',
    segments_included: ['light_commercial', 'commercial_project'],
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

// Also write the app-facing copy (identical to product-residential.json)
fs.writeFileSync(appPath, JSON.stringify(residentialOutput, null, 2) + '\n', 'utf-8');
console.log(`Saved: ${path.relative(process.cwd(), appPath)} (app copy, ${residential.length} items)`);

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

// 8. Safety-check fields present (the 4 that were missing in v1)
check('package_scope_confidence present', residential[0].package_scope_confidence !== undefined);
check('review_flags present', Array.isArray(residential[0].review_flags));
check('physical_specs_last_checked_at present', residential[0].physical_specs_last_checked_at !== undefined);
check('physical_specs_quarantine_reason present', 'physical_specs_quarantine_reason' in residential[0]);

// 9. Pricing fields populated for residential
const resPriced = residential.filter(i => i.equipment_price_typical_eur !== null).length;
check(`Residential pricing coverage > 0 (${resPriced})`, resPriced > 0);

// 10. Physical specs internal metadata preserved even when display nulled
const quarantinedRes = residential.filter(i => i.physical_specs_quarantined);
if (quarantinedRes.length > 0) {
  const sample = quarantinedRes[0];
  check('Quarantined item: display width_mm = null', sample.width_mm === null);
  check('Quarantined item: metadata quarantined = true', sample.physical_specs_quarantined === true);
  check('Quarantined item: metadata family preserved', sample.physical_specs_family !== undefined);
  check('Quarantined item: quarantine_reason preserved', sample.physical_specs_quarantine_reason !== undefined);
}

// 11. Cross-check: all source fields accounted for
const srcItem = enrichedFull.items[0];
const srcTopLevel = Object.keys(srcItem).filter(k => !['_enrichment', '_pricing', '_physical_specs'].includes(k));
const srcPricing = Object.keys(srcItem._pricing || {});
const srcPhysSpecs = Object.keys(srcItem._physical_specs || {});
const srcEnrichment = Object.keys(srcItem._enrichment || {});

// Check all source top-level fields are in output
const flatItem = allFlat[0];
const missingTop = srcTopLevel.filter(f => !(f in flatItem) && f !== 'manufacturer_short');
check(`All source top-level fields mapped (missing: ${missingTop.join(',') || 'none'})`, missingTop.length === 0);

// Check all _pricing fields are in output (accounting for _review_flags -> review_flags rename)
const missingPricing = srcPricing.filter(f => {
  if (f === '_review_flags') return !('review_flags' in flatItem);
  return !(f in flatItem);
});
check(`All _pricing fields mapped (missing: ${missingPricing.join(',') || 'none'})`, missingPricing.length === 0);

// Check all _physical_specs fields are in output
const missingPhys = srcPhysSpecs.filter(f => !(f in flatItem));
check(`All _physical_specs fields mapped (missing: ${missingPhys.join(',') || 'none'})`, missingPhys.length === 0);

// _enrichment was intentionally dropped (all nulls verified)
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
