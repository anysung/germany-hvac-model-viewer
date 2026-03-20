/**
 * Market-Specific Keyword Template
 *
 * Copy this file and replace keywords with the target market's language.
 * These keyword arrays are used by classifyPackageScope() and classifyBafaPackageScope()
 * in market-sampler.cjs to detect whether a listing is unit-only, bundled, etc.
 *
 * Reference: market-sampler.cjs lines 32-71 (Germany keywords)
 * See PORTABILITY-GUIDE.md Step 5 for examples in English, French, Swedish.
 */

// TODO: Replace with target market language keywords

/**
 * Bundle indicators — keywords in retail listing titles that indicate
 * the price includes more than the heat pump unit (e.g., buffer tank, controller).
 */
const BUNDLE_INDICATORS = [
  // TODO: Add keywords in target language
  // German examples: 'speicher', 'pufferspeicher', 'paket', 'komplett', 'inkl.'
  // English examples: 'package', 'bundle', 'complete system', 'with cylinder'
  // French examples: 'pack', 'kit', 'ensemble', 'complet', 'avec ballon'
];

/**
 * Hydromodule indicators — keywords in model names that indicate
 * the unit includes an indoor hydraulic module.
 */
const HYDRO_INDICATORS = [
  // TODO: Add keywords (often brand-specific, not language-specific)
  // Common: 'hydromodul', 'hydro unit', 'hydrobox', 'hydraulikmodul'
  // These tend to be similar across markets.
];

/**
 * Unit-only indicators — keywords in listing titles that confirm
 * the listing is for the heat pump unit alone.
 */
const UNIT_ONLY_INDICATORS = [
  // TODO: Add keywords in target language
  // German examples: 'nur gerät', 'ohne zubehör', 'monoblock'
  // English examples: 'unit only', 'heat pump only', 'outdoor unit'
  // French examples: 'unité seule', 'pompe à chaleur seule'
];

/**
 * Commercial-focused brands — manufacturers that primarily serve
 * the commercial/industrial HVAC market in this country.
 * Even their smaller units should be treated as light_commercial.
 *
 * Reference: COMMERCIAL_FOCUSED_BRANDS in pricing-engine.cjs:151
 */
const COMMERCIAL_FOCUSED_BRANDS = new Set([
  // TODO: Add commercial HVAC brands for target market
  // Germany examples: 'CLIVET GmbH', 'Trane Deutschland GmbH', 'Stulz GmbH'
]);

module.exports = {
  BUNDLE_INDICATORS,
  HYDRO_INDICATORS,
  UNIT_ONLY_INDICATORS,
  COMMERCIAL_FOCUSED_BRANDS
};
