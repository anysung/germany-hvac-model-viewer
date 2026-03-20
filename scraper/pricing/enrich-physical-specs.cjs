#!/usr/bin/env node
/**
 * Physical Specs Enrichment v1.0
 *
 * Enriches the priced BAFA dataset with physical dimensions and weight
 * from a curated product-family reference database.
 *
 * Matching strategy:
 *   1. Match BAFA item manufacturer to reference family manufacturer_pattern
 *   2. Match BAFA model name against family model_patterns (regex)
 *   3. Match item power (kW) to the appropriate chassis variant by capacity_range_kw
 *   4. Direct match → high confidence; family match → medium; no match → null
 *
 * Prerequisites:
 *   - scraper/pricing/output/dataset-full.json (from build-dataset.cjs)
 *   - scraper/pricing/physical-specs-reference.json (curated reference)
 *
 * Usage:
 *   node scraper/pricing/enrich-physical-specs.cjs
 *   node scraper/pricing/enrich-physical-specs.cjs --dry-run
 *   node scraper/pricing/enrich-physical-specs.cjs --stats
 *
 * Output:
 *   scraper/pricing/output/dataset-enriched-full.json
 *   scraper/pricing/output/dataset-enriched-residential.json
 *   scraper/pricing/output/enrichment-summary.json
 */

const fs = require('fs');
const path = require('path');

const DATASET_FILE = path.join(__dirname, 'output', 'dataset-full.json');
const REFERENCE_FILE = path.join(__dirname, 'physical-specs-reference.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const showStats = args.includes('--stats');

// ---------------------------------------------------------------------------
// Matching engine
// ---------------------------------------------------------------------------

/**
 * Compile reference families into a fast lookup structure.
 * Each family becomes a set of compiled regexes + variant ranges.
 */
function compileReference(reference) {
  return reference.families.map(family => {
    const mfrPattern = new RegExp(family.manufacturer_pattern, 'i');
    const modelPatterns = family.model_patterns.map(p => new RegExp(p, 'i'));
    return {
      ...family,
      _mfrRegex: mfrPattern,
      _modelRegexes: modelPatterns,
    };
  });
}

/**
 * Find the best matching family + variant for a BAFA item.
 *
 * Returns: { matched, family, variant, match_type, confidence } or null
 */
function matchItem(item, compiledFamilies) {
  const manufacturer = item.manufacturer || '';
  const model = item.model || '';
  const powerKw = item.power_35C_kw || item.power_55C_kw || null;

  for (const family of compiledFamilies) {
    // Step 1: manufacturer must match
    if (!family._mfrRegex.test(manufacturer)) continue;

    // Step 2: at least one model pattern must match
    const modelMatch = family._modelRegexes.some(rx => rx.test(model));
    if (!modelMatch) continue;

    // Step 3: find the right variant by capacity range
    if (powerKw === null) {
      // No power data — return family match without variant
      return {
        matched: true,
        family_id: family.id,
        family_name: family.family_name,
        variant: null,
        match_type: 'family_only',
        confidence: 'low',
        source_type: family.source_type,
      };
    }

    // Find variant where power falls within capacity_range_kw
    const variant = family.variants.find(v =>
      powerKw >= v.capacity_range_kw[0] && powerKw < v.capacity_range_kw[1]
    );

    // If power exceeds all variants, try the largest
    const fallbackVariant = !variant
      ? family.variants[family.variants.length - 1]
      : null;

    const selectedVariant = variant || fallbackVariant;
    const isExactRange = !!variant;

    if (selectedVariant) {
      return {
        matched: true,
        family_id: family.id,
        family_name: family.family_name,
        variant: selectedVariant,
        match_type: isExactRange ? 'family_variant' : 'family_variant_extrapolated',
        confidence: isExactRange ? family.confidence : 'medium',
        source_type: family.source_type,
        estimated: !isExactRange,
      };
    }

    // Family matched but no variant found
    return {
      matched: true,
      family_id: family.id,
      family_name: family.family_name,
      variant: null,
      match_type: 'family_only',
      confidence: 'low',
      source_type: family.source_type,
    };
  }

  return null; // No match
}

/**
 * Build the physical specs enrichment layer for a single item.
 */
function buildPhysicalSpecsLayer(match) {
  const now = new Date().toISOString();

  if (!match || !match.matched) {
    return {
      width_mm: null,
      height_mm: null,
      depth_mm: null,
      weight_kg: null,
      dimensions_raw: null,
      weight_raw: null,
      physical_specs_source_type: null,
      physical_specs_source_note: null,
      physical_specs_confidence: null,
      physical_specs_estimated: null,
      physical_specs_match_type: null,
      physical_specs_family: null,
      physical_specs_last_checked_at: now,
    };
  }

  const v = match.variant;
  if (!v) {
    // Family match but no variant — we know the family but can't assign dimensions
    return {
      width_mm: null,
      height_mm: null,
      depth_mm: null,
      weight_kg: null,
      dimensions_raw: null,
      weight_raw: null,
      physical_specs_source_type: match.source_type,
      physical_specs_source_note: null,
      physical_specs_confidence: 'low',
      physical_specs_estimated: null,
      physical_specs_match_type: match.match_type,
      physical_specs_family: match.family_name,
      physical_specs_last_checked_at: now,
    };
  }

  const isEstimated = match.match_type === 'family_variant_extrapolated'
    || (match.source_type === 'platform_shared' && match.confidence === 'low');

  return {
    width_mm: v.width_mm,
    height_mm: v.height_mm,
    depth_mm: v.depth_mm,
    weight_kg: v.weight_kg,
    dimensions_raw: v.dimensions_raw || null,
    weight_raw: v.weight_raw || null,
    physical_specs_source_type: match.source_type,
    physical_specs_source_note: v.source_note || null,
    physical_specs_confidence: match.confidence,
    physical_specs_estimated: isEstimated,
    physical_specs_match_type: match.match_type,
    physical_specs_family: match.family_name,
    physical_specs_last_checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
  console.log('=== Physical Specs Enrichment v1.0 ===\n');

  // Load inputs
  if (!fs.existsSync(DATASET_FILE)) {
    console.error(`ERROR: Dataset not found: ${DATASET_FILE}`);
    console.error('Run build-dataset.cjs first.');
    process.exit(1);
  }
  if (!fs.existsSync(REFERENCE_FILE)) {
    console.error(`ERROR: Reference not found: ${REFERENCE_FILE}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8'));
  const reference = JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8'));

  console.log(`Dataset:   ${dataset.items.length} items`);
  console.log(`Reference: ${reference.families.length} product families\n`);

  // Compile reference patterns
  const compiled = compileReference(reference);

  // Stats tracking
  const stats = {
    total: dataset.items.length,
    matched_with_dims: 0,
    matched_with_weight: 0,
    matched_with_both: 0,
    matched_family_only: 0,
    unmatched: 0,
    estimated: 0,
    by_confidence: { high: 0, medium: 0, low: 0 },
    by_source_type: {},
    by_family: {},
    by_match_type: {},
    by_segment: {
      residential_core: { matched: 0, total: 0 },
      light_commercial: { matched: 0, total: 0 },
      commercial_project: { matched: 0, total: 0 },
    },
  };

  // Enrich each item
  const enrichedItems = dataset.items.map(item => {
    const match = matchItem(item, compiled);
    const physLayer = buildPhysicalSpecsLayer(match);

    // Track stats
    const segment = item._pricing?.market_segment || 'unknown';
    if (stats.by_segment[segment]) {
      stats.by_segment[segment].total++;
    }

    if (physLayer.width_mm !== null && physLayer.height_mm !== null && physLayer.depth_mm !== null) {
      stats.matched_with_dims++;
    }
    if (physLayer.weight_kg !== null) {
      stats.matched_with_weight++;
    }
    if (physLayer.width_mm !== null && physLayer.weight_kg !== null) {
      stats.matched_with_both++;
      if (stats.by_segment[segment]) stats.by_segment[segment].matched++;
    }
    if (match && match.match_type === 'family_only') {
      stats.matched_family_only++;
    }
    if (!match) {
      stats.unmatched++;
    }
    if (physLayer.physical_specs_estimated) {
      stats.estimated++;
    }
    if (physLayer.physical_specs_confidence) {
      stats.by_confidence[physLayer.physical_specs_confidence] =
        (stats.by_confidence[physLayer.physical_specs_confidence] || 0) + 1;
    }
    if (physLayer.physical_specs_source_type) {
      stats.by_source_type[physLayer.physical_specs_source_type] =
        (stats.by_source_type[physLayer.physical_specs_source_type] || 0) + 1;
    }
    if (match?.family_id) {
      stats.by_family[match.family_id] = (stats.by_family[match.family_id] || 0) + 1;
    }
    if (match?.match_type) {
      stats.by_match_type[match.match_type] = (stats.by_match_type[match.match_type] || 0) + 1;
    }

    // Attach physical specs as separate layer
    return {
      ...item,
      _physical_specs: physLayer,
    };
  });

  // --- Print summary ---

  console.log('--- Enrichment Results ---\n');
  console.log(`Total items:              ${stats.total}`);
  console.log(`With dimensions:          ${stats.matched_with_dims} (${pct(stats.matched_with_dims, stats.total)})`);
  console.log(`With weight:              ${stats.matched_with_weight} (${pct(stats.matched_with_weight, stats.total)})`);
  console.log(`With both (dims+weight):  ${stats.matched_with_both} (${pct(stats.matched_with_both, stats.total)})`);
  console.log(`Family match only:        ${stats.matched_family_only}`);
  console.log(`Estimated/extrapolated:   ${stats.estimated}`);
  console.log(`No match:                 ${stats.unmatched} (${pct(stats.unmatched, stats.total)})`);

  console.log('\nBy confidence:');
  for (const [conf, count] of Object.entries(stats.by_confidence)) {
    if (count > 0) console.log(`  ${conf}: ${count}`);
  }

  console.log('\nBy source type:');
  for (const [src, count] of Object.entries(stats.by_source_type)) {
    console.log(`  ${src}: ${count}`);
  }

  console.log('\nBy product family:');
  const familySorted = Object.entries(stats.by_family).sort((a, b) => b[1] - a[1]);
  for (const [fam, count] of familySorted) {
    console.log(`  ${count}x ${fam}`);
  }

  console.log('\nBy segment:');
  for (const [seg, info] of Object.entries(stats.by_segment)) {
    console.log(`  ${seg}: ${info.matched}/${info.total} enriched (${pct(info.matched, info.total)})`);
  }

  if (showStats) {
    console.log('\nBy match type:');
    for (const [mt, count] of Object.entries(stats.by_match_type)) {
      console.log(`  ${mt}: ${count}`);
    }

    // Show unenriched residential brands
    const unenrichedBrands = {};
    enrichedItems
      .filter(i => i._pricing?.market_segment === 'residential_core' && i._physical_specs.width_mm === null)
      .forEach(i => {
        const mfr = i.manufacturer;
        unenrichedBrands[mfr] = (unenrichedBrands[mfr] || 0) + 1;
      });
    const sortedUnenriched = Object.entries(unenrichedBrands).sort((a, b) => b[1] - a[1]);
    console.log(`\nUnenriched residential brands (top 20):`);
    sortedUnenriched.slice(0, 20).forEach(([brand, count]) => {
      console.log(`  ${count}x ${brand}`);
    });
  }

  // --- Corrective cleanup ---

  const QUARANTINE_FAMILY_ID = 'oem-chinese-monoblock-generic';
  const QUARANTINE_FAMILY_NAME = 'Generic Chinese R290/R32 Monoblock Platform';
  let quarantinedCount = 0;
  let lowConfNulledCount = 0;

  enrichedItems.forEach(item => {
    const ps = item._physical_specs;
    if (!ps) return;

    // 1. Quarantine generic OEM catch-all items (match on stored family name)
    if (ps.physical_specs_family === QUARANTINE_FAMILY_NAME) {
      ps.physical_specs_quarantined = true;
      ps.physical_specs_quarantine_reason = 'generic_oem_catch_all';
      quarantinedCount++;
    }
  });

  console.log(`\n--- Corrective Cleanup (full dataset) ---`);
  console.log(`Quarantined (generic OEM):    ${quarantinedCount}`);

  // --- Save outputs ---

  if (dryRun) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Full enriched dataset
  const fullOutput = {
    _meta: {
      generated: new Date().toISOString(),
      generator: 'enrich-physical-specs.cjs v1.1',
      base_dataset: 'dataset-full.json',
      reference_version: reference._meta.version,
      reference_families: reference.families.length,
      dataset: 'enriched_full',
      description: 'Full BAFA dataset with pricing layer (_pricing) and physical specs layer (_physical_specs). Generic OEM items are quarantined with physical_specs_quarantined flag.',
      total_items: enrichedItems.length,
      enrichment_coverage: {
        with_dimensions: stats.matched_with_dims,
        with_weight: stats.matched_with_weight,
        with_both: stats.matched_with_both,
        no_match: stats.unmatched,
        quarantined: quarantinedCount,
      },
    },
    items: enrichedItems,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'dataset-enriched-full.json'),
    JSON.stringify(fullOutput, null, 2)
  );
  console.log(`\nSaved: output/dataset-enriched-full.json (${enrichedItems.length} items)`);

  // Residential enriched dataset (flattened for app use)
  const residentialItems = enrichedItems.filter(i =>
    i._pricing?.residential_visibility_default === true
  );

  const residentialFlat = residentialItems.map(item => {
    const { _pricing, _physical_specs, _enrichment, ...bafaFields } = item;
    const ps = _physical_specs || {};

    // Exclude low-confidence and quarantined specs from app-facing display
    const suppressSpecs = ps.physical_specs_confidence === 'low'
      || ps.physical_specs_quarantined === true;

    if (suppressSpecs) lowConfNulledCount++;

    return {
      ...bafaFields,
      // Pricing (flattened)
      equipment_price_low_eur: _pricing?.equipment_price_low_eur ?? null,
      equipment_price_typical_eur: _pricing?.equipment_price_typical_eur ?? null,
      equipment_price_high_eur: _pricing?.equipment_price_high_eur ?? null,
      price_basis: _pricing?.price_basis ?? null,
      price_confidence: _pricing?.price_confidence ?? null,
      brand_tier: _pricing?.brand_tier ?? null,
      market_segment: _pricing?.market_segment ?? null,
      package_scope: _pricing?.package_scope ?? null,
      capacity_band: _pricing?.capacity_band ?? null,
      refrigerant_group: _pricing?.refrigerant_group ?? null,
      installation_type: _pricing?.installation_type ?? null,
      // Physical specs (flattened) — nulled for low-confidence / quarantined items
      width_mm: suppressSpecs ? null : (ps.width_mm ?? null),
      height_mm: suppressSpecs ? null : (ps.height_mm ?? null),
      depth_mm: suppressSpecs ? null : (ps.depth_mm ?? null),
      weight_kg: suppressSpecs ? null : (ps.weight_kg ?? null),
      dimensions_raw: suppressSpecs ? null : (ps.dimensions_raw ?? null),
      weight_raw: suppressSpecs ? null : (ps.weight_raw ?? null),
      // Metadata preserved even when specs are suppressed
      physical_specs_confidence: ps.physical_specs_confidence ?? null,
      physical_specs_estimated: ps.physical_specs_estimated ?? null,
      physical_specs_source_type: ps.physical_specs_source_type ?? null,
      physical_specs_quarantined: ps.physical_specs_quarantined ?? null,
    };
  });

  console.log(`\n--- Corrective Cleanup (residential) ---`);
  console.log(`Low-conf/quarantined nulled:  ${lowConfNulledCount}`);

  const resWithDims = residentialFlat.filter(i => i.width_mm !== null).length;
  const resWithWeight = residentialFlat.filter(i => i.weight_kg !== null).length;
  const resWithBoth = residentialFlat.filter(i => i.width_mm !== null && i.weight_kg !== null).length;
  const resNoMatch = residentialFlat.filter(i => i.width_mm === null).length;

  const residentialOutput = {
    _meta: {
      generated: new Date().toISOString(),
      generator: 'enrich-physical-specs.cjs v1.1',
      dataset: 'enriched_residential',
      description: 'App-ready residential dataset with pricing and physical specs flattened to top-level. Low-confidence and quarantined physical specs have display values nulled (metadata preserved).',
      total_items: residentialFlat.length,
      enrichment_coverage: {
        with_dimensions: resWithDims,
        with_weight: resWithWeight,
        with_both: resWithBoth,
        no_match: resNoMatch,
        suppressed_low_confidence: lowConfNulledCount,
      },
    },
    items: residentialFlat,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'dataset-enriched-residential.json'),
    JSON.stringify(residentialOutput, null, 2)
  );
  console.log(`Saved: output/dataset-enriched-residential.json (${residentialFlat.length} items)`);

  // Enrichment summary
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'enrichment-summary.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log('Saved: output/enrichment-summary.json');

  console.log('\nDone.');
}

function pct(n, total) {
  if (total === 0) return '0%';
  return (n / total * 100).toFixed(1) + '%';
}

// ---------------------------------------------------------------------------
run();
