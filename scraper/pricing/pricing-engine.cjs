/**
 * Deterministic Pricing Engine v3 for BAFA Luft/Wasser Heat Pumps
 *
 * v3 improvements:
 * - Revised C-tier (-15% to -8%) and D-tier (-30% to -20%) multipliers
 *   based on expanded market sample evidence (168 samples, 42 brands)
 * - Commercial N/A policy: commercial_project with weak evidence → null prices
 * - Wider light_commercial price ranges (+/-10% spread)
 * - C/D tier-aware confidence logic
 *
 * v2 improvements:
 * - Residential / light_commercial / commercial_project segmentation
 * - Refined package_scope classification from market-sampler v2
 * - Better confidence logic tied to segment + sample coverage
 * - Calibration uses only unit_only samples, ignores bundles
 *
 * Formula:
 *   Final Price Range = Base Capacity Band Price
 *     × Brand Tier Multiplier
 *     × Refrigerant Modifier
 *     × Installation Type Modifier
 *     × Performance Modifier
 */

const fs = require('fs');
const path = require('path');

const config = require('./config.json');
const brandTiers = require('./brand-tiers.json');
const sampler = require('./market-sampler.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCapacityBand(powerKw) {
  if (!powerKw || powerKw <= 0) return null;

  if (powerKw < 4) {
    const band = config.base_capacity_matrix[0];
    return { ...band, sub4kw: true };
  }

  for (const band of config.base_capacity_matrix) {
    if (powerKw >= band.min_kw && powerKw <= band.max_kw) {
      return { ...band, sub4kw: false };
    }
  }

  const lastBand = config.base_capacity_matrix[config.base_capacity_matrix.length - 1];
  return { ...lastBand, sub4kw: false };
}

function getBrandTier(manufacturer) {
  const entry = brandTiers.brands[manufacturer];
  if (entry) {
    const tierConfig = config.brand_tiers[entry.tier];
    return {
      tier: entry.tier,
      min_adj: tierConfig.min_adj,
      max_adj: tierConfig.max_adj,
      review_priority: entry.review_priority,
      notes: entry.notes,
      matched: true
    };
  }
  const tierC = config.brand_tiers['C'];
  return {
    tier: 'C',
    min_adj: tierC.min_adj,
    max_adj: tierC.max_adj,
    review_priority: 'low',
    notes: 'Not in brand tier mapping; defaulting to C',
    matched: false
  };
}

function getRefrigerantGroup(refrigerant) {
  if (!refrigerant) {
    return { group: 'unknown', ...config.refrigerant_adjustments._default };
  }
  const r = refrigerant.toUpperCase().trim();

  if (config.refrigerant_adjustments[r]) {
    return { group: r, ...config.refrigerant_adjustments[r] };
  }

  if (r.includes('R290')) return { group: 'R290', ...config.refrigerant_adjustments.R290 };
  if (r.includes('R32')) return { group: 'R32', ...config.refrigerant_adjustments.R32 };
  if (r.includes('R410A')) return { group: 'R410A', ...config.refrigerant_adjustments.R410A };
  if (r.includes('R454B')) return { group: 'R454B', ...config.refrigerant_adjustments.R454B };
  if (r.includes('R454C')) return { group: 'R454C', ...config.refrigerant_adjustments.R454C };
  if (r.includes('R452B')) return { group: 'R452B', ...config.refrigerant_adjustments.R452B };

  return { group: r, ...config.refrigerant_adjustments._default };
}

function detectInstallationType(model) {
  if (!model) return 'Monoblock';
  const m = model.toLowerCase();
  if (m.includes('split')) return 'Split';
  if (m.includes('odu') && !m.includes('mono')) return 'Split';
  return 'Monoblock';
}

/**
 * Detect package scope from BAFA model name — uses refined v2 logic.
 */
function detectPackageScope(model) {
  const result = sampler.classifyBafaPackageScope(model);
  return result.scope;
}

/**
 * Get package scope with confidence for richer output.
 */
function detectPackageScopeDetailed(model) {
  return sampler.classifyBafaPackageScope(model);
}

function getPerformanceAdjustments(item, stats) {
  let totalMinAdj = 0;
  let totalMaxAdj = 0;

  if (stats.scopThresholdTop20 && item.scop && item.scop >= stats.scopThresholdTop20) {
    totalMinAdj += config.performance_adjustments.scop_top_20pct.min_adj;
    totalMaxAdj += config.performance_adjustments.scop_top_20pct.max_adj;
  }

  if (stats.noiseThresholdTop20 && item.noise_outdoor_dB && item.noise_outdoor_dB <= stats.noiseThresholdTop20) {
    totalMinAdj += config.performance_adjustments.low_noise_top_20pct.min_adj;
    totalMaxAdj += config.performance_adjustments.low_noise_top_20pct.max_adj;
  }

  if (item.efficiency_55C_percent && item.efficiency_55C_percent >= 140) {
    totalMinAdj += config.performance_adjustments.high_flow_temp_70_75C.min_adj;
    totalMaxAdj += config.performance_adjustments.high_flow_temp_70_75C.max_adj;
  }

  return { min_adj: totalMinAdj, max_adj: totalMaxAdj };
}

// ---------------------------------------------------------------------------
// Market segmentation — NEW in v2
// ---------------------------------------------------------------------------

/**
 * Commercial/project-oriented manufacturer keywords.
 * These manufacturers are primarily commercial HVAC.
 */
const COMMERCIAL_FOCUSED_BRANDS = new Set([
  'CLIVET GmbH',
  'Trane Deutschland GmbH',
  'Aermec Deutschland GmbH',
  'FläktGroup Deutschland GmbH',
  'Swegon Germany GmbH',
  'Stulz GmbH',
  'MTA Deutschland GmbH',
  'Rhoss Deutschland GmbH',
  '2G Heek GmbH',
  'Galletti S.p.A.',
]);

/**
 * Model name patterns indicating commercial/project products.
 */
const COMMERCIAL_MODEL_PATTERNS = [
  /\bvrf\b/i,
  /\bchiller\b/i,
  /\brooftop\b/i,
  /\bcassette\b/i,
  /\bducted\b/i,
  /multi[\s-]?v/i,
  /city[\s-]?multi/i,
];

/**
 * Classify a BAFA item into market segment.
 *
 * Returns:
 *   market_segment: 'residential_core' | 'light_commercial' | 'commercial_project'
 *   segment_confidence: 'high' | 'medium' | 'low'
 *   residential_visibility_default: boolean
 */
function classifyMarketSegment(item) {
  const powerKw = item.power_35C_kw || item.power_55C_kw || 0;
  const model = (item.model || '').toLowerCase();
  const manufacturer = item.manufacturer || '';
  const numCompressors = item.num_compressors || 1;

  // --- Hard rules: clearly commercial ---

  // Very high power: >100kW is always commercial_project
  if (powerKw > 100) {
    return {
      market_segment: 'commercial_project',
      segment_confidence: 'high',
      residential_visibility_default: false
    };
  }

  // >50kW with commercial-focused brand
  if (powerKw > 50 && COMMERCIAL_FOCUSED_BRANDS.has(manufacturer)) {
    return {
      market_segment: 'commercial_project',
      segment_confidence: 'high',
      residential_visibility_default: false
    };
  }

  // >50kW general
  if (powerKw > 50) {
    return {
      market_segment: 'commercial_project',
      segment_confidence: 'medium',
      residential_visibility_default: false
    };
  }

  // Model name contains clear commercial patterns
  if (COMMERCIAL_MODEL_PATTERNS.some(p => p.test(model))) {
    return {
      market_segment: 'commercial_project',
      segment_confidence: 'medium',
      residential_visibility_default: false
    };
  }

  // Multiple compressors (>4) + >20kW = project-oriented
  if (numCompressors > 4 && powerKw > 20) {
    return {
      market_segment: 'commercial_project',
      segment_confidence: 'medium',
      residential_visibility_default: false
    };
  }

  // --- Light commercial zone: 20-50kW ---

  if (powerKw > 20) {
    // Commercial-focused brand in the 20-50kW range
    if (COMMERCIAL_FOCUSED_BRANDS.has(manufacturer)) {
      return {
        market_segment: 'commercial_project',
        segment_confidence: 'medium',
        residential_visibility_default: false
      };
    }

    // Residential heating brands can have 20-50kW products for larger buildings
    return {
      market_segment: 'light_commercial',
      segment_confidence: 'medium',
      residential_visibility_default: false
    };
  }

  // --- Residential core: <=20kW ---

  // Even <=20kW items from commercial-only brands get reduced confidence
  if (COMMERCIAL_FOCUSED_BRANDS.has(manufacturer)) {
    return {
      market_segment: 'light_commercial',
      segment_confidence: 'low',
      residential_visibility_default: false
    };
  }

  // Standard residential product
  return {
    market_segment: 'residential_core',
    segment_confidence: 'high',
    residential_visibility_default: true
  };
}

// ---------------------------------------------------------------------------
// Main pricing function
// ---------------------------------------------------------------------------

function applyAdjustment(prices, minAdj, maxAdj) {
  return {
    low: prices.low * (1 + minAdj),
    typical: prices.typical * (1 + (minAdj + maxAdj) / 2),
    high: prices.high * (1 + maxAdj)
  };
}

function priceItem(item, stats) {
  const result = {
    bafa_id: item.bafa_id,
    manufacturer: item.manufacturer,
    model: item.model,
    equipment_price_low_eur: null,
    equipment_price_typical_eur: null,
    equipment_price_high_eur: null,
    price_basis: 'simulated',
    price_confidence: 'medium',
    brand_tier: null,
    capacity_band: null,
    refrigerant_group: null,
    installation_type: null,
    package_scope: null,
    package_scope_confidence: null,
    // v2 segmentation fields
    market_segment: null,
    segment_confidence: null,
    residential_visibility_default: null,
    _review_flags: []
  };

  // 0. Market segmentation
  const segInfo = classifyMarketSegment(item);
  result.market_segment = segInfo.market_segment;
  result.segment_confidence = segInfo.segment_confidence;
  result.residential_visibility_default = segInfo.residential_visibility_default;

  // 1. Capacity band
  const powerKw = item.power_35C_kw || item.power_55C_kw;
  const band = getCapacityBand(powerKw);
  if (!band) {
    result.price_confidence = 'low';
    result._review_flags.push('no_power_data');
    return result;
  }
  result.capacity_band = band.capacity_band;

  let prices = { low: band.low, typical: band.typical, high: band.high };

  if (band.sub4kw) {
    prices = applyAdjustment(prices, config.sub_4kw_rule.min_adj, config.sub_4kw_rule.max_adj);
  }

  // 2. Brand tier
  const brandInfo = getBrandTier(item.manufacturer);
  result.brand_tier = brandInfo.tier;
  prices = applyAdjustment(prices, brandInfo.min_adj, brandInfo.max_adj);
  if (!brandInfo.matched) {
    result._review_flags.push('brand_not_mapped');
  }

  // 3. Refrigerant
  const refInfo = getRefrigerantGroup(item.refrigerant);
  result.refrigerant_group = refInfo.group;
  prices = applyAdjustment(prices, refInfo.min_adj, refInfo.max_adj);

  // 4. Installation type
  const instType = detectInstallationType(item.model);
  result.installation_type = instType;
  const instAdj = config.installation_type_adjustments[instType] || config.installation_type_adjustments.Monoblock;
  prices = applyAdjustment(prices, instAdj.min_adj, instAdj.max_adj);

  // 5. Package scope (v2 — with confidence)
  const pkgDetail = detectPackageScopeDetailed(item.model);
  result.package_scope = pkgDetail.scope;
  result.package_scope_confidence = pkgDetail.confidence;

  // 6. Performance adjustments
  const perfAdj = getPerformanceAdjustments(item, stats);
  prices = applyAdjustment(prices, perfAdj.min_adj, perfAdj.max_adj);

  // 7. v3 — Commercial N/A policy
  //    commercial_project with insufficient evidence → null prices
  if (segInfo.market_segment === 'commercial_project') {
    // Only price if: known commercial brand + power ≤100kW + unit_only scope
    const hasReasonableBasis = brandInfo.matched &&
                                powerKw <= 100 &&
                                pkgDetail.scope === 'unit_only';
    if (!hasReasonableBasis) {
      result.equipment_price_low_eur = null;
      result.equipment_price_typical_eur = null;
      result.equipment_price_high_eur = null;
      result.price_basis = 'N/A';
      result.price_confidence = 'low';
      result._review_flags.push('commercial_no_price');
      return result;
    }
    // Commercial with reasonable basis: price but flag as low confidence
  }

  // 8. v3 — Light commercial wider range
  //    Expand spread by ±10% for light_commercial to reflect uncertainty
  if (segInfo.market_segment === 'light_commercial') {
    prices.low = prices.low * 0.90;
    prices.high = prices.high * 1.10;
  }

  // 9. Round to nearest 50 EUR
  result.equipment_price_low_eur = Math.round(prices.low / 50) * 50;
  result.equipment_price_typical_eur = Math.round(prices.typical / 50) * 50;
  result.equipment_price_high_eur = Math.round(prices.high / 50) * 50;

  // 10. Confidence assessment (v3 — segment + tier-aware)
  result.price_confidence = computeConfidence(result, brandInfo, powerKw);

  return result;
}

/**
 * v3 confidence logic — considers segment, package scope, brand, tier, and power range.
 */
function computeConfidence(result, brandInfo, powerKw) {
  // Commercial projects: always low confidence (no public pricing basis)
  if (result.market_segment === 'commercial_project') {
    result._review_flags.push('commercial_project_unit');
    return 'low';
  }

  // Light commercial: medium at best
  if (result.market_segment === 'light_commercial') {
    if (!brandInfo.matched) return 'low';
    return 'medium';
  }

  // Residential core logic
  const pkgScope = result.package_scope;

  // Bundle/unknown package: lower confidence
  if (pkgScope === 'all_in_one') return 'low';
  if (pkgScope === 'with_hydromodule') return 'medium';
  if (pkgScope === 'bundle_unknown') return 'low';

  // Unknown brand
  if (!brandInfo.matched) return 'low';

  // Low-priority brands
  if (brandInfo.review_priority === 'low') return 'medium';

  // v3: C/D tier — medium confidence even for residential unit_only
  // These tiers have wider sample variance and less predictable distribution
  if (['C', 'D'].includes(brandInfo.tier)) {
    return 'medium';
  }

  // Good residential unit_only with known S/A+/A/B+/B brand
  if (pkgScope === 'unit_only' && powerKw <= 20 &&
      ['S', 'A+', 'A', 'B+', 'B'].includes(brandInfo.tier)) {
    return 'high';
  }

  return 'medium';
}

// ---------------------------------------------------------------------------
// Population statistics
// ---------------------------------------------------------------------------

function computePopulationStats(items) {
  const residential = items.filter(i => (i.power_35C_kw || 0) <= 50);

  const scops = residential
    .filter(i => i.scop && i.scop > 0)
    .map(i => i.scop)
    .sort((a, b) => b - a);

  const scopThresholdTop20 = scops.length > 0 ? scops[Math.floor(scops.length * 0.2)] : null;

  const noises = residential
    .filter(i => i.noise_outdoor_dB && i.noise_outdoor_dB > 0)
    .map(i => i.noise_outdoor_dB)
    .sort((a, b) => a - b);

  const noiseThresholdTop20 = noises.length > 0 ? noises[Math.floor(noises.length * 0.2)] : null;

  return {
    scopThresholdTop20,
    noiseThresholdTop20,
    totalItems: items.length,
    residentialItems: residential.length
  };
}

// ---------------------------------------------------------------------------
// Batch pricing
// ---------------------------------------------------------------------------

function priceAll(bafaData) {
  const items = bafaData.items;
  const stats = computePopulationStats(items);

  const results = items.map(item => priceItem(item, stats));

  const priced = results.filter(r => r.equipment_price_typical_eur !== null);
  const naItems = results.filter(r => r.price_basis === 'N/A');
  const summary = {
    total_items: results.length,
    priced_items: priced.length,
    unpriced_items: results.length - priced.length,
    commercial_na_items: naItems.length,
    confidence_distribution: {
      high: results.filter(r => r.price_confidence === 'high').length,
      medium: results.filter(r => r.price_confidence === 'medium').length,
      low: results.filter(r => r.price_confidence === 'low').length
    },
    segment_distribution: {
      residential_core: results.filter(r => r.market_segment === 'residential_core').length,
      light_commercial: results.filter(r => r.market_segment === 'light_commercial').length,
      commercial_project: results.filter(r => r.market_segment === 'commercial_project').length
    },
    package_scope_distribution: {},
    tier_distribution: {},
    capacity_band_distribution: {},
    review_flags_summary: {},
    population_stats: stats
  };

  for (const r of results) {
    if (r.brand_tier) {
      summary.tier_distribution[r.brand_tier] = (summary.tier_distribution[r.brand_tier] || 0) + 1;
    }
    if (r.capacity_band) {
      summary.capacity_band_distribution[r.capacity_band] = (summary.capacity_band_distribution[r.capacity_band] || 0) + 1;
    }
    if (r.package_scope) {
      summary.package_scope_distribution[r.package_scope] = (summary.package_scope_distribution[r.package_scope] || 0) + 1;
    }
    for (const flag of r._review_flags) {
      summary.review_flags_summary[flag] = (summary.review_flags_summary[flag] || 0) + 1;
    }
  }

  return { results, stats, summary };
}

// ---------------------------------------------------------------------------
// Calibration v2
// ---------------------------------------------------------------------------

/**
 * Apply market sample calibration.
 * v2 improvements:
 * - Only uses unit_only samples for calibration
 * - Tracks sample density per manufacturer+band for confidence boost
 * - Residential items only — commercial items stay simulation-only
 * - Blending thresholds: need >= 2 unit_only samples and <= 25% deviation
 */
function calibrate(results, samples) {
  if (!samples || samples.length === 0) {
    return {
      calibratedResults: results,
      calibrationReport: { status: 'no_samples', adjustments: 0, coverage: {} }
    };
  }

  // Index unit_only samples by manufacturer + capacity band
  const sampleIndex = {};
  let unitOnlyTotal = 0;
  for (const s of samples) {
    if (s.package_scope !== 'unit_only') continue;
    unitOnlyTotal++;
    const key = `${s.manufacturer}|${s.capacity_band}`;
    if (!sampleIndex[key]) sampleIndex[key] = [];
    sampleIndex[key].push(s);
  }

  let adjustmentCount = 0;
  let confidenceBoosts = 0;
  const tierMismatchFlags = [];

  const calibratedResults = results.map(r => {
    // Only calibrate residential/light_commercial
    if (r.market_segment === 'commercial_project') return r;

    const key = `${r.manufacturer}|${r.capacity_band}`;
    const matchingSamples = sampleIndex[key];
    if (!matchingSamples || matchingSamples.length === 0) return r;

    const samplePrices = matchingSamples.map(s => s.price_eur).sort((a, b) => a - b);
    const sampleMedian = samplePrices[Math.floor(samplePrices.length / 2)];

    if (!r.equipment_price_typical_eur) return r;

    const ratio = sampleMedian / r.equipment_price_typical_eur;

    // >30% deviation: flag for manual review, do NOT auto-adjust
    if (ratio < 0.70 || ratio > 1.30) {
      tierMismatchFlags.push({
        manufacturer: r.manufacturer,
        capacity_band: r.capacity_band,
        brand_tier: r.brand_tier,
        simulated_typical: r.equipment_price_typical_eur,
        sample_median: Math.round(sampleMedian),
        sample_count: matchingSamples.length,
        deviation_pct: Math.round((ratio - 1) * 100),
        action: 'FLAG_FOR_MANUAL_REVIEW'
      });
      r._review_flags.push('sample_price_mismatch');
      return r;
    }

    // Within 25% deviation and >= 2 samples: blend
    if (Math.abs(ratio - 1) <= 0.25 && matchingSamples.length >= 2) {
      const blendWeight = Math.min(0.45, matchingSamples.length * 0.15); // more samples = more weight
      r.equipment_price_typical_eur = Math.round(
        (r.equipment_price_typical_eur * (1 - blendWeight) + sampleMedian * blendWeight) / 50
      ) * 50;
      r.price_basis = 'mixed';
      adjustmentCount++;
    }

    // Even 1 sample in range boosts confidence for residential_core
    // v3: only boost S/A+/A/B+/B tiers; C/D stay at medium
    if (r.market_segment === 'residential_core' && r.package_scope === 'unit_only' &&
        !['C', 'D'].includes(r.brand_tier)) {
      if (r.price_confidence !== 'high') {
        r.price_confidence = 'high';
        confidenceBoosts++;
      }
    }

    return r;
  });

  return {
    calibratedResults,
    calibrationReport: {
      status: 'calibrated',
      total_samples: samples.length,
      unit_only_samples: unitOnlyTotal,
      unique_brand_band_combos: Object.keys(sampleIndex).length,
      adjustments: adjustmentCount,
      confidence_boosts: confidenceBoosts,
      tier_mismatch_flags: tierMismatchFlags
    }
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  priceItem,
  priceAll,
  calibrate,
  computePopulationStats,
  classifyMarketSegment,
  getCapacityBand,
  getBrandTier,
  getRefrigerantGroup,
  detectInstallationType,
  detectPackageScope,
  detectPackageScopeDetailed
};
