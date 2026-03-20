# Germany Market Specification

> **Applies to:** Engine v3.1 | **Last updated:** 2026-03-20 | **Market:** Germany (DE)
> **Data source:** BAFA Wärmepumpen Database (Luft/Wasser category, 6,514 items, extracted 2026-03-19)

---

## Market-Specific Files

| File | Purpose |
|------|---------|
| `config.json` | Base prices, tier multipliers, refrigerant/performance adjustments |
| `brand-tiers.json` | 199 BAFA manufacturers → S/A+/A/B+/B/C/D tier mapping |
| `market-samples.json` | 168 price samples across 42 brands |
| `market-sampler.cjs:32-71` | German-language keywords (BUNDLE/HYDRO/UNIT_ONLY indicators) |
| `pricing-engine.cjs:151-175` | COMMERCIAL_FOCUSED_BRANDS, COMMERCIAL_MODEL_PATTERNS |

---

## Market Channel Structure

```
Manufacturer
  --> Distributor / Wholesaler (Großhandel)
    --> Installer (Fachhandwerker / SHK-Betrieb)
      --> End Customer (Endkunde)
```

The German residential heating market operates through a regulated installer channel. Homeowners generally cannot purchase and install heat pumps themselves; a certified SHK (Sanitär-Heizung-Klima) installer is required.

**Online shops** (e.g., heizung.de, selfio.de, klimaworld.com) sell to installers and increasingly to informed end customers. These prices are publicly visible and serve as **lower-bound market signals** — the installer-to-customer price is typically at or above these levels.

**The engine estimates the installer-to-customer selling price**, which includes the installer's margin on equipment but excludes installation labor, accessories, and commissioning.

---

## Price Definition

```
Price scope:     equipment_only_installer_to_customer_range
Installation:    NOT included
Currency:        EUR
Market:          Germany (DE)
```

---

## Data Source: BAFA

The Bundesamt für Wirtschaft und Ausfuhrkontrolle (BAFA) maintains a registry of heat pumps eligible for the German subsidy program (BEG — Bundesförderung für effiziente Gebäude).

**Relevant fields from BAFA extract:**

| Field | Usage |
|-------|-------|
| `bafa_id` | Unique registry identifier |
| `manufacturer` | Exact manufacturer name (used for brand tier lookup) |
| `model` | Model designation (parsed for installation type, package scope) |
| `power_35C_kw` | Rated heating capacity at 35C flow temperature |
| `power_55C_kw` | Rated heating capacity at 55C flow temperature |
| `scop` | Seasonal COP (used for performance premium) |
| `noise_outdoor_dB` | Outdoor unit noise level (used for performance premium) |
| `refrigerant` | Refrigerant type (R290, R32, R410A, etc.) |
| `efficiency_55C_percent` | Flow temp efficiency (used for high-temp premium) |
| `num_compressors` | Number of compressors (used for commercial segmentation) |

**Current dataset:** 6,514 Luft/Wasser (air-to-water) items, extracted 2026-03-19.

---

## Brand Tier Mapping (199 Brands)

> **Data:** `brand-tiers.json` | **Lookup:** `getBrandTier()` in `pricing-engine.cjs:54` | **Multipliers:** `config.json → brand_tiers`

The brand-tiers.json file maps all 199 BAFA-listed manufacturers to tiers.

### Tier Assignment Principles (Germany-Specific)

| Tier | Criteria | Example Brands |
|------|----------|----------------|
| S | Core German/European premium heating brands. Dominant market share, strong installer network, extensive German service infrastructure. | Viessmann, Bosch, Vaillant, STIEBEL ELTRON, Buderus |
| A+ | Strong premium acceptance in the German hydronic heating market. Major HVAC brands with dedicated German heating divisions. | Daikin, NIBE |
| A | European heating specialists with established German presence. May include Stiebel Eltron subsidiaries or Austrian/Swiss premium brands. | WOLF, alpha innotec (ait-deutschland), ELCO, August Brötje, Ochsner, Heliotherm, WATERKOTTE, Tecalor, Hoval, iDM, Max Weishaupt, Dimplex |
| B+ | Trusted international brands with meaningful German market penetration. Often strong in other HVAC segments (air conditioning). | Mitsubishi Electric, Panasonic, REMKO, Remeha, LAMBDA |
| B | Recognized international brands. Adequate German distribution but not historically dominant in the German heating market. | Samsung, LG, Fujitsu, Carrier, Riello |
| C | Low German pricing signal. Non-China HQ brands with limited or emerging German distribution. Often Italian, Greek, or other European brands without established German installer networks. | CLIVET, INVENTOR, Olimpia Splendid, Trane, M-TEC, Galletti, Enerblue |
| D | China-headquartered brands. Aggressive online pricing. Growing German market presence but limited traditional installer channel penetration. | Midea, GREE, AUX, PHNIX, Zealux, Sprsun, Hisense, Foxess, SolarEast, Deye, Tongyi |

### Current Multiplier Ranges

| Tier | min_adj | max_adj | Effective range on base price |
|------|---------|---------|------------------------------|
| S | +28% | +40% | Base x 1.28 to 1.40 |
| A+ | +20% | +28% | Base x 1.20 to 1.28 |
| A | +12% | +20% | Base x 1.12 to 1.20 |
| B+ | +5% | +12% | Base x 1.05 to 1.12 |
| B | 0% | +5% | Base x 1.00 to 1.05 |
| C | -15% | -8% | Base x 0.85 to 0.92 |
| D | -25% | -15% | Base x 0.75 to 0.85 |

### Unmapped Brand Handling

Brands not in brand-tiers.json default to C-tier with:
- `matched: false`
- `_review_flags: ['brand_not_mapped']`
- `review_priority: 'low'`

This is conservative: unknown brands are assumed to have limited German market signal rather than premium positioning.

---

## Base Capacity Matrix (Germany 2025-2026)

> **Config:** `config.json → base_capacity_matrix`, `sub_4kw_rule` | **Lookup:** `getCapacityBand()` in `pricing-engine.cjs:36`

These base prices represent the B-tier (baseline) equipment-only installer-to-customer range for a standard Monoblock heat pump in Germany.

| Band | kW Range | Low (EUR) | Typical (EUR) | High (EUR) |
|------|----------|-----------|---------------|------------|
| 4-6 | 4.0 - 6.0 | 4,500 | 5,800 | 7,500 |
| >6-8 | 6.01 - 8.0 | 5,300 | 6,900 | 8,900 |
| >8-10 | 8.01 - 10.0 | 6,200 | 8,000 | 10,200 |
| >10-12 | 10.01 - 12.0 | 7,300 | 9,300 | 11,800 |
| >12-16 | 12.01 - 16.0 | 8,800 | 11,300 | 14,300 |
| >16-20 | 16.01 - 20.0 | 10,800 | 13,800 | 17,200 |
| 20+ | 20.01+ | 13,000 | 16,800 | 22,000 |

**Sub-4kW rule:** Units below 4 kW use the 4-6 band with a -10% to -5% discount.

---

## Refrigerant Adjustments (Germany)

> **Config:** `config.json → refrigerant_adjustments` | **Lookup:** `getRefrigerantGroup()` in `pricing-engine.cjs:78`

| Refrigerant | min_adj | max_adj | Rationale |
|-------------|---------|---------|-----------|
| R290 | 0% | +8% | Natural refrigerant premium; growing regulatory preference |
| R32 | 0% | 0% | Baseline; most common in German market |
| R410A | -5% | 0% | Legacy; phase-down expected |
| R454B/C, R452B | 0% | 0% | Neutral; transitional |
| R407C, R449A, R513A, R134a | -5% | 0% | Older, declining |
| Unknown | -5% | 0% | Conservative default |

---

## Segmentation (Germany)

> **Code:** `classifyMarketSegment()` in `pricing-engine.cjs:185` | **Constants:** `COMMERCIAL_FOCUSED_BRANDS` `:151`, `COMMERCIAL_MODEL_PATTERNS` `:167`

### Segment Thresholds

| Segment | Power Threshold | Residential Visibility |
|---------|-----------------|------------------------|
| residential_core | <= 20 kW | Shown in app |
| light_commercial | 20-50 kW | Hidden by default |
| commercial_project | > 50 kW | Hidden, often N/A |

### Why These Thresholds

The German residential heating market is dominated by units in the 4-16 kW range. The 20 kW boundary captures the vast majority of single-family and small multi-family installations. Above 20 kW, products increasingly serve larger buildings (Mehrfamilienhäuser, Gewerbeobjekte) where project-specific pricing replaces list pricing.

### Commercial-Focused Brands (Germany)

These manufacturers primarily serve the commercial/industrial HVAC market in Germany. Even their smaller units are treated as light_commercial:

```
CLIVET GmbH
Trane Deutschland GmbH
Aermec Deutschland GmbH
FläktGroup Deutschland GmbH
Swegon Germany GmbH
Stulz GmbH
MTA Deutschland GmbH
Rhoss Deutschland GmbH
2G Heek GmbH
Galletti S.p.A.
```

### Commercial N/A Policy (Germany)

The German engine returns null prices for commercial items where public pricing evidence is insufficient:

- **N/A items:** 1,164 out of 1,573 commercial_project items (74%)
- **Priced commercial items:** 409 — these have matched brands, power <= 100 kW, and unit_only scope
- **Rationale:** Commercial heat pump pricing in Germany is predominantly project-based and not observable from public sources

---

## Package Scope Detection (German Keywords)

> **Code:** `BUNDLE_INDICATORS` in `market-sampler.cjs:32`, `HYDRO_INDICATORS` `:52`, `UNIT_ONLY_INDICATORS` `:61`
> **Classifiers:** `classifyPackageScope()` `:73` (for listings), `classifyBafaPackageScope()` `:106` (for BAFA model names)

BAFA model names are parsed for scope indicators using German-language keywords.

### Bundle Indicators (Listing Titles)

German retail listing keywords that indicate the price includes more than the unit:

```
speicher, pufferspeicher, warmwasserspeicher, trinkwasserspeicher,
brauchwasserspeicher, schichtenspeicher,
paket, set, komplett, bundle, package, system-paket,
komplettpaket, komplettprogramm, komplettsystem, komplettanlage,
inkl., inklusive, mit speicher, mit puffer, plus speicher, mit regelung,
installationspaket, anschluss-set, montage-set, verrohrung
```

### Hydromodule Indicators (Model Names)

```
hydromodul, hydro unit, hydrobox, hydraulikmodul,
hydraulik-tower, innenmodul, hydro-station, hydrotower,
indoor module, hydraulikeinheit
```

### Unit-Only Indicators (Listing Titles)

```
nur gerät, nur wärmepumpe, ohne zubehör, unit only,
gerät einzeln, außengerät, aussengerät, außeneinheit,
outdoor unit, monoblock, monobloc,
nur außengerät, wärmepumpe mono, luft-wasser-wärmepumpe
```

---

## Market Samples (Germany)

> **Data:** `market-samples.json` | **Seed:** `seedSamples()` in `market-sampler.cjs:329`
> **Calibration:** `calibrate()` in `pricing-engine.cjs:537` | **Coverage:** `getSamplingCoverage()` in `market-sampler.cjs:282`

### Sample Sources

| Source Type | Description |
|-------------|-------------|
| `manufacturer_uvp` | Manufacturer's published UVP (unverbindliche Preisempfehlung) |
| `online_shop` | Anonymized German online heating shops (DE shop A/B/C) |
| `price_portal` | German price comparison portals |

### Current Coverage (v3)

- **168 samples** across **42 brands**
- Capacity bands: 4-6 (14), >6-8 (58), >8-10 (41), >10-12 (34), >12-16 (19), >16-20 (2)
- Refrigerants: R290 (majority), R32 (significant), R410A (few)
- Installation types: Monoblock (majority), Split (21)
- Package scopes: unit_only (148), all_in_one (15), with_hydromodule (5)

### Sample Interpretation Rule

Online prices in Germany are lower-bound signals. The engine's calibration blends simulated prices with sample data but ensures the typical output sits at or above the online signal level. This reflects the installer margin that exists in the actual installer-to-customer transaction.

---

## Known Limitations (Germany Implementation)

1. **No real-time price tracking.** Samples are point-in-time snapshots, not live feeds.
2. **Online shop anonymization.** Sources are labeled generically (DE shop A/B/C) for legal reasons.
3. **C/D tier uncertainty.** Brands with limited German market presence have wider price uncertainty. Confidence is capped at `medium` for these tiers.
4. **20+ kW band is broad.** The "20+" capacity band covers 20-999 kW with a single base price. Items in this band are predominantly commercial and receive N/A or light_commercial treatment.
5. **Package scope from model names only.** BAFA model names rarely contain scope information. Currently 6,511 of 6,514 items are classified as `unit_only`. This is correct for BAFA data (registry lists individual units) but means package scope primarily affects market samples, not BAFA items.
6. **Split system pricing is approximate.** Split systems in BAFA may represent the outdoor unit only, the indoor unit only, or a paired set. The engine cannot always distinguish these cases.
7. **No temporal price trends.** The engine does not model price changes over time. Base matrices should be reviewed annually.

---

## Current Production Outputs

| Output | Items | Description |
|--------|-------|-------------|
| bafa-priced.json | 6,514 | Full dataset: 5,350 priced + 1,164 N/A |
| bafa-residential.json | 4,387 | App-facing residential dataset |
| pricing-summary.json | 1 | Distribution statistics |
| review-flags.json | 1,573 | Items needing human review |
| calibration-report.json | 1 | Calibration details and comparison |
| sampling-coverage.json | 1 | Sample distribution report |

### Residential Dataset Quality (Production)

| Metric | Value |
|--------|-------|
| Items | 4,387 |
| Confidence: high | 2,726 (62%) |
| Confidence: medium | 1,661 (38%) |
| Confidence: low | 0 (0%) |
| Price range (typical) | EUR 4,600 - 18,950 |
| Median typical | EUR 9,000 |
| P25 - P75 | EUR 7,250 - 10,600 |
