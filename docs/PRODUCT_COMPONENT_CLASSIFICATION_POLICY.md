# Product Component Classification Policy
**Version:** 1.1.0  
**Date:** 2026-06-23  
**Status:** AUTHORITATIVE — supersedes all prior IDU/ODU investigation documents  
**Scope:** All BAFA product component identification, rule authoring, mapping generation, and UI display

> This is the single source of truth for how products are split into outdoor units, indoor units, control boxes, tanks, towers, hydraulic modules, and fallback indoor-side equipment in this project.
> All prior IDU/ODU documents under `docs/` are historical research notes and must not be used as current policy.

---

## 1. BAFA Model Name Preservation Rule

**BAFA-registered model names are immutable.**

The model name submitted by the manufacturer to BAFA and recorded in the BAFA list is tied to the official registration number. It must never be:
- modified
- shortened
- normalized
- translated
- rewritten
- replaced with a "cleaned" version

The value stored as `bafa_model_name_original` (or equivalent source field) is the ground truth and must remain unchanged throughout the pipeline.

### Display handling

Long BAFA model names may be **visually displayed** in a structured component block layout, using detected component roles as labels. However:

- the stored source value must not change
- display formatting must not write back to the source field
- do not create a "cleaned product name" field that replaces or summarizes the BAFA name

**Correct pattern:**
```
[Source field]  bafa_model_name_original = "IDU-A 2C AWMIW.A1.19-V055 / ODU 250-A AWMOF-251.A1.04-230-V055"
[Display]       BAFA Name: IDU-A 2C AWMIW.A1.19-V055 / ODU 250-A AWMOF-251.A1.04-230-V055
                Detected ODU: AWMOF-251.A1.04-230-V055
                Detected IDU: AWMIW.A1.19-V055
```

**Wrong pattern:**
```
[Source field]  model = "AWMOF-251"   ← NEVER overwrite with a shortened version
```

---

## 2. ODU — Outdoor Unit Definition

**ODU means outdoor-installed main equipment.** This project uses an installation-location-based definition, not a strict refrigerant-circuit-topology definition.

### What ODU includes

| ODU type | Description | Example |
|---|---|---|
| `split_odu` | Split-system outdoor unit; compressor and refrigerant-side heat exchanger in an outdoor cabinet; connected to indoor hydrobox via refrigerant lines | Viessmann AWMOF-xxx, Panasonic WH-UD/WH-UDZ, LG HU-series, Vaillant aroTHERM VWL |
| `monoblock_outdoor_main` | Monobloc heat pump placed outdoors; compressor, refrigerant circuit, and air-to-water heat exchanger all contained in one outdoor cabinet; connected to heating circuit by water pipes only, no refrigerant lines into the building | Viessmann Vitocal 100-A/150-A AWO, Panasonic WH-MDC/WH-MXC, Daikin Altherma 3 M, LG HM-series, Stiebel Eltron WPL-A, Wolf CHC-MONOBLOCK, Buderus WLW-X MB AR |
| `standalone_outdoor_unit` | An outdoor unit (split or monobloc) registered in BAFA without a paired indoor-side component in the same record | CLIVET EDGE-WIS-AN standalone registrations |

### What ODU does NOT include

- Indoor hydroboxes
- Control boxes or interface modules installed indoors
- Tanks, towers, or hydraulic modules
- Anything classified as `indoor_side_equipment`, `control_box`, or `tower`

### Practical implication

Under this definition, **every monoblock product has an identifiable outdoor unit** — the monoblock unit itself. This gives ~3,568 of 7,163 BAFA products (49.8%) a populated `outdoor_unit_model`, compared to 815 (11.4%) under the prior strict split-only logic. See `docs/IDU_ODU_MONOBLOCK_INCLUSIVE_REEVALUATION.md` for the full coverage analysis.

---

## 3. IDU — Indoor Unit Definition

**IDU is restricted to actual split-system indoor units.**

IDU is a precise technical category. Do not use it as a catch-all for any indoor-side component.

### What IDU includes

| IDU type | Description | Example |
|---|---|---|
| `split_indoor_unit` | The indoor heat exchanger in a refrigerant-split system, connected to the outdoor split unit via refrigerant lines | Mitsubishi EHS/EHSD indoor unit, LG HN hydrobox (when used in HU+HN split) |
| `hydrobox_as_split_idu` | A hydrobox that is the actual indoor refrigerant unit in a split system; explicitly confirmed as the split IDU, not merely installed indoors | Panasonic WH-ADC (in WH-UD + WH-ADC split set) |
| `indoor_module_as_split_idu` | An indoor module that is explicitly the indoor refrigerant unit in a split system | Vaillant flexoTHERM VWF (in aroTHERM + flexoTHERM split set) |

### What IDU must NOT include

| Incorrect IDU | Correct classification |
|---|---|
| Monoblock controller (e.g., Samsung MIM-E03) | `control_box` |
| Generic control/interface box | `control_box` |
| Product-line name or system identifier (e.g., "EDGE Evo" in CLI-002) | Not a component; classify as `product_family_or_package_label_only` |
| Tank or cylinder component (e.g., Samsung AE-DNWM buffer+DHW tank) | `tank` |
| Tower product (e.g., Vaillant uniTOWER, Stiebel HSBC Tower) | `tower` |
| Generic indoor-side accessory (function unclear) | `indoor_side_equipment` |
| Hydraulic module (water-side only, no refrigerant lines) | `hydraulic_module` |

---

## 4. Control Box / Controller

Monoblock or system control equipment must be classified as `control_box` or `controller`. Do not classify as IDU.

**Definition:** A device installed indoors that provides system control, zone bridging, interface management, or network connectivity, but does not function as a heat exchanger or a refrigerant-circuit component.

**Known cases:**
- **Samsung MIM-E03FN / MIM-E03GN** — Multi-zone Interface Module; a control bridge between the outdoor EHS Mono unit and multiple heating zones. Has no heat exchanger. Must be classified as `control_box`, not IDU. (Previously misclassified as IDU in SAM-001 of the v2.0.0 registry.)
- Similar multi-zone controllers or interface boards from other manufacturers should follow the same rule.

---

## 5. Tank

Tank, cylinder, and storage components must be classified separately as `tank`.

Do not force a tank or DHW cylinder into IDU.

**Definition:** A water storage vessel (buffer tank, DHW cylinder, or combined unit) that stores heated water but does not contain a refrigerant circuit. May be paired with a monoblock outdoor unit.

**Known cases:**
- **Samsung AE-DNWMPK / AE-RNWMEG** — Buffer + DHW storage tanks paired with Samsung EHS Mono outdoor units. Classified as `tank`, not IDU.

---

## 6. Tower

Integrated indoor tower products must be classified separately as `tower`.

Do not automatically reduce a tower to IDU.

**Definition:** A tall vertical indoor unit that integrates some combination of DHW storage, hydraulic interface, heat exchanger, and/or controls in a single vertical cabinet. May contain elements that could individually be called a tank, hydrobox, or hydraulic module, but the BAFA registration is the tower as a unit.

**Known cases:**
- Vaillant uniTOWER VIH QW
- Stiebel Eltron HSBC Tower / WPT Tower
- Similar "tower" products from NIBE, Wolf, Buderus

A tower may include an IDU function, but only classify it as `split_indoor_unit` or `hydrobox_as_split_idu` if manufacturer documentation explicitly states it is the indoor refrigerant unit of a split system.

---

## 7. Hydraulic Module

Hydraulic and water-side modules must be classified separately as `hydraulic_module`.

Only classify as IDU if evidence explicitly confirms the module is the actual indoor refrigerant unit of a split system.

**Definition:** A water-side module installed indoors that connects the outdoor heat pump (split or monoblock) to the building's heating circuit. Handles hydraulic functions (pumps, valves, flow distribution) but does not process refrigerant.

**Known cases:**
- **AIT HV-series / HSV-series** — Hydraulic stations paired with LAV/LWAV outdoor units. Classified as `hydraulic_module`.
- **Buderus WLW176i / WLW186i** — Indoor hydraulic module paired with Logatherm WLW-X MB AR monoblock outdoor unit. Classified as `hydraulic_module`.
- **LG PHCS0 / PHCSL0** — Passive Hydraulic Control System paired with LG HM monoblock outdoor unit. Classified as `hydraulic_module` (requires confirmation; may be `indoor_side_equipment` if exact function unclear).

---

## 8. Indoor-side Equipment (Fallback)

Use `indoor_side_equipment` only as a fallback when:
- the component appears to be installed indoors or on the indoor/heating-circuit side, AND
- the exact type cannot be confidently classified as `split_indoor_unit`, `control_box`, `tank`, `tower`, or `hydraulic_module`

**Do not use `indoor_side_equipment` as the default for all indoor components.** It is a runtime-error-prevention fallback and must not imply any specific component type.

When `indoor_side_equipment` is used:
- Log the reason in `component_notes`
- Set `component_confidence_score` to ≤ 0.60
- Mark `component_mapping_status` as `requires_research` unless the architecture is otherwise clear

---

## 9. Internal Schema

The recommended internal data schema for component-level fields:

```json
{
  "bafa_model_name_original": "string — original BAFA model name exactly as registered; never modify",
  "bafa_registration_id": "string | null — BAFA registration/source ID if available",

  "system_architecture": "split | monoblock | monoblock_with_control_box | monoblock_with_tank | monoblock_with_tower | monoblock_with_hydraulic_module | package | component_only | unknown",

  "outdoor_unit_model": "string | null",
  "outdoor_unit_type": "split_odu | monoblock_outdoor_main | standalone_outdoor_unit | none | unknown",

  "idu_model": "string | null",
  "idu_type": "split_indoor_unit | hydrobox_as_split_idu | indoor_module_as_split_idu | none | unknown",

  "control_box_model": "string | null",
  "controller_model": "string | null",
  "tank_model": "string | null",
  "tower_model": "string | null",
  "hydraulic_module_model": "string | null",
  "indoor_side_equipment_model": "string | null",

  "component_mapping_status": "outdoor_only | outdoor_plus_idu | outdoor_plus_control_box | outdoor_plus_tank | outdoor_plus_tower | outdoor_plus_hydraulic_module | outdoor_plus_indoor_side_equipment | indoor_side_only | package_label_only | not_extractable | requires_research",

  "component_confidence_score": 0.0,
  "component_evidence_type": "manufacturer_official | bafa_self_describing | bafa_pattern_only | certification_supported | third_party | none",
  "component_rule_id": "string | null",
  "component_notes": "string | null"
}
```

### system_architecture values explained

| Value | Meaning |
|---|---|
| `split` | Genuine split system: outdoor unit (compressor/refrigerant) + indoor unit (hydrobox/idu) connected by refrigerant lines |
| `monoblock` | Monoblock outdoor main unit only; no paired indoor-side component in BAFA record |
| `monoblock_with_control_box` | Monoblock outdoor main + paired indoor control box/controller (e.g., Samsung EHS Mono + MIM-E03) |
| `monoblock_with_tank` | Monoblock outdoor main + paired buffer/DHW tank (e.g., Samsung EHS Mono + AE-DNWM) |
| `monoblock_with_tower` | Monoblock outdoor main + paired indoor tower |
| `monoblock_with_hydraulic_module` | Monoblock outdoor main + paired hydraulic module (e.g., Buderus WLW-MB AR + WLW176i, AIT LAV + HV) |
| `package` | A registered package of components where the exact individual component types require further identification |
| `component_only` | A single component (indoor-only or outdoor-only) registered without its system pair |
| `unknown` | Architecture cannot be determined from available data |

---

## 10. UI / Internal Display Policy

### 10.1 — Display Layout Rules

The UI must not force the full BAFA model name into a single infinitely expanding table cell. Long BAFA names (some Viessmann, CLIVET, Samsung, Buderus, Panasonic names exceed 80 characters) will break layouts and degrade readability.

The original BAFA model name must be preserved and shown. The display may be structured to show detected components beneath it:

```
BAFA Model Name:
<original BAFA model name unchanged>
```

#### Rules for empty/null components

- If a component is null, hide the row entirely in the display (end-user UI) or display "Not identified" (internal/installer tools only).
- Do NOT display null or undefined as an empty string without handling.
- Do NOT display a guessed component value as confirmed.

---

### 10.2 — User-Facing Display Policy

The public user-facing UI (product table, product card, search results) shows component data when `component_confidence_score >= 0.90`. At this threshold, components are shown **normally** — no uncertainty labels, no "estimated", no "unverified", no "needs review", and no "requires confirmation" text.

| Confidence | What normal users see |
|---|---|
| ≥ 0.90 | Component data shown normally — label (ODU / IDU / Control Box / etc.) + model string — **no qualifiers or warnings** |
| < 0.90 | Component data not shown in public UI |

**Recommended user-facing display format:**

```
BAFA Model Name:
<original BAFA model name unchanged>

Components:
  ODU:              <outdoor_unit_model>
  IDU:              <idu_model>
  Control Box:      <control_box_model>
  Tank:             <tank_model>
  Tower:            <tower_model>
  Hydraulic Module: <hydraulic_module_model>
```

- Only show rows where the component is non-null.
- Do not add any qualifying text (estimated, unverified, needs review, requires confirmation, or similar).
- The absence of a component row means the component was not identified — nothing else.
- Do not show `component_confidence_score`, `component_evidence_type`, or `component_rule_id` to normal users.

**On confidence = 0.95:**  
`conf >= 0.95` is an internal quality benchmark, not a requirement for public display. Products at `conf >= 0.90` are shown normally in the public UI. Higher internal confidence does not change the user-facing presentation.

---

### 10.3 — Internal Data-Quality Controls

The tiers below are **internal only** — for the data pipeline, audit scripts, and monthly review tools. They must not appear in the public user-facing UI as labels, badges, or warning text.

| Internal tier | Confidence | Purpose |
|---|---|---|
| High confidence | ≥ 0.95 | Archived-evidence or self-describing standard; tracked internally |
| Standard display | 0.90 – 0.94 | Pattern-matched with strong manufacturer rule; qualifies for public display |
| Monthly review | 0.80 – 0.89 | Shown in internal audit tools only; reviewed after each monthly BAFA refresh; not in public UI |
| Research queue | 0.60 – 0.79 | Shown in internal research/audit tools only; not in public UI |
| Not usable | < 0.60 | Not displayed anywhere; flagged for research queue |

---

## 11. Fallback and Error-Prevention Policy

The following rules are **internal safety rules** for the data pipeline and classification scripts. They govern how code handles missing, ambiguous, or conflicting data. They are not user-facing display rules, warning labels, or UI messages — nothing in this section should ever be shown to end users.

| # | Condition | Required behavior |
|---|---|---|
| 1 | BAFA model name missing or malformed | Preserve raw value if present; set `component_mapping_status = "requires_research"` or `"unknown"`; do not throw runtime error |
| 2 | Outdoor unit cannot be extracted | `outdoor_unit_model = null`; `outdoor_unit_type = "unknown"`; do not invent a value from the manufacturer name alone |
| 3 | Indoor-side component suspected but type unclear | Use `indoor_side_equipment_model`; `indoor_side_type = "indoor_side_equipment"`; do not force into IDU |
| 4 | Controller/control box detected | Classify as `control_box_model` or `controller_model`; do not classify as IDU |
| 5 | Tank/cylinder detected | Classify as `tank_model`; do not classify as IDU |
| 6 | Tower detected | Classify as `tower_model`; do not classify as IDU unless manufacturer docs explicitly confirm it is the split IDU |
| 7 | Hydraulic module detected | Classify as `hydraulic_module_model`; classify as IDU only if explicitly the split indoor unit |
| 8 | Slash/plus/bracket pattern is ambiguous | Do not auto-treat as component separator; classify as `variant_label` or `requires_research` |
| 9 | Evidence conflicts between sources | Prefer lower-confidence classification; use `requires_research`; do not expose as confirmed |
| 10 | Any component field is null | All code paths (UI, scripts, APIs) must handle null safely; no string operations on null/undefined without guards; no runtime crashes |

---

## 12. Monthly Improvement Policy

Component classification improves incrementally after each monthly BAFA data refresh. This section defines the cadence and criteria.

### 12.1 — Review Trigger

- After each monthly BAFA list refresh (new products may trigger new rule patterns)
- When a known issue from §14 is ready for correction
- When a new manufacturer's products appear in volume (> 10 new items without a matching rule)

### 12.2 — Fix Priority Order

1. **High-impact role errors** — known misclassifications that assign wrong component types (e.g., VAI-002 role reversal, SAM-001 MIM-E03) — fix first
2. **Dead rules** — rules matching 0 products (e.g., WLF-001) — fix pattern or disable
3. **Source type errors** — third-party sources incorrectly tagged as `manufacturer_official` — downgrade to `third_party`
4. **New manufacturer patterns** — added gradually; one rule per manufacturer per cycle to limit error surface
5. **App pipeline corrections** — systematic `installation_type` errors (Mitsubishi, CLIVET, Hitachi, Panasonic, AIT) corrected in the app data pipeline separately

### 12.3 — Evidence Standard for Display

Products at `conf >= 0.90` may be shown in the public UI **without requiring archived manufacturer-official documentation**. Pattern-based rules with strong naming evidence (bracket/plus patterns, keyword matches, BAFA self-describing names) are sufficient at this threshold.

Absence of an archived official URL does **not** block display at `conf >= 0.90`.

Archived manufacturer documentation is tracked internally and raises confidence to the `0.95` tier, but it is not a prerequisite for public display.

### 12.4 — Tracking

- Known issues are tracked in §14 (Known Issues in Current Rule Registry)
- Coverage numbers in §15 are updated after each rule cycle
- Each version increment is recorded in §17 (Change Log)
- Do not remove a known issue from §14 without confirming the fix is live in the rule registry and the mapping has been regenerated

---

## 13. Confidence Policy

| Evidence source | Confidence range | Notes |
|---|---|---|
| BAFA self-describing name (e.g., literal "IDU" / "ODU" / "MONOBLOCK" in BAFA name, submitted by manufacturer) | 0.95 – 0.98 | Highest confidence; the manufacturer themselves named the components |
| Manufacturer official documentation with specific model codes confirmed | 0.90 – 0.97 | Requires archived, accessible URL to the primary manufacturer domain |
| BAFA pattern + strong manufacturer naming rule (bracket/plus format with confirmed role order) | 0.85 – 0.92 | Pattern-matched but no external URL; at 0.90+ qualifies for public display (see §10.2); 0.85–0.89 is internal/monthly-review tier |
| App installation_type = "Monoblock" (from pipeline, no specific rule match) | 0.88 | App pipeline has known errors for some manufacturers; internal/monthly-review tier; not in public UI without a stronger rule |
| Third-party source only (ManualsLib, distributor, non-manufacturer-domain) | ≤ 0.79 | Must not be tagged as `manufacturer_official`; label as `third_party` |
| Ambiguous / requires research | ≤ 0.60 | Do not display publicly |

---

## 14. Known Issues in Current Rule Registry (v2.0.0)

These must be fixed before the new taxonomy is implemented. They are documented here as part of the authoritative policy so they cannot be lost between sessions.

### 14.1 VAI-002 — IDU/ODU Role Reversal (HIGH PRIORITY)

**Problem:** The `plus_separator` extractor assigns position 1 → `odu_model` and position 2 → `idu_model`. In VAI-002's products, the BAFA name starts with the indoor unit (flexoCOMPACT VWF) and ends with the outdoor collector (aroCOLLECT VWL) — the reverse of the expected order. Result: all 10 affected products have `odu_model` containing the indoor unit code and `idu_model` containing the outdoor collector code.

**Correct roles:**
- flexoCOMPACT VWF = indoor-side unit → `idu_model` / `indoor_side_equipment_model`
- aroCOLLECT VWL = outdoor collector → `outdoor_unit_model` / `split_odu`

**Fix:** Add `role_order: "idu_first"` flag to the VAI-002 rule, or create a dedicated extractor that reverses position assignment for this rule.

**Affected products:** 6 flexoCOMPACT + aroCOLLECT; 4 additional flexoTHERM + aroCOLLECT products share the same structure.

### 14.2 SAM-001 — MIM-E03 Misclassification (HIGH PRIORITY)

**Problem:** The current SAM-001 rule includes products where `idu_model = "MIM-E03FN"` or `"MIM-E03GN"`. MIM-E03 is Samsung's Multi-zone Interface Module — a controller/zone bridge with no heat exchanger. It is not an indoor hydrobox or IDU.

**Under the new taxonomy:**
- `outdoor_unit_model` = AE-BXY or AE-CXY monoblock code
- `outdoor_unit_type` = `monoblock_outdoor_main`
- `control_box_model` = MIM-E03FN / MIM-E03GN
- `system_architecture` = `monoblock_with_control_box`

**Fix:** Split SAM-001. Create SAM-002 for EHS Mono + MIM-E03 products with correct `system_architecture` and `control_box_model`.

**Affected products:** 27 of 78 SAM-001 products.

### 14.3 CLI-002 — "EDGE Evo" as Product-Line Identifier (MEDIUM PRIORITY)

**Problem:** CLI-002 may classify "EDGE Evo" as a component code (IDU-like identifier) when it is actually a CLIVET product-line name for the system controller/gateway, not a specific indoor unit.

**Fix:** Review CLI-002 evidence. If "EDGE Evo" is a system identifier/product line and not an exact indoor unit model, reclassify as `package_label_only` or remove from `idu_model`. Use `component_mapping_status = "outdoor_only_identified"` if only the outdoor EDGE-WIS-AN model is extractable.

### 14.4 WLF-001 — Dead Rule (MEDIUM PRIORITY)

**Problem:** WLF-001 matches 0 BAFA products. The rule pattern does not match any actual BAFA Wolf model names. Wolf products are currently unclassified in the mapping.

**Fix:** Either fix the pattern to match actual Wolf BAFA names, or disable the rule. Under the new taxonomy, Wolf "MONOBLOCK" / "CHC-MONOBLOCK" / "CHT-MONOBLOCK" products are correctly classified by keyword matching without a rule.

### 14.5 Source Type Errors (MEDIUM PRIORITY)

**Problem:** Multiple rules tag ManualsLib and easyheatpumps.com as `manufacturer_official`. These are third-party sources.

**Fix:** Change `source_type` to `third_party` for all ManualsLib and non-manufacturer-domain references. This will also require lowering confidence to ≤ 0.79 for any rules that rely on these as sole evidence (per §13 confidence policy above). MTF-001 (27 products) is particularly affected.

### 14.6 App Installation_type Pipeline Errors (MEDIUM PRIORITY)

**Problem:** The residential app's `installation_type` field has systematic misclassifications. Known errors:
- Mitsubishi Ecodan (PUD + E*SD split packages) → labelled "Monoblock" in app
- CLIVET EDGE-WIS-AN split products → labelled "Monoblock" in app
- Hitachi RAS + RWM split products → labelled "Monoblock" in app
- Panasonic WH-UD + WH-ADC split sets → labelled "Monoblock" in app
- AIT LAV + HV bracket products → labelled "Monoblock" in app

**Fix:** Audit and correct the app data pipeline's installation_type derivation separately. Do not use the app's `installation_type` as high-confidence evidence for split vs monoblock classification without first correcting the pipeline for these manufacturers.

---

## 15. Coverage Reference (from latest analysis)

These numbers are from the 2026-06 BAFA master seed (7,163 total / 6,887 BAFA-yes) and should be updated when the mapping is regenerated.

| Metric | Count | % of 7,163 | % of 6,887 BAFA-yes |
|---|---|---|---|
| outdoor_unit_model populated (any confidence) | 3,568 | 49.8% | — |
| BAFA-yes with outdoor_unit_model | 3,437 | — | 49.9% |
| Outdoor-side identifiable (any status) | 4,757 | 66.4% | — |
| BAFA-yes outdoor-side identifiable | 4,626 | — | 67.2% |
| outdoor_unit_model + conf ≥ 0.90 | 906 | 12.7% | — |
| outdoor_unit_model + conf ≥ 0.95 | 225 | 3.1% | — |
| split_outdoor_and_indoor_identified | 1,130 | 15.8% | — |
| monoblock_outdoor_main_identified | 2,568 | 35.9% | — |
| monoblock_outdoor_plus_control_identified | 868 | 12.1% | — |
| standalone_split_odu_identified | 191 | 2.7% | — |
| product_family_or_package_label_only | 690 | 9.6% | — |
| confirmed_not_outdoor_unit | 44 | 0.6% | — |
| unclassified | 1,672 | 23.3% | — |

**Source documents:**  
- `docs/IDU_ODU_MONOBLOCK_INCLUSIVE_REEVALUATION.md` — full coverage analysis with per-manufacturer breakdown  
- `docs/IDU_ODU_REEVALUATION_FROM_MANUFACTURER_PATTERNS.md` — manufacturer pattern re-evaluation and new rule recommendations

---

## 16. Related Files

| File | Role | Status |
|---|---|---|
| `data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json` | Rule registry v2.0.0 (45 rules) | Active; needs updates per §14 |
| `data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-mapping.json` | Current classification output | Active; regenerate after rule fixes |
| `docs/IDU_ODU_MONOBLOCK_INCLUSIVE_REEVALUATION.md` | Most recent coverage analysis (2026-06-23) | Historical research; numbers feed this policy §15 |
| `docs/IDU_ODU_REEVALUATION_FROM_MANUFACTURER_PATTERNS.md` | Manufacturer pattern audit (2026-06-22) | Historical research; known issues feed this policy §14 |
| `docs/IDU_ODU_EVIDENCE_AUDIT_REPORT.md` | Registry v2.0.0 evidence audit (2026-06-21) | Historical research; superseded |
| `docs/IDU_ODU_MANUFACTURER_VALIDATION_REPORT.md` | Registry v2.0.0 validation (2026-06-21) | Historical research; superseded |
| `docs/IDU_ODU_MANUFACTURER_RULE_REGISTRY.md` | Registry v1.0.0 doc (2026-06-21) | Historical research; superseded |
| `docs/IDU_ODU_CLASSIFICATION_FEASIBILITY.md` | Original feasibility study (2026-06-21) | Historical research; superseded |

---

## 17. Change Log

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-06-23 | Revised §10 to separate user-facing display policy (§10.2) from internal data-quality controls (§10.3). Public display threshold remains conf ≥ 0.90 with no uncertainty labels in normal UI. Added §12 Monthly Improvement Policy. Softened §11 framing to internal safety rules. Fixed §13 confidence notes for 0.85–0.92 range. Renumbered §12–§16 → §13–§17. |
| 1.0.0 | 2026-06-23 | Initial policy document. Supersedes all prior IDU/ODU docs. Adopts monoblock-inclusive outdoor-side taxonomy. Separates control_box/tank/tower/hydraulic_module from IDU. Adds BAFA name preservation rule. |
