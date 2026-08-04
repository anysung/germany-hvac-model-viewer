# Regular Update Pipeline — design & operations

> Single entry point: `node scripts/update-all.mjs` (see flags below).
> Never run the country builders by hand in production updates — the
> orchestrator owns ordering, verification and deploy.

## 1. The dependency graph (why order matters)

```
                    ┌────────────── EPREL crawl (opt-in, --fetch-eprel) ─┐
                    ▼                                                    │
  BAFA fetch → parse → master seed ──► match BAFA↔EPREL ─► DE builder ───┤
  (--fetch)                (self-accumulating)                │          │
                                                              ├─► FR builder (DE-derived)
  Ofgem PEL fetch → parse (--fetch)                           │
        └─► match canonical→PEL ──────────────────────────────┼─► GB builder
                                                              │
  Lista ZUM fetch → parse (--fetch)                           │
        └─► match canonical→ZUM ──────────────────────────────┴─► PL builder
                                                     (needs built DE datasets)
```

- **FR, GB, PL and IT depend on the BUILT DE datasets** (each derives its
  catalogue from the canonical baseline). DE always runs first —
  the orchestrator computes this from `dependsOn`, never by hand.
- The PL builder additionally appends spec-complete ZUM-native extension
  records (see CLAUDE.md §2 and `scripts/pl/build-app-products-pl.mjs`).
- **Matcher failure semantics (two-layer defense, clarified 2026-07-28):**
  matcher steps are *optional* so a failed overlay never leaves the run
  half-dead and undiagnosable — the builder emits a technically valid
  dataset and says so loudly ("PEL overlay: none — every product will show
  'verification required'"). That output is **not publishable**: the
  dataset gate's `localMatchDropPct` (20 %) compares confirmed-listing
  counts against the approved baseline and BLOCKS the release, so a
  matcher/parser regression can never silently strip a market's listing
  states from production. Confirmed mappings additionally persist in the
  committed match-history files, and a previously confirmed product whose
  match stops resolves to `review_required` — never to "not listed".
  EPREL is different in kind: it is a link-only enrichment, so running
  without a fresh crawl is genuinely fine (old links persist in the seed).
- EPREL is a slow full crawl (~45k records); refresh monthly at most.

## 2. Safety rails (each has caught or prevents a real incident)

| Rail | Where | What it prevents |
|---|---|---|
| Self-accumulating master seed | `build-master-seed.mjs` | Cleaning `parsed/`/`raw/` folders from disk silently dropping products (happened 2026-07-12: 289 June-only products lost; recovered via hosting-release rollback) |
| fetched-at index | `data_sources/bafa/fetched-at-index.json` | Cleaned raw folders breaking `bafa_snapshot_fetched_at` provenance |
| Builder validations | every `build-app-products-*` | Field-shape drift, price-key reintroduction, provenance gaps, duplicate ids |
| Freshness check | orchestrator | Deploying stale datasets after a silently skipped step |
| **Shrink guard** | orchestrator | Any catalogue count dropping below the live datasets (read from `gs://heatpumpdb-datasets` via gcloud, minus 1 canary/file); intentional reductions need `--allow-shrink` |
| Fail-fast + atomic deploy | orchestrator | Partial cross-country deploys — nothing ships unless every dataset verifies |
| Auth-protected datasets + canaries | `scripts/upload-datasets.mjs` + `storage.rules` | Anonymous bulk scraping of the catalogue; canary (honeytoken) records prove extraction if our data surfaces elsewhere |
| **ID carry-over probes** | `dataset-gate.mjs` (`id_probes`, floor 80 %) | The same products republished under NEW ids — every other gate compares sizes, so a changed model-name normalisation or derived key (PL `PL-<zum id>`, IT `IT-<gse entry key>`) passed them all while orphaning match history and saved links. Activates once a baseline approved with probes exists (added 2026-07-30) |
| **ηs column-swap detector** | `dataset-gate.mjs` (`eta_inversions`) | Seasonal efficiency at 35 °C parsed BELOW 55 °C — physically impossible (EU 811/2013), so the columns were transposed, which would invert every derived energy-label class. Measured 0 inversions in 20,238 records, so it can only fire on a regression |

## 3. Monthly run — commands

```bash
# Regular monthly update (new BAFA + PEL snapshots, refresh EPREL, ship):
node scripts/update-all.mjs --fetch --fetch-eprel --deploy

# Rebuild + ship without fetching new sources (config/logic change):
node scripts/update-all.mjs --deploy

# Inspect the plan without running anything:
node scripts/update-all.mjs --dry-run --fetch --deploy
```

npm aliases: `npm run update:all` / `npm run update:all:deploy`.

## 4. Schedule recommendation (decided 2026-07-12)

- **One sequential run, then deploy all sites together — do NOT stagger.**
  GB/FR/PL/IT derive from DE: staggering deploys by hours only creates
  windows where countries show inconsistent catalogues. Precision on
  atomicity (2026-07-28): the DATASET release is effectively one unit (all
  10 objects re-published together, snapshot-guarded); the HOSTING release
  is a **sequential batch that can partially fail** — each site swap is
  atomic, the batch is not. A partial hosting failure is not dangerous
  (every site already reads the re-published bucket data); the orchestrator
  aborts with the exact redeploy command to finish the batch. Hosting IS
  rebuilt on data-only updates on purpose: the landing-page catalogue
  counts (`__MARKET_STATS__`) are baked at build time from the dataset
  files and would otherwise go stale.
- **When**: monthly, **2nd of the month, 03:00–05:00 Europe/Berlin**, run
  manually (attended). Rationale: the news Cloud Scheduler fires on the 1st
  03:00; sources publish around month start; the 2nd gives BAFA/Ofgem a day
  of slack; the night window minimizes user impact across DE/UK/FR timezones
  (max 1h offset). Attended (not cron) while data volumes still shift —
  the operator reads the shrink-guard/summary before `--deploy`.
- **News is independent**: the Cloud Function handles `countries/<code>`
  news/policies on its own schedule; no coupling with this pipeline.

### 4a. Publishing the news archive (after each news cycle)

The public news pages (`/news/`, `/news/<id>.html`) are generated at BUILD time
from a committed snapshot — the build never reads Firestore, so a credential or
network problem can never block a release. After the Cloud Function has run
(1st, 03:00) the snapshot has to be refreshed, otherwise the new articles exist
only inside the app:

```
node scripts/export-news-public.mjs        # all markets → data_sources/news_public/<cc>.json
git add data_sources/news_public && git commit
npm run build:de && npm run deploy:de      # …and the other four markets
```

`build-public-news.mjs` runs automatically inside every `build:<market>` (after
`build-public-guide.mjs`, because it rewrites `sitemap.xml` with the full URL
set). The exporter keeps the previous snapshot if a fetch returns nothing, and
drops articles under 600 characters — a thin page is worse than no page. The
snapshot in git is also the review point: an article can be removed from the
JSON instead of unpublishing a live page.

## 5. Adding a country (expansion checklist)

1. `scripts/<source>/…` fetch/parse/match/build scripts (copy the ofgem or fr
   pattern; builders must keep the validation gates).
2. `PIPELINES` entry in `scripts/update-all.mjs` with correct `dependsOn`
   (DE-derived catalogues depend on `DE`) — execution order is then automatic.
3. `COUNTRY_PROFILES` entry (+ `market.ts`, i18n dictionaries).
4. `vite.config.ts`: `marketStats` files map + `MARKET_HTML` + `__ALL_MARKET_STATS__`.
5. Hosting: `firebase hosting:sites:create`, target in `firebase.json`/`.firebaserc`,
   `build:xx`/`deploy:xx` scripts; add the target to the orchestrator deploy list
   and its datasets to `LIVE_GCS` (shrink guard). THREE per-domain allowlists
   (all three have caused a live incident when missed): reCAPTCHA key domains,
   datasets-bucket CORS (`scripts/infra/storage-cors.json`), and Firebase Auth
   authorized domains (identitytoolkit admin/v2 PATCH or console) — see
   CLAUDE.md §1. Add the market to
   `scripts/upload-datasets.mjs` DATASETS + a canary pair in
   `scripts/canary/canary-records.json` (datasets are served from the
   auth-protected Storage bucket, not hosting).
6. Cloud Function `MARKETS` entry for news.
The admin console picks the new market up automatically from COUNTRY_PROFILES.

## 6. Local disk prerequisites (gitignored, must exist on the build machine)

- `scraper/pricing/output/dataset-enriched-full.json` (DE overlay)
- `data_sources/bafa/idu_odu_mapping/<YYYY-MM>/` (newest auto-selected)
- `data_sources/eprel_raw/raw/<YYYY-MM>/` (for matchers; optional)
- `data_sources/ofgem_pel/parsed/<YYYY-MM>/`
The orchestrator preflights these and aborts with a clear message if missing.

## 7. Disaster recovery (rewritten 2026-07-28 — see docs/DATASET_ROLLBACK_AND_PANIC.md)

Datasets are NO LONGER served from hosting — the old hosting-release
rollback is obsolete. Recovery escalates in this order:

0. **Prevention — the update refuses to start on a sick system** (2026-07-29):
   `upload-datasets.mjs` runs `verify-serving.mjs --preflight` against the
   CURRENTLY LIVE set before it copies anything. A snapshot inherits the
   health of what it captures, so snapshotting broken data would hand us a
   restore point that rolls back into the fault. On failure nothing is touched
   and no snapshot is taken — the message to act on is "live data is already
   unhealthy", not "the update failed". Deliberate override:
   `--preflight-override --reason="…"` (reason mandatory, stamped onto the
   snapshot and shown on the Panic Button).
1. **Automatic**: `upload-datasets.mjs` verifies the served bytes after every
   publish and restores the run's pre-update snapshot IN FULL on persistent
   failure (nothing to do — read the run output).
2. **Panic Button**: admin console → Overview → "Data operations — Panic
   Rollback": pick a snapshot, type `ROLLBACK`. Full-set validation before
   and after; audited.
3. **Manual runbook**: docs/DATASET_ROLLBACK_AND_PANIC.md bottom section —
   owner gcloud one-liners that work even when the console/function/auth
   are all down.

(The 2026-07-12 seed-recovery script `recover-seed-from-app-export.mjs`
remains as a historical last resort for SOURCE data loss, which snapshots of
the served bucket do not cover.)

## 8. Completion checklist (printed by the orchestrator after --deploy)

The update is NOT finished at "deploy done". Every box, every run:

- [ ] serving verification passed (upload step) and stable-release.json promoted
- [ ] one product page spot-checked per market (DE/UK/FR/PL/IT)
- [ ] `node scripts/dataset-gate.mjs --approve`
- [ ] **Curated funding content review** (owner rule 2026-07-30): read the news
      cycle's output for each market — if it produced a SPECIAL FEATURE (a major
      funding/regulatory change), the funding page's hardcoded content must be
      synced by hand: the cards, the timeline AND the Common Questions
      (`bafa.*` + `guide.faqs` in src/hpiq/i18n.ts, both languages of that
      market). The live "Current programmes" list refreshes itself from
      Firestore; the curated blocks do NOT — this checklist item is their only
      update mechanism, and the July 2026 BEG reform showed what happens
      without it (the DE page described an abolished bonus for nine days).
      No change reported → leave content as is.
- [ ] `git add data_manifests/ && git commit && git push origin main`
- [ ] `git status --short` → clean

Skipping the approval desynchronizes next month's gate/shrink baselines from
what is actually live.
