# Poland ZUM Commercial Feasibility Test — workspace

**Status: PREPARATION ONLY. The external ZUM acquisition/test phase is time-gated
to 2026-07-20 or later by owner instruction.** Nothing in this directory is
production code or approved product data. This directory is intentionally
untracked; nothing here may be committed, uploaded, published, or wired into the
production pipeline.

Owner instruction (2026-07-16): the previously approved Poland implementation plan
(docs/PL_MARKET_PLAN.md) is **paused and superseded**. The only assignment is a
bounded, read-only commercial data-feasibility test producing a
GO / CONDITIONAL GO / HOLD / NO-GO recommendation. See `METHODOLOGY.md` for the
full test design, standards, metrics, and decision thresholds.

## Contents

- `METHODOLOGY.md` — the complete test design (population, sampling, Path A/B
  standards, metrics, decision thresholds, legal/ToS constraints).
- `scripts/01-build-canonical-index.mjs` — builds `out/canonical-index.json` from
  the local built datasets (`public/data/products*.json`). Local data only. RUN.
- `scripts/02-build-eprel-index.mjs` — builds `out/eprel-index.json` from the local
  EPREL 2026-07 snapshot (`data_sources/eprel_raw/raw/2026-07/spaceheaters-heatpump/`,
  45,623 records, complete). Local data only. RUN.
- `scripts/03-fetch-zum-enumerate.mjs` — the bounded ZUM enumerator.
  **DO NOT RUN BEFORE 2026-07-20.** Runtime form-discovery (control names are
  session-randomized), ≤1 request/2s, identity fields only, no attachments, proper
  CA chain (never disabled TLS), snapshots to `out/zum/raw/`.
- `scripts/04-match-path-a.mjs` — Path A matcher (canonical → ZUM confirmation)
  reusing `scripts/ofgem/pel-match-lib.mjs` primitives. Conservative: EPREL-exact,
  EPREL-bridge, exact-model only; everything else is candidate/review, never
  confirmed. Smoke-tested against `fixtures/`.
- `scripts/05-stats.mjs` — Wilson intervals, stratified weighting, combined-coverage
  formula helpers.
- `fixtures/zum-fixture.json` — synthetic ZUM-shaped records for matcher smoke tests
  (fictitious; never real ZUM data).
- `out/` — generated indexes and (after 2026-07-20) test outputs. Temporary analysis
  artifacts only.

## Run order on/after 2026-07-20

1. Re-verify ZUM/Czyste Powietrze conditions + record URLs/dates (step 0 in
   METHODOLOGY.md).
2. `node scripts/03-fetch-zum-enumerate.mjs --counts-only` → verify populations.
3. `node scripts/03-fetch-zum-enumerate.mjs --enumerate` → identity fields for the
   active HP categories + removed/suspended tab (fallback: stratified sample mode).
4. `node scripts/04-match-path-a.mjs` → Path A results + candidate/review queues.
5. Manual audit of 40 random confirmations (error >5% → tighten and rerun).
6. Path B deep-dive on the stratified sample (n≈150) of non-Path-A entries.
7. `node scripts/05-stats.mjs` → combined coverage + CIs → report per the required
   A–K format → `docs/PL_ZUM_FEASIBILITY_REPORT.md` (the ONLY permanent repo artifact).
