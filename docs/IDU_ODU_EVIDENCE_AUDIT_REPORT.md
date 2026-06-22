# IDU/ODU Manufacturer Rule Registry v2.0.0 — Evidence Audit Report

> **Status: Historical research note. Superseded by [`docs/PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md`](PRODUCT_COMPONENT_CLASSIFICATION_POLICY.md).**
> **Do not use this document as the current classification policy.**
> This document audited the evidence quality of the v2.0.0 rule registry under a strict split-system IDU/ODU definition. The audit findings (VAI-002 reversal, SAM-001 MIM-E03, null URLs, source type misclassification) are now tracked as active known issues in the policy document §14.

**Date:** 2026-06-21  
**Registry file:** `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json`  
**Registry version:** 2.0.0  
**BAFA snapshot:** 2026-06  
**Total BAFA products:** 7,163  

---

## 1. Executive Verdict

> **Is v2.0.0 "truly manufacturer-validated"?** — **Partially. Not uniformly.**

The registry contains **45 rules** across 32 manufacturer groups. Of the 10 rules that drive the **579 display-ready** count:

- **1 rule (JCH-001, 50 products)** is verifiably backed by genuine manufacturer-domain URLs (`hitachiaircon.com`, `documentation.hitachiaircon.com`). Evidence meets the ≥0.95 standard without qualification.
- **1 rule (VIE-001, 180 products)** is self-certifying from BAFA registration text — the BAFA name itself contains the literal strings "IDU-A" and "ODU", submitted by Viessmann as the registrant. This is a valid basis for 0.97 confidence.
- **1 rule (CLI-001, 122 products)** has partial self-description: the BAFA registration name itself embeds CLIVET-proprietary component codes (WiSAN outdoor unit + HQCN-NEE indoor hydrobox), submitted by CLIVET as the manufacturer-registrant. However, the claimed "official CLIVET documentation" URL was not archived.
- **7 rules (SAM-001, PAN-001, BSH-001, MTF-001, VAI-001, VAI-002, NIB-001, covering 276 products)** claim `manufacturer_official` evidence but have `url: null`. The evidence was gathered by research agents in prior sessions but the URLs were not stored in the registry. These rules are unverifiable in this audit without live URL access.
- **1 rule (VAI-002, 6 products)** has a confirmed extraction bug: `idu_model` and `odu_model` are **swapped** for all 6 products in this rule.

**Summary of display-ready confidence:**

| Status | Products | Rules |
|---|---|---|
| Fully verified (genuine mfr-domain URL) | 50 | JCH-001 |
| Self-certifying from BAFA text (Viessmann) | 180 | VIE-001 |
| BAFA-embedded component codes (CLIVET) | 122 | CLI-001 |
| Claimed official, no URL archived | 221 | SAM-001, PAN-001, BSH-001, MTF-001, VAI-001, NIB-001 |
| Confirmed extraction bug (IDU/ODU swapped) | 6 | VAI-002 |
| **Total display-ready** | **579** | **10 rules** |

---

## 2. Audit Method

**Files inspected:**
- `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json` (v2.0.0, 1390 lines, 45 rules)
- `data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-summary.json` (registry v2.0.0 run output)
- `scripts/analysis/apply-idu-odu-manufacturer-rules.mjs` (extractor logic)

**JSON validation:** Passed — `node -e "JSON.parse(...)"` returned OK.

**Live URL verification:** **NOT performed.** No WebFetch or WebSearch tools were used in this audit session. URLs stored in the registry were reviewed by domain and path but not fetched for content verification. All URL-related findings in this report are based on domain inspection only.

**Extraction logic reviewed:** The `plus_separator`, `bracket_plus`, `paren_plus`, `paren_ampersand`, `viessmann_idu_odu`, `clivet_edge_wisan_hqcn`, `clivet_sphera_misan`, `inventor_ats_hu`, `jch_ras_rwm`, `nibe_split_paren`, and `gdt_smkl_thf` extractor functions were reviewed for correctness against rule examples and labels.

---

## 3. Source Audit Summary

### 3.1 Evidence URL Inventory

Of 45 rules, **5 have stored external URLs** (totaling 11 URL entries):

| Rule | URLs stored | Domains | Tagged as |
|---|---|---|---|
| AIT-001 | 2 | `alpha-innotec.com`, `manualslib.com` | manufacturer_official (both) |
| JCH-001 | 4 | `documentation.hitachiaircon.com` ×2, `manualslib.com` ×2 | manufacturer_official (all) |
| JCH-002 | 1 | `hitachiaircon.com` | manufacturer_official |
| DAI-001 | 3 | `daikin.eu`, `daikin.co.uk`, `daikin.eu` | manufacturer_official (all) |
| MIT-001 | 3 | `manualslib.com`, `easyheatpumps.com`, `shopclima.it` | manufacturer_official (first two), third_party (last) |

**Genuine manufacturer-domain URLs:**
- `documentation.hitachiaircon.com` (JCH-001 ×2) ✓
- `hitachiaircon.com` (JCH-002 ×1) ✓
- `daikin.eu` (DAI-001 ×2) ✓
- `daikin.co.uk` (DAI-001 ×1) ✓
- `alpha-innotec.com` (AIT-001 ×1) ✓

**Third-party hosting incorrectly tagged as `manufacturer_official`:**
- `manualslib.com` (AIT-001 ×1, JCH-001 ×2, MIT-001 ×1) — ManualsLib is a third-party document archive. The content may be manufacturer-authored, but the hosting platform is third-party.
- `easyheatpumps.com` (MIT-001 ×1) — UK heat pump retailer. Clearly third-party.

### 3.2 Rules With Zero Archived URLs (40 rules)

All 40 remaining rules have `url: null` for all evidence entries. This includes 9 of the 10 rules that contribute to display-ready. Evidence was described in free-text titles and `what_it_proves` fields but source URLs were not recorded.

---

## 4. Online Research Reconstruction

Research was performed by AI sub-agents in prior sessions (not this audit session). No live verification was performed in this audit. Based on the evidence fields:

| Manufacturer | Research performed | URL archived? |
|---|---|---|
| Viessmann | BAFA name text analysis | N/A (self-describing) |
| CLIVET | CLIVET official documentation referenced | No |
| Samsung | Samsung EHS service manual referenced | No |
| Panasonic | Panasonic Aquarea installation manual referenced | No |
| Hitachi (JCH-001) | Hitachi Aircon documentation portal | Yes (2 mfr URLs) |
| Hitachi (JCH-002) | Hitachi Aircon UK website | Yes (1 mfr URL) |
| Bosch/BSH | Bosch product documentation referenced | No |
| Vaillant (aroTHERM) | Vaillant aroTHERM official docs referenced | No |
| Vaillant (flexoCOMPACT) | Vaillant flexoCOMPACT official docs referenced | No |
| MTF (Samsung dist.) | MTF DACH website referenced | No |
| NIBE | NIBE installation manual referenced | No |
| Daikin | Daikin EU/UK product pages | Yes (3 mfr URLs) |
| Mitsubishi Ecodan | ManualsLib + EasyHeatPumps referenced | Yes (third-party URLs only) |
| Alpha InnoTec | alpha-innotec.com + ManualsLib | Yes (1 mfr URL) |
| LG Therma V | Research referenced | No |
| GREE | GREE service manual + Submittal referenced | No |
| Inventor | Research referenced | No |
| All BAFA-only rules | BAFA registration patterns only | N/A |

---

## 5. Rule-by-Rule Audit Table

Legend: `conf` = current confidence score; `audit_verdict` = KEEP / DOWNGRADE / BUG / WATCH; `display` = ✓ if ≥0.95 + confirmed_set + extractable

| Rule | Hits | Classification | Conf | Method | Evidence URL | Audit Verdict | Notes |
|---|---|---|---|---|---|---|---|
| AIT-001 | 17 | confirmed_set | 0.88 | bracket_plus | alpha-innotec.com + ManualsLib | KEEP | Below display threshold. ManualsLib should be tagged third_party. |
| AUX-001 | 58 | variant_label | 0.85 | none | null | KEEP | Below display threshold. Pattern only. |
| BSH-001 | 36 | confirmed_set | 0.97 | paren_plus | null | WATCH | Display-ready. Paren-plus pattern strongly correlated. No URL. BSH indoor/outdoor role order unverified across all bundle patterns. |
| BSH-002 | 48 | standalone_odu | 0.85 | none | null | KEEP | BAFA-pattern-only. Monoblock/standalone classification. |
| BUD-001 | 6 | confirmed_set | 0.85 | paren_ampersand | null | KEEP | Below display threshold. |
| CAR-001 | 15 | requires_research | 0.50 | none | null | KEEP | Correctly flagged for manual research. |
| CLI-001 | 122 | confirmed_set | 0.97 | clivet_edge_wisan_hqcn | null | WATCH | Display-ready (122 products). BAFA registration itself embeds WiSAN + HQCN-NEE component codes, submitted by CLIVET. Strongest self-description evidence among no-URL rules. Claimed official URL not archived. Defensible at 0.95; 0.97 is borderline without URL. |
| CLI-002 | 46 | confirmed_not_set | 0.88 | none | null | KEEP | Correctly reclassified — EDGE Evo 2.0 without HQCN code = standalone outdoor. |
| CLI-003 | 22 | confirmed_set | 0.94 | clivet_sphera_misan | null | KEEP | Below display threshold. BAFA-embedded codes (SQKN + MiSAN). |
| CLI-004 | 134 | standalone_odu | 0.80 | none | null | KEEP | BAFA-pattern-only. |
| DAI-001 | 103 | variant_label | 0.92 | none | daikin.eu ×2 + daikin.co.uk | KEEP | variant_label (not display-ready). Has the strongest URL evidence in the registry (genuine Daikin domains). Not display-ready because no extraction method. |
| DIM-001 | 3 | confirmed_set | 0.85 | none | null | KEEP | Below display threshold. |
| ELC-001 | 22 | variant_label | 0.88 | none | null | KEEP | Pattern-based. |
| ENP-001 | 9 | standalone_odu | 0.85 | none | null | KEEP | BAFA-pattern-only. |
| FLG-001 | 68 | variant_label | 0.85 | none | null | KEEP | Pattern-based. |
| FUJ-001 | 28 | confirmed_set | 0.85 | bracket_plus | null | KEEP | Below display threshold. |
| GDT-001 | 36 | confirmed_set | 0.85 | gdt_smkl_thf | null | KEEP | Below display threshold. |
| GDT-002 | 26 | confirmed_not_set | 0.85 | none | null | KEEP | BAFA-pattern-only. |
| GRE-001 | 53 | confirmed_set | 0.87 | none | null | KEEP | Below display threshold. method=none → not extractable. Reclassification from variant_label correct. No URL for claimed GREE service manual. |
| INV-001 | 24 | confirmed_set | 0.88 | inventor_ats_hu | null | KEEP | Below display threshold. |
| INV-002 | 34 | confirmed_not_set | 0.85 | none | null | KEEP | BAFA-pattern-only. |
| JCH-001 | 50 | confirmed_set | 0.97 | jch_ras_rwm | hitachiaircon.com ×2 + ManualsLib ×2 | KEEP | Display-ready. Strongest evidence in display-ready set. Genuine manufacturer-domain URLs explicitly categorize RAS as outdoor and RWM as indoor. ManualsLib entries should be re-tagged third_party (content is manufacturer-authored). |
| JCH-002 | 5 | confirmed_not_set | 0.97 | none | hitachiaircon.com | KEEP | Not display-ready (confirmed_not_set). Genuine manufacturer URL confirms Yutaki M is monoblock. |
| JCS-001 | 18 | confirmed_set | 0.82 | plus_separator | null | KEEP | Below display threshold. |
| LGE-001 | 39 | confirmed_set | 0.92 | bracket_plus | null | KEEP | Below display threshold. |
| LGE-002 | 0 | confirmed_not_set | 0.93 | none | null | KEEP | Zero BAFA hits. Rule correct in design. |
| MDE-001 | 22 | confirmed_set | 0.85 | plus_separator | null | KEEP | Below display threshold. |
| MIT-001 | 571 | variant_label | 0.93 | none | ManualsLib ×2 + EasyHeatPumps ×1 | SOURCE-TYPE-FIX | Largest rule (571 products). Not display-ready (variant_label). Two ManualsLib URLs incorrectly tagged manufacturer_official; EasyHeatPumps incorrectly tagged manufacturer_official. Both are third_party. |
| MTF-001 | 27 | confirmed_set | 0.97 | bracket_plus | null | WATCH | Display-ready (27 products). Evidence is MTF distributor website — not the Samsung manufacturer. Role assignment for AE-RN indoor prefix not confirmed by direct Samsung EHS URL. Depends on SAM-001 evidence chain, also without URL. |
| NIB-001 | 2 | confirmed_set | 0.97 | nibe_split_paren | null | KEEP | Display-ready (2 products). BAFA name "(AMS 10-X + HK 200S)" is near-self-describing. No URL archived. |
| PAN-001 | 55 | confirmed_set | 0.97 | bracket_plus | null | WATCH | Display-ready (55 products). WH-UD/WH-ADC prefixes are well-established Panasonic Aquarea conventions. No URL archived. |
| PAN-002 | 7 | confirmed_not_set | 0.97 | none | null | KEEP | Not display-ready (confirmed_not_set). No URL. |
| REH-001 | 2 | confirmed_set | 0.95 | none | null | KEEP | conf=0.95, method=none → in high_conf_ge_095 (581) but NOT in display_ready (579). Self-describing ("IDU+ODU" literal). |
| SAL-001 | 24 | confirmed_set | 0.85 | plus_separator | null | KEEP | Below display threshold. |
| SAM-001 | 78 | confirmed_set | 0.97 | plus_separator | null | WATCH | Display-ready (78 products). AE-BX/RX (outdoor) + AE-DN (indoor) conventions cited but URL not archived. |
| STI-001 | 2 | confirmed_set | 0.92 | none | null | KEEP | Below display threshold. |
| VAI-001 | 23 | confirmed_set | 0.97 | plus_separator | null | KEEP | Display-ready (23 products). AS (Außenstation=outdoor) and IS (Innenstation=indoor) German terminology is distinctive. |
| VAI-002 | 6 | confirmed_set | 0.97 | plus_separator | null | **BUG** | Display-ready (6 products). **CONFIRMED BUG: idu_model contains outdoor unit code; odu_model contains indoor unit code. Extraction roles are reversed.** See Section 8. |
| VAI-003 | 11 | confirmed_not_set | 0.90 | none | null | KEEP | Not display-ready (confirmed_not_set). |
| VIE-001 | 180 | confirmed_set | 0.97 | viessmann_idu_odu | null (self-certifying) | KEEP | Display-ready (180 products, largest contributor). BAFA names contain literal "IDU-A" and "ODU" strings. Viessmann registered these names with BAFA, making the BAFA text manufacturer-authored. Confidence 0.97 justified without external URL. |
| VIE-002 | 63 | variant_label | 0.85 | none | null | KEEP | Not display-ready (variant_label). |
| WEI-001 | 9 | variant_label | 0.88 | none | null | KEEP | Pattern-based. |
| WLF-001 | 0 | confirmed_not_set | 0.98 | none | null | WATCH | Zero BAFA hits — no current impact. conf=0.98 is unusually high for confirmed_not_set without URL. "MONOBLOCK" in name is self-describing but 0.98 exceeds what no-URL evidence supports. |
| WLF-002 | 0 | variant_label | 0.88 | none | null | KEEP | Zero BAFA hits. |
| XTH-001 | 16 | confirmed_set | 0.88 | none | null | WATCH | Below display threshold. Upgraded from 0.78 in v2.0.0. No URL. Evidence text claims "External manufacturer documentation confirms" but what_it_proves is generic. Upgrade lacks specific supporting detail in the registry. |

---

## 6. Display-Ready Audit (579)

### 6.1 Rule Contribution Table

| Rule | Products | Conf | Evidence type | URL stored? | Verdict |
|---|---|---|---|---|---|
| VIE-001 | 180 | 0.97 | self_describing (BAFA literal IDU-A/ODU) | No (self-certifying) | ✓ Justified |
| CLI-001 | 122 | 0.97 | manufacturer_official (claimed) | No | WATCH — borderline 0.97 without URL |
| SAM-001 | 78 | 0.97 | manufacturer_official (claimed) | No | WATCH — no URL |
| PAN-001 | 55 | 0.97 | manufacturer_official (claimed) | No | WATCH — no URL |
| JCH-001 | 50 | 0.97 | manufacturer_official | Yes (2 genuine mfr domains) | ✓ Verified |
| BSH-001 | 36 | 0.97 | manufacturer_official (claimed) | No | WATCH — no URL |
| MTF-001 | 27 | 0.97 | manufacturer_official (MTF distributor website) | No | WATCH — distributor ≠ manufacturer |
| VAI-001 | 23 | 0.97 | manufacturer_official (claimed) | No | ✓ AS/IS terminology near-self-certifying |
| VAI-002 | 6 | 0.97 | manufacturer_official (claimed) | No | **BUG — IDU/ODU reversed in extracted fields** |
| NIB-001 | 2 | 0.97 | manufacturer_official (claimed) | No | WATCH — no URL |
| **Total** | **579** | | | | |

### 6.2 Evidence Quality Distribution

| Evidence quality | Products | % of 579 |
|---|---|---|
| Verified: genuine manufacturer-domain URL | 50 (JCH-001) | 8.6% |
| Self-certifying: BAFA text contains literal IDU/ODU labels | 180 (VIE-001) | 31.1% |
| Partially self-certifying: BAFA-embedded component codes | 122 (CLI-001) | 21.1% |
| Near-self-certifying: well-known naming convention | 46 (PAN-001, VAI-001, NIB-001) | 7.9% |
| Claimed official evidence, URL not archived | 175 (SAM-001, BSH-001, MTF-001) | 30.2% |
| Confirmed data bug (IDU/ODU swapped) | 6 (VAI-002) | 1.0% |

### 6.3 Count Verification

The adjacent summary shows `confirmed_set_high_conf_ge_095 = 581`. The display-ready count is `confirmed_set_idu_odu_extractable = 579`. The 2-product gap is REH-001 (conf=0.95, method=none): REH-001 meets the classification and confidence threshold but has no extraction method, so `idu_model = null` and it correctly falls outside the 579.

The 579 count itself is arithmetically consistent with the 10-rule breakdown above. The count is technically correct as computed; the question is evidence quality, not arithmetic.

---

## 7. CLIVET Deep Audit

Four CLIVET rules exist: CLI-001, CLI-002, CLI-003, CLI-004.

### CLI-001 — EDGE Evo 2.0 + WiSAN + HQCN-NEE (122 products, conf=0.97)

**Pattern:** `[Product name] + Box / WiSAN-YME X S X.X + HQCN-NEE X BC X`  
**Example:** `EDGE Evo 2.0 + Box / WiSAN-YME 1 S 2.1 + HQCN-NEE 1 BC A`  
**Extractor:** `clivet_edge_wisan_hqcn` — regex extracts `WiSAN-*` as odu_model and `HQCN-NEE*` as idu_model  

**Evidence assessment:**
- No URL archived.
- The BAFA registration name itself embeds two CLIVET-proprietary component codes: `WiSAN-YME` (outdoor unit) and `HQCN-NEE` (indoor hydrobox). These names were submitted to BAFA by CLIVET as the manufacturer-registrant.
- `HQCN-NEE 1 BC A` is an indoor hydrobox model code — not a product line name, not a system identifier. The extracted `idu_model` is a genuine component code.
- `WiSAN-YME 1 S 2.1` is the outdoor unit — also a genuine component code, not a brand name.
- The claimed "CLIVET official documentation" provides the semantic confirmation (which unit is indoor, which is outdoor) but its URL was not archived.
- **Verdict:** The BAFA name self-describes the components at the model-code level, providing stronger implicit evidence than most other no-URL rules. Confidence 0.97 is marginally above what the evidence supports without an archived URL. Recommended: treat as 0.95 pending URL archival. No product reclassification needed.

### CLI-002 — EDGE Evo 2.0 + WiSAN without HQCN (46 products, conf=0.88, confirmed_not_set)

**Previous classification:** confirmed_set  
**Current classification:** confirmed_not_set (reclassified in v2.0.0)  
**Basis:** EDGE Evo 2.0 is a product line/system controller name, not an indoor unit model code. When no HQCN code is present alongside WiSAN, this is a standalone outdoor WiSAN registration, not a paired indoor+outdoor set.  
**Verdict:** Reclassification correct. Confidence 0.88 appropriate for confirmed_not_set without URL.

### CLI-003 — SPHERA MiSAN (22 products, conf=0.94)

**Pattern:** `SQKN + [capacity] + MiSAN*`  
**Extractor:** `clivet_sphera_misan`  
**Assessment:** BAFA name embeds SQKN (indoor unit) and MiSAN (outdoor unit) component codes. No URL. Confidence 0.94 below display threshold — appropriately capped without URL.  
**Verdict:** Keep as-is.

### CLI-004 — WSAN/WiSAN standalone (134 products, conf=0.80, standalone_odu)

**Assessment:** BAFA-pattern-only identification of standalone outdoor units. The BAFA name typically contains only the WiSAN code without an HQCN code, confirming monoblock/standalone registration.  
**Verdict:** Keep as-is. Confidence 0.80 is appropriately conservative.

---

## 8. Critical Findings

### 8.1 VAI-002: Confirmed IDU/ODU Role Reversal Bug

**Severity:** HIGH — data integrity error in 6 display-ready products  
**Rule:** VAI-002 (Vaillant flexoCOMPACT/flexoTHERM + aroCOLLECT, conf=0.97)  
**Example:** `flexoCOMPACT exclusive VWF 58/4 + aroCOLLECT VWL 11/4 SA`

The `plus_separator` extractor assigns:
```
odu_model = first_segment = "flexoCOMPACT exclusive VWF 58/4"   ← INDOOR unit (wrong field)
idu_model = second_segment = "aroCOLLECT VWL 11/4 SA"          ← OUTDOOR collector (wrong field)
```

Confirmed by the rule's own metadata:
- `idu_label` reads: `"aroCOLLECT VWL **outdoor** air-source collector"` — the label says "outdoor" but it's in the `idu` (indoor) field
- `odu_label` reads: `"flexoCOMPACT/flexoTHERM VWF **indoor** heat pump unit"` — the label says "indoor" but it's in the `odu` (outdoor) field

This is unambiguous: for all 6 VAI-002 products, the `idu_model` field contains the outdoor unit model code and the `odu_model` field contains the indoor unit model code.

**Required fix:** For VAI-002, the extraction roles must be inverted. Either:
1. Change the extractor for this rule to `idu: first_segment, odu: second_segment`, or
2. Create a dedicated extractor that correctly identifies flexoCOMPACT (indoor) as idu and aroCOLLECT (outdoor) as odu.

**Impact until fix:** 6 display-ready products will show incorrect IDU/ODU model codes if consumed. Since IDU/ODU labels are not yet exposed in the user-facing app, the bug is latent but must be resolved before any display or export of the mapping data.

### 8.2 Source Type Misclassification

The following evidence entries are tagged `manufacturer_official` but are hosted on third-party platforms:

| Rule | URL | Correct source_type |
|---|---|---|
| AIT-001 | `manualslib.com/manual/1252373/...` | `third_party` (manufacturer-authored content, third-party hosting) |
| JCH-001 | `manualslib.com/manual/3971999/...` | `third_party` |
| JCH-001 | `manualslib.com/manual/3194522/...` | `third_party` |
| MIT-001 | `manualslib.com/manual/1455392/...` | `third_party` |
| MIT-001 | `easyheatpumps.com/...` | `third_party` |

Note: ManualsLib content may be manufacturer-authored (the manuals themselves are genuine), but the hosting platform is not the manufacturer's own infrastructure. The confidence implications are minimal for rules where genuine manufacturer-domain URLs also exist (JCH-001 has hitachiaircon.com). For MIT-001 (variant_label, not display-ready), the only "official" URLs are ManualsLib + a retailer — making its evidence genuinely third-party-only.

### 8.3 MIT-001 Evidence Quality (Not Display-Ready)

MIT-001 (571 products, Mitsubishi Ecodan, variant_label) has three stored URLs but all are third-party:
- Two ManualsLib (tagged manufacturer_official — should be third_party)
- One EasyHeatPumps UK retailer (tagged manufacturer_official — should be third_party)
- One ShopClima Italian retailer (correctly tagged third_party)

MIT-001 is not display-ready (variant_label + method=none), so this does not affect the 579 count. But the source type misclassification should be corrected in the registry for accuracy.

### 8.4 WLF-001 Confidence Anomaly

WLF-001 (`confirmed_not_set`, conf=0.98) has zero BAFA hits and no stored URL. The confidence of 0.98 is the highest in the registry outside of display-ready rules. For a confirmed_not_set rule with no URL and no current BAFA matches, 0.98 overstates evidence quality. This has zero operational impact (0 hits) but represents an inconsistency with the audit policy.

### 8.5 MTF-001 Evidence Chain Weakness

MTF-001 (27 display-ready products) cites the MTF DACH distributor website as its `manufacturer_official` evidence. MTF is Samsung's exclusive DACH distributor — not Samsung itself. The role assignment for the bracket-plus notation (AE-outdoor first, AE-indoor second) ultimately depends on Samsung EHS documentation, which is covered in SAM-001 but also has no archived URL. This creates a two-step evidence chain (distributor → manufacturer) with no URL at either step.

---

## 9. Confidence Downgrade Recommendations

The following rules warrant annotation or confidence adjustment, in decreasing severity:

### Required (data integrity)

| Rule | Issue | Current conf | Recommended action |
|---|---|---|---|
| VAI-002 | IDU/ODU extraction roles reversed for 6 products | 0.97 | Fix extractor before any mapping consumption; flag in registry |

### Recommended (evidence gap)

| Rule | Issue | Current conf | Recommended conf |
|---|---|---|---|
| MIT-001 | All 3 URLs are third-party; source_type incorrectly tagged | 0.93 (variant_label) | Fix source_type tags to `third_party` |
| AIT-001, JCH-001 | ManualsLib URLs incorrectly tagged manufacturer_official | 0.88 / 0.97 | Fix source_type tags only; confidence unaffected |
| CLI-001 | 0.97 without any archived URL; BAFA-embedded codes support 0.95 | 0.97 | Consider 0.95; display-ready threshold preserved |
| MTF-001 | Distributor website as evidence; Samsung role assignment uncited | 0.97 | Consider 0.94 without Samsung EHS URL |
| WLF-001 | conf=0.98 for confirmed_not_set, no URL, zero hits | 0.98 | Consider 0.88–0.90; no operational impact |
| XTH-001 | Upgraded from 0.78 to 0.88 in v2.0.0; no specific source detail in registry | 0.88 | Keep if agent session has supporting evidence; revert to 0.78 if not |

### Optional (no immediate impact)

| Rule | Note |
|---|---|
| SAM-001, PAN-001, BSH-001, VAI-001, NIB-001 | Confidence defensible from BAFA pattern analysis and prior agent research; archive source URLs when possible |

---

## 10. Data Regeneration Recommendation

| Condition | Action |
|---|---|
| If VAI-002 extraction is fixed | Regenerate `idu-odu-mapping/2026-06/` — 6 products will have swapped idu_model/odu_model corrected |
| If source_type tags are corrected in registry | No regeneration needed — source_type only affects evidence metadata, not extracted field values |
| If CLI-001 confidence adjusted from 0.97 → 0.95 | No regeneration needed — the 122 products remain display-ready (threshold is 0.95) |
| If MTF-001 confidence adjusted from 0.97 → 0.94 | Regeneration needed — 27 products would drop below display threshold. Display-ready count: 579 → 552 |
| If WLF-001/WLF-002/LGE-002 confidence changed | No regeneration needed — these rules have zero BAFA hits |

---

## 11. Validation Results

```
JSON validation:   PASS — manufacturer-idu-odu-rules.json parses without error
Rule count:        45 (verified by Python extraction)
Rules with hits:   42 (from summary rule_hit_counts)
Rules with 0 hits: 3 (LGE-002, WLF-001, WLF-002)
Display-ready:     579 (matches confirmed_set_idu_odu_extractable in summary)
High-conf total:   581 (confirmed_set_high_conf_ge_095; includes REH-001 ×2 with method=none)
Registry version:  2.0.0 (matches applied mapping)
Live URL checks:   NOT PERFORMED
```

---

## 12. Git Status

```
M  .gitignore
M  docs/.bkit-memory.json
M  docs/.pdca-status.json
?? data_sources/bafa/idu_odu_rules/      (new, untracked)
?? scripts/analysis/                    (new, untracked)
?? docs/IDU_ODU_CLASSIFICATION_FEASIBILITY.md (new, untracked)
?? docs/IDU_ODU_MANUFACTURER_RULE_REGISTRY.md (new, untracked)
?? docs/IDU_ODU_MANUFACTURER_VALIDATION_REPORT.md (new, untracked)
```

This report (`docs/IDU_ODU_EVIDENCE_AUDIT_REPORT.md`) is also untracked. No production files were modified by this audit.

---

## 13. Recommended Next Actions

**Priority 1 — Required before any mapping consumption:**
1. Fix VAI-002 extraction bug (swap idu/odu role assignment in rule or extractor)
2. Regenerate mapping files after fix

**Priority 2 — Registry accuracy:**
3. Correct `source_type` for ManualsLib and EasyHeatPumps entries from `manufacturer_official` to `third_party`
4. Archive actual URLs for top display-ready rules (CLI-001, SAM-001, PAN-001, BSH-001, VAI-001)

**Priority 3 — Confidence calibration (optional):**
5. If MTF-001 confidence is lowered to 0.94, regenerate mapping (27 products drop from display-ready; 579 → 552)
6. Lower WLF-001 confidence from 0.98 to ≤0.90 (zero impact on display count)
7. Annotate CLI-001 confidence as "pending URL verification at 0.95; 0.97 requires URL archival"

**Do not do:**
- Do not reclassify or change extraction logic for VIE-001, JCH-001, DAI-001, CLI-002, GRE-001 — these are correctly assessed
- Do not expose IDU/ODU data to the user-facing app until VAI-002 is fixed and URLs are archived for at least the top-5 display-ready rules by product count (VIE-001, CLI-001, SAM-001, PAN-001, JCH-001)
- Do not remove products from confirmed_set purely due to missing URLs — the BAFA patterns are strongly correlated and the research was performed; only VAI-002 has a confirmed data error
