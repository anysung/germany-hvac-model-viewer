# IDU/ODU Manufacturer Rule Registry

> **Status: Historical research note. Superseded by [`docs/PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md`](PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md).**
> **Do not use this document as the current classification policy.**
> This document describes the v1.0.0 rule registry using a strict split-system IDU/ODU definition. The active rule file is `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json` (v2.0.0). Coverage counts and conclusions in this document are from the old strict split logic and do not reflect the monoblock-inclusive taxonomy adopted in June 2026.

> **Status:** Research complete — v1.0.0  
> **Last updated:** 2026-06-21  
> **BAFA snapshot:** 2026-06  
> **Source-controlled rule file:** `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json`  
> **Generated outputs (gitignored):** `data_sources/bafa/idu_odu_mapping/2026-06/`

---

## Summary

This document records the findings and outcomes of a manufacturer-level investigation into Indoor Unit (IDU) / Outdoor Unit (ODU) component identification across all BAFA heat pump product registrations.

The investigation produced a source-controlled rule registry with 46 rules covering 25+ manufacturers. Applying the registry to the 2026-06 BAFA master seed (7,163 products) yields:

| Result | Count | % of BAFA total |
|--------|-------|-----------------|
| **Confirmed set products** | **884** | **12.3%** |
| High confidence ≥0.95 | 785 | 11.0% |
| IDU + ODU both extractable (display-ready) | **615** | **8.6%** |
| Set confirmed, codes not extractable | 145 | 2.0% |
| Standalone outdoor ODU (registered alone) | 191 | 2.7% |
| Variant label (slash = config code, not ODU/IDU) | 947 | 13.2% |
| Confirmed not-set (monoblock) | 83 | 1.2% |
| Requires further research | 15 | 0.2% |
| Not covered by current rules | 5,043 | 70.4% |
| **Manual review queue** | **243** | — |

> **No IDU/ODU labels are exposed in the user-facing app.** This is an internal data quality and enrichment effort only.

---

## Confidence Scale

| Score | Band | Internal designation | Notes |
|-------|------|----------------------|-------|
| ≥0.95 | high | Public display candidate | Both component codes extracted |
| 0.90–0.94 | medium_high | Internal high confidence | Extraction available; needs phase-2 QA |
| 0.75–0.89 | medium | Requires manual review | Pattern inferred, not doc-validated |
| 0.50–0.74 | low | Research required | Product docs needed |
| <0.50 | uncertain | Do not use | — |

---

## Manufacturer Rule Registry — Findings

### Confirmed Set Products (extraction available)

#### Viessmann — 180 products — `VIE-001` (confidence: 0.98)

Viessmann Vitocal 250/300 AWOT split systems use explicit `IDU-A [model] / ODU [model]` labeling in BAFA registrations. This is the clearest IDU/ODU naming in the entire BAFA dataset.

```
IDU-A 2C AWMIW.A1.19-V055 / ODU 250-A AWMOF-251.A1.04-230-V001
→ IDU: IDU-A 2C AWMIW.A1.19-V055
→ ODU: ODU 250-A AWMOF-251.A1.04-230-V001
```

Note: ~39 additional Viessmann products with `/` in the model name are config variants (`VIE-002`), not IDU/ODU pairs (e.g., `AWO-E-AC/AWO-E-AC-AF` = standard vs antifreeze option).

---

#### Panasonic — 55 set + 66 monoblock — `PAN-001`/`PAN-002` (0.97)

Panasonic uses bracket-plus notation for Aquarea split systems and single brackets for monoblocks:

```
Split:     Panasonic Aquarea H Gen [WH-UD09HE8 + WH-ADC0616K9E8]
           → ODU: WH-UD09HE8 | IDU: WH-ADC0616K9E8
Monoblock: Panasonic Aquarea H Gen [WH-MDC05J3E5]
```

`WH-UD` = outdoor split unit. `WH-MDC` = monoblock. `WH-ADC` = indoor split hydrobox.

---

#### LG Electronics — 39 set + 7 monoblock — `LGE-001`/`LGE-002` (0.97)

LG THERMA V uses the same bracket-plus convention:

```
Split:     THERMA V [ HU041MR.U20 + HN0613M.NK5 ]
           → ODU: HU041MR.U20 | IDU: HN0613M.NK5
Monoblock: THERMA V [ HM091MR.U44 ]
```

`HU` = outdoor split unit. `HM` = monoblock unit. `HN` = indoor hydrobox.

---

#### ait-deutschland, FUJITSU GENERAL, MTF — bracket-plus pattern (0.95–0.97)

- **ait-deutschland** (`AIT-001`, 17 products): Uses `[ODU + IDU]` bracket-plus. Brands alpha innotec / Novelan. Both model codes are full part numbers.
- **FUJITSU GENERAL** (`FUJ-001`, 28 products): Waterstage `WGTAH` series. `[WOTAF... + WOTAHAN...]`.
- **MTF** (`MTF-001`, 27 products): Samsung OEM rebadge. `WPLW-Hub [variant] [AE.../EU + AE.../EU]`.

---

#### Buderus — 6 products — `BUD-001` (0.97)

Buderus Logatherm WLW split systems use a unique paren-ampersand notation:

```
Logaplus M WLW166i-4 MBB AR E (WLW-4 MBB AR & Logatherm WLW176i.2 E)
→ ODU: WLW-4 MBB AR | IDU: Logatherm WLW176i.2 E
```

---

#### Samsung Klimatechnik — 78 products — `SAM-001` (0.95)

Samsung EHS (Eco Heating System) split registrations use space-plus-space separator:

```
AE080BXYDGG/EU + AE200DNWMPK/EU     (with /EU regional suffix)
AE050CXYDEK + AE160DNYMPK           (without suffix)
AE080BXYDGG/EU + MIM-E03FN          (with MIM controller module)
→ ODU: AE[B/C/D/R]X outdoor unit | IDU: AE-DN indoor module or MIM controller
```

Note: FläktGroup embeds `+` in model option codes (e.g. `FGAH2020AG1.SL+.E79`) — prevented from false-matching by manufacturer scope.

---

#### Bosch — 36 set + 44 standalone outdoor — `BSH-001`/`BSH-002` (0.97/0.85)

Bosch Compress bundle SKUs embed component codes in trailing parentheses:

```
Compress CS5800iAW 4 ORE-S (AW 4 OR-S + CS5800iAW 12 E)
→ ODU: AW 4 OR-S | IDU: CS5800iAW 12 E
```

Applies to CS3800iAW, CS5800iAW, CS6800iAW, CS8800iAW series. The standalone outdoor units (CS 5000 AW, CS 7000i/7001i/7400i AW, CS3400i AWS, Supraeco SAS) have no `+` and are classified as standalone ODU.

---

#### CLIVET — 190 set + 134 standalone — `CLI-001`/`CLI-002`/`CLI-003`/`CLI-004` (0.95)

CLIVET has the most complex naming structure in the BAFA dataset:

**Pattern A — 3-component EDGE system** (122 products):
```
EDGE Evo 2.0 + Box / WiSAN-YME 1 S 2.1 + HQCN-NEE 1 BC A
→ ODU: WiSAN-YME 1 S 2.1 | IDU (hydrobox): HQCN-NEE 1 BC A
  (EDGE Evo + Box = indoor controller + form factor name)
```

**Pattern B — 2-component EDGE system** (46 products):
```
EDGE Evo 2.0 / WiSAN-YME 1 S 10.1
→ ODU: WiSAN-YME 1 S 10.1 | IDU system: EDGE Evo 2.0 (name, not model code)
```

**Pattern C — Sphera EVO system** (22 products):
```
Sphera EVO 2.0 Box SQKN-YEE 1 BC + MiSAN-YEE 1 S 2.1
→ IDU: SQKN-YEE 1 BC | ODU: MiSAN-YEE 1 S 2.1
```

**Standalone ODU** (134 products): `WSAN-YES/YMi/YSC4`, `WiSAN-P/YEE1/YSE1/PMP` — commercial outdoor units registered without inline IDU codes.

---

#### Vaillant — 29 set + 21 standalone — `VAI-001`/`VAI-002`/`VAI-003` (0.97)

```
aroTHERM Split plus VWL 35/8.2 (AS/230V/S2) + Hydraulikstation VWL 57/8.2 IS
→ ODU: aroTHERM Split plus VWL 35/8.2 (AS/230V/S2)
→ IDU: Hydraulikstation VWL 57/8.2 IS

flexoCOMPACT exclusive VWF 58/4 + aroCOLLECT VWL 11/4 SA
→ Heat pump unit: flexoCOMPACT VWF 58/4 (indoor)
→ Air collector: aroCOLLECT VWL 11/4 SA (outdoor)
```

AS = Außenstation (outdoor station). IS = Innenstation (indoor station). Non-set aroTHERM plus products have `(A/S2)` option codes in parens — these are standalone outdoor units.

---

#### Johnson Controls Hitachi — 88 products — `JCH-001` (0.95)

airH2O 600 S series use compact plus notation (no spaces around `+`):

```
airH2O 600 S (1.5HP) RAS-1.5WHVRP2E+RWM-1.5R3E
→ ODU: RAS-1.5WHVRP2E | IDU: RWM-1.5R3E (water module)

airH2O 600 S Combi (1.5HP) RAS-1.5WHVRP2E+RWD-1.5RW3E-220S
→ ODU: RAS-1.5WHVRP2E | IDU: RWD-1.5RW3E-220S (DHW combo module)
```

RAS = outdoor air-source unit. RWM = indoor water module. RWD = indoor DHW-integrated module (Combi variant).

---

#### GD TCL — 36 set + 26 monoblock — `GDT-001`/`GDT-002` (0.90/0.85)

GD TCL has two distinct product families:

```
Set (SMKL/THF):  SMKL-10D/HBp-B / THF-10D/HBpO-B
                 → IDU: SMKL-10D/HBp-B | ODU: THF-10D/HBpO-B
                 (also compact: SMKL-6D/HBp-A/THF-4D/HBpO-A)

Monoblock:       HB043SP0, HB083TP0 (single code, no separator)
```

Note: 52 GD TCL products remain unclassified (likely additional product families with different naming conventions).

---

#### Salvador Escoda, Midea Europe — plus-separator sets (0.95)

- **Salvador Escoda** (`SAL-001`, 24 products): `MAB-[outdoor] + HR-[indoor+tank]` format. Spanish brand registered in BAFA DE.
- **Midea Europe** (`MDE-001`, 22 products): `MHA-[outdoor] + HB-[indoor module]` format. MHA = outdoor unit; HB = indoor hydrobox.

---

#### INVENTOR — 24 set + 34 standalone — `INV-001`/`INV-002` (0.92/0.90)

INVENTOR uses a slash-separator between outdoor and indoor codes:

```
ATS08S/HU100WT190S3
→ ODU: ATS08S (Air-To-water Split outdoor)
→ IDU: HU100WT190S3 (Hydraulic Unit, indoor, 190L tank)
```

ATM, ATMH, XFMH, MX290 series have no slash and are standalone units.

---

#### NIBE, Remeha, Dimplex, Stiebel Eltron — small confirmed sets

- **NIBE** (`NIB-001`, 2 products): `NIBE SPLIT (AMS 10-8 + HK 200S)` — explicitly labeled with both component codes.
- **Remeha** (`REH-001`, 2 products): `Elga Ace Split, IDU+ODU, 4 kW` — literal IDU+ODU text; component codes NOT embedded.
- **Dimplex** (`DIM-001`, 3 products): `System M Comfort [...]` — compound system; component codes not extractable.
- **Stiebel Eltron** (`STI-001`, 2 products): `WPL 19 [...] Set` — explicit "Set" keyword.

---

#### Xtherma — 16 products — `XTH-001` (0.78 — medium confidence)

All 16 Xtherma products use System-type names: `Flex-System`, `Kombi-System`, `Pro-System`. "Kombi" explicitly means combined/packaged. No component codes in model names. **Lower confidence** — flagged for manual review.

---

#### York / Johnson Controls Systems — 18 products — `JCS-001` (0.82 — medium confidence)

York YKF series uses `+` separator:

```
YKF04ANB + YKF060ANB***
→ ODU: YKF04ANB (4 kW outdoor) | IDU: YKF060ANB (60L indoor module)
YKF04ANB + YKF100/190ANB*** (190L DHW tank variant)
```

Not externally validated — inferred from model code structure. Medium confidence.

---

### Confirmed NOT Set / Variant Labels

| Rule | Manufacturer | Pattern | Reason |
|------|-------------|---------|--------|
| MIT-001 | Mitsubishi Electric | `/CA`, `/2722`, `/PUHZ` | Config / market variant codes — 571 products |
| DAI-001 | Daikin | `180l/230l`, `AWO-E-AC/AF` | Tank size or antifreeze variant — 103 products |
| WLF-001 | Wolf | `CHC/CHT-MONOBLOCK` | Explicitly labeled monoblock |
| WLF-002 | Wolf | `CHA-16/20-400V` | Capacity range `16 or 20 kW` — NOT ODU/IDU |
| ELC-001 | ELCO | `S05.2 / S05.2_2-part` | Variant name in same registration |
| WEI-001 | Weishaupt | `AD / ADR`, `WEB 10/15` | DHW recovery option or capacity range |
| FLG-001 | FläktGroup | `FGAH2020AG1.SL+.E79` | `+` is option suffix within model code |
| GRE-001 | Germany GREE | `GRS-CQ10Pd/NhH-M` | `/` is noise-class/refrigerant suffix within single code |
| AUX-001 | Ningbo AUX | `ACHP-H04/4R2HA-M` | `/` is refrigerant class suffix |

---

### Standalone Outdoor Units (registered without paired IDU in BAFA name)

| Rule | Manufacturer | Pattern | Count |
|------|-------------|---------|-------|
| CLI-004 | CLIVET | `WSAN-YES/YMi`, `WiSAN-P/YEE1/YSE1/PMP` | 134 |
| ENP-001 | Enpal | `EODU-V[n]-M[n]-AW-[n]E` | 9 |
| BSH-002 | Bosch | CS 5000/7000i/7001i/7400i, CS3400i, Supraeco | 48 |
| VAI-003 | Vaillant | `aroTHERM plus VWL` (no `+`) | 21 |

---

### Requires Further Research

| Rule | Manufacturer | Issue |
|------|-------------|-------|
| CAR-001 | Carrier | `30RQ-060R + 15LS + 119D` — 3+ components; roles unclear |

---

## Coverage Summary

**Rules by type:**
- Confirmed set rules: 24
- Confirmed not-set rules: 9
- Variant-label rules (slash/plus = config code): 9
- Standalone ODU rules: 4
- Requires-research rules: 1

**Products by BAFA manufacturer:**

| Manufacturer | BAFA Count | Rule | Classification |
|-------------|-----------|------|----------------|
| Mitsubishi Electric | 1,293 | MIT-001 | 571 variant_label; 722 unclassified |
| CLIVET | 324 | CLI-001/002/003/004 | 190 confirmed_set; 134 standalone_odu |
| Viessmann | 320 | VIE-001/002 | 180 confirmed_set; 39 variant_label |
| Trane | 229 | — | 229 unclassified (commercial monoblocks) |
| Buderus | 212 | BUD-001 | 6 confirmed_set |
| Daikin | 187 | DAI-001 | 103 variant_label |
| Aermec | 179 | — | 178 unclassified |
| Panasonic | 149 | PAN-001/002 | 55 confirmed_set; 66 confirmed_not_set |
| ait-deutschland | 129 | AIT-001 | 17 confirmed_set |
| FläktGroup | 124 | FLG-001 | 68 variant_label |
| GD TCL | 114 | GDT-001/002 | 36 confirmed_set; 26 confirmed_not_set; 52 unclassified |
| Samsung Klimatechnik | 111 | SAM-001 | 78 confirmed_set |
| ELCO | 97 | ELC-001 | 22 variant_label |
| Johnson Controls Hitachi | 93 | JCH-001/002 | 88 confirmed_set |
| Carrier | 93 | CAR-001 | 15 requires_research |
| FUJITSU GENERAL | 51 | FUJ-001 | 28 confirmed_set |
| Vaillant | 50 | VAI-001/002/003 | 29 confirmed_set; 21 confirmed_not_set |
| INVENTOR | 58 | INV-001/002 | 24 confirmed_set; 34 confirmed_not_set |
| Germany GREE | 53 | GRE-001 | 53 variant_label |
| Midea Europe | 57 | MDE-001 | 22 confirmed_set |
| Ningbo AUX | 58 | AUX-001 | 58 variant_label |
| MTF | 32 | MTF-001 | 27 confirmed_set |
| Weishaupt | 39 | WEI-001 | 9 variant_label |
| LG Electronics | 56 | LGE-001/002 | 39 confirmed_set; 7 confirmed_not_set |
| Bosch | 80 | BSH-001/002 | 36 confirmed_set; 44 standalone_odu |
| Xtherma | 16 | XTH-001 | 16 confirmed_set (medium conf) |
| Wolf | 35 | WLF-001/002 | 9 variant_label; 6 confirmed_not_set |
| Salvador Escoda | 42 | SAL-001 | 24 confirmed_set |
| Enpal | 9 | ENP-001 | 9 standalone_odu |
| Remeha | 40 | REH-001 | 2 confirmed_set |
| NIBE | 26 | NIB-001 | 2 confirmed_set |
| Dimplex | 54 | DIM-001 | 3 confirmed_set |
| Stiebel Eltron | 53 | STI-001 | 2 confirmed_set |
| J.C. Systems & Service | 64 | JCS-001 | 18 confirmed_set (medium conf) |

---

## Generated Outputs (Gitignored)

All files are rebuilt by running `apply-idu-odu-manufacturer-rules.mjs`. Do not commit.

| File | Size | Contents |
|------|------|----------|
| `idu-odu-mapping.json` | ~2.7 MB | Full per-product classification and extraction (7,163 items) |
| `idu-odu-summary.json` | ~1.2 kB | Aggregate statistics and rule hit counts |
| `manual-review-queue.json` | ~111 kB | 243 products flagged for human review |

---

## Manual Review Queue (243 products)

Included in `manual-review-queue.json`:

| Category | Count | Reason |
|----------|-------|--------|
| Standalone ODU | 191 | Role needs human confirmation (is it a paired ODU or truly standalone?) |
| Confirmed set, low confidence (<0.90) | 19 | XTH-001 (16) + DIM-001 (3) — set likely but system names only |
| Requires research | 15 | Carrier 30RQ multi-unit (15) — roles and structure unclear |
| JCS-001 (not validated) | 18 | York YKF — inferred from model code structure only |

> The 5,043 unclassified products are NOT in the review queue. They are simply not covered by the current rule set, not anomalous.

---

## Constraints and Limitations

### What the BAFA data contains (and doesn't)

- BAFA has no dedicated `indoor_model` / `outdoor_model` field — all IDU/ODU identification is inferred from the free-text `geraetebezeichnung` (product name) field.
- 70.4% of BAFA products fall into no rule because they are registered with simple model codes that contain no set-indicator patterns. Most are monoblocks or standalone outdoor units from commercial brands (Trane, Aermec, etc.).
- EPREL records were inspected and confirmed to have no dedicated IDU/ODU fields (119 fields checked).

### Known gaps

1. **GD TCL** — 52 products unclassified. Additional SMKL/THF variants or separate product families. Research needed.
2. **Johnson Controls Hitachi** — ~5 Yutaki S products may be unclassified (different model code prefix).
3. **CLIVET Pattern B** — `EDGE .* / WiSAN-.*` extracts the ODU model code but the IDU field is the EDGE controller system name (not a unit model code). Currently returns `idu_model = null` for display-ready filter.
4. **Carrier 30RQ** — multi-component commercial systems; 15 products require product documentation review.
5. **Vaillant slash** — `aroTHERM plus VWL 105/6 (A/S2)` uses `/` as generation/series separator within a single unit code. Currently unclassified (not matched by VAI-003 which only covers `aroTHERM plus` + non-plus pattern). Minor gap.

### Permanent constraints

- Do not expose IDU/ODU labels in the user-facing app until explicitly instructed.
- Do not infer BAFA subsidy eligibility from IDU/ODU classification.
- Do not use wording like "failed eligibility" or "delisted because" — BAFA status is factual only.
- Do not manually fill model codes that are absent from BAFA source data.

---

## Validation Commands

```bash
# Regenerate mapping outputs from current rule registry
export PATH="/Users/christophersung/.nvm/versions/node/v20.19.6/bin:$PATH"
node scripts/analysis/apply-idu-odu-manufacturer-rules.mjs

# Dry run (stdout only, no file writes)
node scripts/analysis/apply-idu-odu-manufacturer-rules.mjs --dry-run

# Spot-check extraction correctness
node -e "
const m = JSON.parse(require('fs').readFileSync(
  'data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-mapping.json','utf8'
));
const sets = m.items.filter(i => i.classification === 'confirmed_set' && i.idu_model);
console.log('Display-ready confirmed sets:', sets.length);
const byRule = {};
sets.forEach(i => { byRule[i.manufacturer_rule_id] = (byRule[i.manufacturer_rule_id]||0)+1; });
console.log(JSON.stringify(byRule, null, 2));
"

# Validate gitignore keeps mapping outputs out of git
git status data_sources/bafa/idu_odu_mapping/
# Should show nothing (directory is gitignored)

# Validate rule registry is tracked in git
git status data_sources/bafa/idu_odu_rules/
# Should show manufacturer-idu-odu-rules.json as untracked (ready to add)
```

---

## Recommended Next Steps

1. **Commit** the rule registry and script as a source-controlled research artifact (`data_sources/bafa/idu_odu_rules/`, `scripts/analysis/apply-idu-odu-manufacturer-rules.mjs`, this document).

2. **Manual review** of the 243-item queue — particularly the 191 standalone ODU products (confirm they are truly standalone vs. missed pairing) and the 15 Carrier 30RQ products.

3. **GD TCL gap** — investigate the 52 unclassified GD TCL products to determine if they're a separate product line or variants of the SMKL/THF pattern.

4. **CLIVET Pattern B extraction** — decide whether the EDGE controller name is an acceptable "IDU identifier" for display purposes (lower the display threshold for this subset), or keep it as extracted-ODU-only.

5. **Phase 2 consideration** — adding `is_set_product`, `idu_model`, `odu_model`, `manufacturer_rule_id` fields to the app-facing product schema. Requires separate implementation decision and user-facing design work.
