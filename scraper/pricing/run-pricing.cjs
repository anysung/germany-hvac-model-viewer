#!/usr/bin/env node
/**
 * Run Pricing Engine v2
 *
 * Usage:
 *   node scraper/pricing/run-pricing.cjs                    # Full run: simulate + seed + calibrate
 *   node scraper/pricing/run-pricing.cjs --simulate-only    # Simulate only, no calibration
 *   node scraper/pricing/run-pricing.cjs --seed-samples     # Seed market samples only
 *   node scraper/pricing/run-pricing.cjs --review-flags     # Show items flagged for review
 *   node scraper/pricing/run-pricing.cjs --brand <name>     # Show results for one brand
 *   node scraper/pricing/run-pricing.cjs --segment <seg>    # Filter by segment
 *   node scraper/pricing/run-pricing.cjs --coverage         # Show sample coverage report
 *
 * Output:
 *   scraper/pricing/output/bafa-priced.json            — Full dataset with prices
 *   scraper/pricing/output/bafa-residential.json       — Residential-only subset
 *   scraper/pricing/output/pricing-summary.json        — Summary statistics
 *   scraper/pricing/output/review-flags.json           — Items needing manual review
 *   scraper/pricing/output/calibration-report.json     — Calibration details
 *   scraper/pricing/output/sampling-coverage.json      — Market sample coverage report
 */

const fs = require('fs');
const path = require('path');

const engine = require('./pricing-engine.cjs');
const sampler = require('./market-sampler.cjs');

const BAFA_FILE = path.join(__dirname, '..', 'bafa-luft-wasser.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

const args = process.argv.slice(2);
const simulateOnly = args.includes('--simulate-only');
const seedOnly = args.includes('--seed-samples');
const reviewOnly = args.includes('--review-flags');
const coverageOnly = args.includes('--coverage');
const brandIdx = args.indexOf('--brand');
const brandFilter = brandIdx !== -1 ? args[brandIdx + 1] : null;
const segIdx = args.indexOf('--segment');
const segFilter = segIdx !== -1 ? args[segIdx + 1] : null;

// ---------------------------------------------------------------------------

function run() {
  console.log('=== BAFA Heat Pump Pricing Engine v3 ===\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Seed samples
  if (seedOnly) {
    console.log('Seeding market samples v2...');
    const data = sampler.seedSamples();
    const coverage = sampler.getSamplingCoverage(data.samples);
    console.log(`Saved ${data._meta.total_samples} samples`);
    console.log(`  Unique brands: ${coverage.unique_brands}`);
    console.log(`  Capacity bands: ${JSON.stringify(coverage.capacity_band_coverage)}`);
    console.log(`  Package scopes: ${JSON.stringify(coverage.package_scope_coverage)}`);
    return;
  }

  // Coverage report only
  if (coverageOnly) {
    const samplesData = sampler.loadSamples();
    if (samplesData.samples.length === 0) {
      console.log('No samples found. Run with --seed-samples first.');
      return;
    }
    const coverage = sampler.getSamplingCoverage(samplesData.samples);
    console.log('=== Sample Coverage Report ===\n');
    console.log(`Total samples: ${coverage.total_samples}`);
    console.log(`Unique brands: ${coverage.unique_brands}`);
    console.log('\nBy capacity band:');
    for (const [band, count] of Object.entries(coverage.capacity_band_coverage)) {
      console.log(`  ${band}: ${count}`);
    }
    console.log('\nBy refrigerant:');
    for (const [ref, count] of Object.entries(coverage.refrigerant_coverage)) {
      console.log(`  ${ref}: ${count}`);
    }
    console.log('\nBy installation type:');
    for (const [type, count] of Object.entries(coverage.installation_type_coverage)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log('\nBy package scope:');
    for (const [scope, count] of Object.entries(coverage.package_scope_coverage)) {
      console.log(`  ${scope}: ${count}`);
    }
    console.log('\nBy brand:');
    const sorted = Object.entries(coverage.brands_coverage).sort((a, b) => b[1] - a[1]);
    for (const [brand, count] of sorted) {
      console.log(`  ${count}x ${brand}`);
    }
    return;
  }

  // Load BAFA data
  console.log(`Loading BAFA data from ${path.relative(process.cwd(), BAFA_FILE)}...`);
  const bafaData = JSON.parse(fs.readFileSync(BAFA_FILE, 'utf8'));
  console.log(`  ${bafaData.items.length} items loaded (${bafaData._meta.extracted_date})\n`);

  // Step 1: Deterministic pricing + segmentation
  console.log('Step 1: Running deterministic pricing + segmentation...');
  const { results, stats, summary } = engine.priceAll(bafaData);
  const naPriced = results.filter(r => r.price_basis === 'N/A').length;
  console.log(`  Priced: ${summary.priced_items} / ${summary.total_items} (${naPriced} commercial N/A)`);
  console.log(`  Segments: residential=${summary.segment_distribution.residential_core}, light_commercial=${summary.segment_distribution.light_commercial}, commercial=${summary.segment_distribution.commercial_project}`);
  console.log(`  Confidence: high=${summary.confidence_distribution.high}, medium=${summary.confidence_distribution.medium}, low=${summary.confidence_distribution.low}`);
  console.log(`  Package scopes: ${JSON.stringify(summary.package_scope_distribution)}`);
  console.log(`  SCOP top-20% threshold: ${stats.scopThresholdTop20?.toFixed(2)}`);
  console.log(`  Noise top-20% threshold: ${stats.noiseThresholdTop20?.toFixed(1)} dB\n`);

  // Step 2: Calibration
  let finalResults = results;
  let calibrationReport = null;

  if (!simulateOnly) {
    console.log('Step 2: Market calibration...');

    const existingSamples = sampler.loadSamples();
    if (existingSamples.samples.length === 0) {
      console.log('  No samples found — seeding v2 reference samples...');
      sampler.seedSamples();
    }

    const samplesData = sampler.loadSamples();
    const coverage = sampler.getSamplingCoverage(samplesData.samples);
    console.log(`  ${samplesData.samples.length} market samples loaded (${coverage.unique_brands} brands)`);

    const aggregated = sampler.aggregateSamples(samplesData.samples);
    const comparison = sampler.compareWithSimulation(aggregated, results);

    const { calibratedResults, calibrationReport: calReport } = engine.calibrate(results, samplesData.samples);
    finalResults = calibratedResults;
    calibrationReport = calReport;

    console.log(`  Unit-only samples used: ${calReport.unit_only_samples}`);
    console.log(`  Brand+band combos covered: ${calReport.unique_brand_band_combos}`);
    console.log(`  Price adjustments (blend): ${calReport.adjustments}`);
    console.log(`  Confidence boosts: ${calReport.confidence_boosts}`);
    if (calReport.tier_mismatch_flags?.length > 0) {
      console.log(`  !! ${calReport.tier_mismatch_flags.length} tier mismatch flags (>30% deviation)`);
    }
    console.log();

    // Save calibration report + comparison + coverage
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'calibration-report.json'),
      JSON.stringify({ calibrationReport: calReport, comparison, coverage }, null, 2)
    );

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'sampling-coverage.json'),
      JSON.stringify(coverage, null, 2)
    );
  } else {
    console.log('Step 2: Skipped (--simulate-only)\n');
  }

  // Recalculate summary after calibration
  const finalSummary = { ...summary };
  finalSummary.confidence_distribution = {
    high: finalResults.filter(r => r.price_confidence === 'high').length,
    medium: finalResults.filter(r => r.price_confidence === 'medium').length,
    low: finalResults.filter(r => r.price_confidence === 'low').length
  };

  // --- Filter modes ---

  if (brandFilter) {
    let filtered = finalResults.filter(r =>
      r.manufacturer.toLowerCase().includes(brandFilter.toLowerCase())
    );
    if (segFilter) {
      filtered = filtered.filter(r => r.market_segment === segFilter);
    }
    console.log(`\nResults for "${brandFilter}"${segFilter ? ` [${segFilter}]` : ''} (${filtered.length} items):\n`);
    for (const r of filtered.slice(0, 20)) {
      console.log(`  ${r.model}`);
      console.log(`    Tier: ${r.brand_tier} | Band: ${r.capacity_band} | Ref: ${r.refrigerant_group} | Pkg: ${r.package_scope} (${r.package_scope_confidence})`);
      console.log(`    Segment: ${r.market_segment} | Visible: ${r.residential_visibility_default}`);
      console.log(`    Price: EUR ${r.equipment_price_low_eur} / ${r.equipment_price_typical_eur} / ${r.equipment_price_high_eur} (${r.price_confidence}, ${r.price_basis})`);
      if (r._review_flags.length > 0) console.log(`    Flags: ${r._review_flags.join(', ')}`);
      console.log();
    }
    if (filtered.length > 20) console.log(`  ... and ${filtered.length - 20} more`);
    return;
  }

  if (segFilter) {
    const filtered = finalResults.filter(r => r.market_segment === segFilter);
    console.log(`\nSegment: ${segFilter} (${filtered.length} items)\n`);
    const tierDist = {};
    filtered.forEach(r => { tierDist[r.brand_tier] = (tierDist[r.brand_tier] || 0) + 1; });
    console.log('Tier distribution:', JSON.stringify(tierDist));
    const confDist = { high: 0, medium: 0, low: 0 };
    filtered.forEach(r => { confDist[r.price_confidence]++; });
    console.log('Confidence:', JSON.stringify(confDist));
    if (filtered.length > 0) {
      const typicals = filtered.filter(r => r.equipment_price_typical_eur).map(r => r.equipment_price_typical_eur).sort((a, b) => a - b);
      if (typicals.length > 0) {
        console.log(`Price range (typical): EUR ${typicals[0]} — ${typicals[Math.floor(typicals.length / 2)]} — ${typicals[typicals.length - 1]}`);
      }
    }
    return;
  }

  if (reviewOnly) {
    const flagged = finalResults.filter(r => r._review_flags.length > 0);
    console.log(`\nItems with review flags (${flagged.length}):\n`);
    const byFlag = {};
    for (const r of flagged) {
      for (const f of r._review_flags) {
        if (!byFlag[f]) byFlag[f] = [];
        byFlag[f].push(r);
      }
    }
    for (const [flag, items] of Object.entries(byFlag)) {
      console.log(`  ${flag}: ${items.length} items`);
      for (const r of items.slice(0, 5)) {
        console.log(`    - ${r.manufacturer} | ${r.model?.slice(0, 50)} | EUR ${r.equipment_price_typical_eur || 'N/A'} | ${r.market_segment}`);
      }
      if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
    }

    // Show tier mismatch details from calibration
    if (calibrationReport?.tier_mismatch_flags?.length > 0) {
      console.log(`\n  Tier mismatch details:`);
      for (const f of calibrationReport.tier_mismatch_flags) {
        console.log(`    ${f.manufacturer} [${f.brand_tier}] band=${f.capacity_band}: simulated EUR ${f.simulated_typical} vs sample EUR ${f.sample_median} (${f.deviation_pct > 0 ? '+' : ''}${f.deviation_pct}%, ${f.sample_count} samples)`);
      }
    }
    return;
  }

  // --- Save outputs ---

  // Full priced dataset
  const outputData = {
    _meta: {
      ...bafaData._meta,
      pricing_version: '3.0',
      pricing_date: new Date().toISOString(),
      pricing_scope: 'equipment_only_installer_to_customer_range_DE',
      pricing_currency: 'EUR',
      improvements: [
        'v2: expanded market samples (100+)',
        'v2: residential/light_commercial/commercial_project segmentation',
        'v2: refined package_scope classification',
        'v2: segment-aware confidence logic',
        'v3: 168 market samples (42 brands) — split, bundle, C/D tier expansion',
        'v3: revised C-tier (-15% to -8%) and D-tier (-30% to -20%) multipliers',
        'v3: commercial N/A policy — weak-evidence commercial items get null prices',
        'v3: wider light_commercial ranges (±10% spread)',
        'v3: C/D tier-aware confidence (medium, not high)'
      ]
    },
    summary: finalSummary,
    items: finalResults
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'bafa-priced.json'),
    JSON.stringify(outputData, null, 2)
  );
  console.log(`Saved: output/bafa-priced.json (${finalResults.length} items)`);

  // Residential-only subset
  const residentialItems = finalResults.filter(r => r.residential_visibility_default === true);
  const residentialData = {
    _meta: {
      ...outputData._meta,
      subset: 'residential_core',
      subset_description: 'Products with residential_visibility_default=true'
    },
    summary: {
      total_items: residentialItems.length,
      confidence_distribution: {
        high: residentialItems.filter(r => r.price_confidence === 'high').length,
        medium: residentialItems.filter(r => r.price_confidence === 'medium').length,
        low: residentialItems.filter(r => r.price_confidence === 'low').length
      }
    },
    items: residentialItems
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'bafa-residential.json'),
    JSON.stringify(residentialData, null, 2)
  );
  console.log(`Saved: output/bafa-residential.json (${residentialItems.length} residential items)`);

  // Summary
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'pricing-summary.json'),
    JSON.stringify(finalSummary, null, 2)
  );
  console.log('Saved: output/pricing-summary.json');

  // Review flags
  const reviewItems = finalResults.filter(r => r._review_flags.length > 0);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'review-flags.json'),
    JSON.stringify({
      total_flagged: reviewItems.length,
      flags_summary: finalSummary.review_flags_summary,
      tier_mismatch_flags: calibrationReport?.tier_mismatch_flags || [],
      items: reviewItems.map(r => ({
        bafa_id: r.bafa_id,
        manufacturer: r.manufacturer,
        model: r.model,
        brand_tier: r.brand_tier,
        capacity_band: r.capacity_band,
        market_segment: r.market_segment,
        package_scope: r.package_scope,
        equipment_price_typical_eur: r.equipment_price_typical_eur,
        price_confidence: r.price_confidence,
        flags: r._review_flags
      }))
    }, null, 2)
  );
  console.log(`Saved: output/review-flags.json (${reviewItems.length} flagged items)`);

  // --- Print summary ---
  console.log('\n--- Summary ---');

  console.log('\nSegment distribution:');
  for (const [seg, count] of Object.entries(finalSummary.segment_distribution)) {
    console.log(`  ${seg}: ${count}`);
  }

  console.log('\nConfidence distribution (after calibration):');
  console.log(`  high: ${finalSummary.confidence_distribution.high}`);
  console.log(`  medium: ${finalSummary.confidence_distribution.medium}`);
  console.log(`  low: ${finalSummary.confidence_distribution.low}`);

  console.log('\nTier distribution:');
  for (const [tier, count] of Object.entries(finalSummary.tier_distribution).sort()) {
    console.log(`  ${tier}: ${count}`);
  }

  console.log('\nPackage scope distribution:');
  for (const [scope, count] of Object.entries(finalSummary.package_scope_distribution)) {
    console.log(`  ${scope}: ${count}`);
  }

  console.log('\nCapacity band distribution:');
  for (const [band, count] of Object.entries(finalSummary.capacity_band_distribution)) {
    console.log(`  ${band}: ${count}`);
  }

  console.log('\nReview flags:');
  for (const [flag, count] of Object.entries(finalSummary.review_flags_summary)) {
    console.log(`  ${flag}: ${count}`);
  }

  // v3: Commercial N/A stats
  const commercialNA = finalResults.filter(r => r.price_basis === 'N/A').length;
  const commercialPriced = finalResults.filter(r => r.market_segment === 'commercial_project' && r.equipment_price_typical_eur !== null).length;
  console.log(`\nCommercial pricing:`);
  console.log(`  Priced (with basis): ${commercialPriced}`);
  console.log(`  N/A (insufficient evidence): ${commercialNA}`);
  console.log(`  Total commercial_project: ${commercialPriced + commercialNA}`);

  // v3: Light commercial range info
  const lcItems = finalResults.filter(r => r.market_segment === 'light_commercial' && r.equipment_price_typical_eur);
  if (lcItems.length > 0) {
    const lcTypicals = lcItems.map(r => r.equipment_price_typical_eur).sort((a, b) => a - b);
    console.log(`\nLight commercial price range (typical):`);
    console.log(`  Min: EUR ${lcTypicals[0]} | Median: EUR ${lcTypicals[Math.floor(lcTypicals.length / 2)]} | Max: EUR ${lcTypicals[lcTypicals.length - 1]}`);
  }

  // Residential price sanity
  const resTypicals = residentialItems
    .filter(r => r.equipment_price_typical_eur)
    .map(r => r.equipment_price_typical_eur)
    .sort((a, b) => a - b);
  if (resTypicals.length > 0) {
    console.log(`\nResidential price range (typical):`);
    console.log(`  Min: EUR ${resTypicals[0]}`);
    console.log(`  P25: EUR ${resTypicals[Math.floor(resTypicals.length * 0.25)]}`);
    console.log(`  Median: EUR ${resTypicals[Math.floor(resTypicals.length * 0.5)]}`);
    console.log(`  P75: EUR ${resTypicals[Math.floor(resTypicals.length * 0.75)]}`);
    console.log(`  Max: EUR ${resTypicals[resTypicals.length - 1]}`);
  }

  console.log('\nDone.');
}

// ---------------------------------------------------------------------------
run();
