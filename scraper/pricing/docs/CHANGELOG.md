# Pricing Engine Decision History & Changelog

> **Current version:** 3.1 | **Last updated:** 2026-03-20 | **Reference market:** Germany (DE)

Preserves the reasoning behind major design decisions across all versions.

---

## v1.0 — Initial Engine (2026-03-19)

### What Was Built

A deterministic pricing engine for BAFA-listed Luft/Wasser heat pumps using a multiplicative adjustment chain:

```
Base Capacity Price x Brand Tier x Refrigerant x Installation Type x Performance
```

### Key Decisions

**Decision: Online prices are NOT final selling prices.**

Public online shop prices (e.g., selfio.de, klimaworld.com) represent the lowest publicly observable equipment prices. The actual installer-to-customer price is higher because:
- Installers purchase through wholesale/distribution, not online
- Installer margin on equipment is typically 15-30%
- Online prices attract price-sensitive buyers and may not reflect the typical transaction

The engine treats online prices as lower-bound calibration signals. Simulated typical prices are set at or above these signals.

**Decision: Multiplicative adjustment chain, not additive.**

Price factors compound. A premium brand using a premium refrigerant in a premium capacity range should stack multipliers, not add flat amounts. This produces realistic price separation between segments.

**Decision: 7 capacity bands.**

Bands were chosen to match observable market price breaks in the German market:
- 4-6, >6-8, >8-10 kW: residential sweet spot
- >10-12, >12-16 kW: larger residential / small commercial
- >16-20 kW: boundary zone
- 20+: commercial catchall

**Decision: 7 brand tiers (S through D).**

German heating market has clear brand stratification:
- S tier: the "big 4" German heating brands that dominate installer mindshare
- A+/A: known specialist brands
- B+/B: international brands with adequate presence
- C: low-signal brands (non-China, limited distribution)
- D: China HQ brands (aggressive online pricing, limited installer network)

B-tier is the baseline (0% adjustment). This means base capacity prices represent the "generic competent brand" level.

**Decision: 14 initial market samples for calibration.**

v1 used only 14 samples — enough to validate the engine concept but insufficient for reliable calibration.

---

## v2.0 — Segmentation & Sample Expansion (2026-03-19)

### What Changed

1. **Market samples expanded from 14 to 108** across 32 brands
2. **Three-segment classification** added: residential_core / light_commercial / commercial_project
3. **Package scope refinement** with German keyword detection

### Key Decisions

**Decision: Residential / Light Commercial / Commercial separation.**

Problem: The BAFA dataset contains 6,514 items ranging from 3 kW residential units to 500+ kW commercial chillers. Pricing them all with the same model produces misleading results for large commercial units where pricing is project-based.

Solution:
- residential_core (<=20 kW, non-commercial brands): highest confidence, shown in app
- light_commercial (20-50 kW): medium confidence, hidden by default
- commercial_project (>50 kW): low confidence, price may be N/A

Why 20 kW as residential boundary: German single-family homes typically need 4-12 kW. Newer well-insulated homes need 4-8 kW. Multi-family or poorly insulated buildings may need 12-20 kW. Above 20 kW, it's rarely a single-family installation.

**Decision: Package scope matters for confidence, not price.**

Problem: Online listings may include "Paket" (package) with a buffer tank, which inflates the listed price by 30-80% vs. unit-only.

Solution: Detect bundle indicators in listing titles using German keywords. Classify samples as unit_only / with_hydromodule / all_in_one / bundle_unknown. Only use unit_only samples for price calibration. Package scope affects confidence (bundles = lower confidence) but does not directly adjust the simulated price.

Why not adjust price for scope: The engine prices the heat pump unit itself. If we detected a hydromodule-included BAFA listing, we'd need to subtract the hydromodule value — which we don't know reliably. Better to flag it and adjust confidence.

**Decision: Calibration blending with 60/40 weights.**

When simulation and sample data are within 25%:
- blend_weight = min(0.45, sample_count x 0.15)
- More samples = more trust in sample data (up to 45%)
- Simulation always retains at least 55% weight

When deviation exceeds 30%: flag for manual review, do not auto-adjust. The mismatch likely indicates a tier assignment problem or a market sample classification error, not a calibration failure.

---

## v3.0 — C/D Tier Recalibration (2026-03-19 to 2026-03-20)

### What Changed

1. **Market samples expanded from 108 to 168** across 42 brands
2. **Split system samples:** 3 --> 21
3. **Bundle samples:** 6 --> 20
4. **C-tier brand samples:** 0 --> 14
5. **D-tier brand samples:** 6 --> 25
6. **C-tier multiplier revised:** -10%/-5% --> -15%/-8%
7. **D-tier multiplier revised:** -15%/-10% --> -30%/-20% --> -25%/-15%
8. **Commercial N/A policy:** commercial items with weak evidence get null prices
9. **Wider light_commercial ranges:** +/-10% spread on low/high
10. **C/D tier confidence cap:** medium (not boosted to high by calibration)

### Key Decisions

**Decision: D-tier needed significant downward revision.**

Evidence: After expanding D-tier samples to 25 (Midea, GREE, AUX, PHNIX, Zealux, Sprsun), the average deviation between simulation and sample medians was -24.3%. The simulation was overestimating D-tier prices by nearly a quarter.

Implied adjustment from samples: -32% at >6-8 kW band, -33% at >8-10 kW.

However, online prices are lower-bound signals. Installer-to-customer prices are higher. So the engine sets D-tier at -25%/-15% — above the online floor but materially below previous setting.

**Decision: D-tier must not be adjusted in isolation.**

Problem: Initially the D-tier was revised from -15%/-10% to -30%/-20%. But this created a gap between C-tier (then -10%/-5%) and D-tier that was unrealistically large.

Solution: Revise both tiers together based on sample evidence. C-tier was adjusted from -10%/-5% to -15%/-8%. D-tier was initially set to -30%/-20% but later moderated to -25%/-15% after review showed the most aggressive setting was too compressed.

Final C-D gap: ~12 percentage points at the midpoint. At >8-10 kW band, this translates to C typical ~EUR 7,750 vs D typical ~EUR 6,100 — a 21% gap that reflects real market positioning differences.

**Decision: Commercial items with weak evidence get N/A instead of forced prices.**

Problem: Over 1,100 commercial items (>100 kW, unmapped brands, or non-unit-only scope) had no public pricing basis. Forcing a price estimate produced unreliable numbers that could mislead users.

Solution: Set prices to null, price_basis to 'N/A', and add a `commercial_no_price` review flag. Only price commercial items where: (1) brand is mapped, (2) power <= 100 kW, (3) package scope is unit_only.

Result: 1,164 items (74% of commercial) get N/A. 409 commercial items retain prices.

**Decision: C/D tier residential items capped at medium confidence.**

Problem: The v2 calibration logic boosted any residential item with a matching sample to 'high' confidence. This meant D-tier brands like Midea/GREE got 'high' confidence even though their market price variance is much wider than S-tier brands.

Solution: Exclude C/D tier from confidence boost. These items stay at 'medium' regardless of sample coverage. This is honest: even with samples, the price uncertainty for these brands is higher than for established brands.

---

## v3.1 — D-Tier Fine-Tuning (2026-03-20)

### What Changed

1. **D-tier multiplier moderated:** -30%/-20% --> -25%/-15%

### Key Decision

**Decision: Pull D-tier back from -30%/-20% to -25%/-15%.**

The -30%/-20% setting was calibrated against online prices which are the lowest observable signals. The engine targets installer-to-customer prices, which include an installer margin on equipment. Setting D-tier too aggressively toward online floor levels risks understating the actual transaction price.

At -25%/-15%, D-tier typical prices sit about 15-20% above online signals. This is consistent with the installer margin assumption for lower-tier brands (installers buying from China-HQ brands may have smaller margins than from premium brands, but margins still exist).

C-D gap after this adjustment: 21% at >8-10 kW. Previously 18% at -30%/-20%.

---

## Design Principles (Preserved Across All Versions)

1. **Conservative over aggressive.** When in doubt, widen the range or lower the confidence rather than force a specific price.

2. **Honest uncertainty.** N/A is better than a confident-looking wrong number. Medium confidence is better than falsely high confidence.

3. **Lower-bound calibration.** Online prices anchor the floor. Simulated prices sit at or above this floor. The engine never systematically produces prices below public online signals.

4. **Tier monotonicity.** At every capacity band, S-tier typical must exceed A+ which must exceed A, and so on down to D. If this ordering breaks, the multipliers are wrong.

5. **Residential primacy.** The residential dataset (4,387 items) is the production output that powers the app. It must be the cleanest, highest-confidence subset. Commercial and light_commercial are secondary.

6. **Incremental improvement.** Each version extends the previous one. No full rewrites. Changes are evidence-based (sample data) not theory-based.

7. **Separation of concerns.** Market-specific assumptions (brand tiers, base prices, language keywords) are isolated from core engine logic (multiplicative chain, calibration algorithm, confidence framework).
