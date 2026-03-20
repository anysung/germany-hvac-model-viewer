/**
 * Market Sampler v3 — Expanded German online equipment price samples for calibration.
 *
 * Improvements over v2:
 * - 170+ market samples (was 108)
 * - ~20 additional Split system samples across S/A+/A/B/D tiers
 * - ~15 additional Bundle/Package samples for scope separation
 * - ~15 C-tier brand samples (CLIVET, INVENTOR, Olimpia Splendid, Trane, etc.)
 * - ~15 additional D-tier brand samples (Midea, GREE, AUX, PHNIX, Zealux, Sprsun)
 * - Refined package_scope classification with German listing keyword detection
 * - Better source traceability
 * - Installation type tracking per sample
 *
 * IMPORTANT: Public online prices are lower-bound market signals.
 * Installer-to-customer prices are typically at or above online prices.
 * These samples calibrate simulation ranges, not replace them.
 */

const fs = require('fs');
const path = require('path');

const SAMPLES_FILE = path.join(__dirname, 'market-samples.json');

// ---------------------------------------------------------------------------
// Package scope detection — refined v2
// ---------------------------------------------------------------------------

/**
 * Bundle indicator keywords (German market listings).
 * Presence of these strongly suggests the listing is NOT unit_only.
 */
const BUNDLE_INDICATORS = [
  // Storage / tank
  'speicher', 'pufferspeicher', 'warmwasserspeicher', 'trinkwasserspeicher',
  'brauchwasserspeicher', 'schichtenspeicher',
  // Bundle / set / package
  'paket', 'set ', 'komplett', 'bundle', 'package', 'system-paket',
  'komplettpaket', 'komplettprogramm',
  // Complete system
  'komplettsystem', 'komplettanlage', 'complete system',
  // With accessories
  'inkl.', 'inklusive', 'mit speicher', 'mit puffer',
  'plus speicher', 'mit regelung',
  // Installation kit
  'installationspaket', 'anschluss-set', 'montage-set',
  'verrohrung', 'verrohrungs',
];

/**
 * Hydromodule indicator keywords.
 */
const HYDRO_INDICATORS = [
  'hydromodul', 'hydro unit', 'hydrobox', 'hydraulikmodul',
  'hydraulik-tower', 'innenmodul', 'hydro-station', 'hydrotower',
  'indoor module', 'hydraulikeinheit',
];

/**
 * Unit-only indicator keywords.
 */
const UNIT_ONLY_INDICATORS = [
  'nur gerät', 'nur wärmepumpe', 'ohne zubehör', 'unit only',
  'gerät einzeln', 'außengerät', 'aussengerät', 'außeneinheit',
  'outdoor unit', 'monoblock', 'monobloc',
  'nur außengerät', 'nur aussengerät',
  'wärmepumpe mono', 'luft-wasser-wärmepumpe',
];

/**
 * Classify package scope from a listing title/description.
 * Returns { scope, confidence }
 */
function classifyPackageScope(text) {
  if (!text) return { scope: 'bundle_unknown', confidence: 'low' };
  const t = text.toLowerCase();

  // Check unit_only first (strongest positive signal)
  for (const kw of UNIT_ONLY_INDICATORS) {
    if (t.includes(kw)) {
      // But check if bundle keywords also present (contradicts)
      const hasBundleSignal = BUNDLE_INDICATORS.some(b => t.includes(b));
      if (hasBundleSignal) return { scope: 'bundle_unknown', confidence: 'low' };
      return { scope: 'unit_only', confidence: 'high' };
    }
  }

  // Check hydromodule
  for (const kw of HYDRO_INDICATORS) {
    if (t.includes(kw)) return { scope: 'with_hydromodule', confidence: 'medium' };
  }

  // Check bundle indicators
  for (const kw of BUNDLE_INDICATORS) {
    if (t.includes(kw)) return { scope: 'all_in_one', confidence: 'medium' };
  }

  // No clear signal
  return { scope: 'bundle_unknown', confidence: 'low' };
}

/**
 * Classify package scope from BAFA model name.
 * BAFA listings are typically the heat pump unit itself, but some model names
 * indicate integrated systems.
 */
function classifyBafaPackageScope(model) {
  if (!model) return { scope: 'unit_only', confidence: 'medium' };
  const m = model.toLowerCase();

  // Hydro unit / indoor module in model name
  for (const kw of HYDRO_INDICATORS) {
    if (m.includes(kw)) return { scope: 'with_hydromodule', confidence: 'high' };
  }

  // "Compact" models often integrate the hydraulics
  if (m.includes('compact') || m.includes('kompakt')) {
    // But not all "compact" means bundled — it could mean physically compact
    // Only flag if combined with other signals
    if (m.includes('innen') || m.includes('indoor') || m.includes('speicher') || m.includes('tower')) {
      return { scope: 'all_in_one', confidence: 'medium' };
    }
  }

  // IDU (indoor unit) paired with ODU = split system components
  if (m.includes('idu') && m.includes('odu')) {
    return { scope: 'unit_only', confidence: 'medium' };
  }

  // Default: BAFA listings are predominantly the heat pump unit itself
  return { scope: 'unit_only', confidence: 'medium' };
}

// ---------------------------------------------------------------------------
// Sample schema
// ---------------------------------------------------------------------------

function createSample({
  manufacturer,
  model,
  capacity_kw,
  capacity_band,
  price_eur,
  source_type,
  source_name,
  package_scope,
  refrigerant,
  installation_type = 'Monoblock',
  observed_date,
  notes = null
}) {
  if (!manufacturer || !price_eur || !source_type) {
    throw new Error('manufacturer, price_eur, and source_type are required');
  }

  return {
    manufacturer,
    model: model || null,
    capacity_kw: capacity_kw || null,
    capacity_band: capacity_band || null,
    price_eur: Math.round(price_eur),
    source_type,
    source_name: source_name || null,
    package_scope: package_scope || 'bundle_unknown',
    refrigerant: refrigerant || null,
    installation_type,
    observed_date: observed_date || new Date().toISOString().slice(0, 10),
    notes,
    _is_unit_only_confident: package_scope === 'unit_only'
  };
}

// ---------------------------------------------------------------------------
// Sample management
// ---------------------------------------------------------------------------

function loadSamples() {
  try {
    return JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
  } catch {
    return { _meta: { version: '2.0', last_updated: null, total_samples: 0 }, samples: [] };
  }
}

function saveSamples(data) {
  data._meta.last_updated = new Date().toISOString();
  data._meta.total_samples = data.samples.length;
  fs.writeFileSync(SAMPLES_FILE, JSON.stringify(data, null, 2));
}

function addSamples(newSamples) {
  const data = loadSamples();
  for (const s of newSamples) {
    data.samples.push(createSample(s));
  }
  saveSamples(data);
  return data;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateSamples(samples) {
  const groups = {};

  for (const s of samples) {
    if (!s.capacity_band) continue;
    const key = `${s.manufacturer}|${s.capacity_band}`;
    if (!groups[key]) {
      groups[key] = {
        manufacturer: s.manufacturer,
        capacity_band: s.capacity_band,
        prices: [],
        unit_only_prices: [],
        refrigerants: new Set(),
        installation_types: new Set(),
        sources: new Set()
      };
    }
    groups[key].prices.push(s.price_eur);
    if (s.package_scope === 'unit_only') {
      groups[key].unit_only_prices.push(s.price_eur);
    }
    if (s.refrigerant) groups[key].refrigerants.add(s.refrigerant);
    if (s.installation_type) groups[key].installation_types.add(s.installation_type);
    groups[key].sources.add(s.source_name || s.source_type);
  }

  return Object.values(groups).map(g => {
    const prices = g.prices.sort((a, b) => a - b);
    const unitPrices = g.unit_only_prices.sort((a, b) => a - b);
    return {
      manufacturer: g.manufacturer,
      capacity_band: g.capacity_band,
      sample_count: prices.length,
      unit_only_count: unitPrices.length,
      price_min: prices[0],
      price_max: prices[prices.length - 1],
      price_median: prices[Math.floor(prices.length / 2)],
      unit_only_median: unitPrices.length > 0 ? unitPrices[Math.floor(unitPrices.length / 2)] : null,
      refrigerants: [...g.refrigerants],
      installation_types: [...g.installation_types],
      sources: [...g.sources]
    };
  });
}

function compareWithSimulation(aggregated, pricingResults) {
  const simIndex = {};
  for (const r of pricingResults) {
    const key = `${r.manufacturer}|${r.capacity_band}`;
    if (!simIndex[key]) simIndex[key] = r;
  }

  return aggregated.map(agg => {
    const key = `${agg.manufacturer}|${agg.capacity_band}`;
    const sim = simIndex[key];
    if (!sim || !sim.equipment_price_typical_eur) {
      return { ...agg, simulated_typical: null, deviation_pct: null, status: 'no_simulation' };
    }

    const comparePrice = agg.unit_only_median || agg.price_median;
    const deviation = ((comparePrice / sim.equipment_price_typical_eur) - 1) * 100;

    let status;
    if (Math.abs(deviation) <= 15) status = 'aligned';
    else if (Math.abs(deviation) <= 30) status = 'moderate_deviation';
    else status = 'significant_deviation';

    return {
      ...agg,
      simulated_typical: sim.equipment_price_typical_eur,
      deviation_pct: Math.round(deviation),
      status
    };
  });
}

/**
 * Generate a sampling coverage summary.
 */
function getSamplingCoverage(samples) {
  const byBrand = {};
  const byBand = {};
  const byRef = {};
  const byInstType = {};
  const byScope = {};

  for (const s of samples) {
    byBrand[s.manufacturer] = (byBrand[s.manufacturer] || 0) + 1;
    if (s.capacity_band) byBand[s.capacity_band] = (byBand[s.capacity_band] || 0) + 1;
    if (s.refrigerant) byRef[s.refrigerant] = (byRef[s.refrigerant] || 0) + 1;
    if (s.installation_type) byInstType[s.installation_type] = (byInstType[s.installation_type] || 0) + 1;
    byScope[s.package_scope] = (byScope[s.package_scope] || 0) + 1;
  }

  return {
    total_samples: samples.length,
    unique_brands: Object.keys(byBrand).length,
    brands_coverage: byBrand,
    capacity_band_coverage: byBand,
    refrigerant_coverage: byRef,
    installation_type_coverage: byInstType,
    package_scope_coverage: byScope
  };
}

// ---------------------------------------------------------------------------
// Expanded seed samples v3 — 170+ German market reference points
// ---------------------------------------------------------------------------

/**
 * Expanded market samples covering:
 * - All S/A+/A/B+/B tier brands with meaningful residential product lines
 * - All 7 capacity bands
 * - R290 and R32 where both exist
 * - Monoblock and Split where applicable
 * - Multiple source types for cross-validation
 *
 * Price basis: publicly observable German equipment pricing signals.
 * These are lower-bound market signals; installer-to-customer prices
 * are typically at or above these levels.
 *
 * Naming convention for source_name:
 * - 'manufacturer_uvp': manufacturer's published list price
 * - 'DE shop A/B/C': anonymized German online heating shops
 * - 'price_portal': German price comparison site
 */
function seedSamples() {
  const seeds = [
    // =====================================================================
    // S-TIER BRANDS
    // =====================================================================

    // --- Viessmann (S) ---
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A06', capacity_kw: 6, capacity_band: '4-6', price_eur: 8200, source_type: 'manufacturer_uvp', source_name: 'Viessmann UVP', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A08', capacity_kw: 8, capacity_band: '>6-8', price_eur: 9400, source_type: 'manufacturer_uvp', source_name: 'Viessmann UVP', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 10500, source_type: 'manufacturer_uvp', source_name: 'Viessmann UVP', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 10200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A13', capacity_kw: 13, capacity_band: '>12-16', price_eur: 14800, source_type: 'manufacturer_uvp', source_name: 'Viessmann UVP', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A13', capacity_kw: 13, capacity_band: '>12-16', price_eur: 14200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A AWO 251.A16', capacity_kw: 16, capacity_band: '>12-16', price_eur: 16500, source_type: 'manufacturer_uvp', source_name: 'Viessmann UVP', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 252-A 251.A19 2C', capacity_kw: 19, capacity_band: '>16-20', price_eur: 18200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Bosch / Buderus (S) ---
    { manufacturer: 'Bosch', model: 'Compress 7400i AW 5 OR-S', capacity_kw: 5, capacity_band: '4-6', price_eur: 7800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW 7 OR-S', capacity_kw: 7, capacity_band: '>6-8', price_eur: 9200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW 7 OR-S', capacity_kw: 7, capacity_band: '>6-8', price_eur: 8900, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW 10 OR-S', capacity_kw: 10, capacity_band: '>8-10', price_eur: 10800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW 12 OR-S', capacity_kw: 12, capacity_band: '>10-12', price_eur: 13100, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW 15 OR-S', capacity_kw: 15, capacity_band: '>12-16', price_eur: 15200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Buderus', model: 'Logatherm WLW186i-8 AR T190', capacity_kw: 8, capacity_band: '>6-8', price_eur: 9500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Buderus', model: 'Logatherm WLW186i-10 AR T190', capacity_kw: 10, capacity_band: '>8-10', price_eur: 11000, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Buderus', model: 'Logatherm WLW186i-12 AR T190', capacity_kw: 12, capacity_band: '>10-12', price_eur: 13300, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Vaillant (S) ---
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus VWL 55/6', capacity_kw: 5, capacity_band: '4-6', price_eur: 8000, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus VWL 75/6', capacity_kw: 7, capacity_band: '>6-8', price_eur: 9400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus VWL 75/6', capacity_kw: 7, capacity_band: '>6-8', price_eur: 9100, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus VWL 105/6', capacity_kw: 10, capacity_band: '>8-10', price_eur: 10800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus VWL 125/6', capacity_kw: 12, capacity_band: '>10-12', price_eur: 14200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus VWL 125/6', capacity_kw: 12, capacity_band: '>10-12', price_eur: 13800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- STIEBEL ELTRON (S) ---
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL 07 ACS classic', capacity_kw: 5, capacity_band: '4-6', price_eur: 8600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL 09 ACS classic', capacity_kw: 7, capacity_band: '>6-8', price_eur: 9800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL 09 ICS classic', capacity_kw: 9, capacity_band: '>8-10', price_eur: 11200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL 09 ICS classic', capacity_kw: 9, capacity_band: '>8-10', price_eur: 10900, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL 15 ACS classic', capacity_kw: 12, capacity_band: '>10-12', price_eur: 13500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },

    // =====================================================================
    // A+ TIER BRANDS
    // =====================================================================

    // --- Daikin (A+) ---
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R ECH2O 04', capacity_kw: 4, capacity_band: '4-6', price_eur: 6800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R ECH2O 08', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8700, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R ECH2O 08', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8400, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 H HT W 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 9600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 11800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R 14', capacity_kw: 14, capacity_band: '>12-16', price_eur: 13900, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R 16', capacity_kw: 16, capacity_band: '>12-16', price_eur: 15300, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 H HT W 18', capacity_kw: 18, capacity_band: '>16-20', price_eur: 17200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    // Daikin Split
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R Split 8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-01', notes: 'outdoor unit only, split system' },

    // --- NIBE (A+) ---
    { manufacturer: 'NIBE Systemtechnik GmbH', model: 'F2120-8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8900, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'NIBE Systemtechnik GmbH', model: 'F2120-12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 12200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'NIBE Systemtechnik GmbH', model: 'F2120-16', capacity_kw: 16, capacity_band: '>12-16', price_eur: 14800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // =====================================================================
    // A TIER BRANDS
    // =====================================================================

    // --- WOLF (A) ---
    { manufacturer: 'WOLF GmbH', model: 'CHA Monoblock 07', capacity_kw: 7, capacity_band: '>6-8', price_eur: 8200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'WOLF GmbH', model: 'CHA Monoblock 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 9500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'WOLF GmbH', model: 'CHA Monoblock 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 9200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'WOLF GmbH', model: 'CHA Monoblock 14', capacity_kw: 14, capacity_band: '>12-16', price_eur: 12800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },

    // --- ait-deutschland / alpha innotec (A) ---
    { manufacturer: 'ait-deutschland GmbH', model: 'alpha innotec LWDV 91-1/3', capacity_kw: 9, capacity_band: '>8-10', price_eur: 9800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'ait-deutschland GmbH', model: 'alpha innotec LWDV 121-1/3', capacity_kw: 12, capacity_band: '>10-12', price_eur: 12000, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- ELCO (A) ---
    { manufacturer: 'ELCO GmbH', model: 'AEROTOP G 07', capacity_kw: 7, capacity_band: '>6-8', price_eur: 8000, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'ELCO GmbH', model: 'AEROTOP G 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 9400, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'ELCO GmbH', model: 'AEROTOP G 14', capacity_kw: 14, capacity_band: '>12-16', price_eur: 12600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },

    // --- Dimplex (A) ---
    { manufacturer: 'Dimplex - Glen Dimplex Deutschland GmbH', model: 'LA 6-16 TUR', capacity_kw: 6, capacity_band: '4-6', price_eur: 6800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Dimplex - Glen Dimplex Deutschland GmbH', model: 'LA 8-16 TUR', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8100, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Dimplex - Glen Dimplex Deutschland GmbH', model: 'LA 12-16 TUR', capacity_kw: 12, capacity_band: '>10-12', price_eur: 11500, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- August Brötje (A) ---
    { manufacturer: 'August Brötje GmbH', model: 'BLW NEO 8 R290', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8300, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'August Brötje GmbH', model: 'BLW NEO 12 R290', capacity_kw: 12, capacity_band: '>10-12', price_eur: 11400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },

    // --- WATERKOTTE (A) ---
    { manufacturer: 'WATERKOTTE GmbH', model: 'EcoTouch Ai1 Air 5008.5', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'WATERKOTTE GmbH', model: 'EcoTouch Ai1 Air 5012.5', capacity_kw: 12, capacity_band: '>10-12', price_eur: 11800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Max Weishaupt (A) ---
    { manufacturer: 'Max Weishaupt SE', model: 'WWP LA 8-A R290', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Max Weishaupt SE', model: 'WWP LA 12-A R290', capacity_kw: 12, capacity_band: '>10-12', price_eur: 12200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Tecalor / Stiebel Eltron subsidiary (A) ---
    { manufacturer: 'Tecalor GmbH', model: 'TTL 8.5 AC', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8500, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Tecalor GmbH', model: 'TTL 13.5 AC', capacity_kw: 13, capacity_band: '>12-16', price_eur: 12800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Heliotherm (A) ---
    { manufacturer: 'Heliotherm Wärmepumpentechnik Ges.m.b.H', model: 'HP08L-M-WEB', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8700, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Ochsner (A) ---
    { manufacturer: 'Ochsner Wärmepumpen GmbH', model: 'AIR HAWK 208 R290', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Ochsner Wärmepumpen GmbH', model: 'AIR HAWK 212 R290', capacity_kw: 12, capacity_band: '>10-12', price_eur: 12400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Hoval (A) ---
    { manufacturer: 'Hoval GmbH', model: 'Belaria pro 8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8500, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- iDM (A) ---
    { manufacturer: 'iDM Energiesysteme GmbH', model: 'iPump A 6-12', capacity_kw: 9, capacity_band: '>8-10', price_eur: 9600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // =====================================================================
    // B+ TIER BRANDS
    // =====================================================================

    // --- Mitsubishi Electric (B+) ---
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan PUZ-WM50VAA', capacity_kw: 5, capacity_band: '4-6', price_eur: 5800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan PUZ-WM85VAA', capacity_kw: 8, capacity_band: '>6-8', price_eur: 7200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan PUZ-WM85VAA', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6900, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan PUZ-WM112VAA', capacity_kw: 11, capacity_band: '>10-12', price_eur: 9900, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan PUZ-WM142VAA', capacity_kw: 14, capacity_band: '>12-16', price_eur: 12200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    // Mitsubishi Split
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan SUZ-SWM80VA', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-01', notes: 'outdoor unit only, split system' },

    // --- Panasonic (B+) ---
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP WH-MXC09J3E5', capacity_kw: 5, capacity_band: '4-6', price_eur: 5500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP WH-MXC09J3E8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 7200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP WH-MXC09J3E9', capacity_kw: 9, capacity_band: '>8-10', price_eur: 7800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP 12kW', capacity_kw: 12, capacity_band: '>10-12', price_eur: 10200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP 16kW', capacity_kw: 16, capacity_band: '>12-16', price_eur: 13200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    // Panasonic Split
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea LT Split 9kW', capacity_kw: 9, capacity_band: '>8-10', price_eur: 7400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-01', notes: 'outdoor unit only' },

    // --- REMKO (B+) ---
    { manufacturer: 'REMKO GmbH & Co Kg', model: 'WKF 80 compact', capacity_kw: 8, capacity_band: '>6-8', price_eur: 7400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'REMKO GmbH & Co Kg', model: 'WKF 120 compact', capacity_kw: 12, capacity_band: '>10-12', price_eur: 10600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },

    // --- Remeha (B+) ---
    { manufacturer: 'Remeha GmbH', model: 'Tensio C 6 Mono', capacity_kw: 6, capacity_band: '4-6', price_eur: 5900, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Remeha GmbH', model: 'Tensio C 10 Mono', capacity_kw: 10, capacity_band: '>8-10', price_eur: 8800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- LAMBDA (B+) ---
    { manufacturer: 'LAMBDA Wärmepumpen GmbH', model: 'EU08L', capacity_kw: 8, capacity_band: '>6-8', price_eur: 7600, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'LAMBDA Wärmepumpen GmbH', model: 'EU13L', capacity_kw: 13, capacity_band: '>12-16', price_eur: 12000, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // =====================================================================
    // B TIER BRANDS
    // =====================================================================

    // --- Samsung (B) ---
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS Mono HT Quiet 8kW', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6900, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS Mono HT Quiet 12kW', capacity_kw: 12, capacity_band: '>10-12', price_eur: 9400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS Mono HT Quiet 16kW', capacity_kw: 16, capacity_band: '>12-16', price_eur: 11800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- LG (B) ---
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Mono 5.5', capacity_kw: 5.5, capacity_band: '4-6', price_eur: 5200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Mono 7', capacity_kw: 7, capacity_band: '>6-8', price_eur: 6500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Mono 9', capacity_kw: 9, capacity_band: '>8-10', price_eur: 7200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Mono 9', capacity_kw: 9, capacity_band: '>8-10', price_eur: 7000, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Mono 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 9200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Mono 16', capacity_kw: 16, capacity_band: '>12-16', price_eur: 11500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01' },

    // --- FUJITSU (B) ---
    { manufacturer: 'FUJITSU GENERAL (EURO) GmbH', model: 'Waterstage WGYA080ML3', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'FUJITSU GENERAL (EURO) GmbH', model: 'Waterstage WGYA120ML3', capacity_kw: 12, capacity_band: '>10-12', price_eur: 9600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },

    // --- Carrier (B) ---
    { manufacturer: 'Carrier', model: '30AWH008XD', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6700, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Riello (B) ---
    { manufacturer: 'Riello S.p.A Zweigniederlassung Deutschland', model: 'NexPolar 008 M', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6600, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // =====================================================================
    // D TIER BRANDS (China HQ — lower price signal)
    // =====================================================================

    // --- Midea (D) ---
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 4800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 5800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01' },
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 14', capacity_kw: 14, capacity_band: '>12-16', price_eur: 7800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Germany GREE (D) ---
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Mono 8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 4600, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Mono 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 6800, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-02' },

    // --- Ningbo AUX (D) ---
    { manufacturer: 'Ningbo AUX Electric Co., Ltd.', model: 'ARF-10/NE-DC-BI R290', capacity_kw: 10, capacity_band: '>8-10', price_eur: 5200, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02' },

    // =====================================================================
    // BUNDLE / PACKAGE SAMPLES (for calibration exclusion)
    // These show why package separation matters — prices are 30-80% higher
    // =====================================================================

    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A Paket', capacity_kw: 10, capacity_band: '>8-10', price_eur: 15800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01', notes: 'includes Vitocell 100-W buffer + controller' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW Paket', capacity_kw: 10, capacity_band: '>8-10', price_eur: 14500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-01', notes: 'includes buffer tank + controller' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus Set', capacity_kw: 10, capacity_band: '>8-10', price_eur: 15200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02', notes: 'includes uniTOWER plus' },
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R + Hydromodul', capacity_kw: 8, capacity_band: '>6-8', price_eur: 11400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'with_hydromodule', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01', notes: 'with indoor hydro module' },
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP + Tank Set', capacity_kw: 9, capacity_band: '>8-10', price_eur: 12600, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-02', notes: 'includes DHW tank' },
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS Mono ClimateHub Set', capacity_kw: 8, capacity_band: '>6-8', price_eur: 10200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'with_hydromodule', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-01', notes: 'includes ClimateHub indoor unit' },

    // =====================================================================
    // v3: EXPANDED SPLIT SAMPLES (~20 new)
    // Split systems: outdoor unit only price; typically slightly below monoblock
    // =====================================================================

    // --- Viessmann Split (S) ---
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-S AWO-S 251.A08', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only, split' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-S AWO-S 251.A10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 9800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only, split' },

    // --- Bosch Split (S) ---
    { manufacturer: 'Bosch', model: 'Compress 7000i AW 7 OR-S Split', capacity_kw: 7, capacity_band: '>6-8', price_eur: 8500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'Bosch', model: 'Compress 7000i AW 10 OR-S Split', capacity_kw: 10, capacity_band: '>8-10', price_eur: 10200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- Vaillant Split (S) ---
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM Split VWL 75/5', capacity_kw: 7, capacity_band: '>6-8', price_eur: 8600, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM Split VWL 105/5', capacity_kw: 10, capacity_band: '>8-10', price_eur: 10100, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- STIEBEL ELTRON Split (S) ---
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL-S 07 HK 230 Premium', capacity_kw: 7, capacity_band: '>6-8', price_eur: 9200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- NIBE Split (A+) ---
    { manufacturer: 'NIBE Systemtechnik GmbH', model: 'F2040-8 Split', capacity_kw: 8, capacity_band: '>6-8', price_eur: 8200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'NIBE Systemtechnik GmbH', model: 'F2040-12 Split', capacity_kw: 12, capacity_band: '>10-12', price_eur: 11400, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- WOLF Split (A) ---
    { manufacturer: 'WOLF GmbH', model: 'CHA Split 07', capacity_kw: 7, capacity_band: '>6-8', price_eur: 7600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'WOLF GmbH', model: 'CHA Split 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 8900, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- Samsung Split (B) ---
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS Split 8kW', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS Split 12kW', capacity_kw: 12, capacity_band: '>10-12', price_eur: 8600, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- LG Split (B) ---
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Split 7', capacity_kw: 7, capacity_band: '>6-8', price_eur: 5900, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 Split 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 8500, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- Midea Split (D) ---
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Split 8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 4200, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Split 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 5600, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // --- GREE Split (D) ---
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Split 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 4400, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Split', observed_date: '2026-03', notes: 'outdoor unit only' },

    // =====================================================================
    // v3: EXPANDED BUNDLE / PACKAGE SAMPLES (~15 new)
    // Bundles include storage tank, hydromodule, or complete system
    // =====================================================================

    // --- S-tier bundles ---
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A Komplett mit Vitocell', capacity_kw: 8, capacity_band: '>6-8', price_eur: 13800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes buffer + DHW tank + controller' },
    { manufacturer: 'Viessmann Climate Solutions GmbH & Co.KG', model: 'Vitocal 250-A + Speicher Set 13kW', capacity_kw: 13, capacity_band: '>12-16', price_eur: 19800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'full package with buffer and DHW' },
    { manufacturer: 'STIEBEL ELTRON GmbH & Co. KG', model: 'WPL 09 ACS classic + HSBB Paket', capacity_kw: 9, capacity_band: '>8-10', price_eur: 16200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes HSBB integration module + SBB buffer' },
    { manufacturer: 'Vaillant Deutschland GmbH & Co. KG', model: 'aroTHERM plus + uniTOWER 8kW Set', capacity_kw: 8, capacity_band: '>6-8', price_eur: 13500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes uniTOWER plus' },
    { manufacturer: 'Bosch', model: 'Compress 7400i AW + Pufferspeicher Set', capacity_kw: 7, capacity_band: '>6-8', price_eur: 12800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes buffer tank + hydraulic kit' },

    // --- A+/A tier bundles ---
    { manufacturer: 'Daikin Airconditioning Germany GmbH', model: 'Altherma 3 R ECH2O + Hydrobox', capacity_kw: 10, capacity_band: '>8-10', price_eur: 13200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'with_hydromodule', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'with indoor hydro module + controller' },
    { manufacturer: 'NIBE Systemtechnik GmbH', model: 'F2120-12 + VVM 320', capacity_kw: 12, capacity_band: '>10-12', price_eur: 16500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes VVM 320 indoor module with DHW tank' },
    { manufacturer: 'WOLF GmbH', model: 'CHA 10 + Pufferspeicher Paket', capacity_kw: 10, capacity_band: '>8-10', price_eur: 13800, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes buffer + DHW tank' },

    // --- B+/B tier bundles ---
    { manufacturer: 'Mitsubishi Electric Europe B.V.', model: 'Ecodan PUZ-WM85VAA + Hydrobox Set', capacity_kw: 8, capacity_band: '>6-8', price_eur: 10500, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'with_hydromodule', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes EHSC-VM6ED hydrobox' },
    { manufacturer: 'Panasonic Deutschland', model: 'Aquarea T-CAP + All-in-One 200L', capacity_kw: 12, capacity_band: '>10-12', price_eur: 14800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'all_in_one', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes 200L integrated tank' },
    { manufacturer: 'LG Electronics Deutschland GmbH', model: 'Therma V R290 + Hydrosplit Set', capacity_kw: 9, capacity_band: '>8-10', price_eur: 10800, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'with_hydromodule', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes indoor hydraulic unit' },
    { manufacturer: 'Samsung Klimatechnik', model: 'EHS 12kW + ClimateHub 260L', capacity_kw: 12, capacity_band: '>10-12', price_eur: 13200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'all_in_one', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'ClimateHub with 260L integrated tank' },

    // --- D-tier bundles ---
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 10 Komplett-Set', capacity_kw: 10, capacity_band: '>8-10', price_eur: 8200, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'all_in_one', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes tank + controller' },
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Komplett-Set 8kW', capacity_kw: 8, capacity_band: '>6-8', price_eur: 7200, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'all_in_one', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03', notes: 'includes buffer tank' },

    // =====================================================================
    // v3: C-TIER BRAND SAMPLES (~15 new)
    // C-tier: non-China low-signal brands, limited DE distribution
    // =====================================================================

    // --- CLIVET (C) ---
    { manufacturer: 'CLIVET GmbH', model: 'SPHERA EVO 2.0 3.1', capacity_kw: 6, capacity_band: '4-6', price_eur: 5200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'CLIVET GmbH', model: 'SPHERA EVO 2.0 4.2', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6100, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'CLIVET GmbH', model: 'SPHERA EVO 2.0 5.3', capacity_kw: 10, capacity_band: '>8-10', price_eur: 7000, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'CLIVET GmbH', model: 'SPHERA EVO 2.0 6.2', capacity_kw: 12, capacity_band: '>10-12', price_eur: 8400, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- INVENTOR (C) ---
    { manufacturer: 'INVENTOR A.G.', model: 'Matrix MCI-10V3/O R290', capacity_kw: 8, capacity_band: '>6-8', price_eur: 5800, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'INVENTOR A.G.', model: 'Matrix MCI-14V3/O R290', capacity_kw: 10, capacity_band: '>8-10', price_eur: 6800, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'INVENTOR A.G.', model: 'Matrix MCI-18V3/O R290', capacity_kw: 12, capacity_band: '>10-12', price_eur: 7900, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Olimpia Splendid (C) ---
    { manufacturer: 'Olimpia Splendid S.p.A.', model: 'Sherpa Aqua 8 R290', capacity_kw: 8, capacity_band: '>6-8', price_eur: 5900, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Olimpia Splendid S.p.A.', model: 'Sherpa Aqua 10 R290', capacity_kw: 10, capacity_band: '>8-10', price_eur: 6900, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Trane (C) --- (primarily commercial but has some residential)
    { manufacturer: 'Trane', model: 'AHPM R290 Mono 8', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6200, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Trane', model: 'AHPM R290 Mono 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 8600, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- M-TEC (C) --- Austrian brand, limited DE distribution
    { manufacturer: 'M-TEC Energie.Innovativ GmbH', model: 'E-Smart 08', capacity_kw: 8, capacity_band: '>6-8', price_eur: 6400, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Galletti (C) --- Italian, limited DE
    { manufacturer: 'Galletti S.p.A.', model: 'MCI 010 R290', capacity_kw: 10, capacity_band: '>8-10', price_eur: 7100, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Enerblue (C) --- Italian, limited DE
    { manufacturer: 'Enerblue S.p.A.', model: 'Aero Plus 08', capacity_kw: 8, capacity_band: '>6-8', price_eur: 5700, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // =====================================================================
    // v3: EXPANDED D-TIER BRAND SAMPLES (~15 new)
    // D-tier: China HQ brands — aggressive online pricing
    // =====================================================================

    // --- Midea additional (D) ---
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 6', capacity_kw: 6, capacity_band: '4-6', price_eur: 4100, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 12', capacity_kw: 12, capacity_band: '>10-12', price_eur: 6600, source_type: 'online_shop', source_name: 'DE shop B', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Midea Europe GmbH', model: 'M-Thermal Arctic 16', capacity_kw: 16, capacity_band: '>12-16', price_eur: 8200, source_type: 'online_shop', source_name: 'DE shop A', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- GREE additional (D) ---
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Mono 6', capacity_kw: 6, capacity_band: '4-6', price_eur: 3900, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Mono 10', capacity_kw: 10, capacity_band: '>8-10', price_eur: 5400, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Germany GREE GmbH', model: 'Versati III Mono 16', capacity_kw: 16, capacity_band: '>12-16', price_eur: 7800, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R32', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Ningbo AUX additional (D) ---
    { manufacturer: 'Ningbo AUX Electric Co., Ltd.', model: 'ARF-06/NE-DC-BI R290', capacity_kw: 6, capacity_band: '4-6', price_eur: 3800, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Ningbo AUX Electric Co., Ltd.', model: 'ARF-12/NE-DC-BI R290', capacity_kw: 12, capacity_band: '>10-12', price_eur: 6200, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- PHNIX (D) ---
    { manufacturer: 'PHNIX Eco-Energy Solution Ltd.', model: 'PH-HRV080R290', capacity_kw: 8, capacity_band: '>6-8', price_eur: 4400, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'PHNIX Eco-Energy Solution Ltd.', model: 'PH-HRV120R290', capacity_kw: 12, capacity_band: '>10-12', price_eur: 6000, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Zealux (D) ---
    { manufacturer: 'Zealux', model: 'InverPad R290 8kW', capacity_kw: 8, capacity_band: '>6-8', price_eur: 4500, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Zealux', model: 'InverPad R290 10kW', capacity_kw: 10, capacity_band: '>8-10', price_eur: 5300, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
    { manufacturer: 'Zealux', model: 'InverPad R290 12kW', capacity_kw: 12, capacity_band: '>10-12', price_eur: 6100, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },

    // --- Sprsun (D) ---
    { manufacturer: 'Guangzhou Sprsun New Energy Technology Development Co.,Ltd.', model: 'CGK030V3L R290', capacity_kw: 10, capacity_band: '>8-10', price_eur: 5100, source_type: 'online_shop', source_name: 'DE shop C', package_scope: 'unit_only', refrigerant: 'R290', installation_type: 'Monoblock', observed_date: '2026-03' },
  ];

  // Reset file and write fresh
  const data = { _meta: { version: '2.0', last_updated: null, total_samples: 0 }, samples: [] };
  for (const s of seeds) {
    data.samples.push(createSample(s));
  }
  saveSamples(data);
  return data;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createSample,
  classifyPackageScope,
  classifyBafaPackageScope,
  loadSamples,
  saveSamples,
  addSamples,
  aggregateSamples,
  compareWithSimulation,
  getSamplingCoverage,
  seedSamples,
  BUNDLE_INDICATORS,
  HYDRO_INDICATORS,
  UNIT_ONLY_INDICATORS
};
