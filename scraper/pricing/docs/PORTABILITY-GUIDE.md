# Multi-Market Portability Guide

> **Applies to:** Engine v3.1 | **Last updated:** 2026-03-20 | **Reference market:** Germany (DE)
> **Templates:** `docs/templates/config-template.json`, `docs/templates/brand-tiers-template.json`

How to adapt the heat pump pricing engine for a new country or market.

---

## Architecture Overview

```
                    +-----------------------+
                    |    Core Engine         |   market-agnostic logic
                    |  pricing-engine.cjs    |   (multiplicative chain,
                    |  market-sampler.cjs    |    calibration, confidence)
                    +-----------+-----------+
                                |
              +-----------------+-----------------+
              |                 |                 |
     +--------v------+  +------v--------+  +-----v---------+
     | Germany Layer  |  |   UK Layer    |  | France Layer  |
     | config.json    |  | config.json   |  | config.json   |
     | brand-tiers    |  | brand-tiers   |  | brand-tiers   |
     | market-samples |  | market-samples|  | market-samples|
     | keywords (DE)  |  | keywords (EN) |  | keywords (FR) |
     +----------------+  +---------------+  +---------------+
```

The engine is designed so that core logic is reusable and market-specific data is isolated in configuration files and keyword sets.

---

## Reusability Matrix

### Fully Reusable (no changes needed)

| Component | Location | Why Reusable |
|-----------|----------|--------------|
| Capacity band lookup | `getCapacityBand()` | Driven by config matrix |
| Refrigerant adjustment | `getRefrigerantGroup()` | Refrigerant chemistry is global |
| Installation type detection | `detectInstallationType()` | "split" / "odu" keywords are universal |
| Performance adjustment | `getPerformanceAdjustments()` | SCOP/noise thresholds computed from population |
| Population stats computation | `computePopulationStats()` | Purely statistical |
| Batch pricing | `priceAll()` | Orchestration logic |
| Sample creation schema | `createSample()` | Validation only |
| Sample I/O | `loadSamples()`, `saveSamples()`, `addSamples()` | File operations |
| Sample aggregation | `aggregateSamples()` | Grouping math |
| Sample comparison | `compareWithSimulation()` | Deviation math |
| Coverage reporting | `getSamplingCoverage()` | Counting |
| Calibration algorithm | `calibrate()` | Blending logic (thresholds tunable) |
| Confidence framework | `computeConfidence()` | Structure reusable, tier list configurable |
| CLI runner structure | `run-pricing.cjs` | Flag handling, output generation |

### Must Be Replaced Per Market

| Component | Location | What Changes |
|-----------|----------|--------------|
| Base capacity matrix | `config.json` | Different base prices per country |
| Brand tier multipliers | `config.json` | Tier percentages may differ |
| Brand-to-tier mapping | `brand-tiers.json` | Different brands, different positioning |
| Market samples | `market-samples.json` | Country-specific price observations |
| Seed samples function | `seedSamples()` | Country-specific reference data |
| Package scope keywords | `BUNDLE_INDICATORS`, `HYDRO_INDICATORS`, `UNIT_ONLY_INDICATORS` | Language-specific |
| BAFA scope classification | `classifyBafaPackageScope()` | Language-specific keywords |
| Listing scope classification | `classifyPackageScope()` | Language-specific keywords |
| Commercial-focused brands | `COMMERCIAL_FOCUSED_BRANDS` | Different brands per market |
| Commercial model patterns | `COMMERCIAL_MODEL_PATTERNS` | May need localized patterns |
| Registry field names | `bafa_id` etc. | Different registry per country |
| Price currency | `config.json` | EUR, GBP, SEK, NOK, PLN, etc. |
| Price definition | `config.json` | Channel structure may differ |

### Requires Judgment Per Market

| Component | Consideration |
|-----------|---------------|
| Segmentation thresholds | Is 20 kW still the residential boundary? Depends on building stock. |
| Calibration thresholds | 25%/30% deviation limits may need tuning for markets with different price variance. |
| N/A policy | Which commercial items get null prices depends on data availability. |
| Light commercial range expansion | The +/-10% spread may need adjustment. |
| Sub-4kW rule | Some markets may have different small-unit dynamics. |

---

## Step-by-Step: Adding a New Market

### Step 1: Define the Price Meaning

Before anything technical, answer:

```
1. What does "price" mean in this market?
   - Installer-to-customer? Retail? Wholesale?

2. What is the distribution channel?
   - Manufacturer --> Distributor --> Installer --> Customer?
   - Or: Manufacturer --> Retailer --> Customer?
   - Or: Direct online sales?

3. What public price signals exist?
   - Manufacturer list prices?
   - Online shop prices?
   - Trade price portals?
   - Government subsidy databases?

4. How do public signals relate to the target price?
   - Lower bound? Upper bound? Approximate?
```

Document this in a `{COUNTRY}-MARKET.md` file following the Germany example.

### Step 2: Create the Market Configuration

Copy and adapt `config.json`:

```json
{
  "pricing_scope": {
    "market": "UK",
    "price_definition": "equipment_only_installer_to_customer_range",
    "installation_cost_included": false,
    "currency": "GBP"
  },

  "base_capacity_matrix": [
    // Research UK equipment prices for each capacity band
    // Start from manufacturer list prices or major distributor catalogs
    // Use the B-tier (baseline) as reference
    { "capacity_band": "4-6", "min_kw": 4, "max_kw": 6,
      "low": ???, "typical": ???, "high": ??? },
    // ...
  ],

  "brand_tiers": {
    // Same tier structure, but percentages may differ
    // UK market may have different price stratification
    "S":  { "min_adj": ???, "max_adj": ??? },
    // ...
  },

  "refrigerant_adjustments": {
    // Likely similar across Europe due to F-Gas regulation
    // May differ outside EU
  },

  "installation_type_adjustments": {
    // UK split systems may have different price dynamics
  },

  "performance_adjustments": {
    // Reuse as-is; SCOP/noise premiums are physics-based
  },

  "package_scope_confidence": {
    // Reuse as-is; scope uncertainty is universal
  }
}
```

### Step 3: Create the Brand Tier Mapping

Create `brand-tiers-{country}.json`:

```json
{
  "_meta": {
    "version": "1.0",
    "market": "UK",
    "last_updated": "YYYY-MM-DD",
    "tier_rules": {
      "S": "Dominant UK premium heating brands",
      "A+": "Strong UK market acceptance",
      // ... define criteria for this market
    }
  },
  "brands": {
    "Manufacturer Name As Listed": {
      "tier": "S",
      "review_priority": "high",
      "notes": "Justification for tier assignment"
    }
    // Map all manufacturers in the country's registry
  }
}
```

**Key question:** Brand positioning varies by country. Vaillant is S-tier in Germany but might be A+ in a market where a different brand dominates. Daikin is A+ in Germany but might be S-tier in a market where they have stronger distribution.

### Step 4: Collect Market Samples

Create a `seedSamples()` function with country-specific online price observations:

**Minimum viable sample set:**
- At least 3 brands per tier with samples
- At least the top 4 capacity bands covered
- At least 50 unit_only samples
- At least 5 bundle samples (for scope separation validation)

**Sample collection rules:**
1. Record the price exactly as observed
2. Classify package scope honestly (unit_only, with_hydromodule, etc.)
3. Note the source type (manufacturer list, online shop, trade portal)
4. Anonymize source names if needed
5. Record observation date

### Step 5: Define Language-Specific Keywords

Create keyword arrays for the market language:

```javascript
// UK English example
const BUNDLE_INDICATORS_UK = [
  'package', 'bundle', 'complete system', 'with cylinder',
  'with buffer', 'with tank', 'including', 'incl.',
  'installation kit', 'system pack', 'with controller',
];

const HYDRO_INDICATORS_UK = [
  'hydro module', 'hydrobox', 'indoor unit',
  'hydraulic module', 'hydro station',
];

const UNIT_ONLY_INDICATORS_UK = [
  'unit only', 'heat pump only', 'outdoor unit',
  'monoblock', 'monobloc', 'without accessories',
];
```

For **French**:
```javascript
const BUNDLE_INDICATORS_FR = [
  'pack', 'kit', 'ensemble', 'complet', 'avec ballon',
  'avec tampon', 'avec régulation', 'inclus',
  'système complet', 'pack hydraulique',
];
```

For **Swedish**:
```javascript
const BUNDLE_INDICATORS_SE = [
  'paket', 'komplett', 'med varmvattenberedare',
  'med ackumulatortank', 'inkl.', 'systempaket',
];
```

### Step 6: Define Commercial Brands

Identify which brands in the new market are primarily commercial/industrial and should be treated differently:

```javascript
const COMMERCIAL_FOCUSED_BRANDS_UK = new Set([
  // UK-specific commercial HVAC brands
  // e.g., Airedale, Weatherite, Mitsubishi Heavy Industries (commercial division)
]);
```

### Step 7: Adjust Segmentation Thresholds

Review whether the power thresholds make sense for the market:

| Market | Residential Boundary | Rationale |
|--------|---------------------|-----------|
| Germany | 20 kW | Most single-family homes use 4-16 kW |
| UK | 16 kW? | UK housing stock is smaller on average |
| Sweden | 20 kW? | Similar to Germany; well-insulated homes may need less |
| France | 20 kW? | Similar housing stock to Germany |

### Step 8: Run and Validate

1. Run the engine with the new market configuration
2. Check the price distribution: does the residential median make sense for this market?
3. Compare with any known reference prices
4. Check that tier ordering is monotonic (S > A+ > A > ... > D at every band)
5. Review flagged items
6. Adjust base prices or multipliers if the initial calibration shows systematic bias

---

## Market Configuration Templates

Copyable template files are provided in `docs/templates/`:

| Template File | Purpose | Copy To |
|---------------|---------|---------|
| `config-template.json` | Pricing configuration with all required keys | `config.json` (replace Germany values) |
| `brand-tiers-template.json` | Brand tier mapping structure | `brand-tiers-{country}.json` |

To start a new market: copy both templates, fill in market-specific values (marked with `TODO` comments), and update keyword arrays in a new market-sampler module.

---

## Market Onboarding Checklist

Before launching a new market, verify:

- [ ] Price definition documented (what does "price" mean in this market?)
- [ ] Channel structure documented (who sells to whom?)
- [ ] Base capacity matrix populated with local market research
- [ ] Currency set correctly
- [ ] Brand tier mapping created for all registry manufacturers
- [ ] Tier multiplier ranges validated against local price evidence
- [ ] Market samples collected (minimum 50 unit_only)
- [ ] Package scope keywords translated to local language
- [ ] Commercial-focused brand list created
- [ ] Segmentation thresholds reviewed for local housing stock
- [ ] Engine run end-to-end with no errors
- [ ] Tier price ordering is monotonic at every capacity band
- [ ] Residential price median makes sense vs market knowledge
- [ ] Calibration report reviewed: no excessive deviation flags
- [ ] Review flags inspected: unmapped brands checked
- [ ] Output files generated and spot-checked

---

## Things That Must Never Be Hardcoded Globally

These must always remain in market-specific configuration:

1. **Base prices** — different in every country
2. **Brand positioning** — Vaillant is S-tier in Germany, may not be elsewhere
3. **Currency** — EUR, GBP, SEK, NOK, PLN, etc.
4. **Language keywords** — package scope detection must use local language
5. **Commercial brand lists** — different companies dominate different markets
6. **Channel structure interpretation** — "online price" means different things in different distribution models
7. **Segmentation boundaries** — the residential/commercial boundary depends on local building stock
8. **Registry field names** — BAFA (DE), MCS (UK), EHPA (EU), etc.

---

## Market-Specific Notes for Potential Future Markets

### UK (MCS Registry)

- MCS (Microgeneration Certification Scheme) maintains a product directory
- Distribution: manufacturer --> merchant/distributor --> installer --> customer
- Online prices exist (e.g., PlumbNation, Mr Central Heating)
- Currency: GBP
- Residential threshold: likely 16-20 kW (UK housing stock is smaller)
- Key brands: Vaillant, Mitsubishi (Ecodan dominant), Daikin, Samsung, Grant, Viessman

### France (NF PAC / EHPA)

- Regulated installer market similar to Germany
- Currency: EUR
- Strong presence of Atlantic, Daikin, Mitsubishi, Hitachi
- Bundle culture may differ (French market often includes installation in quotes)
- Language: French keywords needed for package scope

### Sweden (Energimyndigheten)

- Mature heat pump market (highest per-capita adoption in Europe)
- Strong domestic brands: NIBE, CTC, Thermia, IVT
- Currency: SEK
- May need different tier structure: Swedish brands are S-tier domestically
- Housing stock is well-insulated; smaller capacity needs

### Norway

- Similar to Sweden in market structure
- Currency: NOK
- ENOVA subsidy program maintains product lists
- Same Scandinavian brands dominant

### Poland

- Rapidly growing market
- Mix of Polish brands (e.g., Galmet) and imported brands
- Currency: PLN
- Different price levels than Western Europe
- May need adjusted base capacity matrix
