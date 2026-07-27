# HeatPump DB — Project Rules

> **Brand (Jul 2026):** The app brand is **"HeatPump DB"** (capital P, one space before "DB").
> Never introduce the old "HeatpumpIQ" name in UI text. Logo: use `BrandLogo` /
> `WavingFlag` from `src/components/BrandLogo.tsx` (brand assets in `brand-assets/`,
> colors documented in `brand-assets/README.md`).
> **The artwork has ONE source: `src/components/brandSvg.ts`.** The React
> components and the PDF data sheet (`hpiq/pdf/brandArtwork.ts` rasterizes the
> same SVGs at print resolution) both read from it. NEVER redraw the mark or the
> flag by hand for a new surface — that is exactly how the PDF ended up with a
> different circle and a square flag (Jul 2026). The flag is a **waving cloth**,
> never a rectangle. Documents render it with `animated={false}`.

> **UI (Jul 2026):** The user-facing app is the **hpiq** design (`src/hpiq/`, spec in
> `design_handoff_heatpumpiq/README.md` — authoritative UI spec). The legacy components
> (`HeatPumpApp.tsx`, `ResultsTable.tsx`, `NewsView.tsx`, etc.) were **removed** in the
> Jul 2026 cleanup; their layout rules no longer apply. The Admin dashboard lives in
> `src/components/admin/` + `AdminDashboard.tsx`.

---

## 1. Architecture Facts

- Entry: `src/index.tsx` → `src/App.tsx`. Views: auth surface (`src/components/auth/AuthShell.tsx`),
  main app (`src/hpiq/HpiqApp.tsx`), admin (`src/components/AdminDashboard.tsx`).
- Two parallel i18n systems, both live: `src/translations.ts` (auth + admin) and
  `src/hpiq/i18n.ts` (main app: EN/DE + GB + FR_FR/FR_EN + PL_PL/PL_EN + IT_IT/IT_EN market dictionaries). Add
  strings to the matching one. The GB edition is English-only and always serves the
  GB dictionary — the DE dictionary is Germany-market *content*, not a translation.
- Country-specific UI semantics in hpiq go through `src/hpiq/market.ts` (derived from
  `ACTIVE_COUNTRY`): registry id prefix (BAFA/MCS), verify URLs, funding source links,
  UI languages. Do not scatter `code === 'GB'` checks across pages.
- Country config is centralized in `src/config/countryProfiles.ts` (`ACTIVE_COUNTRY`,
  resolved from `VITE_COUNTRY_CODE`). New-country work goes there — flag, dataset paths,
  subsidy labels all derive from it. Do not scatter country logic.
- Product data is built to `public/data/*.json` (gitignored) but is **NOT served
  publicly** (anti-scraping, Jul 2026): hosting deploys exclude `data/**`
  (firebase.json) and the app downloads datasets through the Firebase Storage
  SDK from the auth-protected bucket `gs://heatpumpdb-datasets`
  (`storage.rules`: approved accounts only; dev server still reads the local
  files). Ship datasets with `node scripts/upload-datasets.mjs` — it appends
  ONE fictitious CANARY record per file (`scripts/canary/canary-records.json`,
  honeytokens proving extraction; keep ids stable, never mention them publicly).
  The shrink guard reads live counts from the bucket via gcloud and subtracts
  the canary. robots.txt disallows `/data/` and opts out AI-training crawlers.
  **App Check** (reCAPTCHA Enterprise, `VITE_RECAPTCHA_SITE_KEY`) is initialized
  in `src/firebase.ts` and runs in MONITORING mode on every service — Cloud
  Storage enforcement was TURNED OFF 2026-07-18 after it silently blocked
  legitimate logged-in users (empty catalogue, no error): reCAPTCHA scores are
  domain-reputation-based, so a fresh market domain (heatpumpdb.pl) failed the
  0.5 threshold even for real users, and the B2B audience (corporate
  VPN/proxy) is structurally low-scoring. The access gate is the approval
  system + storage.rules + canaries + terms, not the bot score. Do NOT
  re-enforce on a hunch — only with observed-abuse evidence (canary hit,
  download-pattern anomaly), and never during a market launch. **When adding a
  market domain, THREE per-domain allowlists must be updated** (PL hit ① and ②
  — empty catalogue; IT hit ③ — auth/unauthorized-domain on login, fixed
  2026-07-18): ① the reCAPTCHA key's allowed domains (gcloud recaptcha keys
  update --web --domains=<FULL list — it REPLACES>), ② the datasets
  bucket's CORS origins — source of truth `scripts/infra/storage-cors.json`,
  applied with `gcloud storage buckets update gs://heatpumpdb-datasets
  --cors-file=scripts/infra/storage-cors.json` (the browser cannot read
  Storage responses from an origin missing there, even though the server
  logs a 200), ③ Firebase Auth authorized domains (no gcloud command — PATCH
  identitytoolkit admin/v2 config `authorizedDomains` with an access token +
  x-goog-user-project header, or Firebase console → Auth → Settings). Firestore was always UNENFORCED (login
  safety); e2e tests use a registered debug token via
  `window.FIREBASE_APPCHECK_DEBUG_TOKEN` (dev server auto-generates one).
- Registration consent: every signup path (form + first-time social) must pass
  the account/data-use terms popup (one account per person; no data
  extraction) — `termsAcceptedAt` is stamped on the profile. The same terms
  are displayed on the Account page above the legal notice. Do not remove
  either without owner sign-off.
- hpiq global nav is **60px** tall; pages size themselves with `calc(100vh - 60px)` —
  keep in sync if the header changes.
- **Print / PDF: we GENERATE a real PDF — never print the DOM.** Both the Print and
  PDF buttons go through `src/hpiq/pdf/dataSheetPdf.ts` (jsPDF: exact A4, own
  margins/pagination/watermark) + `deliverPdf.ts` (mobile → OS share sheet, which is
  the only way to get a PDF on iOS; desktop → PDF opens with its print dialog, or
  downloads). DOM printing was tried every way and CANNOT work cross-device: WebKit
  (iOS Safari, iPhone *and* iPad) lays print out against the meta-viewport width, not
  the paper, and ignores `@page { margin }` → clipped, edge-to-edge sheets; a web page
  cannot force the print dialog's margins/scale and iOS has no margin controls. Do not
  reintroduce `window.print()` on the document.
  jsPDF's standard font is WinAnsi — keep `ascii()` in dataSheetPdf.ts (folds `η`→
  `eta-s` and U+2212 `−`→`-`, etc.), or DE/FR sheets get mojibake.

## 2. Data Pipeline (BAFA → app)

**Regular updates run through `node scripts/update-all.mjs`** (dependency-graph
orchestrator: DE first, then FR/GB/PL derive from the built DE datasets; optional
matcher overlays; freshness + shrink-guard verification; `--deploy` ships all
sites in one atomic call). Never hand-run builders for production updates —
see `docs/UPDATE_PIPELINE.md` for the graph, schedule (monthly, 2nd, 03:00
Europe/Berlin, attended) and the country-expansion checklist.
`build-master-seed` is SELF-ACCUMULATING: it unions previous master seeds so
cleaning parsed/raw folders never drops products (regression 2026-07-12).

`scripts/bafa/`: `fetch-bafa-raw` → `parse-bafa-raw` → `build-master-seed` →
`build-app-products-from-master-seed` (auto-selects newest `data_sources/bafa/master_seed/YYYY-MM/`).
- `bafa_id` comes from BAFA raw (`anlagennummer`) and flows through automatically.
- Overlay source: `scraper/pricing/output/dataset-enriched-full.json` (installation_type,
  uuid — price fields are gone and guarded against; do not reintroduce).
- Diff reference baseline snapshot: `2026-03` (keep `data_sources/bafa/raw/2026-03` + `parsed/2026-03`).
- EPREL matching (DE): `match-bafa-to-eprel` attaches `eprel_registration_number` as a
  **link only** — no performance values are copied; energy-label classes stay derived
  from BAFA ηs per EU 811/2013 and the data sheet says so — keep that honesty.
- Raw snapshot folders may be cleaned from disk; per-snapshot fetch timestamps are
  accumulated in the committed `data_sources/bafa/fetched-at-index.json` (the builder
  merges live `raw/_meta.json` values over it and writes it back — do not gitignore it).
- **UK pipeline** (`scripts/ofgem/`) — **canonical baseline + PEL listing overlay
  (v3.0, Jul 2026; `docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md`)**:
  `fetch-pel-xlsx` → `parse-pel-xlsx` → `match-canonical-to-pel` → `build-app-products-gb`.
  The UK catalogue IS the canonical (DE-derived) catalogue — run the DE builder first.
  The Ofgem PEL is an **overlay only**: it confirms listing, and never creates a
  product, supplies a spec, changes a capacity/segment, or removes a product when a
  match fails. The PEL publishes NO performance data, which is exactly why it can
  never be a technical source: the old PEL-first build (v2.1) published 4,422 PEL rows
  and left 2,134 of them with no capacity, no segment and a blank data sheet.
  Listing states: `confirmed` → "PEL Listed" + PEL id; `review_required` (was
  confirmed, stopped matching — a matcher regression is likelier than a delisting) and
  everything else → **"PEL verification required"**. **Never "Not on PEL"** — a failed
  match is a fact about our matching, not about the list. Only a market that OWNS its
  registry (DE) may say "not listed". Confirming evidence: exact model, approved alias,
  exact component identity — never fuzzy, never an ODU-only overlap (those go to a
  review queue). Confirmed mappings persist in the committed
  `data_sources/ofgem_pel/pel-match-history.json`. Official manufacturer mappings enter
  via `data_sources/manufacturer_cross_reference/canonical-to-pel.json` (no code change).
  The old PEL-first matchers live in `scripts/ofgem/internal/` — audit only, never wire
  them back into a builder.
- **PL pipeline** (`scripts/pl/`) — canonical baseline + **Lista ZUM listing overlay**
  (PEL rules verbatim): `fetch-zum.mjs` (public grid + detail pages, facts only, no
  attachments, ≥1.5s politeness) → `parse-zum.mjs` → `match-canonical-to-zum.mjs` →
  `build-app-products-pl.mjs`. Confirming methods only (manufacturer_official,
  eprel_exact/bridge, exact model/code, capacity-resolved identity, registry-published
  alias); fuzzy/family/ODU-only never confirm. States: `confirmed` → "Na liście ZUM" +
  ZUM id; everything else → "Weryfikacja ZUM wymagana" — **never "not on ZUM"**.
  Confirmed mappings persist in committed `data_sources/lista_zum/zum-match-history.json`;
  official mappings enter via `data_sources/manufacturer_cross_reference/canonical-to-zum.json`.
  PL additionally publishes **spec-complete PL-market extension records** (ZUM entries
  with no canonical counterpart, mostly DHW): `performance_source='ZUM_REGISTRY'`,
  `source_id 'PL-<zum id>'`, admitted ONLY through the shared Data-Sheet eligibility
  rule — never a weaker standard, and they never travel to other markets. ZUM data is
  used facts-only (no IOŚ-PIB logo/branding; source attribution + snapshot dates shown).
- **IT pipeline** (`scripts/it/`) — canonical baseline + **GSE Conto Termico listing
  overlay** (PEL rules verbatim): `fetch-gse.mjs` (three public PDF catalogues,
  III.A/III.B/III.E, stable URLs, facts only) → `parse-gse.mjs` (pdftotext-based
  tolerant parser; strict accounting on III.A) → `match-canonical-to-gse.mjs` →
  `build-app-products-it.mjs`. Only catalogue **III.A** can confirm: III.B lists
  hybrid COMBOS (never evidence for a standalone HP — ODU-overlap rule), III.E
  (DHW) has no canonical counterpart. Confirming methods only (manufacturer_official,
  ODU+IDU component identity, monobloc identity — GSE entry AND canonical product
  both IDU-free, exact model/code, capacity/spec-resolved); fuzzy/family/ODU-only
  never confirm; voltage/phase/refrigerant variant markers are contradiction guards.
  States: `confirmed` → "Nel catalogo GSE"; everything else → "Verifica catalogo GSE
  richiesta" — **never "not in the catalogue"**. The catalogue publishes NO per-row
  id — `gse_entry_key` is OUR deterministic key (history/integrity only, never shown
  as an official id) and no listing id is ever displayed. **IT additionally publishes an
  Italy-only GSE-NATIVE LAYER** (owner decision 2026-07-18): in-scope catalogue
  entries (air/water + ground/water families ONLY — never air/air, VRF, water/air
  or gas-driven) with no canonical counterpart become IT-edition records
  (performance_source='GSE_CATALOGUE', source_id 'IT-<gse entry key>', method
  'gse_native'), admitted through the ITALY-SPECIFIC publication tier
  `gseNativeEligibility` (scripts/lib/data-sheet-eligibility.mjs): identity +
  type + capacity + seasonal performance (ηs/SCOP) + provenance — a name alone
  is still refused; the GLOBAL rule is unchanged for every other layer/market.
  Honest basis mapping: dual rating rows with DISTINCT ηs = the 35/55 °C
  application pair (higher ηs = 35 °C — physical ordering verified on 5,698/5,698
  German pairs, zero inversions; EU 813/2013), single rows only via an explicit
  "LWT 35/55" model label; everything else stays in gse_ratings verbatim with
  declared_capacity_kw (basis unstated) for the 23 kW split — 35/55 fields are
  NEVER fabricated (builder + architecture tests enforce). Refrigerant only when
  printed in the catalogue row itself (…R32/R290). These records never travel to
  other markets (gate blocks GSE_CATALOGUE outside IT). Data sheet renders a
  native-aware sparse layout (no structural-null COP rows) + a "Valori
  dichiarati nel catalogo GSE" section; the products page discloses the source
  mix (countGse line). Confirmed mappings
  persist in committed `data_sources/gse_ct/gse-match-history.json`; official
  mappings enter via `data_sources/manufacturer_cross_reference/canonical-to-gse.json`.
  GSE data facts-only (no GSE logo; source attribution + snapshot dates). No
  "listed only" filter (422/7,106 confirmed would be a discovery trap — GB rule).
  Match-rate root-cause audit (2026-07): docs/IT_GSE_MATCHING_AUDIT.md +
  scripts/it/audit-gse-*.mjs — 60% of the catalogue is out of scope (air/air;
  the canonical baseline is 100% air/water), 18% are brands with zero canonical
  presence, 16% newer/absent hardware; parser quality contributes zero. Rule
  changes must be measured through the audit's mode flags before adoption.
- **FR pipeline** (`scripts/fr/`): `build-app-products-fr.mjs` derives the France
  catalogue from the **built DE datasets** (same hardware sold in both markets — run the
  DE builder first) → `public/data/products-fr*.json`. German type strings are localised
  (Luft/Wasser → Air/Eau); specs are framed as `performance_source='BAFA_REFERENCE'`.
  MaPrimeRénov'/CEE are **criteria-based** — the app never claims eligibility. NF PAC
  references come from an optional overlay (`data_sources/nf_pac/matching/`) and are
  shown ONLY on confident matches — never guessed. FR UI is bilingual FR|EN
  (FR_FR/FR_EN dictionaries in `src/hpiq/i18n.ts`).
- Cloud Function (`google_cloud_function/index.js`) is deployed separately via its own
  `deploy.sh`; it owns the news pipeline. News/policies are market-parameterized
  (`MARKETS`: DE + FR + GB + PL → `countries/<code>/news|policies`); a manual run can be
  narrowed with `?newsOnly=true&countries=GB`. GB articles are English-only (no `_de`
  fields); FR articles carry `_fr` fields.
  News is **append-only** (press-agency format, byline "HeatPump DataBase (Europe)",
  date-based ids `news-YYYYMMDD-<cc>-NNN`) — never reintroduce collection deletion for
  news; policies are still replaced each run. The app shows a searchable archive of all
  past articles and `/?article=<id>` share deep links.
  Redeploying with plain `gcloud functions deploy` (no env flags) preserves the
  function's env vars; `deploy.sh` overwrites them — only run it with real secrets exported.

## 3. Market News Image Rules (google_cloud_function/index.js)

- **Every news article must always display an image** — never leave the image slot empty.
- **Never let AI (Gemini) generate or hallucinate image URLs** — images are assigned
  deterministically at PUBLISH time from the owner-curated LOCAL pool
  `public/news-images/` (slugs in `manifest.json`; ships with every market build;
  imageUrl is root-relative `/news-images/<slug>.webp`). Rules (2026-07-19, mirrored
  in `google_cloud_function/index.js` and `scripts/news/backfill-news-images.mjs` —
  keep in sync): subject = category field + keyword nudges; POLICY articles use the
  market's OWN `<cc>-policy-*` set (images carry that country's flag — NEVER cross
  markets); a national-programme mention outranks an incidental EU reference and only
  genuinely EU-level policy rotates the three `eu-policy-*` images; non-policy uses
  the COMMON pools; within one (market, month) no file twice; rotation walks each
  pool with a running counter; exhausted pool → least-used (an article is never
  imageless).
- The hpiq NewsPage renders `imageUrl` assigned at write time by the function
  (press-format reader: masthead, eyebrow, serif headline, byline
  "HeatPump DB <Country> Editorial Team" + country icon, PDF/Print/Email action bar —
  PDF and Print both go through the generated `pdf/newsArticlePdf.ts`, never
  window.print()).

## 4. General Rules

- **Canonical baseline + local overlay (permanent — `docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md`).**
  Every country publishes the SAME canonical technical products (the German dataset,
  presented neutrally). A local registry is only ever a listing OVERLAY:
  canonical → match → attach status. Never local-registry-first with specs
  reconstructed afterwards. Public products must pass ONE shared Data Sheet
  eligibility rule (`scripts/lib/data-sheet-eligibility.mjs`: manufacturer, model,
  canonical id, type, ηs, a rated capacity, a segment, and ≥2 of 5 measured fields) —
  applied in the DE canonical builder, inherited by every market.
- **Datasets are generated, then GATED, then published.** `node scripts/dataset-gate.mjs`
  compares the candidate with the committed `data_manifests/production.json` and blocks
  a bad update (zero/truncated parse, count or eligibility collapse, duplicate ids,
  local-match collapse, segment shift, German status fields outside Germany).
  `upload-datasets.mjs` runs it and refuses to publish if it fails; override needs
  `--override --reason="…"` and is recorded. After a successful upload:
  `node scripts/dataset-gate.mjs --approve`.
- **Segmentation + European presentation (permanent — `docs/EUROPE_DATA_AND_PRODUCT_SEGMENTATION_PRINCIPLES.md`).**
  The residential/commercial split is the app's OWN rule, identical in every country:
  rated capacity **≤ 23 kW residential, > 23 kW commercial** (never `>=`), missing
  capacity → **unclassified** (never silently residential). One source:
  `src/config/segmentation.ts`; the whole pool is re-split at load time because the
  dataset FILES are split by source, not capacity (that is why UK Commercial was
  empty). The capacity the UI shows/sorts/filters is the same one the split uses
  (`HpVM.ratedKw`). **The word "BAFA" — and the source country — may appear only on
  the German site**; elsewhere records are "European reference" (provenance stays
  internal). Local listing status comes only from the market's OWN list via
  `src/hpiq/listing.ts` (DE→BAFA, GB→PEL, FR→none, PL→ZUM, IT→GSE Conto Termico catalogue; never inferred across markets),
  and a filter is offered only where it actually divides the catalogue
  (`searchCapabilities.localListingFilter`). Tests: `tests/segmentation.unit.mjs`,
  `tests/products-segmentation.e2e.mjs` (fails if BAFA appears on GB/FR pages).
- Refrigerant filtering always uses `.includes()` contains logic (values like
  `R290(estimated)` must match), never exact match.
- **Auth flow (2026-07-27 program): 7-day in-app free trial, no payment method.**
  Two modes, switched by `VITE_BILLING_FN_URL` (src/config/env.ts):
  - **Trial flow** (URL set): registration creates a `pending` profile; the
    server function `finalizeSignup` (google_cloud_function_billing/) activates
    it after **email verification against the Firebase Auth SERVER record**
    (social = provider-verified) + required consents, and grants ONE 7-day
    trial per email service-wide (`emailRegistry`, kept 1 year after deletion,
    Firestore TTL). Day 8 without payment → server rules close access
    (`accessUntilTs` on user/org; storage.rules + firestore.rules
    `isEntitled()`). Paddle prices carry NO trial — checkout charges
    immediately; only the billing webhook / admin / grant redemption ever
    extend the window. **Fail-open principle (binding): refunds, past_due,
    chargebacks, webhook/API errors NEVER auto-block; access ends only on
    natural expiry or confirmed final cancellation.** See
    docs/TRIAL_SUBSCRIPTION_GATE.md (launch checklist before reopening
    registration).
  - **Legacy flow** (URL unset — current production): pending profile + manual
    admin approval, as before.
  Social sign-in must never bypass the consent gate in either mode. Team trial
  is anchored to the team ADMIN alone (trialing org may exist BEFORE payment;
  members inherit the admin's window; no extension by member joins).
- Build: `export PATH="/Users/christophersung/.nvm/versions/node/v20.19.6/bin:$PATH" && npm run build:de` (DE, `dist/`)
  or `npm run build:uk` (GB, `VITE_COUNTRY_CODE=GB` → `dist-uk/`).
- Deploy: multi-site hosting — **always use a named target**, never bare
  `firebase deploy --only hosting` (it deploys every target).
  `npm run deploy:de` → site `gen-lang-client-0324244302` (heatpumpdb.de);
  `npm run deploy:uk` → site `heatpumpdb-uk`; `npm run deploy:fr` → `heatpumpdb-fr`;
  `npm run deploy:pl` → `heatpumpdb-pl` (www.heatpumpdb.pl);
  `npm run deploy:admin` → `heatpumpdb-hub` (unified ops console, noindex,
  VITE_APP_MODE=admin, admin-role gate — heatpumpdb.click attachable later).
  Targets are mapped in `.firebaserc`; per-target config in `firebase.json`.
- Billing is web-only via Paddle (merchant of record) — no app-store
  distribution. **Subscription program (Jul 2026): Professional / Team 3 /
  Team 5 × monthly / 6 months / annual** — single source of truth is
  `src/config/subscriptionPlans.ts` (prices VAT-excl, 7-day trial on every
  Paddle price, per-term price ids via `VITE_PADDLE_PRICE_*`; unset =
  'coming soon'). Operating rules: plan/term/seats are FIXED during a paid
  period — changes apply at the NEXT RENEWAL only (`subscriptionChangeRequests`,
  applied from the admin Billing page); team member replacement is always
  allowed and never touches Paddle; team trials are anchored to the admin's
  checkout (one end date per org). Entitlements (`user.subscription`) are
  written ONLY by the billing webhook, an admin, or the rules-validated
  free-grant redemption — never plain client code. Teams live in
  `organizations` (owner manages seats, never plan/seatLimit); free
  promotions in `freeAccessGrants` (admin Billing page registers email +
  plan + period → account auto-approves and gets the plan at registration
  or immediately if it exists).
- Admin console: unified Overview = live per-market status + action alerts;
  the actual work (approvals, support, subscriptions) happens in per-market
  workspaces and the Billing page. Admin UI languages are **EN | KO only**
  (adminI18n.ts, sidebar text buttons) — never reintroduce German there.
