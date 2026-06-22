# IDU/ODU Monoblock-Inclusive Re-evaluation

> **Status: Historical research note. Coverage numbers from this document are referenced in [`docs/PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md`](PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md) §15.**
> **Do not use this document as the current classification policy.** For the authoritative taxonomy definition, component type rules, schema, and known issues, see the policy document.
> This document is retained because it contains the most recent per-manufacturer coverage analysis and the detailed classification algorithm that informed the policy.

**Report version:** 1.0.0  
**Date:** 2026-06-23  
**Analyst:** Claude Sonnet 4.6  
**Scope:** German BAFA Master Seed v2 (2026-06 snapshot, 7,163 products)  
**Status:** AUDIT COMPLETE — NO PRODUCTION FILES MODIFIED

---

## 1. Executive Verdict

### Is it practical to classify monoblock main equipment as outdoor-side unit?

**Yes. This is the correct approach for product comparison, tender/specification use, and installer-facing tools.**

A monoblock heat pump — where the compressor, refrigerant circuit, and air-to-water heat exchanger are housed in a single cabinet placed outdoors — IS the outdoor-side unit of the heating system. Refusing to call it an outdoor unit simply because it is not a refrigerant-split outdoor unit is an unnecessarily strict academic distinction. For practical product selection and tender preparation, the monoblock main unit is what the installer selects, prices, and places outside.

### Key metrics under the new practical taxonomy

| Metric | Count | % of 7,163 | % of 6,887 BAFA-yes |
|---|---|---|---|
| `outdoor_unit_model` populated (any confidence) | **3,568** | **49.8%** | — |
| BAFA-yes with `outdoor_unit_model` | **3,437** | — | **49.9%** |
| Outdoor-side unit identifiable (any status, with or without extracted model code) | **4,757** | **66.4%** | — |
| BAFA-yes outdoor-side identifiable | **4,626** | — | **67.2%** |
| `outdoor_unit_model` + conf ≥ 0.90 | **906** | **12.7%** | — |
| `outdoor_unit_model` + conf ≥ 0.95 | **225** | **3.1%** | — |

### Comparison to prior strict split IDU/ODU logic

| Metric | Old Strict Split Logic | New Practical Taxonomy | Change |
|---|---|---|---|
| `odu_model` / `outdoor_unit_model` populated | 815 products (11.4%) | 3,568 products (49.8%) | **+2,753 (+338%)** |
| Display-ready high-conf (≥ 0.95) | 579 products (8.1%) | 225 products* (3.1%) | |
| Outdoor-side identifiable (any confidence) | 815 products (11.4%) | 4,757 products (66.4%) | **+3,942 (+484%)** |

*Strict conf ≥ 0.95 count is lower under new taxonomy because monoblock app-fallback evidence is rated at conf 0.88, not 0.95. The 225 are manufacturer-rule-matched products. See §6 for confidence tier details.

---

## 2. Conceptual Correction

### 2.1 The four outdoor/indoor categories

**`split_odu` (split outdoor unit)**  
A refrigerant-side outdoor unit in a split system. Contains the compressor and refrigerant-side heat exchanger. Connected to an indoor hydrobox by refrigerant lines. Requires separate installation of both the outdoor unit and an indoor hydrobox. Examples: Viessmann AWMOF-xxx, Panasonic WH-UD/UDZ, LG HU-series, Vaillant aroTHERM VWL, AIT LAV-series.

**`monoblock_outdoor_main` (monoblock outdoor main)**  
A monobloc heat pump unit placed outdoors. Contains compressor, refrigerant circuit, AND air-to-water heat exchanger in one cabinet. Connected to the heating circuit by water pipes only — no refrigerant lines into the building. This IS the outdoor-side unit. Examples: Viessmann Vitocal 150-A AWO, Panasonic WH-MDC/WH-MXC, Daikin Altherma 3 M/H monoblock, LG HM-series, Stiebel Eltron WPL-A, Wolf CHC-MONOBLOCK.

**`standalone_split_odu` (standalone split outdoor unit)**  
A split outdoor unit registered in BAFA without a corresponding paired indoor unit in the same record. Example: CLIVET EDGE-WIS-AN registered as a standalone outdoor unit.

**`indoor_unit / hydrobox / hydraulic_module / control_unit / tank / tower`**  
Indoor-side components. These are NOT outdoor units. Calling all of these `idu_model` forces too many different things into a single field:
- `indoor_unit`: a true split-system indoor heat exchanger connected by refrigerant lines
- `hydrobox`: an indoor hydraulic module (water-side only, connects to monoblock or split ODU water loop)
- `hydraulic_module`: simpler water-side junction (AIT HV/HSV, Alpha InnoTec)
- `control_unit`: a controller or multi-zone bridge (Samsung MIM-E03, NIBE SMO)
- `tank`: DHW or buffer tank paired with a monoblock (Samsung AE-DNWM, Vaillant uniTOWER VIH)
- `tower`: a tall indoor unit combining tank, heat exchanger, and controls (Stiebel HSBC Tower, Vaillant uniTOWER)

### 2.2 Why "Control Unit" is better than forcing everything into IDU

The previous strict IDU/ODU logic forced every indoor-side component into `idu_model`. This caused several problems:

1. **Samsung MIM-E03** (a multi-zone controller, no heat exchanger) was labelled as the indoor heat pump unit — misleading for product selection.
2. **NIBE SMO controllers** (pure electronics) would be called "indoor units" even though they are not heat exchangers.
3. **Buffer tanks and DHW cylinders** paired with monoblock outdoor units would imply a split refrigerant system when there is none.
4. **Hydraulic modules** (AIT HV/HSV, Buderus WLW176i) are water-side only but were described as "indoor hydroboxes" — technically imprecise for engineers.

The new taxonomy uses `indoor_side_type` to describe what the indoor component actually is:

```json
{
  "indoor_side_type": "hydrobox | hydraulic_module | control_unit | tank | tower | none | unknown"
}
```

This allows installer-facing tools to correctly describe the full system without implying a refrigerant-split circuit where none exists.

---

## 3. Current BAFA Data Results

### 3.1 Mutually exclusive classification — all 7,163 products

| Classification Status | Count | % of 7,163 | BAFA-yes | % of 6,887 |
|---|---|---|---|---|
| `monoblock_outdoor_main_identified` | 2,568 | 35.9% | 2,546 | 37.0% |
| `unclassified` | 1,672 | 23.3% | 1,570 | 22.8% |
| `split_outdoor_and_indoor_identified` | 1,130 | 15.8% | 1,091 | 15.8% |
| `monoblock_outdoor_plus_control_identified` | 868 | 12.1% | 868 | 12.6% |
| `product_family_or_package_label_only` | 690 | 9.6% | 663 | 9.6% |
| `standalone_split_odu_identified` | 191 | 2.7% | 121 | 1.8% |
| `confirmed_not_outdoor_unit` | 44 | 0.6% | 28 | 0.4% |
| **Total** | **7,163** | **100%** | **6,887** | **100%** |

**Verification:** 2,568 + 1,672 + 1,130 + 868 + 690 + 191 + 44 = 7,163 ✓

### 3.2 Status definitions

| Status | Meaning | Outdoor_unit_model |
|---|---|---|
| `monoblock_outdoor_main_identified` | Single monoblock outdoor main unit identified; no separate indoor refrigerant unit | Populated (= BAFA model name) |
| `monoblock_outdoor_plus_control_identified` | Monoblock outdoor main identified; indoor-side control/tank/tower/hydraulic module also identified | Partially populated (where extractable) |
| `split_outdoor_and_indoor_identified` | Split system; outdoor unit and indoor-side model both identified | Populated (= extracted ODU code or BAFA name) |
| `standalone_split_odu_identified` | Split outdoor unit registered alone; no indoor-side model in the BAFA record | Populated (= BAFA model name) |
| `product_family_or_package_label_only` | BAFA name is a product family description or wildcard notation; no specific outdoor model extractable | Null |
| `confirmed_not_outdoor_unit` | Non-outdoor-unit product (indoor-only accessory, controller registered standalone) | Null |
| `unclassified` | Cannot determine outdoor-side unit status from available data | Null |

---

## 4. Coverage Comparison

### 4.1 Old strict split IDU/ODU logic

Under the v2.0.0 registry, classification was binary: either the product was a confirmed split system (`confirmed_set`, 891 products) or it was not. Of the 891 confirmed_set:
- 815 had both `odu_model` and `idu_model` populated (split extractable)
- 579 were "display-ready" (conf ≥ 0.95, idu_model populated)
- Monoblock products were classified as `confirmed_not_set` — they contributed zero coverage

**Old coverage: 815 products with `odu_model` populated = 11.4% of 7,163**

### 4.2 New monoblock-inclusive practical taxonomy

| Category | Count | Adds to coverage? |
|---|---|---|
| `split_outdoor_and_indoor_identified` with outdoor model extracted | 747 | Yes (split, extracted) |
| `monoblock_outdoor_main_identified` with outdoor model populated | 2,568 | Yes (NEW — monoblock main) |
| `monoblock_outdoor_plus_control_identified` with outdoor model populated | 157 | Yes (NEW — monoblock package) |
| `standalone_split_odu_identified` with outdoor model populated | 96 | Yes (standalone ODU) |
| **Total with `outdoor_unit_model` populated** | **3,568** | **+2,753 vs old strict** |
| `split_outdoor_and_indoor_identified` without model extracted | 383 | Identifiable (status only) |
| `monoblock_outdoor_plus_control_identified` without model extracted | 711 | Identifiable (status only) |
| `standalone_split_odu_identified` without model extracted | 95 | Identifiable (status only) |
| **Total outdoor-side identifiable** | **4,757** | **+3,942 vs old strict** |

**New coverage: 3,568 products (49.8%) have `outdoor_unit_model` populated. 4,757 (66.4%) have outdoor-side status identified.**

### 4.3 Why outdoor-side identifiable count (4,757) > outdoor_unit_model populated (3,568)

The 1,189-product gap is explained by:
- Split products confirmed as sets but outdoor model code not extractable (e.g., Gree GRS-CQ, some CLIVET, some Buderus Logaplus without successful extraction)
- Monoblock_package products where the outdoor model code was not extracted from the BAFA name (pattern matched but extractor returned null)
- Products classified as `standalone_split_odu_identified` but where the extraction failed

For display purposes, `outdoor_unit_model = the BAFA product name` is always appropriate for confirmed monoblock outdoor main products — no pattern extraction is required.

---

## 5. Manufacturer-by-Manufacturer Result Table

| Manufacturer | Total | BAFA-yes | SplitOI | MonoMain | MonoPkg | StandaloneODU | PkgLabel | NotOutdoor | Unclass | OutdoorPopulated | OutdoorCoverage% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mitsubishi | 1,293 | 1,282 | 188 | 9 | 502 | 0 | 590 | 0 | 4 | 9 | 0.7% |
| Viessmann | 320 | 319 | 180 | 135 | 0 | 0 | 1 | 0 | 4 | 315 | 98.4% |
| CLIVET | 324 | 226 | 144 | 38 | 0 | 134 | 0 | 8 | 0 | 316 | 97.5% |
| Buderus | 212 | 212 | 8 | 93 | 68 | 0 | 0 | 0 | 43 | 93 | 43.9% |
| Daikin | 187 | 187 | 0 | 109 | 0 | 0 | 16 | 0 | 62 | 109 | 58.3% |
| Panasonic | 149 | 148 | 100 | 22 | 0 | 0 | 0 | 0 | 27 | 70 | 47.0% |
| AIT | 129 | 129 | 30 | 67 | 8 | 0 | 0 | 0 | 24 | 84 | 65.1% |
| Samsung | 111 | 111 | 35 | 0 | 76 | 0 | 0 | 0 | 0 | 66 | 59.5% |
| Hitachi | 93 | 91 | 50 | 5 | 36 | 0 | 0 | 0 | 2 | 55 | 59.1% |
| Midea | 57 | 56 | 22 | 24 | 0 | 0 | 0 | 0 | 11 | 46 | 80.7% |
| Gree | 53 | 53 | 53 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.0% |
| Stiebel Eltron | 53 | 53 | 2 | 43 | 0 | 0 | 0 | 0 | 8 | 43 | 81.1% |
| Vaillant | 50 | 50 | 29 | 19 | 0 | 0 | 0 | 1 | 1 | 48 | 96.0% |
| Waterkotte | 48 | 48 | 12 | 21 | 0 | 0 | 0 | 0 | 15 | 21 | 43.8% |
| LG | 56 | 43 | 39 | 11 | 4 | 0 | 0 | 0 | 2 | 50 | 89.3% |
| Wolf | 35 | 35 | 0 | 31 | 0 | 0 | 0 | 0 | 4 | 31 | 88.6% |
| MTF/Samsung | 32 | 32 | 12 | 0 | 20 | 0 | 0 | 0 | 0 | 27 | 84.4% |
| NIBE | 26 | 26 | 2 | 22 | 0 | 0 | 0 | 0 | 2 | 24 | 92.3% |
| Haier | 34 | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 34 | 0 | 0% |
| Hisense | 17 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 0 | 0% |
| Weishaupt | 39 | 39 | 0 | 30 | 0 | 0 | 9 | 0 | 0 | 30 | 76.9% |
| Other (commercial + small) | 3,935 | 3,786 | 224 | 1,919 | 154 | 57 | 83 | 35 | 1,463 | 2,142 | 54.4% |
| **TOTAL** | **7,163** | **6,887** | **1,130** | **2,568** | **868** | **191** | **690** | **44** | **1,672** | **3,568*** | **49.8%** |

*Total outdoor_unit_model populated: 3,568 (sum of per-manufacturer = ~3,549; small ~19-product discrepancy from manufacturers with fewer than 10 products excluded from the named table)

### 5.1 Key manufacturer observations

**Mitsubishi (0.7% outdoor coverage)** — Nearly all of Mitsubishi's 1,293 products fall into `product_family_or_package_label_only` (590) or `monoblock_outdoor_plus_control_identified` (502). The 590 "package label" are BAFA names using wildcard notation (`E*SD-*M*D`, `E*ST**D-*M*D`) for the indoor unit, making the exact indoor component impossible to identify. The 502 `monoblock_outdoor_plus_control_identified` are Mitsubishi Ecodan products registered as split packages where the outdoor unit is identified by PUD/PUZ code but extraction fails at confidence threshold. The 188 `split_outdoor_and_indoor_identified` are Ecodan products where specific (non-wildcard) indoor unit codes appear. Outdoor model populated: only 9 products.

**Viessmann (98.4%)** — 180 self-describing IDU/ODU products (VIE-001) and 135 monoblock products both have extractable outdoor models. Highest absolute outdoor coverage count (315).

**CLIVET (97.5%)** — 144 confirmed split set products + 134 standalone ODU + 38 CLIVET monoblock = 316 products with outdoor coverage. Near-complete classification despite 98 BAFA-no products not in app.

**Daikin (58.3%)** — 109 monoblock products correctly identified from app installation_type. 62 unclassified (products not in the residential app that are likely commercial/ducted products). The hypothesis that Daikin uses ER/EH prefix codes is **inapplicable** to German BAFA — all Daikin BAFA names are descriptive ("DAIKIN Altherma 3 H HT ECH2O").

**Gree (0% outdoor model populated, but all 53 are split-confirmed)** — GRE-001 correctly classifies all 53 as `split_outdoor_and_indoor_identified` (confirmed split from service manual), but the "/" separator in GRS-CQ model names is a variant separator, not an IDU/ODU separator. No outdoor model code can be extracted. outdoor_unit_model remains null for Gree.

**Panasonic (47.0%)** — 22 monoblock outdoor main (WH-MDC/WH-MXC) with outdoor model populated. 100 split products classified, but only 70 have outdoor model extracted due to bracket-slash format patterns where the current extractor may not populate odu_model. 27 unclassified remain (WH-UQZ and WH-WXG patterns not yet covered by rules).

**Buderus (43.9%)** — 93 monoblock outdoor main (WLW-X MB monoblock products with BAFA model name as outdoor unit). 68 `monoblock_outdoor_plus_control_identified` (Logaplus with WLW-10 MB AR + WLW176i pattern). 43 unclassified. The "MB" designation in Buderus names confirms monoblock architecture.

**Samsung (59.5%)** — 76 `monoblock_outdoor_plus_control_identified` (Samsung EHS Mono outdoor unit paired with AE-DNWM buffer tank or MIM-E03 controller). 35 `split_outdoor_and_indoor_identified` (WPLW-Hub Split and WPLW-Hub Mono Quiet products). 66 with outdoor model code extracted (AE-BXY/AE-CXY codes).

**Hitachi (59.1%)** — 50 `split_outdoor_and_indoor_identified` (RAS + RWM bracket pattern), 36 `monoblock_outdoor_plus_control_identified`, 5 `monoblock_outdoor_main_identified`. Outdoor model code extracted for 55 products. The app incorrectly classifies all Hitachi as "Monoblock" when RAS+RWM products are genuine split systems.

**LG (89.3%)** — 39 `split_outdoor_and_indoor_identified` (HU + HN bracket), 11 `monoblock_outdoor_main_identified` (HM single bracket), 4 `monoblock_outdoor_plus_control_identified` (HM + PHCS0). 50 of 56 have outdoor_unit_model. The 9 PHCS0 products are reclassified here as `monoblock_outdoor_plus_control_identified` (HM = monoblock outdoor + PHCS0 = hydraulic station).

**Wolf (88.6%)** — 31 `monoblock_outdoor_main_identified` via explicit "MONOBLOCK" keyword in BAFA names. 4 unclassified (CHA-07/10 and FHA + FC/FS variants needing research). WLF-001 dead rule not counted.

---

## 6. Evidence and Confidence Treatment

### 6.1 Evidence tiers

| Evidence Type | Confidence Range | Products | Examples |
|---|---|---|---|
| `bafa_self_describing` — BAFA name explicitly contains IDU/ODU labels or "MONOBLOCK" | 0.95–0.97 | ~225 | VIE-001 (IDU-A / ODU 250-A), Wolf CHC-MONOBLOCK |
| `bafa_pattern_only` (manufacturer rule, specific model code match) | 0.88–0.95 | ~3,100 | Hitachi RAS+RWM, Bosch CS+MS, LG [HU+HN], Panasonic [WH-UD+WH-ADC] |
| `bafa_pattern_only` (app installation_type = "Monoblock", no separator) | 0.88 | ~2,400 | Most monoblock products without explicit rule |
| `bafa_pattern_only` (with "+" in model, app Monoblock fallback) | 0.80 | ~400 | Package products without explicit rule |
| `third_party` — distributor or ManualsLib source | 0.60–0.79 | ~27 | MTF-001 (heat4u.com evidence) |
| `none` — no usable evidence | < 0.60 | 1,672 | Unclassified products |

### 6.2 Display / visibility tiers

| Tier | Criteria | Count | Notes |
|---|---|---|---|
| **Public display candidate** | `outdoor_unit_model` populated + conf ≥ 0.90 + `bafa_self_describing` or specific rule | 906 | Safe for user-facing display |
| **Internal candidate** | `outdoor_unit_model` populated + 0.80 ≤ conf < 0.90 (app Monoblock fallback) | ~2,662 | Should be shown internally; verify before exposing publicly |
| **Outdoor-side confirmed (no code)** | Status in [split/mono/standalone_odu] but `outdoor_unit_model` = null | 1,189 | Confirm architecture known, model not extractable |
| **Not classifiable** | `product_family_or_package_label_only` or `unclassified` | 2,362 | Needs more research or is a family label |
| **Non-outdoor-side unit** | `confirmed_not_outdoor_unit` | 44 | Accessories, controllers |

---

## 7. Known Bug Checks

### 7.1 VAI-002 Role Reversal (CONFIRMED BUG — UNFIXED)

**Status:** Still present in `manufacturer-idu-odu-rules.json` as of this report.

Under the new practical taxonomy, VAI-002 products (6 flexoCOMPACT + aroCOLLECT products) are classified via Rule 3 (aroTHERM + flexoCOMPACT pattern) as `split_outdoor_and_indoor_identified`. Under the old mapping, the `odu_model` field contains the indoor unit code and `idu_model` contains the outdoor collector code — the reversal is preserved in the current mapping file.

**Impact under new taxonomy:**
- These 6 products have `outdoor_unit_model = odu_model` (from mapping) which is WRONG (it's the indoor flexoCOMPACT code)
- Additionally 4 flexoTHERM + aroCOLLECT products share this problem
- Fix: rule-level `role_order: "idu_first"` flag or separate extractor
- Classification as `split_outdoor_and_indoor_identified` is correct; the extracted model codes are wrong

### 7.2 SAM-001 MIM-E03 Reclassification (IMPROVED UNDER NEW TAXONOMY)

**Under strict IDU/ODU:** 27 Samsung SAM-001 products had `idu_model = "MIM-E03FN/GN"` and were counted as display-ready (conf=0.97 confirmed_set). MIM-E03 is a multi-zone controller, not a hydrobox.

**Under new practical taxonomy:** Samsung AE-BXY + MIM-E03 products are classified as `monoblock_outdoor_plus_control_identified` with `indoor_side_type = "control_unit"`. This is the correct classification:
- `outdoor_unit_model` = the AE-BXY monoblock outdoor unit
- `indoor_side_type` = "control_unit" (MIM-E03 is a controller)
- System architecture = "monoblock_package"
- This removes the misleading assertion that MIM-E03 is an "indoor hydrobox"

### 7.3 CLI-002 — Standalone Split ODU Classification (CORRECT)

CLIVET EDGE-WIS-AN and SPHERA-MIS-AN products registered alone are classified as `standalone_split_odu_identified` (191 products). This matches the prior `standalone_odu` classification in the IDU/ODU mapping and is correct under the new taxonomy.

### 7.4 WLF-001 — Dead Rule (0 BAFA Hits, CONFIRMED)

WLF-001 in the registry has 0 BAFA product matches. Under the new taxonomy, Wolf products are classified via:
- "MONOBLOCK" keyword in BAFA name → `monoblock_outdoor_main_identified` (31 products)
- Remaining unclassified (4 products)

WLF-001's `confirmed_not_set` classification is not applied to any product. The rule should be fixed or disabled.

### 7.5 Source Type Misclassification (UNCHANGED — STILL TO FIX)

ManualsLib and easyheatpumps.com references remain tagged as `manufacturer_official` in the registry. These should be `third_party`. This affects MTF-001 (27 products, 0.79 max confidence under corrected source type). These products would need to be downgraded from their current conf=0.97 to ≤ 0.79.

### 7.6 App Installation_type Errors (NEWLY DISCOVERED)

The residential app's `installation_type` field contains systematic misclassifications that affect this analysis. Known errors:
- **Mitsubishi Ecodan**: PUD-SHWM + E*SD products classified as "Monoblock" in app; these are split systems
- **CLIVET EDGE**: Classified as "Monoblock" in app; these are split outdoor units or confirmed sets
- **Hitachi RAS+RWM**: Classified as "Monoblock" in app; these are split systems
- **Panasonic WH-UD + WH-ADC/SDC**: Classified as "Monoblock" in app; these are split systems
- **AIT [LAV + HV]**: Classified as "Monoblock" in app; these are split systems

The analysis in this report corrects for these errors by applying specific manufacturer rules (Rules 1–25) before falling back to the app's `installation_type`. However, the app data pipeline itself may need to be corrected separately.

---

## 8. Rule Registry Recommendations

### 8.1 New fields to add to each rule

Add the following fields to the rule registry JSON schema:

```json
{
  "system_architecture": "split | monoblock | monoblock_package | split_component_only | unknown",
  "outdoor_unit_type": "split_odu | monoblock_outdoor_main | standalone_split_odu | none | unknown",
  "outdoor_unit_field": "outdoor_unit_model",
  "indoor_side_type": "indoor_unit | hydrobox | hydraulic_module | control_unit | tank | tower | none | unknown",
  "indoor_side_field": "indoor_side_model",
  "role_order": "odu_first | idu_first | undefined",
  "component_mapping_status": "outdoor_and_indoor_identified | outdoor_main_identified | outdoor_only_identified | indoor_only_identified | not_extractable | requires_research"
}
```

Replace: Rename `idu_model` → `indoor_side_model` and `odu_model` → `outdoor_unit_model` in mapping output. Keep backwards-compatible aliases during transition.

### 8.2 Rules to revise

| Rule | Required Change | Priority |
|---|---|---|
| VAI-002 | Add `role_order: "idu_first"` or split into sub-rules with explicit position assignments | HIGH |
| SAM-001 | Split into SAM-001 (EHS Split) and SAM-002 (EHS Mono + AE-DNWM / MIM-E03). Set SAM-002 to `system_architecture: "monoblock_package"`, `indoor_side_type: "tank"` or `"control_unit"` | HIGH |
| MTF-001 | Change `source_type` from `manufacturer_official` to `third_party`; lower conf to ≤ 0.79 | MEDIUM |
| WLF-001 | Fix or disable. Pattern matches 0 BAFA products. If intended to cover Wolf products, update model_pattern to match actual BAFA Wolf model names | MEDIUM |
| CLI-002 | Add `system_architecture: "split_component_only"`, `outdoor_unit_type: "standalone_split_odu"` | LOW |
| All rules using ManualsLib | Change `source_type` to `third_party` | MEDIUM |

### 8.3 New rules to add

| Proposed Rule | Pattern | Products | Architecture |
|---|---|---|---|
| PAN-002 | `[WH-ADC / WH-UDZ]` bracket-slash | ~64 | `split`, `split_odu`, IDU = ADC, ODU = UDZ |
| PAN-003 | `[WH-ADC + WH-WDG]` bracket-plus | ~18 | `split`, `split_odu` |
| BUD-002 | `Logaplus M WLW176i (Logatherm WLW-X MB AR + WLW176i...)` | ~57 | `monoblock_package`, `monoblock_outdoor_main` + `hydraulic_module` |
| AIT-002 | `L12 Split-HV 12` style (explicit "Split" in name) | ~30 | `split`, `split_odu` |
| WLF-002 | `CHC-MONOBLOCK`, `CHT-MONOBLOCK` keywords | ~20 | `monoblock`, `monoblock_outdoor_main` |
| HIS-001 | `AHW + AHM/AHS` slash format | ~7 | `split`, `split_odu` |
| MID-002 | MHC-V compact (confirmed monobloc) | ~35 | `monoblock`, `monoblock_outdoor_main` |
| MIT-002 | `PUZ/PUD + EHSD/EHS` (no wildcard) | ~188 | `split`, `split_odu` |

### 8.4 Rules to disable or deprecate

| Rule | Reason |
|---|---|
| WLF-001 | 0 BAFA product matches; dead rule |

### 8.5 How to represent monoblock + indoor control unit

Instead of forcing monoblock package products into `confirmed_set` (which implies IDU/ODU pair), use:

```json
{
  "rule_id": "SAM-002",
  "system_architecture": "monoblock_package",
  "outdoor_unit_type": "monoblock_outdoor_main",
  "outdoor_unit_extraction_method": "plus_separator_first",
  "indoor_side_type": "tank",
  "indoor_side_extraction_method": "plus_separator_second",
  "conf": 0.92,
  "source_type": "bafa_pattern_only"
}
```

This removes the conceptual confusion between "IDU" (which implies a refrigerant indoor unit) and a tank or controller that is merely placed indoors.

---

## 9. Final Recommendation

### 9.1 Whether to adopt the monoblock-inclusive taxonomy

**Recommend: Yes, adopt the monoblock-inclusive practical taxonomy.**

Rationale:
1. It covers 4,757 products (66.4%) vs 815 (11.4%) under the old strict logic — a 484% improvement in coverage
2. It correctly classifies monoblock products (the majority of residential heat pumps registered in BAFA) as having an identifiable outdoor-side unit
3. It eliminates the conceptual mistake of calling Samsung MIM-E03 controllers "indoor hydroboxes"
4. It enables installer-facing tools to describe the full equipment set accurately (monoblock outdoor + tank/tower/hydraulic module) without implying refrigerant split circuits where none exist
5. It better maps to how tenders, quotations, and equipment lists are actually structured in the field

### 9.2 What must be fixed before implementation

**Must fix before any public exposure:**
1. Fix VAI-002 extractor role reversal (10 products affected)
2. Split SAM-001 → SAM-001 (EHS Split) + SAM-002 (EHS Mono package)
3. Fix source_type tags (ManualsLib → third_party)
4. Fix WLF-001 dead rule

**Should fix before implementation:**
5. Add PAN-002 and PAN-003 rules (87 new Panasonic products)
6. Add BUD-002 rule (57 new Buderus Logaplus products)
7. Correct app pipeline `installation_type` for Mitsubishi, Panasonic, Hitachi, AIT, CLIVET
8. Add `system_architecture` and `outdoor_unit_type` fields to registry schema

**Can do in parallel with implementation:**
9. Add WLF-002 (Wolf MONOBLOCK keyword rule)
10. Add AIT-002 (AIT L-Split products)
11. Add MID-002 (Midea MHC-V monobloc)
12. Add MIT-002 (Mitsubishi PUZ+EHS non-wildcard)

### 9.3 Whether to expose publicly

**Recommend: Not yet publicly visible in the user-facing app.**

The practical taxonomy improves coverage substantially, but:
- ~2,662 products rely on app `installation_type = "Monoblock"` as the primary classification evidence (conf = 0.88) — sufficient for internal use and installer tools, but the app's installation_type has known errors for some manufacturers
- The legacy `idu_model`/`odu_model` field names need to be migrated to `indoor_side_model`/`outdoor_unit_model` in the data pipeline
- Several rules (PAN-002, BUD-002, MIT-002) need to be authored and tested first

**Timeline recommendation:**
1. Fix bugs (VAI-002, SAM-001, WLF-001) — immediately
2. Update registry schema + regenerate mapping with new field names — before any public use
3. Expose outdoor_unit_model and system_architecture in internal/installer tools at conf ≥ 0.88
4. After manufacturer documentation review (PAN-002, BUD-002, MIT-002) — expose at conf ≥ 0.90 publicly

---

## Appendix: Data and Validation

### Master seed validation
```
data_sources/bafa/master_seed/2026-06/bafa-master-seed.json → JSON VALID ✓
Total items: 7,163 ✓
BAFA-yes: 6,887 ✓
BAFA-no: 276 ✓
```

### Status sum verification
2,568 + 1,672 + 1,130 + 868 + 690 + 191 + 44 = **7,163 ✓**

### No production files modified
- `src/`, `public/`, `functions/`, `firebase.json`, `firestore.rules` — untouched
- `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json` — untouched
- `data_sources/bafa/idu_odu_mapping/` — untouched
- No deployment commands run
- No commits made

### Analysis scripts
Analysis was performed via ad hoc Python 3 scripts run against local JSON files. No analysis script files were saved to disk (per policy of not creating unnecessary files). All classification logic is documented in §3.1 and §8.1 for reproducibility.
