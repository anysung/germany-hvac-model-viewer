# Pricing Engine Specification

> **Version:** 3.1 | **Last updated:** 2026-03-20 | **Reference market:** Germany (BAFA Luft/Wasser)

---

## Source Files

| File | Purpose |
|------|---------|
| `pricing-engine.cjs` | Core pricing logic (all functions below) |
| `market-sampler.cjs` | Sample management, package scope classification |
| `run-pricing.cjs` | CLI runner, output generation |
| `config.json` | Market-specific pricing configuration |
| `brand-tiers.json` | Brand-to-tier mapping (199 brands) |
| `market-samples.json` | Collected market price observations |

---

## What the Engine Does

Estimates **equipment-only installer-to-customer selling price ranges** for heat pumps listed in a national registry (e.g., BAFA in Germany). The engine produces a low/typical/high price triplet per item, a confidence rating, and a market segment classification.

**It does not:**

- Estimate installation costs
- Quote retail or end-consumer prices directly
- Replace manufacturer price lists
- Handle subsidies, rebates, or financing terms
- Produce binding commercial offers

---

## Price Definition

```
Target price = equipment-only, installer-to-customer estimated selling price range
             = excludes installation, commissioning, accessories, permits
             = expressed as (low, typical, high) triplet in local currency
```

The "installer-to-customer" price sits in the distribution chain as:

```
Manufacturer --> Distributor --> Installer --> Customer
                                  ^^^^^^^^^^^^^^^^^^^^^^^
                                  THIS is what the engine estimates
```

Public online retail prices are treated as **lower-bound market signals**, not as final customer prices. The simulation is calibrated so that its typical output sits at or above these signals.

---

## Pricing Formula

The engine applies a multiplicative adjustment chain to a base capacity price:

```
Final Price = Base Capacity Band Price
            x Brand Tier Multiplier
            x Refrigerant Adjustment
            x Installation Type Adjustment
            x Performance Adjustment
```

Each factor is a `(min_adj, max_adj)` pair. The engine computes:

```
low     = base_low     x (1 + min_adj)    for each factor
typical = base_typical  x (1 + midpoint)   where midpoint = (min_adj + max_adj) / 2
high    = base_high    x (1 + max_adj)    for each factor
```

Final prices are rounded to the nearest 50 in local currency.

---

## Core Logic Components

### 1. Base Capacity Band Lookup

> **Code:** `getCapacityBand()` in `pricing-engine.cjs:36` | **Config:** `config.json → base_capacity_matrix`, `sub_4kw_rule`

Maps the item's rated power (kW at 35C or 55C) to one of several capacity bands. Each band defines a base price triplet (low/typical/high).

**Reusable:** Yes. The lookup logic is market-agnostic. The band definitions and base prices are market-specific configuration.

```
Input:  power_kw (number)
Output: { capacity_band, low, typical, high, sub4kw (boolean) }
```

Items below the lowest band threshold receive a discount adjustment (configurable).

### 2. Brand Tier Multiplier

> **Code:** `getBrandTier()` in `pricing-engine.cjs:54` | **Config:** `config.json → brand_tiers`, `brand-tiers.json`

Classifies the manufacturer into a tier (S / A+ / A / B+ / B / C / D) and applies the corresponding multiplier range.

| Tier | Meaning |
|------|---------|
| S | Dominant domestic premium brands |
| A+ | Strong premium acceptance in market |
| A | Established specialist brands |
| B+ | Trusted brands, upper-mid positioning |
| B | Recognized international brands (baseline) |
| C | Low market signal, non-dominant brands |
| D | Lowest market signal, aggressively priced |

**Reusable:** The tier system is reusable. The brand-to-tier mapping and the multiplier percentages must be defined per market.

Unmapped brands default to C-tier with a review flag.

### 3. Refrigerant Adjustment

> **Code:** `getRefrigerantGroup()` in `pricing-engine.cjs:78` | **Config:** `config.json → refrigerant_adjustments`

Adjusts price based on the refrigerant type. Refrigerants with higher manufacturing cost or regulatory premium (e.g., R290 natural propane) receive a positive adjustment. Legacy refrigerants (e.g., R410A) receive a negative or neutral adjustment.

**Reusable:** Yes. Refrigerant price premiums vary by market but the mechanism is universal. R32 is the baseline (0% adjustment) in the reference implementation.

### 4. Installation Type Adjustment

> **Code:** `detectInstallationType()` in `pricing-engine.cjs:98` | **Config:** `config.json → installation_type_adjustments`

Adjusts for Monoblock vs Split systems. Monoblock is baseline (0%). Split systems may have a slight price difference depending on whether outdoor-unit-only pricing is typical in the market.

**Reusable:** Yes. Detection logic (keyword matching on model name for "split", "odu") is language-agnostic.

### 5. Performance Adjustment

> **Code:** `getPerformanceAdjustments()` in `pricing-engine.cjs:121` | **Config:** `config.json → performance_adjustments`

Applies cumulative premiums for items that exceed population-level performance thresholds:

| Performance Signal | Trigger | Premium Range |
|--------------------|---------|---------------|
| High SCOP | Top 20% of population | +3% to +6% |
| Low noise | Top 20% (quietest) | +2% to +4% |
| High flow temperature (70-75C) | Efficiency >= threshold | +3% to +7% |

**Reusable:** Yes. The thresholds are computed dynamically from the dataset population, not hardcoded.

### 6. Package Scope Classification

> **Code:** `classifyPackageScope()` in `market-sampler.cjs:73`, `classifyBafaPackageScope()` in `market-sampler.cjs:106` | **Config:** `config.json → package_scope_confidence`
> **Keywords:** `BUNDLE_INDICATORS` `:32`, `HYDRO_INDICATORS` `:52`, `UNIT_ONLY_INDICATORS` `:61` (all in `market-sampler.cjs`)

Determines whether the item listing represents a bare unit, a unit with hydromodule, or a complete system bundle.

| Scope | Meaning |
|-------|---------|
| `unit_only` | Heat pump unit alone |
| `with_hydromodule` | Unit + indoor hydraulic module |
| `all_in_one` | Complete system (unit + tank + controller) |
| `bundle_unknown` | Likely bundled, scope unclear |

**Reusable:** The classification schema is reusable. The detection keywords (for parsing listing titles and model names) are language-specific and must be defined per market.

Package scope affects confidence (not price directly). Unit-only items have the highest confidence. Bundles have lower confidence because the equipment-only component is unclear.

### 7. Market Segmentation

> **Code:** `classifyMarketSegment()` in `pricing-engine.cjs:185` | **Constants:** `COMMERCIAL_FOCUSED_BRANDS` `:151`, `COMMERCIAL_MODEL_PATTERNS` `:167`

Classifies each item into a market segment based on power rating, manufacturer type, model name patterns, and compressor count:

| Segment | Typical Power | Visibility |
|---------|---------------|------------|
| `residential_core` | <= 20 kW | Shown in app |
| `light_commercial` | 20-50 kW | Hidden by default |
| `commercial_project` | > 50 kW | Hidden, may be N/A |

**Reusable:** Partially. The power thresholds and logic are reusable. The list of commercial-focused brands is market-specific.

Rules (in priority order):
1. Power > 100 kW --> commercial_project (high confidence)
2. Power > 50 kW + commercial brand --> commercial_project (high confidence)
3. Power > 50 kW general --> commercial_project (medium confidence)
4. Model matches commercial patterns (VRF, chiller, rooftop, etc.) --> commercial_project
5. Multiple compressors (>4) + power > 20 kW --> commercial_project
6. Power > 20 kW + commercial brand --> commercial_project
7. Power > 20 kW general --> light_commercial
8. Power <= 20 kW + commercial brand --> light_commercial (low confidence)
9. Otherwise --> residential_core (high confidence)

### 8. Confidence Rules

> **Code:** `computeConfidence()` in `pricing-engine.cjs:402`

Confidence reflects how reliable the price estimate is:

| Level | Meaning |
|-------|---------|
| `high` | Strong basis: known premium brand, unit_only, residential, <= 20 kW |
| `medium` | Reasonable basis with some uncertainty |
| `low` | Weak basis: commercial segment, unknown brand, or bundle scope |

Confidence assignment (v3):
- Commercial projects --> always `low`
- Light commercial --> `medium` (or `low` if brand unknown)
- Residential + all_in_one / bundle_unknown --> `low`
- Residential + with_hydromodule --> `medium`
- Residential + unknown brand --> `low`
- Residential + C/D tier --> `medium` (wider sample variance)
- Residential + S/A+/A/B+/B tier + unit_only + <= 20 kW --> `high`

### 9. Commercial N/A Policy

> **Code:** `priceItem()` step 7 in `pricing-engine.cjs:289` (N/A branch ~line 350)

Items in the `commercial_project` segment with insufficient public pricing evidence receive null prices instead of forced estimates:

```
N/A condition:
  market_segment == 'commercial_project'
  AND NOT (brand_matched AND power <= 100kW AND package_scope == 'unit_only')
```

These items get `price_basis: 'N/A'` and a `commercial_no_price` review flag.

### 10. Light Commercial Wider Range

> **Code:** `priceItem()` step 8 in `pricing-engine.cjs:289` (range widening ~line 380)

For `light_commercial` items, the price range is widened by +/- 10%:
```
low  = low  x 0.90
high = high x 1.10
```
This reflects greater uncertainty in the 20-50 kW segment where fewer public price signals exist.

---

## Calibration

> **Code:** `calibrate()` in `pricing-engine.cjs:537` | **Samples:** `market-samples.json`, `seedSamples()` in `market-sampler.cjs:329`
> **Supporting:** `aggregateSamples()` `:203`, `compareWithSimulation()` `:248`, `getSamplingCoverage()` `:282` (all in `market-sampler.cjs`)

After deterministic pricing, the engine optionally calibrates results against collected market samples:

1. **Index** market samples by (manufacturer, capacity_band), using only `unit_only` scope samples
2. **For each priced item** (skip commercial_project):
   - Compute sample median for matching (manufacturer, capacity_band)
   - If deviation > 30%: **flag for manual review**, do not adjust
   - If deviation <= 25% and >= 2 samples: **blend** simulation with sample data
   - Blend weight = min(0.45, sample_count x 0.15)
   - More samples = higher blend weight (up to 45%)
3. **Confidence boost**: residential + unit_only + S-B tier items with matching samples get boosted to `high`

**Reusable:** Yes. The algorithm is market-agnostic. Deviation thresholds (25%, 30%) and blend weights are tunable per market.

---

## Output Schema

> **Code:** `priceItem()` in `pricing-engine.cjs:289` (assembles result object) | **Output files:** generated by `run-pricing.cjs:44`

Each priced item includes:

| Field | Values | Set By |
|-------|--------|--------|
| `bafa_id` | Registry ID | Input data (field name varies by market) |
| `manufacturer` | Manufacturer name | Input data |
| `model` | Model designation | Input data |
| `equipment_price_low_eur` | Number or null | `priceItem()` → `applyAdjustment()` `:281` |
| `equipment_price_typical_eur` | Number or null | `priceItem()` → `applyAdjustment()` `:281` |
| `equipment_price_high_eur` | Number or null | `priceItem()` → `applyAdjustment()` `:281` |
| `price_basis` | simulated / mixed / N/A | `priceItem()` or `calibrate()` `:537` |
| `price_confidence` | high / medium / low | `computeConfidence()` `:402` |
| `brand_tier` | S / A+ / A / B+ / B / C / D | `getBrandTier()` `:54` → `brand-tiers.json` |
| `capacity_band` | e.g. ">6-8" | `getCapacityBand()` `:36` → `config.json` |
| `refrigerant_group` | e.g. "R290" | `getRefrigerantGroup()` `:78` |
| `installation_type` | Monoblock / Split | `detectInstallationType()` `:98` |
| `package_scope` | unit_only / with_hydromodule / all_in_one / bundle_unknown | `classifyBafaPackageScope()` in `market-sampler.cjs:106` |
| `package_scope_confidence` | high / medium / low | `detectPackageScopeDetailed()` `:117` |
| `market_segment` | residential_core / light_commercial / commercial_project | `classifyMarketSegment()` `:185` |
| `segment_confidence` | high / medium / low | `classifyMarketSegment()` `:185` |
| `residential_visibility_default` | true / false | `priceAll()` `:477` |
| `_review_flags` | array of flag strings | Accumulated in `priceItem()` |

**Output files** (generated by `run-pricing.cjs`):

| File | Content |
|------|---------|
| `output/bafa-priced.json` | Full dataset: all items with prices or N/A |
| `output/bafa-residential.json` | Residential subset (`residential_visibility_default: true`) |
| `output/pricing-summary.json` | Distribution statistics |
| `output/review-flags.json` | Items with non-empty `_review_flags` |
| `output/calibration-report.json` | Calibration comparison details |
| `output/sampling-coverage.json` | Sample distribution report |

---

## Review Flags

| Flag | Meaning |
|------|---------|
| `no_power_data` | Item has no rated power; cannot assign capacity band |
| `brand_not_mapped` | Manufacturer not in brand tier mapping; defaulted to C |
| `commercial_project_unit` | Commercial segment, low confidence |
| `commercial_no_price` | Commercial with insufficient evidence, price set to N/A |
| `sample_price_mismatch` | >30% deviation between simulation and sample data |

---

## Documentation

| Doc | Purpose |
|-----|---------|
| `docs/ENGINE-SPEC.md` | This file — core engine specification |
| `docs/GERMANY-MARKET.md` | Germany-specific assumptions and data |
| `docs/PORTABILITY-GUIDE.md` | Multi-market adaptation guide |
| `docs/CHANGELOG.md` | Decision history across versions |
| `docs/templates/` | Copyable templates for new market layers |
