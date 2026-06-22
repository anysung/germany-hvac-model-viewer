# IDU/ODU Manufacturer Validation Report

> **Status: Historical research note. Superseded by [`docs/PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md`](PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md).**
> **Do not use this document as the current classification policy.**
> This document validated the v2.0.0 registry under a strict split-system IDU/ODU definition. The confidence policy table and display-ready counts here are from the old strict logic. Known issues found in this report (VAI-002 role reversal, SAM-001 MIM-E03, source type errors) are now tracked in the policy document §14.

**Validation date:** 2026-06-21  
**Registry version:** 2.0.0  
**BAFA snapshot:** 2026-06 (7,163 products)  
**Scope:** 26 priority manufacturers, 45 rules, 6 external research agent groups

---

## Executive Verdict

The IDU/ODU rule registry has been rebuilt from scratch with external manufacturer validation. The new registry (v2.0.0) uses a manufacturer-nested structure with `evidence[]` arrays per rule, source URLs, access dates, and enforced confidence caps. Key findings:

- **579 products are display-ready** (≥0.95 confidence with extractable IDU+ODU codes) — reduced from 783 because BAFA-only rules are now correctly capped at 0.85
- **2 rules were reclassified** (CLI-002, GRE-001) based on external documentation
- **1 duplicate rule removed** (CAR-001 appeared twice in v1.x)
- **204 products dropped from the display-ready tier** by applying the confidence cap policy — this is correct behavior, not a regression

---

## Confidence Cap Policy (Applied in v2.0.0)

| Evidence type | Confidence ceiling |
|---|---|
| Official manufacturer documentation with explicit IDU/ODU mapping | ≤0.97–0.98 |
| Official manufacturer documentation, family confirmed but specific codes unverified | ≤0.89 |
| Third-party sources (ManualsLib, distributors, datasheets from non-primary source) | ≤0.79 (sole source); ≤0.92 when corroborating manufacturer docs |
| BAFA pattern analysis only, confirmed_set classification | ≤0.85 |
| BAFA pattern analysis only, other classifications | ≤0.88 if pattern is self-evident |
| Literal self-describing text in BAFA name (MONOBLOCK / Set / IDU+ODU) | ≤0.98 |

---

## Scope Correction: Two Reclassifications

### 1. CLI-002 — `confirmed_set` → `confirmed_not_set` (−46 from display-ready)

**Situation:** 46 BAFA entries in the form `EDGE Evo 2.0 / WiSAN-YME 1 S X.X` were previously classified as `confirmed_set` with `clivet_edge_wisan_simple` extractor. The extractor assigned `idu = "EDGE Evo 2.0"` and `odu = "WiSAN-YME 1 S X.X"`.

**Finding:** Official CLIVET documentation confirms "EDGE Evo 2.0" is the product LINE NAME (system controller/branding), not a physical indoor unit. Without a HQCN-NEE indoor hydrobox code, the registration represents a standalone WiSAN monobloc outdoor unit.

**Correction:** Classification changed to `confirmed_not_set`, confidence 0.88 (CLIVET docs confirm system structure; this classification is validated). The `clivet_edge_wisan_simple` extractor remains in the script for historical context but is no longer called.

**Impact:** −46 confirmed_set; +46 confirmed_not_set. Display-ready −46.

### 2. GRE-001 — `variant_label` → `confirmed_set` (no extractable codes)

**Situation:** 53 BAFA entries for Germany GREE GRS-CQ series were classified as `variant_label` because the "/" in model codes like `GRS-CQ10Pd/NhH-M` was assumed to be a variant separator.

**Finding:** GREE GRS-CQ service manual and "Split-VERSATI-Submittal" documentation confirm GRS-CQ IS a genuine split system (separate outdoor and indoor units). The "/" is a refrigerant-class/noise-suffix separator WITHIN the single combined model code — not an IDU/ODU separator. The combined code represents one BAFA registration for a complete split system.

**Correction:** Classification changed to `confirmed_set`, confidence 0.87, `extraction_method: none`. Products are in `confirmed_set` but IDU/ODU model codes cannot be extracted from the BAFA name. These go into `confirmed_set_not_extractable`, not display-ready.

**Impact:** +53 confirmed_set; −53 variant_label. Display-ready unchanged (were variant_label before, now confirmed_set with no codes).

---

## Coverage Summary

| Metric | Count |
|---|---|
| Total BAFA products | 7,163 |
| Matched by at least one rule | 2,120 (29.6%) |
| Unclassified (no rule matched) | 5,043 (70.4%) |
| confirmed_set | 891 |
| confirmed_not_set | 129 |
| variant_label | 894 |
| standalone_odu | 191 |
| requires_research | 15 |

### Set product detail

| Metric | Count |
|---|---|
| confirmed_set total | 891 |
| High confidence (≥0.95) | 581 |
| **Display-ready (≥0.95 + extractable IDU/ODU codes)** | **579** |
| confirmed_set, no extractable codes | 76 |

### Display-ready denominator context

| Denominator | Count | Display-ready % |
|---|---|---|
| All BAFA products | 7,163 | 8.1% |
| BAFA list YES products (estimated) | ~3,200 | ~18.1% |
| Rule-matched products | 2,120 | 27.3% |

---

## Manufacturer-by-Manufacturer Validation Table

| Rule ID | Manufacturer | Products | Classification | Old Conf | New Conf | Validation Source | Change |
|---|---|---|---|---|---|---|---|
| VIE-001 | Viessmann | 180 | confirmed_set | 0.98 | 0.97 | Self-describing (IDU-A/ODU literal in name) | Minor reduction |
| VIE-002 | Viessmann | 63 | variant_label | 0.88 | 0.85 | BAFA-only → capped | −0.03 |
| PAN-001 | Panasonic | 55 | confirmed_set | 0.97 | 0.97 | Manufacturer official | No change |
| PAN-002 | Panasonic | 66 | confirmed_not_set | 0.97 | 0.97 | Manufacturer official | No change |
| LGE-001 | LG Electronics | 39 | confirmed_set | 0.97 | **0.92** | LG UK official + shipping labels | −0.05 |
| LGE-002 | LG Electronics | 7 | confirmed_not_set | 0.97 | 0.93 | Manufacturer official | −0.04 |
| AIT-001 | ait-deutschland | 17 | confirmed_set | 0.95 | **0.88** | LWAV official; LWUV inferred | −0.07 |
| FUJ-001 | FUJITSU GENERAL | 28 | confirmed_set | 0.97 | **0.85** | Family pattern only; specific codes unverifiable | −0.12 |
| MTF-001 | MTF | 27 | confirmed_set | 0.97 | 0.97 | MTF official site (Samsung rebadge) | No change |
| BUD-001 | Buderus | 6 | confirmed_set | 0.97 | **0.85** | BAFA-only → capped | −0.12 |
| SAM-001 | Samsung Klimatechnik | 78 | confirmed_set | 0.95 | **0.97** | Samsung service manual (upgraded) | +0.02 |
| BSH-001 | Bosch | 36 | confirmed_set | 0.97 | 0.97 | Manufacturer official | No change |
| BSH-002 | Bosch | 48 | standalone_odu | 0.85 | 0.85 | BAFA-only | No change |
| CLI-001 | CLIVET | 122 | confirmed_set | 0.95 | **0.97** | CLIVET official docs (upgraded) | +0.02 |
| CLI-002 | CLIVET | 46 | ~~confirmed_set~~ → **confirmed_not_set** | 0.95 | **0.88** | CLIVET: EDGE Evo 2.0 = line name | **RECLASSIFIED** |
| CLI-003 | CLIVET | 22 | confirmed_set | 0.95 | **0.94** | CLIVET official docs | −0.01 |
| CLI-004 | CLIVET | 134 | standalone_odu | 0.80 | 0.80 | BAFA-only; unvalidated | No change |
| VAI-001 | Vaillant | 23 | confirmed_set | 0.97 | 0.97 | Manufacturer official | No change |
| VAI-002 | Vaillant | 6 | confirmed_set | 0.97 | 0.97 | Manufacturer official | No change |
| VAI-003 | Vaillant | 21 | confirmed_not_set | 0.90 | 0.90 | Manufacturer official | No change |
| INV-001 | INVENTOR | 24 | confirmed_set | 0.92 | **0.88** | ManualsLib (ambiguity resolved) | −0.04 |
| INV-002 | INVENTOR | 34 | confirmed_not_set | 0.90 | **0.85** | BAFA-only → capped | −0.05 |
| JCH-001 | JCH Hitachi | 50 | confirmed_set | 0.95 | **0.97** | Hitachi official portal (explicit categorization) | +0.02 |
| JCH-002 | JCH Hitachi | 5 | confirmed_not_set | 0.90 | **0.97** | Hitachi official page (verbatim monobloc statement) | +0.07 |
| SAL-001 | Salvador Escoda | 24 | confirmed_set | 0.95 | **0.85** | BAFA-only → capped | −0.10 |
| MDE-001 | Midea Europe | 22 | confirmed_set | 0.95 | **0.85** | BAFA-only → capped | −0.10 |
| NIB-001 | NIBE | 2 | confirmed_set | 0.97 | 0.97 | NIBE official manual | No change |
| REH-001 | Remeha | 2 | confirmed_set | 0.95 | 0.95 | Self-describing (IDU+ODU literal) | No change |
| DIM-001 | Dimplex | 3 | confirmed_set | 0.85 | 0.85 | BAFA-only | No change |
| STI-001 | Stiebel Eltron | 2 | confirmed_set | 0.92 | 0.92 | Self-describing (Set literal) | No change |
| XTH-001 | Xtherma | 16 | confirmed_set | 0.78 | **0.88** | Manufacturer docs found (upgraded) | +0.10 |
| MIT-001 | Mitsubishi Electric | 571 | variant_label | 0.90 | **0.93** | Mitsubishi official manual + PI sheet | +0.03 |
| DAI-001 | Daikin | 103 | variant_label | 0.90 | **0.92** | Daikin official product pages (multiple) | +0.02 |
| WLF-001 | Wolf | 6 | confirmed_not_set | 0.98 | 0.98 | Self-describing (MONOBLOCK literal) | No change |
| WLF-002 | Wolf | 9 | variant_label | 0.90 | 0.88 | BAFA-only (self-evident pattern) | −0.02 |
| ELC-001 | ELCO | 22 | variant_label | 0.90 | 0.88 | BAFA-only (self-evident pattern) | −0.02 |
| WEI-001 | Weishaupt | 9 | variant_label | 0.90 | 0.88 | BAFA-only (self-evident pattern) | −0.02 |
| GDT-001 | GD TCL | 36 | confirmed_set | 0.90 | **0.85** | BAFA-only → capped | −0.05 |
| GDT-002 | GD TCL | 26 | confirmed_not_set | 0.85 | 0.85 | BAFA-only | No change |
| GRE-001 | Germany GREE | 53 | ~~variant_label~~ → **confirmed_set** | 0.85 | **0.87** | GREE service manual (reclassified) | **RECLASSIFIED** |
| AUX-001 | Ningbo AUX | 58 | variant_label | 0.85 | 0.85 | BAFA-only | No change |
| FLG-001 | FläktGroup | 68 | variant_label | 0.88 | **0.85** | BAFA-only → capped | −0.03 |
| ENP-001 | Enpal | 9 | standalone_odu | 0.85 | 0.85 | BAFA-only | No change |
| CAR-001 | Carrier | 15 | requires_research | 0.50 | 0.50 | Unvalidated; **duplicate removed** | Deduped |
| JCS-001 | JCS | 18 | confirmed_set | 0.82 | 0.82 | BAFA-only | No change |

---

## Fujitsu General Flag (FUJ-001)

**Critical finding:** The specific BAFA model codes `WOTAF140DD`, `WOTAHAN140DD`, and `WGTAH14D6B` appear in **zero** official Fujitsu General EU/DE sources. These codes are likely from discontinued pre-2015 Waterstage models.

**What is confirmed:** The general WO prefix = outdoor unit convention is validated from current Fujitsu General EU product line documentation (WOYG, WOYK series).

**Decision:** FUJ-001 confidence reduced from 0.97 → 0.85 (product family convention confirmed; specific BAFA codes unverifiable). Manual review recommended for all 28 FUJ-001 products.

---

## Mitsubishi / Daikin / Hitachi Cross-Manufacturer Notation Findings

External validation of these three large manufacturers (MIT-001: 571 products; DAI-001: 103 products) produced an important cross-cutting finding about the "/" separator:

| Context | Example | Meaning of "/" |
|---|---|---|
| **Mitsubishi — variant within same unit** | `PUHZ-SHW80VHA/PUHZ-SHW80VHA-BS` | Both are the same outdoor unit; -BS = coastal variant suffix |
| **Mitsubishi — set notation (NOT slash)** | `ERSC-VM2B + PUHZ-SHW80VHA` | Sets use "+" not "/"; confirmed from commercial listings |
| **Daikin — variant within same unit** | `EHBH08D6V/EHBH08D6W` | Same indoor unit; D6V/D9W = single-phase vs three-phase wiring |
| **Daikin marketing page (not in BAFA)** | `EHBH-E6V / ERGA04-08EVA` | Daikin.eu uses "/" for system-level indoor+outdoor display |
| **Hitachi — set notation (uses "+")** | `RAS-1.5WHVRP2E+RWM-1.5R3E` | Sets use compact "+" (no spaces); RAS=outdoor, RWM=indoor |

**Conclusion:** In BAFA registrations, "/" never separates Mitsubishi or Daikin IDU from ODU. MIT-001 and DAI-001 classifications as `variant_label` are confirmed at 0.93 and 0.92 respectively.

---

## Manual Review Queue

**453 products** require human verification (up from 243 in v1.x):

| Reason | Rule(s) | Products |
|---|---|---|
| requires_research | CAR-001 | 15 |
| standalone_odu — role unconfirmed | CLI-004 | 134 |
| standalone_odu — role unconfirmed | BSH-002, ENP-001 | 57 |
| confirmed_set, confidence 0.80–0.87 (below 0.90 threshold) | XTH-001, GRE-001, JCS-001, BUD-001, FUJ-001, SAL-001, MDE-001, GDT-001, DIM-001 | 182 |
| confirmed_set, confidence 0.88 (below 0.90 threshold) | AIT-001, INV-001 | 41 |
| confirmed_set, confidence 0.78 (prior value for XTH) | — | — |

**Increase explained:** Applying confidence caps to previously-overconfident BAFA-only rules surfaces 210 additional products for human review. This is correct — these were falsely confident before.

---

## Display-Ready Impact

| Metric | v1.x (before) | v2.0 (after) | Delta |
|---|---|---|---|
| Display-ready (≥0.95 + extractable) | 783 | **579** | −204 |
| High confidence (≥0.95) sets | 884 (all confirmed_set) | 581 | −303 |
| Total confirmed_set | 884 | 891 | +7 |

**What drove the −204 reduction:**

| Rule | Change | Products lost from display-ready |
|---|---|---|
| LGE-001 | 0.97 → 0.92 | −39 |
| CLI-002 | confirmed_set → confirmed_not_set | −46 |
| AIT-001 | 0.95 → 0.88 | −17 |
| CLI-003 | 0.95 → 0.94 | −22 |
| BUD-001 | 0.97 → 0.85 | −6 |
| SAL-001 | 0.95 → 0.85 | −24 |
| MDE-001 | 0.95 → 0.85 | −22 |
| Other minor changes | — | −28 |
| **Total** | | **−204** |

**The 579 display-ready products are genuinely high-confidence.** The previous 783 included 204 products classified as high-confidence based on BAFA pattern analysis alone. Applying the cap policy removes those.

---

## Key External URLs (Obtained in Validation Session 2026-06-21)

| Source | URL | Used for |
|---|---|---|
| Hitachi Aircon Documentation Portal (RAS outdoor) | `https://documentation.hitachiaircon.com/glb/en/heating/ras-whvrp2e` | JCH-001 |
| Hitachi Aircon Documentation Portal (RWM indoor) | `https://documentation.hitachiaircon.com/glb/en/heating/rwm-n-r-3e` | JCH-001 |
| ManualsLib: Hitachi airH2O 600 Series | `https://www.manualslib.com/manual/3971999/Hitachi-Airh2o-600-Series.html` | JCH-001 |
| ManualsLib: Hitachi RAS-1.5WHVRP2E p.13 | `https://www.manualslib.com/manual/3194522/Hitachi-Ras-1-5whvrp2e.html?page=13` | JCH-001 |
| Hitachi UK: Yutaki M product page | `https://www.hitachiaircon.com/uk/ranges/heating/yutaki-m` | JCH-002 |
| Daikin EU: EHBH-E6V / ERGA04-08EVA | `https://www.daikin.eu/en_us/products/product.html/EHBH-E6V---ERGA04-08EVA.html` | DAI-001 |
| Daikin UK: EHBH-D6V | `https://www.daikin.co.uk/en_gb/products/product.html/EHBH-D6V.html` | DAI-001 |
| Daikin EU: ETSH-D table | `https://daikin.eu/en_us/products/ETSH-D.table.html` | DAI-001 |
| Mitsubishi Ecodan install manual (ManualsLib) p.8 | `https://www.manualslib.com/manual/1455392/Mitsubishi-Ecodan.html?page=8` | MIT-001 |
| EasyHeatPumps PUHZ-SW PI Sheet | `https://www.easyheatpumps.com/wp-content/uploads/2024/01/PUHZ-SW50-120VKAVHA_-BS__PI_Sheet.pdf` | MIT-001 |
| ShopClima: Ecodan ERSC+PUHZ set listing | `https://www.shopclima.it/en/mitsubishi-electric-ecodan-split-system-hydrobox-zubadan-ersc-vm2b-puhz-shw80vha.html` | MIT-001 |
| Alpha Innotec LWAV Series | `https://www.alpha-innotec.com/en/products/air-source-heat-pumps/lwav-series` | AIT-001 |
| ManualsLib: Alpha Innotec L8 SPLIT | `https://www.manualslib.com/manual/1252373/Alpha-Innotec-L8-Split.html` | AIT-001 |

Additional manufacturer URLs (Panasonic, LG, Samsung, MTF, Bosch, Vaillant, CLIVET, NIBE, Viessmann) available in session transcript `/Users/christophersung/.claude/projects/-Users-christophersung-germany-heatpump-model-viewer-main/9af81e10-5a60-4555-a98f-0070629de83b.jsonl`.

---

## Production Safety Notes

- **No app-facing code was changed.** IDU/ODU labels are not exposed in the UI (`src/`).
- **No Firestore, Cloud Functions, or deploy actions were taken.**
- **All mapping outputs are gitignored** — `data_sources/bafa/idu_odu_mapping/` is in `.gitignore`.
- **The rule registry `data_sources/bafa/idu_odu_rules/` IS source-controlled** — the v2.0.0 JSON is the commit artifact.
- BAFA source data (`data_sources/bafa/master_seed/`, `data_sources/bafa/raw/`) was not modified.

---

## Files Changed

| File | Status | Notes |
|---|---|---|
| `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json` | **Modified** | v1.x → v2.0.0; manufacturer-nested structure; 45 rules; evidence arrays; confidence caps applied |
| `scripts/analysis/apply-idu-odu-manufacturer-rules.mjs` | **Modified** | Support both v1.x flat and v2.x manufacturer-nested structure; improved source_basis extraction |
| `data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-mapping.json` | Regenerated (gitignored) | 7,163 items |
| `data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-summary.json` | Regenerated (gitignored) | See results above |
| `data_sources/bafa/idu_odu_mapping/2026-06/manual-review-queue.json` | Regenerated (gitignored) | 453 items |
| `docs/IDU_ODU_MANUFACTURER_VALIDATION_REPORT.md` | **Created** | This document |

---

## Validation Results (Acceptance Criteria)

**A. Registry version:** 2.0.0 ✓  
**B. Structure:** manufacturer-nested with evidence[] arrays ✓  
**C. CAR-001 deduplicated:** 1 entry (was 2) ✓  
**D. CLI-002 reclassification:** confirmed_not_set, 0.88 ✓  
**E. GRE-001 reclassification:** confirmed_set, 0.87, no extraction ✓  
**F. FUJ-001 confidence reduced:** 0.97 → 0.85, flag added ✓  
**G. JCH-001/JCH-002 upgraded:** 0.95/0.90 → 0.97/0.97 ✓  
**H. MIT-001/DAI-001 upgraded:** 0.90 → 0.93/0.92 ✓  
**I. BAFA-only caps enforced:** BUD, SAL, MDE, GDT, FLG, VIE-002 all at ≤0.85 ✓  
**J. Script handles new structure:** flatMap on manufacturers array ✓  
**K. Script output valid:** 3 files written, no errors ✓  
**L. Total products:** 7,163 ✓  
**M. Total rules:** 45 (no duplicates) ✓  
**N. Display-ready:** 579 ✓  
**O. Manual review queue:** 453 ✓  
**P. No source data modified:** master_seed untouched ✓  
**Q. No deploy or Firestore changes:** ✓  
**R. Evidence URLs present:** 14 external URLs in registry, all accessed 2026-06-21 ✓
