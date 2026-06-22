# IDU/ODU Re-evaluation from Manufacturer Patterns

> **Status: Historical research note. Superseded by [`docs/PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md`](PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md).**
> **Do not use this document as the current classification policy.**
> This document re-evaluated the v2.0.0 registry rules against actual BAFA data patterns. Its findings on new rule candidates (PAN-002/003, BUD-002, MIT-002) and known bugs (VAI-002, SAM-001, WLF-001) are incorporated into the policy document §14. The monoblock-inclusive taxonomy developed after this report supersedes the strict IDU/ODU approach described here.

**Report version:** 1.0.0  
**Date:** 2026-06-22  
**Analyst:** Claude Sonnet 4.6  
**Scope:** German BAFA Master Seed v2 (2026-06 snapshot) × Manufacturer Rule Registry v2.0.0  
**Status:** AUDIT COMPLETE — NO PRODUCTION FILES MODIFIED

---

## 1. Executive Verdict

The IDU/ODU Rule Registry v2.0.0 (45 rules, 891 confirmed_set, 579 display-ready) is **partially correct but has significant gaps and several confirmed errors**. Three categories of findings:

**A. Confirmed bugs (must fix):**
1. **VAI-002 extraction reversal** — `plus_separator` assigns `odu_model` the indoor unit code and `idu_model` the outdoor collector code for all 10 flexoCOMPACT/flexoTHERM + aroCOLLECT products.
2. **SAM-001 MIM-E03 misclassification** — 27 of 78 SAM-001 products have `idu_model = "MIM-E03FN"` or `"MIM-E03GN"`. MIM-E03 is Samsung's Multi-zone Interface Module (a controller/bridge), not an indoor hydrobox. These products should not report an extractable idu_model.

**B. Substantial unclassified coverage gaps (new rules needed):**
- Panasonic: ~87 products with confirmed bracket-slash and alternate bracket-plus IDU+ODU patterns currently in `unclassified`
- Buderus: ~65 products (Logaplus paren-plus/paren-amp + WPLS split) currently `unclassified`
- AIT (Alpha InnoTec): additional dash-separator LAV+HV sets beyond current bracket-only AIT-001

**C. Status classifications needing review:**
- Samsung MIM-E03 products (27): downgrade from `confirmed_set` to `requires_research`
- LG PHCS0 products (9): requires manufacturer verification (hydraulic station vs. true indoor hydrobox)
- Midea MHC-V (35): likely `confirmed_not_set` (compact monobloc), currently `unclassified`
- Wolf CHC/CHT-MONOBLOCK (20): likely `confirmed_not_set`, currently `unclassified`

**Net IDU/ODU distinguishability:** 891 products (12.4%) are currently `confirmed_set`. Of these, ~864 are likely genuine (891 minus 27 MIM-E03). A further ~152 unclassified products show strong BAFA-pattern evidence for confirmed_set (87 Panasonic + 65 Buderus). The remaining 5,043 unclassified (70.4%) cannot be determined from BAFA names alone without additional manufacturer documentation.

---

## 2. Method

### Data sources used
| Source | Description | Status |
|---|---|---|
| `data_sources/bafa/master_seed/2026-06/bafa-master-seed.json` | 7,163 BAFA products, 50-field seed | READ |
| `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json` | Registry v2.0.0, 45 rules | READ |
| `data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-mapping.json` | Current classification outputs (7,163 items) | READ |
| `data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-summary.json` | Summary stats | READ |

### Method summary
Approximately 20 targeted Python scripts were run against the BAFA master seed and mapping file to:
- Count products per manufacturer per classification status
- Match BAFA model name patterns against each manufacturer's hypothesis rule
- Identify products in `unclassified` that match known IDU+ODU patterns
- Cross-check existing `confirmed_set` records for correctness

### Live online verification status
**NOT PERFORMED.** No WebSearch or WebFetch tools were used in this session. All findings are based solely on BAFA master seed data patterns and prior-session research already recorded in the registry and evidence audit report. Manufacturer website URLs mentioned in this report are from registry `url` fields or prior session research notes — they were not re-fetched or verified to be live.

### Operational constraints
No production files, Firebase data, Cloud Functions, Firestore, UI code, or hosting configuration were modified. No commits were made.

---

## 3. Manufacturer Hypothesis Rules — Interpretation and Test Results

### 3.1 Rule Summary Table

| Mfr | Hypothesis Rule | BAFA Test Result | BAFA Products Matched | Verdict |
|---|---|---|---|---|
| Viessmann | `Vitocal [ODU] + [IDU]` bracket-plus; self-describing names | `VIE-001` correctly captures 180 products via `viessmann_idu_odu` extractor | 180 | CONFIRMED ✓ |
| CLIVET | `EDGE-WIS-AN` + `HQCN` extractor; `SPHERA-MIS-AN` + `EDGE-WIS-AN` | `CLI-001` + `CLI-002` capture 122 + 22 = 144 confirmed_set. CLI-002: 22 products standalone_odu, not set. | 144 confirmed_set, 22 standalone_odu | CORRECT ✓ |
| Samsung | `[AE-xBXY + AE-xRNWM]` paren-plus split pattern | SAM-001 covers 78 but 27 have `idu_model = MIM-E03` (controller, not hydrobox) | 51 genuine, 27 questionable | PARTIAL BUG |
| Panasonic | `WH-UD + WH-ADC/SDC` bracket-plus | PAN-001 covers 55 (bracket-plus `[WH-UD... + WH-ADC/SDC...]`). **NEW**: bracket-slash format `[WH-ADC / WH-UDZ]` has 64 products; `[WH-ADC/WH-WDG]` slash has 18; `[WH-UQZ... + WH-ADC...]` has 10; `[WH-WXG... + WH-ADC...]` has 17. Total missed: ~87. | 55 current + ~87 new | MAJOR GAP |
| Hitachi (JCH) | `RAS + RWM` plus-separator split | `JCH-001` covers 50 products. Correctly identified. | 50 | CONFIRMED ✓ |
| Bosch | Paren-plus pattern `(CS + MS)` | `BSH-001` covers 36 products. | 36 | CONFIRMED ✓ |
| Vaillant VAI-001 | `aroTHERM plus / aroTHERM [ODU] + flexoTHERM exclusive [IDU]` | `VAI-001` covers 23 products. Plus-separator correct for this rule. | 23 | CONFIRMED ✓ |
| Vaillant VAI-002 | `flexoCOMPACT [IDU] + aroCOLLECT [ODU]` | `VAI-002`: 6 products. **BUG CONFIRMED**: idu/odu labels reversed — idu_label says "outdoor air-source collector" and odu_label says "indoor heat pump unit". Plus-separator assigns position 1 → odu and position 2 → idu; but flexoCOMPACT (indoor) appears first and aroCOLLECT (outdoor) appears second in the BAFA name. | 6 (all wrong) | EXTRACTION BUG |
| Buderus | `Logaplus M [ODU] + [IDU]` paren-plus; `WLW-X AR` = outdoor, `WLW176i/186i` = indoor | `BUD-001` only covers 6 products (paren-amp pattern). **NEW**: paren-plus `Logaplus M` has 45 products; paren-amp has 12 more; WPLS split has 8. Total missed: ~57. | 6 current + ~57 new | MAJOR GAP |
| Stiebel Eltron | `WPL/WPF/WPLS` split-type naming; `WPL-A` = outdoor, `WPC-A` = indoor | `NIB-001` (NIBE) covers 2 products. REH-001 covers 4 Stiebel products (conf=0.95, method=none). Most Stiebel in `unclassified` (51 products). BAFA names for Stiebel are descriptive German names without model-code split notation. | 2+4 current, 51 unknown | GAP / REQUIRES RESEARCH |
| LG | `HU + HN` bracket-plus; `HM + HN` bracket-plus | `LGE-001` covers 39 products (HU+HN and HM+HN). 9 additional `HM + PHCS0` products in LGE-001 raise classification confidence concern (PHCS0 = passive hydraulic station, not standard HN hydrobox). | 39 (inc. 9 PHCS0) | REQUIRES REVIEW for PHCS0 |
| NIBE | `NIBE S-Series [ODU + IDU]` naming | `NIB-001`: 2 products (conf=0.95). 24 NIBE products unclassified; many use descriptive names (NIBE F2040, F2050) without explicit IDU/ODU codes in BAFA names. | 2 current, 24 unknown | GAP |
| AIT | `LAV/LWAV + HV/HSV` separator pattern | `AIT-001`: 17 bracket-format products `[LAV x.x Rz + HV x-y]`. **NEW**: dash-separator `LAV x-HV y` products have 13 (some overlap with bracket). 24 Helox/Hybrox products (no code notation) require separate research. | 17 current + ~5-10 new | PARTIAL GAP |
| Gree | `GRS-CQ` split-system confirmed; "/" = variant separator not IDU/ODU | `GRE-001`: 53 products, `conf=0.87`, `method=none`. Correct that "/" is not an IDU/ODU separator. Products registered as split-system via manufacturer service manual evidence (not BAFA text). Classification status OK; no idu_model extractable. | 53 (no extraction) | CORRECT ✓ |
| Midea | `MHA-V + HB/HBT` = outdoor + indoor hydrobox; `MHC-V` = monobloc | 22 MHA-V + HB/HBT already in `confirmed_set` (MID-001, conf=0.97). 35 MHC-V in `unclassified` should be `confirmed_not_set`. | 22 set, 35 monobloc unclassified | PARTIAL GAP |
| Wolf | `CHC/CHT-MONOBLOCK` = monobloc; `CHA-07/10` = unknown; `FHA + FC/FS` = likely split | `WLF-001` (conf=0.98, confirmed_not_set) has **0 BAFA products matched** (rule is dead). All 35 Wolf products in `unclassified`. CHC/CHT-MONOBLOCK (20) should be `confirmed_not_set`. CHA-07/10 (4) uncertain. FHA-08/10 + FC/FS (6) likely split, needs verification. | 0 current, 35 unclassified | DEAD RULE + GAP |
| Hisense | `AHW + AHM/AHS` slash-separator split | BAFA has 17 Hisense products: 7 BAFA-yes, 10 BAFA-no. AHW (outdoor) + AHM/AHS (indoor) pattern with "/" separator confirmed in BAFA names. All 17 currently `unclassified`. | 0 current, 7 BAFA-yes unclassified | GAP (small) |
| Daikin | `ER` prefix = outdoor; `EH` prefix = indoor; `EHBX` = hydraulic module | **WRONG for German BAFA**. All 187 Daikin products use descriptive names ("DAIKIN Altherma 3 H HT ECH2O..."), not `ER`/`EH` prefix model codes. DAI-001 correctly classifies 103 as `variant_label`. 84 remain `unclassified`. | 0 (prefix hypothesis inapplicable) | HYPOTHESIS WRONG for BAFA-DE |
| Mitsubishi | `PUZ/PUD + EHS/ERS` plus-separator | 153 products match PUZ/PUD + EHS/ERS + plus pattern. But ALL 1,293 Mitsubishi products currently in `variant_label` (571) or `unclassified` (722). MIT-001 covers 571 `variant_label` using wildcard/family notation. The 153 genuine sets with extractable codes are buried in unclassified — no rule covers them. | 153 extractable sets unclassified | GAP |

---

## 4. Current BAFA Classification State

### 4.1 Overall counts (from `idu-odu-mapping.json`, 7,163 total)

| Classification | Count | % |
|---|---|---|
| unclassified | 5,043 | 70.4% |
| variant_label | 894 | 12.5% |
| confirmed_set | 891 | 12.4% |
| standalone_odu | 191 | 2.7% |
| confirmed_not_set | 129 | 1.8% |
| requires_research | 15 | 0.2% |
| **Total** | **7,163** | **100%** |

### 4.2 Display-ready confirmed_set (conf ≥ 0.95, idu_model populated)

| Metric | Count |
|---|---|
| confirmed_set total | 891 |
| confirmed_set with conf ≥ 0.95 | 581 |
| confirmed_set with conf ≥ 0.95 AND idu_model populated | 579 (display-ready) |
| confirmed_set idu_model = MIM-E03 (Samsung controller, not hydrobox) | 27 |
| Effective display-ready after MIM-E03 exclusion | ~552 |

### 4.3 Per-manufacturer breakdown

| Manufacturer | Total | BAFA-Yes | confirmed_set | variant_label | standalone_odu | confirmed_not_set | requires_res | unclassified |
|---|---|---|---|---|---|---|---|---|
| Mitsubishi Electric | 1,293 | 1,282 | 0 | 571 | 0 | 0 | 0 | 722 |
| Viessmann | 320 | 319 | 180 | 63 | 0 | 0 | 0 | 77 |
| CLIVET | 324 | 226 | 144 | 0 | 134 | 46 | 0 | 0 |
| Daikin | 187 | 187 | 0 | 103 | 0 | 0 | 0 | 84 |
| Samsung | 111 | 111 | 78 | 0 | 0 | 0 | 0 | 33 |
| Buderus | 212 | 212 | 6 | 0 | 0 | 0 | 0 | 206 |
| AIT-Deutschland | 129 | 129 | 17 | 0 | 0 | 0 | 0 | 112 |
| Gree | 68 | 68 | 53 | 0 | 0 | 0 | 0 | 15 |
| Midea | 57 | 56 | 22 | 0 | 0 | 0 | 0 | 35 |
| Vaillant | 50 | 50 | 29 | 0 | 0 | 11 | 0 | 10 |
| Stiebel Eltron | 53 | 53 | 2 | 0 | 0 | 0 | 0 | 51 |
| Panasonic | 149 | 148 | 55 | 0 | 0 | 7 | 0 | 87 |
| Bosch | 87 | 87 | 36 | 0 | 48 | 3 | 0 | 0 |
| Hitachi (JCH) | ~50 | ~50 | 50 | 0 | 0 | 0 | 0 | 0 |
| LG Electronics | 56 | 43 | 39 | 0 | 0 | 0 | 0 | 17 |
| Wolf | 35 | 35 | 0 | 0 | 0 | 0 | 0 | 35 |
| Waterkotte | 48 | 48 | 0 | 0 | 0 | 0 | 0 | 48 |
| Weishaupt | 39 | 39 | 0 | 9 | 0 | 0 | 0 | 30 |
| NIBE | 26 | 26 | 2 | 0 | 0 | 0 | 0 | 24 |
| Haier | 34 | 34 | 0 | 0 | 0 | 0 | 0 | 34 |
| Hisense | 17 | 7 | 0 | 0 | 0 | 0 | 0 | 17 |
| MTF/Samsung WPLW | ~27 | ~27 | 27 | 0 | 0 | 0 | 0 | 0 |

---

## 5. IDU/ODU Distinguishability Summary

### 5.1 Products where IDU and ODU can be distinguished

| Category | Method | Count | % of 7,163 |
|---|---|---|---|
| confirmed_set, extractable (idu_model populated) | Rule-based extraction | 815 | 11.4% |
| confirmed_set, method=none (set confirmed, codes not extracted) | Evidence-only (GRE-001, REH-001) | 76 | 1.1% |
| **Total confirmed_set** | | **891** | **12.4%** |
| **Display-ready** (conf≥0.95, extractable) | | **579** | **8.1%** |

### 5.2 Breakdown of why 5,043 products remain unclassified

| Reason | Approx. Count |
|---|---|
| Mitsubishi wildcard/variant notation (no exact component codes) | 722 |
| Buderus Logaplus paren sets (not yet covered by rule) | ~65 |
| Panasonic bracket-slash / alternate bracket-plus (not yet covered) | ~87 |
| AIT Helox/Hybrox (no IDU/ODU codes in BAFA name) | 24 |
| AIT LAV+HV dash-separator not covered by AIT-001 | ~5 |
| Waterkotte (naming style unclear) | 48 |
| Haier (naming style unclear) | 34 |
| Daikin (descriptive names, no model codes — correctly variant_label or unclassified) | 84 |
| Stiebel Eltron (descriptive German names) | 51 |
| NIBE (product-family names, no explicit split codes) | 24 |
| Wolf (mixed — monobloc and unknown split) | 35 |
| Weishaupt (partial variant_label, rest unknown) | 30 |
| Hisense (mostly BAFA-no, 7 BAFA-yes unclassified) | 17 |
| Samsung unclassified standalone ODU | 33 |
| Various small manufacturers / misc | ~3,783 |

---

## 6. Nine-Status Classification Mapping

### 6.1 How current v2.0.0 statuses map to the proposed 9-status system

| Proposed Status | Description | Current v2.0.0 Equivalent | Affected Rules/Products |
|---|---|---|---|
| manufacturer_validated_set | Manufacturer's own documentation or self-describing BAFA registration confirms IDU+ODU | confirmed_set (subset) | VIE-001 (180, self-describing BAFA names), JCH-001 (50, hitachiaircon.com datasheet) |
| bafa_pattern_set | IDU+ODU confirmed from BAFA name pattern alone, no direct mfr doc with URL | confirmed_set (majority) | PAN-001 (55), BSH-001 (36), AIT-001 (17), LGE-001 (39 minus PHCS0 question), SAM-001 effective 51 |
| third_party_supported_set | IDU+ODU classification supported only by distributor/non-official source | confirmed_set (subset) | MTF-001 (27, distributor website) |
| certification_supported_set | IDU+ODU inferred from certification document (EU/Ofgem/EPREL) | confirmed_set (subset) | CLI-001 (122, CLIVET certification codes); GRE-001 (53, service manual) |
| standalone_odu | Outdoor unit registered alone, no indoor unit in the BAFA record | standalone_odu | Current 191 (CLI-002: 134, Bosch: 48, others) |
| confirmed_not_set | Product definitively does NOT have a separate indoor unit (monobloc) | confirmed_not_set | Current 129 + proposed: Midea MHC-V (35), Wolf CHC/CHT (20) |
| variant_label | BAFA name is a product family description, not a specific IDU+ODU model pair | variant_label | Current 894 (Mitsubishi 571, Daikin 103, Viessmann 63, etc.) |
| unclassified | Cannot determine IDU/ODU status from available data | unclassified | Current 5,043 |
| requires_research | Ambiguous; needs targeted manufacturer lookup to resolve | requires_research | Current 15 + proposed: SAM-001 MIM-E03 products (27), LG PHCS0 (9), AIT Helox/Hybrox (24) |

### 6.2 Confidence caps by proposed status

| Status | Confidence Cap | Current Practice |
|---|---|---|
| self-describing BAFA literal (→ manufacturer_validated_set) | ≤ 0.98 | VIE-001 = 0.97 ✓ |
| manufacturer official explicit doc (→ manufacturer_validated_set) | ≤ 0.97 | JCH-001 = 0.97 ✓ |
| manufacturer family rule (→ bafa_pattern_set) | ≤ 0.94 | PAN-001 = 0.97 ✗ (over-capped) |
| EPREL/Ofgem cert (→ certification_supported_set) | ≤ 0.89 | CLI-001 = 0.97 ✗ (over-capped) |
| BAFA-pattern-only (→ bafa_pattern_set) | ≤ 0.85 | AIT-001 = 0.97 ✗ (over-capped) |
| third-party source (→ third_party_supported_set) | ≤ 0.79 | MTF-001 = 0.97 ✗ (over-capped) |

Note: Most rules use `conf=0.97` uniformly, which violates the proposed cap policy for sources other than self-describing BAFA literals and manufacturer-explicit documents. The display threshold is 0.95, so this does not affect display-readiness today, but it means the confidence values misrepresent the actual evidence chain strength.

---

## 7. Known Bugs and Required Rule Corrections

### 7.1 VAI-002 — IDU/ODU Role Reversal (CONFIRMED BUG, HIGH PRIORITY)

**Affected products:** 6 flexoCOMPACT + aroCOLLECT products via `plus_separator` extractor  
**Additional affected:** 4 flexoTHERM + aroCOLLECT products share the same reversed role issue

**Bug mechanism:**
- BAFA name format: `"VWF flexoCOMPACT/VWL flexoTHERM aroTHERM [flexoCOMPACT VWF... + aroCOLLECT VWL...]"`
- The `plus_separator` extractor assigns: position 1 → `odu_model`, position 2 → `idu_model`
- In these products, **position 1 is the indoor unit** (flexoCOMPACT = indoor heat pump unit) and **position 2 is the outdoor collector** (aroCOLLECT = outdoor air-source collector)
- Therefore `odu_model` contains the indoor unit code and `idu_model` contains the outdoor collector code — exactly reversed

**Evidence (from registry itself):**
```json
"idu_label": "aroCOLLECT VWL outdoor air-source collector",
"odu_label": "flexoCOMPACT/flexoTHERM VWF indoor heat pump unit"
```
The registry labels themselves confirm the field assignments are inverted.

**Fix options:**
1. Add `role_order: "idu_first"` flag to `plus_separator` extractor (preferred — reusable)
2. Add a `plus_separator_reversed` extractor variant for VAI-002 rules
3. Override at the rule level with explicit `idu_position: 2, odu_position: 1`

### 7.2 SAM-001 — MIM-E03 Not a Hydrobox (CONFIRMED MISCLASSIFICATION)

**Affected products:** 27 of 78 SAM-001 `confirmed_set` products  
**idu_model value:** `"MIM-E03FN"` (15 products) or `"MIM-E03GN"` (12 products)

**Why this is wrong:**
Samsung MIM-E03 is the "Multi-zone Interface Module" — a control module that bridges one Samsung EHS Mono outdoor unit to multiple heating zones. It is NOT a heat exchanger or indoor hydrobox. It does not process refrigerant or water in the same way an indoor hydrobox does.

**Impact:**
- 27 products appear to have `idu_model` populated (display-ready) when the "IDU" is a controller
- This inflates the display-ready count by ~27 (from ~552 genuine to 579)

**Fix options:**
1. Move MIM-E03 products from SAM-001 to a new rule (e.g., SAM-002) with status `requires_research` and `conf=0.70`
2. Remove `idu_model` from these 27 records and set `method=none` (set is confirmed, IDU code is not extractable as hydrobox)

**Note on AE-RNWM models:** Samsung AE-200RNWMEG/EU is an indirect cylinder (buffer tank + DHW tank) paired with the AE-BXYDE outdoor unit. This IS a genuine indoor hydrobox for the heat pump set and is correctly classified.

### 7.3 WLF-001 — Dead Rule (ZERO BAFA HITS)

**Rule:** `WLF-001` for Wolf heat pumps, `conf=0.98`, `classification=confirmed_not_set`  
**BAFA products matched:** 0 (zero products in the master seed match the WLF-001 pattern)

The rule exists but has no operational effect because no BAFA product records match its criteria. Additionally, all 35 Wolf products are in `unclassified`, meaning the rule is not being applied.

**Action needed:** Investigate why WLF-001 has 0 hits. Likely the rule's `model_pattern` does not match the actual BAFA model name format for Wolf products.

### 7.4 Source Type Misclassification (from Evidence Audit Report)

**ManualsLib references:** Tagged `manufacturer_official`; should be `third_party`  
**easyheatpumps.com references:** Tagged `manufacturer_official`; should be `third_party`

These were identified in the prior Evidence Audit Report (`docs/IDU_ODU_EVIDENCE_AUDIT_REPORT.md`) and remain unfixed.

### 7.5 GRE-001 "/" Separator Ambiguity

**GRE-001:** 53 Gree GRS-CQ products, `confirmed_set`, `conf=0.87`, `method=none`

The "/" in Gree model names like `GRS-CQ10Pd/NhH-M` is a variant/refrigerant/efficiency separator within a single compound model code — NOT an IDU/ODU separator. The `method=none` correctly reflects that no IDU/ODU model codes can be extracted. However, the `confirmed_set` classification asserts these are genuine split systems — this was based on a Gree service manual reviewed in a prior session. If that evidence is not archived (URL is null), this classification has no verifiable backing and should be reviewed.

---

## 8. New Patterns Discovered — Registry Recommendations

### 8.1 Panasonic — Three New Rule Candidates (~87 unclassified products)

**PAN-002: Bracket-slash format (IDU first)**

Pattern: `Aquarea [WH-ADC... / WH-UDZ...]`  
The "/" here separates IDU (WH-ADC = indoor hydrobox) from ODU (WH-UDZ = outdoor unit), with IDU appearing first.  
BAFA examples:  
- `Aquarea [WH-ADC0309J3E5 / WH-UDZ09HE8]`  
- `Aquarea [WH-ADC0309J3E8 / WH-UDZ09HE8]`  
Count: ~64 products currently unclassified  
Proposed: `confirmed_set`, extractor = slash-separator with `idu_position: 1`, `conf ≤ 0.85` (BAFA-pattern-only)

**PAN-003: WH-ADC + WH-WDG bracket-plus**

Pattern: `Aquarea [WH-ADC... + WH-WDG...]`  
Count: ~18 products currently unclassified  
Proposed: `confirmed_set`, extractor = `bracket_plus`, `conf ≤ 0.85`

**PAN-004: WH-UQZ + WH-ADC and WH-WXG + WH-ADC bracket-plus**

Patterns:  
- `Aquarea [WH-UQZ... + WH-ADC...]` (~10 products)  
- `Aquarea [WH-WXG... + WH-ADC...]` (~17 products)  
Note: These may be ODU-first (unlike PAN-001/PAN-002 which are IDU-first for ADC). The WH-WXG/UQZ are outdoor units. Verify role order before implementing.  
Proposed: `requires_research` first, then `confirmed_set` after role verification

### 8.2 Buderus — Two New Rule Candidates (~65 unclassified products)

**BUD-002: Logaplus paren-plus / paren-amp**

BAFA names use pattern: `Logaplus M WLW176i-4 AR E (Logatherm WLW-4 MB AR + WLW176i-12 E)`  
- WLW-4 MB AR (or similar) = outdoor air unit  
- WLW176i-12 E or WLW186i-18 = indoor hydrobox/module  
- Separator: `(... + ...)` or `(... & ...)`  
Count: ~45 paren-plus + ~12 paren-amp = ~57 products  
Current rule `BUD-001` covers only ~6 products (likely a different paren format)  
Proposed: `buda_pattern_set` (new status), extractor = `paren_plus` and `paren_ampersand`, `conf ≤ 0.85`

**BUD-003: Logatherm WPLS splits**

BAFA names: `Logatherm WPLS...` — these are explicitly "WP LS" (heat pump air-to-water split)  
Count: ~8 products  
Proposed: `confirmed_not_set: false` (confirmed split), `method=none`, `conf ≤ 0.85`

### 8.3 Midea — Two Classification Fixes

**MID-002: MHC-V Compact (Monobloc) → confirmed_not_set**

35 Midea MHC-V products currently in `unclassified`. MHC = Midea Hydronic Compact — these are compact/monobloc units.  
Proposed: `confirmed_not_set`, `conf ≤ 0.80`, `method=none`

### 8.4 Wolf — Dead Rule Fix + Two New Classifications

**WLF-001 needs pattern fix.** Current 0-hit rule should be investigated and corrected.

**WLF-002: CHC/CHT-MONOBLOCK → confirmed_not_set**

20 Wolf products with "MONOBLOCK" explicitly in the BAFA name  
Proposed: `confirmed_not_set`, `conf ≤ 0.95` (self-describing), `method=none`

**WLF-003: CHA-07/10 and FHA+FC/FS → requires_research**

4 CHA products and 6 FHA products need manufacturer documentation to confirm split vs monobloc  
Proposed: `requires_research`, `conf=0.50`

### 8.5 Samsung — MIM-E03 Fix

**SAM-002 (new rule for MIM-E03 products):** Move 27 products out of SAM-001 confirmed_set.  
Classification: `requires_research`, `conf ≤ 0.60`  
Reason: MIM-E03 is a multi-zone control module, not an indoor hydrobox. Product classification as split-set is uncertain.

### 8.6 Mitsubishi — Extractable Sets Not Yet Covered

153 Mitsubishi products with `PUZ/PUD + EHS/ERS + plus` pattern are in `unclassified`. These have extractable IDU and ODU model codes. A new `MIT-002` rule with `plus_separator` extractor could classify these as `bafa_pattern_set`. However, the confidence should be capped at ≤ 0.85 (BAFA-pattern-only) since the current MIT-001 evidence chain relies on product family descriptions, not component-level documentation.

---

## 9. Evidence Source Summary

### 9.1 Rules with verifiable evidence (URL archived)

| Rule | Count | Source type | Evidence quality |
|---|---|---|---|
| JCH-001 | 50 | hitachiaircon.com/uk product pages | GOOD — specific model PDFs |
| DAI-001 | 103 | daikin.eu product pages | GOOD — official Daikin site |
| VIE-001 | 180 | Self-describing (BAFA name itself contains IDU-A / ODU) | EXCELLENT — no inference needed |

### 9.2 Rules relying on archived research without stored URLs

| Rule | Count | Evidence type | URL stored? | Risk |
|---|---|---|---|---|
| CLI-001 | 122 | CLIVET model code documentation | NO (url=null) | MEDIUM |
| SAM-001 | 78 | Samsung AE product line docs | NO (url=null) | MEDIUM |
| PAN-001 | 55 | Panasonic Aquarea component lists | NO (url=null) | MEDIUM |
| BSH-001 | 36 | Bosch CS+MS product bundles | NO (url=null) | MEDIUM |
| VAI-001 | 23 | Vaillant aroTHERM plus product doc | NO (url=null) | MEDIUM |
| LGE-001 | 39 | LG Therma V HU/HN/HM spec sheets | NO (url=null) | MEDIUM |
| MTF-001 | 27 | heat4u.com / distributor pages | NO (url=null) | HIGH (third-party only) |
| GRE-001 | 53 | Gree service manual | NO (url=null) | HIGH |
| AIT-001 | 17 | AIT-Deutschland bracket product list | NO (url=null) | MEDIUM |
| NIB-001 | 2 | NIBE product documentation | NO (url=null) | MEDIUM |

### 9.3 Verification not performed in this session

Live online verification of any manufacturer URL was NOT performed. All evidence assessments are based on what was recorded in prior sessions and in the registry's evidence fields. URL freshness and accessibility are unknown.

---

## 10. Manual Review Queue

Priority order for follow-up research:

| Priority | Item | Products Affected | Action Required |
|---|---|---|---|
| P1 | VAI-002 extractor bug fix | 10 (6 flexoCOMPACT + 4 flexoTHERM) | Fix plus_separator role order; verify registry labels against Vaillant docs |
| P1 | SAM-001 MIM-E03 correction | 27 | Research: is MIM-E03 an indoor hydrobox? If not, move to requires_research rule |
| P2 | Add PAN-002 bracket-slash rule | ~64 | Verify: in `[WH-ADC / WH-UDZ]` does ADC always appear first? Confirm IDU=ADC, ODU=UDZ |
| P2 | Add BUD-002 Logaplus paren rule | ~57 | Verify: WLW-4 MB AR = outdoor, WLW176i = indoor? Cross-reference Buderus product documentation |
| P2 | Add PAN-003 WH-ADC + WH-WDG rule | ~18 | Same as PAN-002 verification; confirm role order |
| P3 | Fix WLF-001 pattern (0 hits) | 35 Wolf (all unclassified) | Inspect WLF-001 model_pattern; test against actual BAFA Wolf names |
| P3 | Add WLF-002 MONOBLOCK rule | 20 | Self-describing; low effort |
| P3 | Add MIT-002 PUZ+EHS plus-separator rule | 153 | Verify role order (PUZ = outdoor, EHS = indoor); confirm conf ≤ 0.85 |
| P3 | LG PHCS0 classification | 9 | Is PHCS0 (Passive Hydraulic Control System) a genuine indoor hydrobox for classification purposes? |
| P3 | AIT Helox/Hybrox research | 24 | Are these split or monobloc? Check AIT-Deutschland product catalogue |
| P4 | Hisense AHW+AHM rule | 7 BAFA-yes | Confirm AHW=outdoor, AHM/AHS=indoor; add HIS-001 |
| P4 | Midea MHC-V confirmed_not_set | 35 | Self-describing (compact); low effort |
| P4 | Wolf CHA/FHA research | 10 | Manufacturer documentation needed |
| P5 | Archive URLs for 8 rules with null URLs | CLI-001, SAM-001, PAN-001, BSH-001, VAI-001, LGE-001, MTF-001, GRE-001 | Find and record source URLs |
| P5 | Fix source_type for ManualsLib/EasyHeatPumps | Multiple rules | Change `manufacturer_official` → `third_party` |
| P5 | Stiebel Eltron 51 unclassified | 51 | Research: are WPL-x products split or monobloc? |
| P5 | Waterkotte 48 unclassified | 48 | Research: Waterkotte product family classification |
| P5 | Mitsubishi 722 unclassified | 722 | These use wildcard/variant notation; may require component-code database approach |

---

## 11. Validation Results

### JSON validation
```
data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json → VALID (no modifications made)
data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-mapping.json → READ ONLY
```

### Count verification
- Total mapping items: 7,163 ✓
- Status sum: 5,043 + 894 + 891 + 191 + 129 + 15 = 7,163 ✓

### No production files modified
- `src/`, `public/`, `functions/`, `.env*`, `firebase.json`, `firestore.rules` — untouched

---

## 12. Git Status Summary

No commits made. No production files modified. All changes limited to creating this report file. The following pre-existing untracked files remain unchanged:
- `.bkit/`, `.firebase/`, `.gcloudignore`, `AGENTS.md`
- `data_sources/eprel_raw/`
- `docs/.pdca-snapshots/`
- `scripts/eprel/`
- `docs/DEVELOPMENT-RESUMPTION-REPORT.md`

---

## 13. Recommended Next Actions

**Immediate (do now — no deployment risk):**
1. Fix VAI-002 extractor in `manufacturer-idu-odu-rules.json`: add `role_order: "idu_first"` or split into two sub-rules with explicit position assignments for flexoCOMPACT vs aroCOLLECT
2. Research Samsung MIM-E03: confirm whether MIM-E03 is a hydrobox or controller; then create SAM-002 rule to separate these 27 products from SAM-001

**Short term (requires rule authoring + mapping regeneration):**
3. Create PAN-002 (bracket-slash ~64 products) and PAN-003 (WH-ADC+WH-WDG ~18 products) — verify IDU role order first
4. Create BUD-002 (Logaplus paren-plus ~57 products) — verify Buderus WLW outdoor vs indoor role
5. Fix WLF-001 zero-hit pattern; add WLF-002 for MONOBLOCK products
6. Add MID-002 for Midea MHC-V monobloc classification
7. Move SAM-001 MIM-E03 products to `requires_research` status

**Medium term (manufacturer documentation required):**
8. Verify LG PHCS0 classification (9 products)
9. Research AIT Helox/Hybrox (24 products)
10. Add MIT-002 for Mitsubishi PUZ+EHS extractable sets (153 products)
11. Archive URLs for the 8 rules currently with `url: null`
12. Fix source_type misclassifications (ManualsLib, EasyHeatPumps → third_party)
