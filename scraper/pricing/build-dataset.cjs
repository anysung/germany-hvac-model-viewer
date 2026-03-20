#!/usr/bin/env node
/**
 * Build Dataset — Integration Layer v1.0
 *
 * Joins pricing-engine output to the BAFA master product list and produces
 * the final app-ready datasets.
 *
 * Prerequisites:
 *   1. BAFA extraction:  scraper/bafa-luft-wasser.json  (run extract-bafa.cjs)
 *   2. Pricing engine:   scraper/pricing/output/bafa-priced.json  (run run-pricing.cjs)
 *
 * Usage:
 *   node scraper/pricing/build-dataset.cjs
 *   node scraper/pricing/build-dataset.cjs --dry-run        # Validate only, no file output
 *   node scraper/pricing/build-dataset.cjs --stats           # Print extended statistics
 *
 * Output:
 *   scraper/pricing/output/dataset-full.json          — All 6,514 items (BAFA + pricing)
 *   scraper/pricing/output/dataset-residential.json   — Residential default (app-ready)
 *   scraper/pricing/output/dataset-validation.json    — Validation report
 */

const fs = require('fs');
const path = require('path');

const BAFA_FILE = path.join(__dirname, '..', 'bafa-luft-wasser.json');
const PRICED_FILE = path.join(__dirname, 'output', 'bafa-priced.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const showStats = args.includes('--stats');

// ---------------------------------------------------------------------------
// Pricing fields to attach to each BAFA record
// ---------------------------------------------------------------------------

const PRICING_FIELDS = [
  'equipment_price_low_eur',
  'equipment_price_typical_eur',
  'equipment_price_high_eur',
  'price_basis',
  'price_confidence',
  'brand_tier',
  'market_segment',
  'residential_visibility_default',
  'package_scope',
];

// Additional pricing fields preserved in the full dataset but not in the
// required set above. Included for completeness.
const SUPPLEMENTARY_PRICING_FIELDS = [
  'capacity_band',
  'refrigerant_group',
  'installation_type',
  'package_scope_confidence',
  'segment_confidence',
  '_review_flags',
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function build() {
  console.log('=== Build Dataset — Integration Layer v1.0 ===\n');

  // --- Load sources ---

  if (!fs.existsSync(BAFA_FILE)) {
    console.error(`ERROR: BAFA source not found: ${BAFA_FILE}`);
    console.error('Run the BAFA extraction first.');
    process.exit(1);
  }
  if (!fs.existsSync(PRICED_FILE)) {
    console.error(`ERROR: Pricing output not found: ${PRICED_FILE}`);
    console.error('Run the pricing engine first: node scraper/pricing/run-pricing.cjs');
    process.exit(1);
  }

  const bafaData = JSON.parse(fs.readFileSync(BAFA_FILE, 'utf8'));
  const pricedData = JSON.parse(fs.readFileSync(PRICED_FILE, 'utf8'));

  console.log(`BAFA source:    ${bafaData.items.length} items (${bafaData._meta.extracted_date})`);
  console.log(`Pricing output: ${pricedData.items.length} items (v${pricedData._meta.pricing_version})\n`);

  // --- Build pricing index by bafa_id ---

  const pricingIndex = new Map();
  for (const item of pricedData.items) {
    pricingIndex.set(item.bafa_id, item);
  }

  // --- Validation ---

  const validation = {
    bafa_count: bafaData.items.length,
    pricing_count: pricedData.items.length,
    matched: 0,
    unmatched_bafa: [],      // BAFA items with no pricing record
    unmatched_pricing: [],   // Pricing records with no BAFA item
    field_checks: {
      missing_fields: 0,     // Pricing records missing expected fields
      null_prices_expected: 0,  // Commercial N/A (expected nulls)
      null_prices_unexpected: 0, // Non-N/A items with null prices
    },
    tier_monotonicity: {},   // Per-band tier ordering check
    segment_counts: { residential_core: 0, light_commercial: 0, commercial_project: 0 },
    confidence_counts: { high: 0, medium: 0, low: 0 },
    price_stats: {
      residential: { count: 0, min: Infinity, max: -Infinity, sum: 0 },
      light_commercial: { count: 0, min: Infinity, max: -Infinity, sum: 0 },
      commercial_priced: { count: 0, min: Infinity, max: -Infinity, sum: 0 },
      commercial_na: 0,
    },
    warnings: [],
  };

  // Check for BAFA IDs not in pricing
  const bafaIds = new Set(bafaData.items.map(i => i.bafa_id));
  for (const id of bafaIds) {
    if (!pricingIndex.has(id)) {
      validation.unmatched_bafa.push(id);
    }
  }
  // Check for pricing IDs not in BAFA
  for (const id of pricingIndex.keys()) {
    if (!bafaIds.has(id)) {
      validation.unmatched_pricing.push(id);
    }
  }

  // --- Merge ---

  const fullItems = [];

  for (const bafaItem of bafaData.items) {
    const pricing = pricingIndex.get(bafaItem.bafa_id);

    if (!pricing) {
      // No pricing record — include BAFA item with null pricing layer
      const merged = { ...bafaItem, _pricing: nullPricingLayer() };
      fullItems.push(merged);
      continue;
    }

    validation.matched++;

    // Check that all expected pricing fields exist
    for (const field of PRICING_FIELDS) {
      if (!(field in pricing)) {
        validation.field_checks.missing_fields++;
        validation.warnings.push(`Missing field '${field}' in pricing for bafa_id=${bafaItem.bafa_id}`);
      }
    }

    // Build the pricing layer
    const pricingLayer = {};
    for (const field of PRICING_FIELDS) {
      pricingLayer[field] = pricing[field] ?? null;
    }
    for (const field of SUPPLEMENTARY_PRICING_FIELDS) {
      pricingLayer[field] = pricing[field] ?? null;
    }

    // Track stats
    const seg = pricing.market_segment;
    if (seg) validation.segment_counts[seg] = (validation.segment_counts[seg] || 0) + 1;

    const conf = pricing.price_confidence;
    if (conf) validation.confidence_counts[conf] = (validation.confidence_counts[conf] || 0) + 1;

    const typical = pricing.equipment_price_typical_eur;
    if (pricing.price_basis === 'N/A') {
      validation.field_checks.null_prices_expected++;
      validation.price_stats.commercial_na++;
    } else if (typical === null || typical === undefined) {
      validation.field_checks.null_prices_unexpected++;
      validation.warnings.push(`Unexpected null price for bafa_id=${bafaItem.bafa_id} (basis=${pricing.price_basis})`);
    } else {
      // Track price distribution by segment
      const bucket =
        seg === 'residential_core' ? 'residential' :
        seg === 'light_commercial' ? 'light_commercial' :
        'commercial_priced';
      const s = validation.price_stats[bucket];
      s.count++;
      s.sum += typical;
      if (typical < s.min) s.min = typical;
      if (typical > s.max) s.max = typical;
    }

    // Merge: original BAFA fields unchanged, pricing as separate layer
    const merged = { ...bafaItem, _pricing: pricingLayer };
    fullItems.push(merged);
  }

  // --- Tier monotonicity check ---
  // At each capacity band, S typical > A+ typical > A > B+ > B > C > D
  const tierOrder = ['S', 'A+', 'A', 'B+', 'B', 'C', 'D'];
  const bandTierTypicals = {};

  for (const item of fullItems) {
    const p = item._pricing;
    if (!p || !p.capacity_band || !p.brand_tier || !p.equipment_price_typical_eur) continue;
    if (p.market_segment !== 'residential_core') continue;

    const key = p.capacity_band;
    if (!bandTierTypicals[key]) bandTierTypicals[key] = {};
    const bt = bandTierTypicals[key];
    if (!bt[p.brand_tier]) bt[p.brand_tier] = [];
    bt[p.brand_tier].push(p.equipment_price_typical_eur);
  }

  for (const [band, tiers] of Object.entries(bandTierTypicals)) {
    const medians = {};
    for (const [tier, prices] of Object.entries(tiers)) {
      prices.sort((a, b) => a - b);
      medians[tier] = prices[Math.floor(prices.length / 2)];
    }

    let monotonic = true;
    for (let i = 0; i < tierOrder.length - 1; i++) {
      const upper = tierOrder[i];
      const lower = tierOrder[i + 1];
      if (medians[upper] !== undefined && medians[lower] !== undefined) {
        if (medians[upper] < medians[lower]) {
          monotonic = false;
          validation.warnings.push(
            `Tier monotonicity broken at band ${band}: ${upper} median EUR ${medians[upper]} < ${lower} median EUR ${medians[lower]}`
          );
        }
      }
    }
    validation.tier_monotonicity[band] = { monotonic, medians };
  }

  // --- Compute price stat averages ---
  for (const bucket of ['residential', 'light_commercial', 'commercial_priced']) {
    const s = validation.price_stats[bucket];
    if (s.count > 0) {
      s.mean = Math.round(s.sum / s.count);
    } else {
      s.min = null;
      s.max = null;
      s.mean = null;
    }
    delete s.sum;
  }

  // --- Print validation results ---

  console.log('--- Validation ---\n');
  console.log(`Join match:      ${validation.matched} / ${validation.bafa_count} BAFA items matched`);

  if (validation.unmatched_bafa.length > 0) {
    console.log(`  WARNING: ${validation.unmatched_bafa.length} BAFA items have no pricing record`);
  }
  if (validation.unmatched_pricing.length > 0) {
    console.log(`  WARNING: ${validation.unmatched_pricing.length} pricing records have no BAFA item`);
  }
  if (validation.field_checks.missing_fields > 0) {
    console.log(`  WARNING: ${validation.field_checks.missing_fields} missing pricing fields`);
  }
  if (validation.field_checks.null_prices_unexpected > 0) {
    console.log(`  WARNING: ${validation.field_checks.null_prices_unexpected} unexpected null prices`);
  }

  const joinOk = validation.matched === validation.bafa_count &&
                 validation.unmatched_bafa.length === 0 &&
                 validation.unmatched_pricing.length === 0;
  const fieldsOk = validation.field_checks.missing_fields === 0 &&
                   validation.field_checks.null_prices_unexpected === 0;
  const monotoneOk = Object.values(validation.tier_monotonicity).every(v => v.monotonic);

  console.log(`\nField integrity: ${fieldsOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Commercial N/A (expected): ${validation.field_checks.null_prices_expected}`);
  console.log(`  Unexpected null prices:    ${validation.field_checks.null_prices_unexpected}`);

  console.log(`\nTier monotonicity: ${monotoneOk ? 'PASS' : 'FAIL'}`);
  for (const [band, info] of Object.entries(validation.tier_monotonicity)) {
    const medianStr = tierOrder
      .filter(t => info.medians[t] !== undefined)
      .map(t => `${t}=€${info.medians[t]}`)
      .join(' > ');
    console.log(`  ${band}: ${info.monotonic ? '✓' : '✗'} ${medianStr}`);
  }

  console.log(`\nSegments:   residential=${validation.segment_counts.residential_core}, light_commercial=${validation.segment_counts.light_commercial}, commercial=${validation.segment_counts.commercial_project}`);
  console.log(`Confidence: high=${validation.confidence_counts.high}, medium=${validation.confidence_counts.medium}, low=${validation.confidence_counts.low}`);

  console.log('\nPrice ranges (typical):');
  for (const [bucket, s] of Object.entries(validation.price_stats)) {
    if (bucket === 'commercial_na') {
      console.log(`  commercial N/A: ${s} items`);
    } else if (s.count > 0) {
      console.log(`  ${bucket}: EUR ${s.min} — ${s.mean} (mean) — ${s.max}  (${s.count} items)`);
    }
  }

  // --- Split datasets ---

  const residentialItems = fullItems.filter(item =>
    item._pricing && item._pricing.residential_visibility_default === true
  );

  console.log(`\n--- Datasets ---\n`);
  console.log(`Full dataset:        ${fullItems.length} items`);
  console.log(`Residential default: ${residentialItems.length} items`);

  if (showStats) {
    printExtendedStats(fullItems, residentialItems);
  }

  if (dryRun) {
    console.log('\n[dry-run] No files written.');
  } else {
    // --- Write outputs ---

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Full dataset
    const fullOutput = {
      _meta: {
        generated: new Date().toISOString(),
        generator: 'build-dataset.cjs v1.0',
        bafa_source: {
          file: 'bafa-luft-wasser.json',
          extracted_date: bafaData._meta.extracted_date,
          total_items: bafaData.items.length,
        },
        pricing_source: {
          file: 'bafa-priced.json',
          pricing_version: pricedData._meta.pricing_version,
          pricing_date: pricedData._meta.pricing_date,
          pricing_scope: pricedData._meta.pricing_scope,
          currency: pricedData._meta.pricing_currency,
        },
        dataset: 'full',
        description: 'All BAFA Luft/Wasser items with pricing layer attached. Includes residential, light_commercial, and commercial_project segments. Commercial N/A items have null prices.',
        total_items: fullItems.length,
        schema_note: 'Original BAFA fields are top-level. Pricing fields are under _pricing. This preserves BAFA data unchanged.',
      },
      validation: {
        join_match: `${validation.matched}/${validation.bafa_count}`,
        field_integrity: fieldsOk ? 'PASS' : 'FAIL',
        tier_monotonicity: monotoneOk ? 'PASS' : 'FAIL',
        warnings: validation.warnings.length,
      },
      items: fullItems,
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'dataset-full.json'),
      JSON.stringify(fullOutput, null, 2)
    );
    console.log(`\nSaved: output/dataset-full.json (${fullItems.length} items)`);

    // Residential app-ready dataset
    // Flatten pricing into top-level for app consumption
    const residentialFlat = residentialItems.map(item => {
      const { _pricing, _enrichment, ...bafaFields } = item;
      return {
        ...bafaFields,
        // Pricing fields promoted to top-level for app use
        equipment_price_low_eur: _pricing.equipment_price_low_eur,
        equipment_price_typical_eur: _pricing.equipment_price_typical_eur,
        equipment_price_high_eur: _pricing.equipment_price_high_eur,
        price_basis: _pricing.price_basis,
        price_confidence: _pricing.price_confidence,
        brand_tier: _pricing.brand_tier,
        market_segment: _pricing.market_segment,
        package_scope: _pricing.package_scope,
        capacity_band: _pricing.capacity_band,
        refrigerant_group: _pricing.refrigerant_group,
        installation_type: _pricing.installation_type,
      };
    });

    const residentialOutput = {
      _meta: {
        generated: new Date().toISOString(),
        generator: 'build-dataset.cjs v1.0',
        bafa_source: fullOutput._meta.bafa_source,
        pricing_source: fullOutput._meta.pricing_source,
        dataset: 'residential_default',
        description: 'App-ready residential dataset. Pricing fields promoted to top-level alongside BAFA fields. Only items where residential_visibility_default=true.',
        total_items: residentialFlat.length,
        schema_note: 'BAFA fields and pricing fields are both top-level. _enrichment removed.',
      },
      items: residentialFlat,
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'dataset-residential.json'),
      JSON.stringify(residentialOutput, null, 2)
    );
    console.log(`Saved: output/dataset-residential.json (${residentialFlat.length} items)`);

    // Validation report
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'dataset-validation.json'),
      JSON.stringify(validation, null, 2)
    );
    console.log(`Saved: output/dataset-validation.json`);
  }

  // --- Final status ---

  const allPass = joinOk && fieldsOk && monotoneOk;
  console.log(`\n=== ${allPass ? 'ALL CHECKS PASSED' : 'CHECKS FAILED — review warnings above'} ===`);

  if (validation.warnings.length > 0 && !showStats) {
    console.log(`\n${validation.warnings.length} warning(s). Run with --stats for details.`);
  }

  console.log('\nDone.');
  return allPass;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nullPricingLayer() {
  const layer = {};
  for (const field of PRICING_FIELDS) {
    layer[field] = null;
  }
  for (const field of SUPPLEMENTARY_PRICING_FIELDS) {
    layer[field] = null;
  }
  return layer;
}

function printExtendedStats(fullItems, residentialItems) {
  console.log('\n--- Extended Statistics ---\n');

  // Brand tier distribution in residential
  const tierDist = {};
  for (const item of residentialItems) {
    const tier = item._pricing?.brand_tier;
    if (tier) tierDist[tier] = (tierDist[tier] || 0) + 1;
  }
  console.log('Residential tier distribution:');
  for (const t of ['S', 'A+', 'A', 'B+', 'B', 'C', 'D']) {
    if (tierDist[t]) console.log(`  ${t}: ${tierDist[t]}`);
  }

  // Capacity band distribution in residential
  const bandDist = {};
  for (const item of residentialItems) {
    const band = item._pricing?.capacity_band;
    if (band) bandDist[band] = (bandDist[band] || 0) + 1;
  }
  console.log('\nResidential capacity band distribution:');
  for (const [band, count] of Object.entries(bandDist).sort()) {
    console.log(`  ${band}: ${count}`);
  }

  // Refrigerant distribution
  const refDist = {};
  for (const item of residentialItems) {
    const ref = item._pricing?.refrigerant_group;
    if (ref) refDist[ref] = (refDist[ref] || 0) + 1;
  }
  console.log('\nResidential refrigerant distribution:');
  for (const [ref, count] of Object.entries(refDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ref}: ${count}`);
  }

  // Confidence by tier (residential)
  console.log('\nResidential confidence by tier:');
  const tierConf = {};
  for (const item of residentialItems) {
    const tier = item._pricing?.brand_tier;
    const conf = item._pricing?.price_confidence;
    if (tier && conf) {
      if (!tierConf[tier]) tierConf[tier] = { high: 0, medium: 0, low: 0 };
      tierConf[tier][conf]++;
    }
  }
  for (const t of ['S', 'A+', 'A', 'B+', 'B', 'C', 'D']) {
    if (tierConf[t]) {
      console.log(`  ${t}: high=${tierConf[t].high}, medium=${tierConf[t].medium}, low=${tierConf[t].low}`);
    }
  }

  // Price percentiles (residential)
  const typicals = residentialItems
    .map(i => i._pricing?.equipment_price_typical_eur)
    .filter(p => p !== null && p !== undefined)
    .sort((a, b) => a - b);

  if (typicals.length > 0) {
    console.log('\nResidential price percentiles (typical):');
    const pcts = [0, 10, 25, 50, 75, 90, 100];
    for (const p of pcts) {
      const idx = Math.min(Math.floor(typicals.length * p / 100), typicals.length - 1);
      console.log(`  P${p.toString().padStart(3)}: EUR ${typicals[idx]}`);
    }
  }

  // Warnings detail
  const validation = buildValidationFromItems(fullItems);
  if (validation.warnings && validation.warnings.length > 0) {
    console.log(`\nWarnings (${validation.warnings.length}):`);
    for (const w of validation.warnings) {
      console.log(`  - ${w}`);
    }
  }
}

// Quick re-derive warnings for extended stats (avoids passing validation object)
function buildValidationFromItems(items) {
  return { warnings: [] };
}

// ---------------------------------------------------------------------------
build();
