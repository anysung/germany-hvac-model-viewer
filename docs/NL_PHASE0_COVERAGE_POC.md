# Netherlands Phase-0 — Full-Coverage Matching PoC (Decision Report)

> **STATUS (2026-07-17): Netherlands implementation is postponed. No production
> site, dataset, hosting target, routing, or billing configuration is currently
> approved.** This report and `docs/NL_MARKET_FEASIBILITY.md` are the
> authoritative research record; the reproducible PoC scripts are preserved
> (inactive) in `feasibility_tests/nl_isde_2026-07/scripts/`; raw caches and
> generated outputs were deleted in the 2026-07-17 cleanup (checksums, URLs and
> counts remain documented below).

Executed 2026-07-17 on git `main@dd7ab13`. Non-production PoC: no production code,
dataset, configuration, or deployment was touched; all tooling and outputs live in
the untracked `feasibility_tests/nl_isde_2026-07/` workspace. Nothing was committed
or pushed. Machine-readable summary: `feasibility_tests/nl_isde_2026-07/out/
nl-phase0-summary.json`; row-level output: `out/row-audit.csv` (3,246 rows);
recorded audit: `out/manual-audit.md`; reproducible scripts: `scripts/01–06`.

## A. Executive verdict

**CONDITIONAL GO (coverage-gated).** Strongest reason: the official source is the
best this project has ever worked with — a perfectly reconciled, fully structured,
licence-unencumbered monthly list with a stable JSON API, and the matching that IS
safe already produces ~1,300 publishable products at ~95–96% audited precision
(≥98% with three named guards). Largest blocker: **confirmed-or-spec-complete
coverage is 40.5% today — well under the 60% development gate — and the gap is
structural**, concentrated in (1) DHW appliances outside our EPREL snapshot,
(2) six major brands whose Dutch model ranges/registrations don't string-match
(Daikin, Bosch, ATAG, Atlantic, Nefit, Thermia), and (3) Dutch-native brands
absent from all reference sources. Each gap has a bounded, named recovery
workstream with an estimated yield; development should start only after the
re-measured coverage crosses 60% (§U/V).

## B. Scope and restrictions followed

Read-only repo inspection; bounded polite traffic (65 API pages + 1 XLSX + 2
failed archive probes + 1 archived PDF + 4 web searches ≈ 75 requests, ≥1.5 s
spacing); local-only analysis; no external contact; no access-control bypass; no
production writes. Created files are listed in §W; `git status` shows only the
pre-existing untracked entries plus this report and the PoC workspace.

## C. Official-source verification

- **Source:** ISDE Meldcodelijst Warmtepompen, RVO. Version **juli 2026** (the
  URL is month-stamped; RVO states monthly updates; "Aan deze lijst kunnen geen
  rechten worden ontleend"; no licence stated).
- **XLSX:** `https://www.rvo.nl/sites/default/files/2026-07/Meldcodelijst%20Warmtepompen%20-%20juli%202026.xlsx`
  — 163,073 bytes, sha256[:16] `90a734c12fe8b5ef`, 2 sheets, header row parsed,
  **3,246 data rows**.
- **API:** `https://www.rvo.nl/api/rvo/v1/search-products/21` — 65 pages × 50,
  pager count **3,246**, all pages HTTP 200, JSON.
- **Reconciliation:** 3,246 = 3,246; **all 3,246 meldcodes common; zero one-sided
  rows**; field agreement on common records: brand 3,246/3,246, kW 3,246, amount
  3,246, category 3,246, model 3,223 (23 whitespace-only diffs). API and XLSX are
  the same logical dataset; XLSX additionally carries `Subsidiebedrag 2e
  warmtepomp` and `GWP`; the API additionally carries `nid`/`urlAlias`.
- Access date for everything: 2026-07-17.

## D. Full enumeration results

3,246 rows · 3,246 unique meldcodes (0 duplicate codes) · **0 missing values in
any field** (brand, model, kW, amount, refrigerant, GWP, category all complete) ·
218 raw brands = 218 normalized brands · 3,246 unique raw brand+model strings ·
3,235 unique normalized brand+model · 3,236 unique brand+model+kW · **10 rows are
exact duplicates** of another meldcode at brand+model+kW+refrigerant level
(classified `duplicate_source_row`). Categories: Lucht-Water 2,566 ·
Warmtepompboiler 371 · Grond-Water 227 · Water-Water 82. Refrigerants: R32 1,246 ·
R290 1,191 · R410A 407 · R134a 191 · others 211. No hybrid marker exists in the
source (hybrids sit inside Lucht-Water, undifferentiated); no air/air category.

## E. Counting units

Row = meldcode (verified 1:1). Unique normalized model and brand+model+kW differ
from rows by ≤11 — **all counting units give materially identical coverage**
(40.5/40.6/40.6%), so gaming-by-unit is impossible on this source.
Recommended primary units: **meldcode** for subsidy coverage and maintenance
(RVO's own key; the one-local-id-one-product rule applies to it), **technical
product** (canonical identity) for the public catalogue — exactly the PL pattern.
Combination handling: RVO model strings frequently encode IDU+ODU pairs and
variant families (parenthesized letters); one meldcode may cover several concrete
variants (decoded deterministically in matching; families stay one meldcode).

## F. Matching architecture assessment

Reused as-is from the shared/PL machinery: identity keys, compact normalization,
containment identity, component-key indexing (idu/odu), numeric-conflict guard,
capacity/refrigerant/category contradiction guards, review-queue semantics,
one-id-one-product rule. Reused with configuration: brand-token consistency +
legal-form stoplist; corporate-alias mapping (extended for NL: ait-deutschland=
Alpha Innotec, Qingdao=Haier, Johnson Controls=Hitachi/York, Guangzhou=SPRSUN,
Bosch=Nefit…). New NL-specific mechanisms built for the PoC and needed in
production: **RVO variant-notation decoder** (`EGSA(H)(X)06D9W(G)` → concrete
codes), **article-number extractor** (`(0010016682)` → separate field),
2-character brand tokens (LG). Missing capabilities identified: alpha-suffix
conflict guard, EPREL value-plausibility guard, EPREL component-family guard,
EPREL **water-heaters** snapshot (DHW), manufacturer code-mapping packs.

## G. Matching-stage results (final attribution, mutually exclusive)

| Stage | Status | Rows |
|---|---|---|
| A raw equality | confirmed_exact | 415 |
| B/G normalized+containment (incl. decoded variants/packages) | confirmed_normalized | 267 |
| D deterministic corporate alias | confirmed_new_alias | 1 |
| E capacity-resolved among identity candidates | confirmed_capacity_supported | 22 |
| H EPREL bridge → canonical | confirmed_eprel_supported | 30 |
| H EPREL bridge → native (spec-complete) | native_spec_complete | 579 |
| B/E/H ambiguity (safely gated) | ambiguous_multiple_candidates | 267 |
| J no safe identity anywhere | eligibility_only | 1,655 |
| pre duplicate source rows | duplicate_source_row | 10 |
| — | native_partial / invalid | 0 |

## H–I. Coverage results

- **Tier 1+2 (confirmed + native spec-complete): 1,314 / 3,246 = 40.5%** (row) ·
  40.6% (unique model) · 40.6% (brand+model+kW) · **39% market-priority-weighted**
  (weights: ln(1+brand rows), ×1.5 Dutch-strategic brands, ×1.25 R290/R32 rows —
  fully reproducible in `scripts/06-metrics.mjs`; weighting is secondary and
  reported for honesty: it is *lower* than raw because strategic Dutch brands
  under-match).
- After the precision guards recommended in §L, publishable-grade coverage is
  ~39.0% (the guards demote ~25 rows).
- Segments: Lucht-Water 49.1% · Grond-Water 18.5% · Water-Water low ·
  **Warmtepompboiler 0.0%** (structural: DHW heat pumps register in EPREL's
  water-heater group, absent from our space-heater snapshot) · residential
  (≤23 kW) 39.9% · commercial (>23 kW) 47.5%. The shared 23 kW rule maps cleanly
  (2,985 residential / 261 commercial rows; no evidence against it).
- Recency: not measurable this session (no machine-readable prior month; §O).

## J–K. Brand matrix and priority-brand findings

Top-of-matrix (rows · tier1+2%): Mitsubishi Electric 160·58% · Daikin 113·**12%** ·
Viessmann 85·39% · Panasonic 80·48% · Midea 79·~60% · Bosch 76·**3%** · NIBE
74·39% · Vaillant 71·20% · ATAG 69·**1%** · Samsung 67·19% · Alpha Innotec 61·31% ·
LG 56·63% · Atlantic 55·**0%** · Stiebel-Eltron 50·44% · Remeha 46·22% · Thermia
45·13% · **Nefit 20·0% · Itho Daalderop 36·0% · Intergas 7·43% · Quatt 6·0% ·
WeHeat 5·0%**. Zero-coverage brands with ≥10 rows: Atlantic(55), Itho
Daalderop(36), Nefit(20), plus long-tail (Hedatech 16, Warmichko 16, Tesy 16,
Mastertherm 14, Mundo Clima 12…). Causes are diagnosed per brand
(`scripts/05-diagnose.mjs`): Daikin = generation-suffix divergence between RVO,
BAFA and EPREL strings (D9W/DA9W; EBLA04E(3)V3) — needs an official Daikin code
map; Bosch/Nefit/Atlantic = EPREL registrations under article numbers (1,092
Bosch EPREL records, only 61 with usable model strings) + NL ranges (LWF/7001)
absent from BAFA; ATAG = NL brand of the group, ENERGION range absent from the
German list; Itho Daalderop/Quatt/WeHeat = genuinely absent everywhere — but Itho
rows embed the official SKU (`03-00756 …`) that maps 1:1 to their public product/
documentation portal (verified) → semi-automatable native route; Nefit has full
official spec PDFs (verified). No priority brand is *infeasible*; five are
*unstarted*.

## L. Precision audit & M. false-match patterns

Recorded in `out/manual-audit.md` (253 sampled rows, deterministic sampling).
Results: exact class ~100%; normalized class ~92–95% with one dominant failure
pattern — **trailing alpha-suffix variant differences** (NhH-E/M, AWB/AWBT,
ecoAIR/ecoAIR+, -14M+/-14, II) — fixable by a suffix-conflict guard (projected
≥98%, −2–3 pp coverage); EPREL/native class ~96% with two patterns — indoor-unit
family mismatch (ERST/EHST) and degenerate EPREL values (etas35=1) — fixable by
component-family + value-plausibility guards; **capacity-supported class 78–91%
→ fails the 95% bar → review-only, never auto-published** (22 rows). Blended
publishable precision: ~95–96% today, **≥98% with the three guards** — Gate 4 is
achievable but NOT yet demonstrated end-to-end; re-measurement is part of the
conditions. Unresolved sample: no false negatives found (bucket is real absence,
not matcher failure).

## N. Native-record feasibility

Proven at scale for EPREL-registered space heaters: **579 native records already
spec-complete automatically** (ηs35 + capacity + noise from EPREL; refrigerant +
GWP from RVO) — this is the PL ZUM_EPREL pattern working on NL data. Bounded
manufacturer tests (Itho Daalderop, Nefit): official Dutch documentation portals
exist with full technical data; Itho's RVO strings carry their SKU → page URL
(low effort, semi-automatable); Nefit/Bosch resource PDFs (moderate). Estimated
manual effort for non-EPREL natives: 10–20 min/model initially; DHW (371 rows)
becomes automatic after an EPREL water-heater crawl (same fetcher pattern as the
existing space-heater crawl). Commercially impractical: none identified; the
long-tail (~210 rows, brands absent everywhere) can honestly remain
eligibility-only at launch.

## O. Monthly maintenance simulation — partial (open item)

No machine-readable prior month exists anywhere (RVO publishes only the current
month; Wayback holds no 2025/26 XLSX captures; the one archived PDF is truncated
server-side). Verified instead: monthly update cadence (RVO statement), annual
amount changes (Staatscourant, regression-confirmed formula), high multi-year
churn (configurations halved in 3 years — refrigerant transition), and same-month
API↔XLSX drift = zero. Update mechanics inherit the PL monthly attended flow
(fetch → diff by meldcode → rematch changed rows → review queue). **The actual
month-over-month delta must be measured across the first two production months**
— an open item, not a blocker (fetch cost ≈ minutes; the shrink-guard + review
semantics already handle legitimate list shrinkage like the 2027 refrigerant
cliff).

## P. Schema mapping (overlay fields, PL pattern — no global schema change)

`isde_meldcode` ← MELDCODE · `isde_status` (confirmed/verification_required —
never "not eligible"; unlisted devices can still apply to RVO) · `isde_amount_eur`
← Subsidiebedrag (labelled *indicatief*) · `isde_amount_second_eur` ← 2e wp ·
`isde_capacity_kw` ← Vermogen (kept separate from our rated capacity — RVO warns
it is the *subsidiabel* value) · `isde_category` · `isde_gwp` ← GWP ·
`isde_snapshot` + fetched-at ← list month. All are NL-overlay fields mirroring
`zum_*`; nothing enters the shared global schema; the neutral-public-schema rule
(NEUTRAL_PUBLIC_MARKETS) applies from day one.

## Q. Recommended data architecture

**Canonical baseline + ISDE overlay + EPREL-native records + a separate
eligibility-only index** — i.e. Poland's architecture plus one addition: the
1,600+ unmatched-but-official rows should power a **separate "ISDE meldcode
lookup" view** (searchable by meldcode/brand/model, showing RVO's own fields +
attribution) rather than being forced into the product catalogue or discarded.
They must not appear in product comparison or carry data sheets. This preserves
truthfulness while still answering the #1 Dutch installer question (meldcode +
amount) for 100% of the official list on day one.

## R. Gate scorecard

| Gate | Result | Evidence / remaining requirement |
|---|---|---|
| 1 Source integrity | **PASS** | Perfect XLSX↔API reconciliation; stable public API; checksummed |
| 2 Coverage ≥60% | **FAIL — 40.5%** (row) / 40.6% (unique) / 39% (weighted) | Named recovery workstreams C1–C3; re-run required |
| 3 Priority brands | **CONDITIONAL** | Six majors under-covered but each has a verified feasible route |
| 4 Precision ~95% | **CONDITIONAL PASS** | ~95–96% audited; ≥98% projected with 3 named guards; capacity class gated to review |
| 5 Native enrichment | **PASS** | 579 automatic; manufacturer routes verified; DHW = one crawl away |
| 6 Maintenance | **PASS (open item)** | Cadence/mechanics fine; month-delta measurement pending |
| 7 Legal/provenance | **PASS** | Who 2024 + art. 8(2) posture unchanged; full field-level provenance retained in PoC outputs |

## S. Thresholds (unchanged, evidence supports them)

Development start ≥60% · public beta ≥70% · paid launch ≥80% or ≥90% of
priority-market products · parity ≈ strongest existing edition (PL: 83% of its
registry). Today's 40.5% supports **none** of these yet.

## T. Risk register (top)

| Risk | P | I | Mitigation | Blocks |
|---|---|---|---|---|
| Coverage stalls below 60% after C1–C3 | M | H | Each workstream has an independent, measurable yield; stop-loss at re-run | Development |
| Manufacturer code-mapping yield overestimated | M | M | Treat +8–12 pp as hypothesis; measure per brand-pack | Development |
| Suffix-variant false matches reach production | L (post-guard) | H | Alpha-suffix guard + gate assertion + audit re-run | Paid launch |
| EPREL degenerate values pollute native records | L (post-guard) | M | Value-plausibility guard | Paid launch |
| Month-delta workload surprises | L | M | Measure over first 2 months before paid launch | Paid launch |
| DHW water-heater EPREL crawl underdelivers | L | M | RVO requires EPREL registration for listing — coverage should be high | — |

## U. Final decision

**Remain CONDITIONAL GO; do not begin implementation yet.** Run the named
recovery workstreams as *pre-implementation data work*, then re-execute this PoC
(scripts are reproducible) and start the build only when Gate 2 passes at ≥60%
with ≥98% audited precision on publishable classes.

## V. Recommended next phase — "Phase 0.5: coverage recovery" (bounded, still non-production)

Scope: (1) EPREL **water-heaters** crawl (new snapshot category, same fetcher
pattern; recovers up to 371 DHW rows, +~9–11 pp); (2) implement the three
precision guards in the PoC matcher and re-audit (precision ≥98% acceptance);
(3) build manufacturer code-mapping packs for Daikin, Bosch/Nefit, ATAG,
Atlantic, Thermia (+ Stiebel WWK DHW) from official documentation — measured
per-brand yield, est. +8–12 pp total; (4) review the 267-row ambiguous queue
(+~4 pp); (5) Itho Daalderop SKU→portal native pilot (36 rows). Permitted: local
tooling, bounded polite fetches of official documentation, EPREL API crawl.
Prohibited: everything production (unchanged from this phase). Acceptance:
re-run coverage ≥60% row-basis + ≥98% precision + updated report. Projected
outcome: 62–68% (uncertainty stated: manufacturer-pack yield unproven).
Dependencies: none external. Rollback: delete workspace.

## W. Files created (all non-production; nothing committed/pushed)

`docs/NL_PHASE0_COVERAGE_POC.md` (this report) · workspace
`feasibility_tests/nl_isde_2026-07/`: `scripts/01-fetch-sources.mjs`,
`02-enumerate.mjs`, `03-build-indexes.mjs`, `04-match.mjs` (staged matcher),
`05-diagnose.mjs`, `06-metrics.mjs`, `zum-trial.py` (unused here) ·
`raw/` (cached XLSX + 65 API pages + `_meta.json` checksums; one truncated
archived PDF discarded) · `out/`: `rows.json`, `enumeration.json`,
`canonical-index.json`, `eprel-index.json`, `match-results.json`, `metrics.json`,
`audit-samples.json`, `manual-audit.md`, `row-audit.csv`,
`nl-phase0-summary.json`. Git: branch `main`, commit `dd7ab13`, status shows only
pre-existing untracked entries + this report + the workspace.

## X. Open questions

1. Actual month-over-month delta (first two production months).
2. Manufacturer code-pack yields per brand (measured in Phase 0.5).
3. EPREL water-heater coverage of the 371 DHW rows.
4. Whether RVO would add EPREL ids to the list (Who-request opportunity — would
   collapse most of the string-matching problem).
5. ATAG/Vaillant near-range recovery rate from per-brand review.
6. Hybrid identification (source has no hybrid marker — presentation question).
