# IDU/ODU Classification Feasibility Report

> **Status: Historical research note. Superseded by [`docs/PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md`](PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md).**
> **Do not use this document as the current classification policy.**
> This was the initial feasibility study using a strict split-system IDU/ODU definition. The project has since adopted a practical monoblock-inclusive outdoor-side taxonomy. The coverage numbers and feasibility conclusions in this document reflect the old strict logic only.

> **Investigation date:** 2026-06-21
> **Dataset:** BAFA master seed 2026-06 (7,163 products)
> **Status:** Investigation complete — no production files modified

---

## 1. Executive Verdict

**IDU/ODU distinction is feasible for a well-defined subset of BAFA products.** It is not feasible for the full dataset using only the currently held data.

| Scope | Verdict |
|-------|---------|
| Entire BAFA dataset (7,163) | **Not feasible** — most products are single-unit registrations |
| Confirmed set products (366, 5.1%) | **Highly feasible** — 352 of 366 have both units parseable from the BAFA model name alone |
| Likely sets (80, 1.1%) | **Partially feasible** — external manufacturer documentation needed |
| Ambiguous slash products (1,620, 22.6%) | **Not feasible without research** — most are configuration variant codes, not IDU/ODU pairs |

**Recommended next step:** Implement internal-only IDU/ODU labeling for the 352 confirmed-extractable products first, before committing to any external research pipeline for the ambiguous cases.

---

## 2. Files Inspected

### Local data files

| File | Status | Purpose |
|------|--------|---------|
| `data_sources/bafa/master_seed/2026-06/bafa-master-seed.json` | Present | 7,163 products, 50 fields |
| `data_sources/bafa/raw/2026-06/bafa-luft-wasser.json` | Present | 6,887 BAFA List Yes raw records |
| `data_sources/bafa/master_seed/2026-06/_summary.json` | Present | Snapshot metadata |
| `public/data/products.json` | Present (gitignored) | 5,017 residential app-facing products |
| `public/data/products-commercial.json` | Present (gitignored) | 1,834 commercial app-facing products |
| `scraper/pricing/output/dataset-enriched-full.json` | Present (gitignored) | 6,514 products with `installation_type`, physical specs |
| `data_sources/eprel_raw/raw/test/` | Present (sample) | 10 EPREL API sample files |
| `data_sources/eprel_raw/raw/test/product-detail-245385-daikin.json` | Present | Single Daikin EPREL detail record |
| `data_sources/eprel_raw/raw/test/spaceheaterpackages-limit1.json` | Present | EPREL packages schema sample |
| `data_sources/ofgem_pel/parsed/2026-06/pel-normalized.json` | Present | 4,596 UK PEL products |
| `data_sources/bafa/segmentation-pending/2026-06-capacity-missing.json` | Present (gitignored) | 36 pending null-capacity products |

### Scripts inspected

| File | Relevance |
|------|-----------|
| `scripts/bafa/build-app-products-from-master-seed.mjs` | Defines current 65-field schema; no IDU/ODU fields present |
| `src/config/searchConfig.ts` | Capacity filter configuration |
| `src/types.ts` | `HeatPump` interface definition |

### Files created (this investigation)

| File | Purpose |
|------|---------|
| `scripts/analysis/investigate-idu-odu-feasibility.mjs` | Reproducible local classification script |
| `docs/IDU_ODU_CLASSIFICATION_FEASIBILITY.md` | This report |

---

## 3. Current Data Field Inventory

### Fields available in BAFA master seed (50 fields)

| Category | Fields | IDU/ODU relevance |
|----------|--------|-------------------|
| Identity | `bafa_id`, `source_id`, `manufacturer`, `manufacturer_normalized`, `model` | **`model`** is the primary IDU/ODU carrier |
| Type | `type` | Always `Luft / Wasser` in current export |
| Refrigerant | `refrigerant`, `refrigerant_2`, amounts | None |
| Performance | `power_35C_kw`, `power_55C_kw`, COP fields, `scop` | None |
| Noise | `noise_outdoor_dB`, `noise_indoor_dB` | Indirect (indoor=IDU, outdoor=ODU) |
| Electrical | `max_electric_power_kw`, `drive_type`, `power_control` | None |
| System | `grid_ready`, `num_compressors`, `ee_display`, `heat_meter`, `defrost_*` | None |
| Physical | From enriched overlay: `width_mm`, `height_mm`, `depth_mm`, `weight_kg` | None |
| Provenance | `bafa_list_current`, `bafa_snapshot_fetched_at`, etc. | None |

### Fields present in raw BAFA API but not in master seed

| Raw field | Description | IDU/ODU relevance |
|-----------|-------------|-------------------|
| `gtinEan` | GTIN/EAN barcode | Only 31/6,887 populated (0.5%) — not useful |
| `artikelnummer` | Manufacturer article number | 534/6,887 populated (7.8%) — partial use |
| `einzelabnahme` | Individual type approval flag | 0/6,887 true — no information |
| `pumpentyp` | Heat pump type | All `LUFT_WASSER` — no distinction |
| `uuid` | BAFA internal UUID | Already forwarded to enriched overlay |

### Fields missing but needed for IDU/ODU labeling

| Missing field | Needed for |
|---------------|-----------|
| `is_set_product` | Confirm whether registration covers a system bundle |
| `idu_model` | Indoor unit model code |
| `odu_model` | Outdoor unit model code |
| `idu_odu_confidence` | Confidence level of the distinction |
| `idu_odu_source_type` | Evidence type used |
| `component_mapping_status` | Whether both/one/neither unit was identified |

**Conclusion:** The BAFA API provides no dedicated IDU/ODU fields. All set-product evidence must be extracted from the `model` (= `geraetebezeichnung`) name string or sourced externally.

---

## 4. Set/Package Product Detection

### Detection rules (applied to `model` field)

| Rule ID | Pattern | Classification | False-positive risk |
|---------|---------|----------------|---------------------|
| R1 | `model` starts with `IDU` and contains `ODU` (Viessmann) | `confirmed_set` | Very low — explicit labels |
| R2 | `model` contains `[... + ...]` in brackets | `confirmed_set` | Very low — standardised registration format |
| R3 | `model` contains `(... & ...)` in parens | `confirmed_set` | Very low — Buderus-specific format |
| R4 | `model` matches `^[A-Z]{3+}\d+ / [A-Z]{3+}\d+` at start | `confirmed_set` | Low — INVENTOR specific |
| R5 | `model` contains `Package`, `Set`, `Satz`, `Paket`, `Kombi` | `confirmed_set` | Low — explicit words |
| R6 | `model` starts with `System M` (Dimplex) | `confirmed_set` | Very low — known product line |
| R7 | `model` starts with `EODU` (Enpal) | `likely_set` | Low — ODU identified, IDU registration separate |
| R8 | `model` contains `Split` + `-` or `+` | `likely_set` | Medium — could be split-series single unit |
| R9 | `model` contains `Hydrobox`/`Hydraulik`/`Innengerät` | `likely_set` | Low for indoor-unit-specific terms |
| R10 | `model` contains `[single_model_code]` only | `not_set` | Low — single-code bracket = one unit |
| R11 | `model` contains `/` but no other set indicator | `ambiguous` | **High** — most are configuration variant slashes |

### Classification results (7,163 total BAFA products)

| Classification | Count | % of total | Description |
|----------------|-------|-----------|-------------|
| `confirmed_set` | **366** | **5.1%** | Set product confirmed by BAFA model name alone |
| — Both IDU+ODU extractable | **352** | **4.9%** | Units parseable without external research |
| — Set confirmed, units not separable | **14** | **0.2%** | Set confirmed but units not separately parseable from name |
| `likely_set` | **80** | **1.1%** | Set indicators present; external research needed |
| `ambiguous` | **1,620** | **22.6%** | Slash present; likely config variants, not IDU/ODU |
| `not_set` | **5,097** | **71.2%** | Single-unit products; no set indicators |

### By detection method

| Method | Count | % | Extractable? |
|--------|-------|---|--------------|
| `no_indicators` | 5,024 | 70.1% | N/A — single unit |
| `slash_ambiguous` | 1,620 | 22.6% | **Unknown** — needs per-manufacturer research |
| `viessmann_idu_odu` | 180 | 2.5% | **YES — high confidence** |
| `bracket_plus` | 166 | 2.3% | **YES — high confidence** |
| `bracket_single_model` | 73 | 1.0% | N/A — confirmed monoblock |
| `split_name_pattern` | 70 | 1.0% | Partial — needs external |
| `set_word` | 11 | 0.2% | No — words only, no codes |
| `enpal_eodu_only` | 9 | 0.1% | ODU only — IDU separate |
| `paren_ampersand` | 6 | 0.1% | **YES — high confidence** |
| `dimplex_system_m` | 3 | 0.0% | No — codes embedded in alphanumeric |
| `hydrobox_term` | 1 | 0.0% | No — needs external |

### False-positive concerns for ambiguous slash (1,620 products)

The 22.6% slash-ambiguous group contains several distinct patterns that are **not** set products:

| Manufacturer | Count | Slash pattern | Conclusion |
|---|---|---|---|
| Mitsubishi Electric | 571 | `ERACS2-Q /CA /2722`, `/XL-CA /2022` | Configuration suffix codes — **NOT set products** |
| Daikin | 103 | `Altherma 3 H HT F BG 16 180l/230l` | Tank volume options — **NOT set products** |
| Viessmann (non-IDU/ODU) | 63 | `Vitocal 150-A AWO-E-AC/AWO-E-AC-AF` | Standard/antifreeze variant — **NOT set products** |
| CLIVET | 168 | `EDGE Evo 2.0 / WiSAN-YME 1 S 10.1` | **Needs research** — may be IDU/ODU |
| WOLF | 35 | `CHA-16/20-400V-M2 CS-C2` | Capacity range code — **NOT set products** |

Estimated false-positive rate for `slash_ambiguous` → confirmed set: **~15–25%** (based on Mitsubishi/Daikin/Viessmann pattern evidence). If CLIVET slashes are confirmed as set products, the confirmed-set total would rise by up to 168 (to ~534 total, ~7.5%).

---

## 5. IDU/ODU Classification Feasibility

### For confirmed set products (366 items)

| Confidence | Count | % of sets | Condition |
|---|---|---|---|
| **High** | 348 | 95.1% | Explicit IDU/ODU or `[ODU + IDU]` bracket-plus notation |
| **Medium** | 4 | 1.1% | INVENTOR slash (`ATS04S/HU100WT190S3`) — coding convention known |
| **Low** | 14 | 3.8% | Set confirmed by name word/pattern but units not separately coded |
| **Not classifiable** | 0 | 0.0% | — |

**Key finding: 96.2% of confirmed set products have both IDU and ODU model codes parseable from the BAFA model name alone.**

### BAFA-only feasibility (no external research)

- Products where **both units are identifiable from BAFA data alone**: **352 / 7,163 = 4.9%**
- Products where **set status is confirmed but units need external research**: **14 / 7,163 = 0.2%**
- Products where **external research is required even to confirm set status**: **80 / 7,163 = 1.1%** (likely sets) + up to 1,620 (ambiguous)

### IDU/ODU extraction formulas

```
set_candidate_rate = (confirmed_set + likely_set) / total_bafa
                   = (366 + 80) / 7163 = 6.2%

confirmed_set_rate = confirmed_set / total_bafa
                   = 366 / 7163 = 5.1%

high_conf_extractable_rate = (viessmann_idu_odu + bracket_plus + paren_ampersand) / total_bafa
                            = (180 + 166 + 6) / 7163 = 4.9%

medium_conf_extractable_rate = inventor_slash / total_bafa
                              = (24 captured by rule, ~4 unambiguous) / 7163 = ~0.03%

low_conf_extractable_rate = (set_word + dimplex_system_m + enpal_eodu) / total_bafa
                           = 23 / 7163 = 0.3%
```

> Note: These are estimates based on deterministic rules applied to the BAFA model name string. Sample validation was performed against manufacturer naming conventions. External sources were not accessed at scale.

---

## 6. Source Usefulness Ranking

### Rank 1 — BAFA model name string (primary, already held)

**Usefulness: Very High (for 4.9% of products)**

Several manufacturers embed both IDU and ODU model codes directly in the BAFA registration product name (`geraetebezeichnung`):

| Manufacturer | Format | Example |
|---|---|---|
| Viessmann | `IDU-A [...] / ODU [...] [...]` | `IDU-A 2C AWMIW.A1.19-V055 / ODU 250-A AWMOF-251.A1.04-230-V001` |
| ait-deutschland | `[ODU_model + IDU_model]` | `LAV 8.2 R1/3 + HV 12-3` |
| LG Electronics | `THERMA V [HU... + HN...]` | `THERMA V [ HU041MR.U20 + HN0613M.NK5 ]` |
| Panasonic | `AQUAREA [WH-UD... + WH-ADC...]` | `AQUAREA [WH-UD03JE5 + WH-ADC0309J3E5]` |
| MTF (Samsung) | `WPLW-Hub [...] [AE ... + AE ...]` | `WPLW-Hub Mono-12-200 [AE 120 RXYDEG/EU + AE 200 RNWMEG/EU]` |
| FUJITSU | `WATERSTAGE [...] [WOHA... + WSHA...]` | `WATERSTAGE Comfort 10 kW [WOHA100KLT + WSHA100ML3]` |
| Buderus | `Logaplus M [...] (WLW-... & Logatherm...)` | `Logaplus M WLW166i-4 MBB AR E (WLW-4 MBB AR & Logatherm WLW176i.2 E)` |

**Limitation:** Only works for manufacturers who choose to embed component codes in BAFA registration. 94.9% of products have no IDU/ODU information derivable from BAFA data.

### Rank 2 — Manufacturer official documentation (high effort, high yield)

**Usefulness: High (for ambiguous and likely-set products)**

Official manufacturer documentation would confirm:
- Whether a product is a set (outdoor + indoor unit)
- The exact component model codes
- Which part is the IDU and which is the ODU

Particularly valuable for:
- CLIVET `EDGE Evo 2.0 / WiSAN-YME 1 S` (168 records) — system documentation would confirm if EDGE Evo 2.0 is the control/indoor module
- ait-deutschland `L12 Split-HV 12` (70 records) — naming suggests split set; documentation would confirm

**Limitation:** Requires systematic per-manufacturer research for 10–30 key manufacturers. Model codes in BAFA may differ from current product brochures.

### Rank 3 — EU EPREL / energy label data

**Usefulness: Low-Medium (indirect supporting evidence only)**

EPREL findings:
- **`spaceheaters` with `category=COMBINATION_HEATER`**: 26,967 EU records. These represent HVAC packages. The `modelIdentifier` field contains slash-separated component codes (e.g., `EKHBRD016ADV1 / ERRQ016AAV1 / EKHTS260AC`) — same pattern as BAFA model names.
- **`spaceheaterpackages`**: 111,497 records (predominantly solar thermal packages, not heat pump IDU/ODU sets). The first sampled item had `spaceHeaterType=BOILER`, suggesting this endpoint covers different product types than air-to-water heat pump combinations.
- **No dedicated IDU/ODU component fields** found in EPREL schema (119 fields inspected in one detail record). EPREL records expose `modelIdentifier` (string), `outdoorNoise`, `noise`, `ratedHeatOutput` — aggregate system-level data, not per-component data.

**Matching challenge:** BAFA uses German-market model codes; EPREL uses EU-market model identifiers. The same product often appears under different model codes across registries. String matching would require fuzzy techniques and would produce many false positives.

**Limitation:** EPREL does not provide IDU/ODU as separate fields. It would confirm system-level bundle identity but not extract individual component codes more cleanly than BAFA already does.

### Rank 4 — UK Ofgem PEL / BUS list

**Usefulness: Low (UK market only; same naming-pattern limitations)**

Ofgem PEL data (4,596 records, locally held at `data_sources/ofgem_pel/parsed/2026-06/`):
- Contains UK `mcs_number` + `model` fields.
- UK model identifiers also use slash notation: `AW162HVGHA/HU162WAHYB` — same pattern as BAFA.
- UK and German registrations often use different or offset model codes for the same product.
- Adding a UK dimension introduces cross-country matching complexity without adding IDU/ODU structural information.

**Limitation:** UK PEL does not add IDU/ODU component fields. It overlaps weakly with BAFA products (UK and DE markets use similar but not identical model codes). Keep UK status fully separate from German BAFA status.

### Rank 5 — MCS certification / UK installer data

**Usefulness: Very Low**

MCS certification focuses on installer qualifications and system type approval, not component-level model mapping. No locally held MCS data. Not recommended as an IDU/ODU source.

### Rank 6 — Third-party commercial/product sites

**Usefulness: Low (supporting evidence only)**

Retailer product pages, distributor catalogues, and heat pump comparison sites may confirm whether a product is a set and sometimes list component names. However:
- Not authoritative — cannot override official sources
- Often list marketing names rather than exact BAFA model codes
- URLs and content change frequently
- Cannot scale to 7,163+ products without automation

Use only as low-confidence corroboration when official sources are unavailable.

---

## 7. Sample Evidence Table

Representative sampled products (local BAFA data only; no online sources accessed for this investigation).

| # | Manufacturer | BAFA Model Name | Set Status | IDU Model | ODU Model | Confidence | Source Type | Evidence Note |
|---|---|---|---|---|---|---|---|---|
| 1 | Viessmann | `IDU-A 2C AWMIW.A1.19-V055 / ODU 250-A AWMOF-251.A1.04-230-V001` | confirmed_set | IDU-A 2C AWMIW.A1.19-V055 | ODU 250-A AWMOF-251.A1.04-230-V001 | high | BAFA model name | Explicit IDU/ODU prefixes in registration name; no external source needed |
| 2 | Viessmann | `IDU-A 2C AWMIW.A1.19-V055 ODU 250-A AWMOF-251.A1.16-400-V001` | confirmed_set | IDU-A 2C AWMIW.A1.19-V055 | ODU 250-A AWMOF-251.A1.16-400-V001 | high | BAFA model name | Same as above; no slash variant; space-separated |
| 3 | ait-deutschland | `LAV 8-HV 9  [LAV 8.2 R1/3 + HV 9-1/3]` | confirmed_set | HV 9-1/3 | LAV 8.2 R1/3 | high | BAFA model name | `[ODU + IDU]` bracket-plus; LAV=outdoor, HV=indoor hydrobox |
| 4 | LG Electronics | `THERMA V [ HU041MR.U20 + HN0613M.NK5 ]` | confirmed_set | HN0613M.NK5 | HU041MR.U20 | high | BAFA model name | `[ODU + IDU]` bracket-plus; HU=outdoor THERMA V, HN=indoor hydrobox |
| 5 | Panasonic | `AQUAREA  [WH-UD03JE5 + WH-ADC0309J3E5]` | confirmed_set | WH-ADC0309J3E5 | WH-UD03JE5 | high | BAFA model name | `[ODU + IDU]`; WH-UD=outdoor, WH-ADC=indoor |
| 6 | Panasonic | `AQUAREA  [WH-MDC05J3E5]` | not_set (monoblock) | — | — | high | BAFA model name | Single model in brackets; WH-MDC=monoblock series |
| 7 | FUJITSU GENERAL | `WATERSTAGE Comfort 10 kW [WOHA100KLT + WSHA100ML3]` | confirmed_set | WSHA100ML3 | WOHA100KLT | high | BAFA model name | `[ODU + IDU]`; WOH=outdoor, WSH=indoor |
| 8 | MTF (Samsung) | `WPLW-Hub Mono-12-200 [AE 120 RXYDEG/EU + AE 200 RNWMEG/EU]` | confirmed_set | AE 200 RNWMEG/EU | AE 120 RXYDEG/EU | high | BAFA model name | `[ODU + IDU]`; RXYD=outdoor, RNWM=indoor hydrobox |
| 9 | Buderus | `Logaplus M WLW166i-4 MBB AR E (WLW-4 MBB AR & Logatherm WLW176i.2 E)` | confirmed_set | Logatherm WLW176i.2 E | WLW-4 MBB AR | high | BAFA model name | `(ODU & IDU)` paren-ampersand |
| 10 | INVENTOR | `ATS04S/HU100WT190S3` | confirmed_set | HU100WT190S3 | ATS04S | medium | BAFA model name | Slash two distinct model codes; ATS=outdoor, HU=hydrobox indoor |
| 11 | INVENTOR | `ATS04/HU060S3` | confirmed_set | HU060S3 | ATS04 | medium | BAFA model name | Same pattern; simpler variant |
| 12 | Dimplex | `System M Comfort Plus 16IHOIAOC6D` | confirmed_set | embedded in code | embedded in code | low | BAFA model name | Set name confirmed; IDU/ODU codes embedded in single alphanumeric — needs Dimplex datasheet |
| 13 | Enpal | `EODU-V10-M1-AW-9E` | likely_set | unknown | EODU-V10-M1-AW-9E | medium | BAFA model name | `EODU` = outdoor unit; corresponding IDU likely separate BAFA record or not BAFA-registered |
| 14 | ait-deutschland | `L12 Split-HV 12` | likely_set | unknown | unknown | medium | BAFA model name | `Split` + component suffix suggests bundle; needs ait catalogue to confirm |
| 15 | Mitsubishi Electric | `ERACS2-Q /CA /2722` | ambiguous (likely NOT set) | — | — | low | BAFA model name | `/CA`, `/LN-CA`, `/SL-CA` are compressor/casing configuration codes — NOT IDU/ODU |
| 16 | Mitsubishi Electric | `ERACS2-Q /XL-CA /3222` | ambiguous (likely NOT set) | — | — | low | BAFA model name | Same pattern; `/XL-CA` = extra-large casing option |
| 17 | CLIVET | `EDGE Evo 2.0 / WiSAN-YME 1 S 10.1` | ambiguous (needs research) | unknown | unknown | low | BAFA model name | EDGE Evo 2.0 may be controller/indoor module; WiSAN-YME may be outdoor; CLIVET docs needed |
| 18 | Daikin | `DAIKIN Altherma 3 H HT F BG 16 180l/230l (Bi-Zone) H/C` | ambiguous (NOT set) | — | — | low | BAFA model name | `180l/230l` = hot water tank volume option; `H/C` = heating/cooling flag — NOT IDU/ODU |
| 19 | Viessmann | `Vitocal 150-A Typ AWO-M-E-AC/AWO-M-E-AC-AF 151.A04` | ambiguous (NOT set) | — | — | low | BAFA model name | `AWO-E-AC/AWO-E-AC-AF` = standard/antifreeze version variant — NOT IDU/ODU |
| 20 | Galmet | `Airmax³ 12GT` | not_set (single unit) | — | — | high | BAFA model name | Clean single model code; monoblock |
| 21 | BHT Deutschland | `AeroWIN Evo 13, AeroWIN Evo 13.9 Package` | confirmed_set | unknown | unknown | low | BAFA model name | `Package` confirmed but codes not separated; marketing name + trade name |
| 22 | Remeha | `Effenca 400 [...]` | likely_set | unknown | unknown | medium | BAFA model name | Note: Remeha products are among the 36 null-capacity pending; classification may shift |
| 23 | Samsung | `Samsung EHS Mono R290 AE080RXYD...` | not_set (monoblock) | — | — | high | BAFA model name | R-series RXYD = outdoor monoblock; no indoor companion in model string |
| 24 | WOLF | `CHA-16/20-400V-M2 CS-C2` | ambiguous (NOT set) | — | — | low | BAFA model name | `16/20` = capacity range code; NOT IDU/ODU |
| 25 | Xtherma | `AQUA X 5.0 [XAC-050-D1D/XHU-050-D1D]` | confirmed_set | XHU-050-D1D | XAC-050-D1D | high | BAFA model name | `[ODU + IDU]` bracket-plus; XAC=outdoor, XHU=indoor |

---

## 8. Recommended Data Schema

These fields should be added to the internal pipeline (not to user-facing app data by default). Manual review is required before any IDU/ODU label is shown to users.

```json
{
  "is_set_product": false,
  "set_product_confidence": "confirmed_set | likely_set | not_set_or_unknown",
  "idu_model": null,
  "odu_model": null,
  "idu_odu_confidence": "high | medium | low | not_classifiable",
  "idu_odu_source_type": "bafa_model_name | manufacturer_official | eprel | uk_pel | third_party | mixed | none",
  "idu_odu_sources": [],
  "idu_odu_evidence_note": "",
  "component_mapping_status": "both_units_identified | idu_only | odu_only | ambiguous | not_applicable",
  "component_mapping_reviewed_at": "",
  "component_mapping_method": "rule_based | official_manual | external_lookup | manual_review | mixed"
}
```

### Storage recommendation

| Option | Recommended? | Notes |
|--------|-------------|-------|
| Store directly in `products.json` / `products-commercial.json` | **No — not yet** | Adds 10 fields to 65-field schema; premature until validation complete |
| Store in separate internal classification table | **Yes (Phase 1)** | `data_sources/bafa/idu_odu_mapping.json` — gitignored, pipeline-managed |
| Expose high-confidence IDU/ODU labels in app | **No — not yet** | Only after: schema extended, build validated, false-positive review complete |
| Expose confirmed-set flag only (no model codes) | **Conditionally** | `is_set_product: true/false` could be added to 65-field schema as a safe first step after validation |

---

## 9. Implementation Recommendation

**Recommendation: Implement internal-only classification first.**

### Phase 1 — Internal rule-based classification (low effort, high immediate value)

1. Extend `build-app-products-from-master-seed.mjs` to write a separate `data_sources/bafa/idu_odu_mapping.json` file (gitignored).
2. Run `classify()` from the investigation script against all 7,163 products.
3. Produce a mapping with `source_id`, `is_set_product`, `set_product_confidence`, `idu_model`, `odu_model`, `idu_odu_confidence`, `method`.
4. Add `is_set_product` and `component_mapping_status` to the 65-field schema (nullable boolean / nullable string) for confirmed-set products only.
5. Validate: check that 352 products receive `component_mapping_status = 'both_units_identified'`.

Estimated effort: 1 day. No schema change until validation is complete.

### Phase 2 — CLIVET slash disambiguation (medium effort, ~168 products)

Manually inspect CLIVET `EDGE Evo 2.0 / WiSAN-YME` product documentation to confirm whether the slash indicates an IDU/ODU set. If confirmed, add a CLIVET-specific rule to the classification script. This would raise confirmed-set total by up to 168 (to ~534).

### Phase 3 — Manufacturer documentation for likely sets (~80 products)

Systematically retrieve ait-deutschland, Enpal, Stiebel Eltron, and BHT split/package documentation to classify the 80 `likely_set` products.

### Phase 4 — EPREL matching (high effort, incremental yield)

Match BAFA products to EPREL `spaceheaters/combination_heater` records using manufacturer + model string similarity. Useful primarily for confirming `is_set_product` rather than extracting IDU/ODU codes (which EPREL does not provide as separate fields).

### Do NOT implement yet

- Full IDU/ODU public display in app — premature until Phase 1 validated.
- UK PEL as IDU/ODU source — adds cross-country complexity without IDU/ODU data.
- Scale-automated third-party scraping — high maintenance burden.

---

## 10. Risk Review

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False positives from slash variants | **High** (22.6% of products have slash) | Medium | Only classify slash products with additional confirming evidence; leave majority `ambiguous` |
| Manufacturer naming inconsistency | Medium | Medium | Store extraction method; re-validate after each BAFA refresh |
| Set vs product family confusion | Medium | Low | Require explicit structural pattern (bracket, paren, IDU/ODU label); reject name-similarity alone |
| Monoblock products misclassified as sets | Low | Medium | `bracket_single_model` rule correctly classifies 73 Panasonic monoblocks as `not_set` |
| BAFA model codes differing from manufacturer codes | Medium | Medium | Store `idu_model`/`odu_model` as-extracted from BAFA name; note potential divergence in `idu_odu_evidence_note` |
| EPREL model identifiers not matching BAFA names | High | Low | Do not use EPREL as primary IDU/ODU source; treat as low-confidence corroboration only |
| UK/Ofgem names not matching BAFA names | High | Low | Keep UK status separate from BAFA status; do not merge IDU/ODU identity across registries |
| CLIVET slash false-positive (168 products) | Medium | Medium | Leave `ambiguous` until CLIVET documentation confirms; do not pre-classify |
| Third-party data inaccuracies | High | Low | Use only as low-confidence corroboration; always prefer official sources |
| Maintenance burden on monthly BAFA refresh | Low | Low | Classification script is deterministic from model name; re-runs automatically |
| Low-confidence IDU/ODU labels shown to users prematurely | Medium | High | Do not expose in app until Phase 1 validation complete and confidence threshold applied |
| Subsidy eligibility inference from IDU/ODU labels | Low | **High** | IDU/ODU labels must never imply BAFA subsidy eligibility; keep labels factual and separate from BAFA List status |

---

## 11. Validation Commands

### Run the analysis script (read-only, no file writes)

```bash
export PATH="/Users/christophersung/.nvm/versions/node/v20.19.6/bin:$PATH"
node scripts/analysis/investigate-idu-odu-feasibility.mjs

# JSON output for further processing:
node scripts/analysis/investigate-idu-odu-feasibility.mjs --json > /tmp/idu-odu-analysis.json
```

### Verify expected counts match this report

```bash
node -e "
const fs = require('fs');
const seed = JSON.parse(fs.readFileSync('data_sources/bafa/master_seed/2026-06/bafa-master-seed.json','utf8'));
const items = seed.items || [];
const bafaYes = items.filter(i => i.bafa_list_current === true).length;
const viessSet = items.filter(i => /(?:^|\s)IDU[\-\s]/.test(i.model) && /\bODU[\s\-]/.test(i.model)).length;
const bracketPlus = items.filter(i => /\[([^\[\]+]+)\s*\+\s*([^\[\]]+)\]/.test(i.model)).length;
console.log('Total:', items.length, '(expected 7163)');
console.log('BAFA List Yes:', bafaYes, '(expected 6887)');
console.log('Viessmann IDU/ODU:', viessSet, '(expected 180)');
console.log('Bracket-plus sets:', bracketPlus, '(expected 166)');
"
```

### Verify no production files were modified

```bash
git diff --stat
git status
```

---

## 12. Final Recommendation

**Go/No-Go: Conditional Go for Phase 1 only.**

| Question | Answer |
|---|---|
| Is IDU/ODU distinction feasible? | **Yes, for 5.1% of products** (366 confirmed set products) |
| Is it feasible for all products? | **No** — 71.2% are confirmed single-unit products with no IDU/ODU data |
| Can it be done using only held data? | **Yes for 4.9%** (352 products) — no external research needed |
| What is the recommended first milestone? | Add `is_set_product` + `component_mapping_status` + `idu_model` + `odu_model` fields to internal pipeline output for the 352 confirmed-extractable products. Validate counts. **Do not expose in app yet.** |
| What should NOT be done yet? | Exposing IDU/ODU in the user-facing app; processing the ambiguous 22.6% without per-manufacturer research; using EPREL or UK PEL as IDU/ODU sources |
| Biggest unresolved question? | Whether CLIVET `EDGE Evo 2.0 / WiSAN-YME` slash means IDU/ODU (168 products) — needs one round of CLIVET documentation review |

---

*Report generated by investigation script `scripts/analysis/investigate-idu-odu-feasibility.mjs` using BAFA master seed 2026-06. No production files were modified during this investigation. Analysis is read-only.*
