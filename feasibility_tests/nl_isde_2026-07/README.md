# Netherlands ISDE Phase-0 PoC — INACTIVE research tooling

**Status: the Netherlands edition is POSTPONED (2026-07-17). Nothing here is
production code; nothing runs during build/test/deploy/CI; no raw data is
committed.** The authoritative findings live in `docs/NL_MARKET_FEASIBILITY.md`
and `docs/NL_PHASE0_COVERAGE_POC.md` (source URLs, checksums, counts, coverage,
precision audit, decision gates).

These scripts reproduce the Phase-0 analysis if the investigation resumes.
They write only inside this workspace (`raw/`, `out/` — both gitignored and
deleted in the 2026-07-17 cleanup), fetch only public official sources with
polite rate limits, and require no credentials.

Run order (from the repository root):

1. `node feasibility_tests/nl_isde_2026-07/scripts/01-fetch-sources.mjs`
   — downloads the current RVO Meldcodelijst XLSX (month-stamped URL — update
   the month) and enumerates the public JSON API (65 pages, cached, 1.5 s
   politeness), writing `raw/` + checksums.
2. `02-enumerate.mjs` — parses XLSX + API, reconciles them, writes `out/rows.json`
   + `out/enumeration.json`.
3. `03-build-indexes.mjs` — builds the canonical-catalogue and EPREL match
   indexes from repository data (requires built `public/data/products*.json`
   and the local EPREL snapshot under `data_sources/eprel_raw/`).
4. `04-match.mjs` — the staged matcher (A–J) with the mutually exclusive
   status taxonomy; writes `out/match-results.json`.
5. `05-diagnose.mjs` — failure-cause diagnosis of unresolved rows.
6. `06-metrics.mjs` — coverage under all counting units, brand/segment
   matrices, weighted coverage; writes `out/metrics.json`.

Known follow-ups if resumed (Phase 0.5, per the report §V): EPREL
*water-heaters* crawl (DHW rows), alpha-suffix / component-family /
value-plausibility precision guards, manufacturer code-mapping packs
(Daikin, Bosch/Nefit, ATAG, Atlantic, Thermia), ambiguous-queue review,
Itho Daalderop SKU→portal native pilot.
