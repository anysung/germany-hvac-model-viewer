# Netherlands Edition — Commercial Feasibility & Build-Readiness Report

Status: **DECISION REPORT — no code, configuration, or data was modified.**
Research performed 2026-07-17 (three parallel primary-source tracks in Dutch/English
+ a limited non-destructive data proof-of-concept). Repo facts as of commit `dd7ab13`.
Every load-bearing external fact carries its source URL and access date; facts are
tagged verified/secondary/unverified inline.

---

## A. Executive summary

**Verdict: CONDITIONAL GO.** A commercially credible, legally well-grounded,
maintainable Netherlands edition can be built on the proven canonical-baseline +
local-overlay architecture — with the **best data-acquisition and legal position of
any market so far**, but a **more volatile demand environment** and one unproven
technical variable (model-level match rate at scale) that should be resolved by a
bounded PoC before implementation is authorized.

- **Strongest evidence for:** the official RVO ISDE *meldcodelijst warmtepompen* is a
  monthly, structured, per-model device list (3,246 rows, 218 brands) that publishes
  **subsidy amounts per device** — richer than the UK PEL or Polish ZUM — and is
  served both as a month-stamped XLSX and via a clean public JSON API
  (`/api/rvo/v1/search-products/21`, verified working; 65 pages × 50 records). RVO
  offers **no official search tool** for it, and the one independent lookup site
  (meldcodezoeker.nl) was found broken. Dutch law *inverts* the government-database-
  right default in our favor (Databankenwet art. 8(2); Who 2024 grants a default
  right to commercial reuse). Two NL-specific data hooks no incumbent bundles: the
  **Bbl 40 dB outdoor-unit noise rule** (needs per-unit sound power — which our
  canonical data has) and the **2027 refrigerant cliff** (half the listed
  configurations disappearing; the list carries refrigerant + GWP per device).
- **Largest unresolved issues:** (1) model-level match rate between the meldcodelijst
  and the canonical catalogue is only sampled (~37–40% direct on 164 records,
  *before* alias mapping and the Poland-grade recovery machinery; brand-weighted
  overlap ≈ 72–77%); the meldcodelijst prints **no EPREL number and no ηs/SCOP/sound
  data**, so unmatched/native records depend on string-based EPREL bridging — the
  pivotal PoC. (2) Market demand is volatile: residential sales fell 27% in 2024
  after the 2026 hybrid mandate was scrapped, recovered ~9–13% in 2025; the 2026
  forecast spread is 106k–216k units; grid congestion becomes a structural brake
  from 1 July 2026. (3) Dutch-first UI is mandatory → full `NL_NL` dictionary +
  legal set is a PL-scale content effort.
- **Likely commercial value:** a real, currently unserved integration gap (specs +
  meldcode/amount + noise data + refrigerant/2027 status + comparison + data sheets)
  for ~5,500 installer firms, consultants and housing associations that already pay
  €0.5k–5k/yr for adjacent data/tooling (2BA, Uniec, Vabi).
- **Recommended decision:** CONDITIONAL GO — authorize the three named conditions
  (§O), then implement on the FR/PL pattern.

## B. Confirmed facts (each verified 2026-07-17 unless noted)

1. **ISDE** (Investeringssubsidie duurzame energie en energiebesparing) is live
   through 2031; €500M budget 2026; legal basis Regeling nationale EZ-subsidies
   H4 T4.5 (wetten.overheid.nl/BWBR0035474, consolidated 2026-07-01).
   Homeowners apply within 24 months AFTER installation (existing pre-2019 homes
   only, min €500, professional installation mandatory); businesses/VvEs apply
   BEFORE purchase. [rvo.nl/subsidies-financiering/isde + /woningeigenaren/warmtepomp + /zakelijke-gebruikers/warmtepomp]
2. **Meldcodelijst Warmtepompen**: month-stamped XLSX
   (`rvo.nl/sites/default/files/2026-07/Meldcodelijst Warmtepompen - juli 2026.xlsx`,
   downloaded and parsed) + JSON search API (verified). **3,246 rows; columns:
   MELDCODE, Fabrikant/Merknaam, Model, Vermogen (kW, "subsidiabel"), Subsidiebedrag,
   Subsidiebedrag 2e warmtepomp, NAAM_KOUDEMIDDEL, GWP, Categorie.** Categories:
   Lucht-Water 2,566 · Warmtepompboiler 371 · Grond-Water 227 · Water-Water 82.
   218 brands (Mitsubishi Electric 160, Daikin 113, Viessmann 85, Panasonic 80,
   Midea 79 …). Refrigerants: R32 1,246 · R290 1,191 · R410A 407 · …
   Updated monthly; devices enter via manufacturer application **with mandatory
   EPREL registration**; unlisted devices may still be subsidised via documentation
   (the list is an approval cache, not a strict gate); the only stated term is
   "Aan deze lijst kunnen geen rechten worden ontleend" — **no licence stated**.
   2026 amount formula confirmed by regression on the file (air-water: €1,025 base
   + €225/kW + €200 label bonus; 2nd unit €225/kW only).
3. **Air/air is not ISDE-eligible** (never was, per RVO reasoning: falls under
   air-conditioning Reg. 206/2012). From 2026 split air-water units with <3 kg
   charge AND GWP>750 are excluded (F-gas alignment).
4. **The 2026 hybrid heating mandate was officially scrapped** (rijksoverheid.nl
   document 2024-10-31: "Het huidige kabinet ziet af van de voorgenomen normering…").
   A 2029 hybrid minimum standard is a 2026 coalition *plan*, not law [secondary].
5. **Noise rule**: Bbl art. 4.107/4.108 — 40 dB limit at the plot boundary /
   neighbours' openable windows for newly placed outdoor units, measurement per
   Omgevingsregeling art. 5.59 [iplo.nl]. The official calculation tool is widely
   considered complex (NVKL built an e-learning; the industry association's own
   tool is members-only; two independent tools exist) — a validated data niche.
6. **Market (CBS official)**: all heat pumps incl. air/air — 2022: 401k, 2023: 457k,
   **2024: 393k (first decline)**; residential (association series): 2024 110k
   (−27%), 2025 ≈136k (all-electric 86k > hybrid 43k); 2026 forecast 106k–216k;
   installed base 1-in-12 homes. Causes of the 2024 drop: scrapped mandate, gas/
   electricity price ratio, lower ISDE amounts. Grid congestion: connection waiting
   list for small consumers from 2026-07-01. [cbs.nl 2025/19; warmte-pompen.nl;
   Trendrapport 2026 via warmte365.nl]
7. **Legal (strongest of all our markets)**: Who 2024 (in force 19-06-2024) grants a
   default right to commercial reuse of public-body information; **Databankenwet
   art. 8(2)** — no sui generis database right in government-produced databases
   unless expressly reserved (text verified on wetten.overheid.nl); RVO's open-data
   page: attribution not required unless stated (images excluded). EPREL API T&C
   (2024) expressly permit commercial comparison tools; forbid raw-data resale;
   require attribution and keeping local copies in sync. Wet Van Dam (auto-renewal)
   is consumer-only; NL VAT 21% with reverse charge via VAT ID (Paddle handles);
   KvK display duty applies only to NL-registered entities; English B2B T&C valid;
   EAA (in force 28-06-2025) has B2B and micro-enterprise carve-outs.
8. **Repo/infra**: no NL edition exists anywhere in the repository; the Firebase
   console already lists heatpumpdb.nl / www / heatpumpdb-nl.web.app as authorized
   auth domains; **no `heatpumpdb-nl` hosting site exists**; both .nl domains
   currently do not resolve (no DNS). The four existing editions share one
   country-profile architecture with a documented expansion checklist
   (docs/UPDATE_PIPELINE.md §5) exercised twice (FR, PL).
9. **PoC (performed, non-destructive, ~6 requests)**: the JSON API returns per-record
   brand/model/meldcode/category/amount/kW/refrigerant; facets give the full brand
   census in one call; 200-record sample matched against the canonical catalogue:
   60/164 space-heating records matched by exact/containment identity, 4 more by
   identity keys, 100 no direct trace (pre-alias); 36 were DHW boilers. Brand-level:
   19 of the top 33 NL brands are in the canonical catalogue directly, plus at least
   Haier/Hitachi/SPRSUN under corporate legal names (alias problem, known solution);
   entry-weighted brand overlap ≈72–77%. Dutch-native brands absent from canonical:
   Itho Daalderop (36), Nefit (20), Intergas (7), Quatt (6), WeHeat (5).

## C. Dutch market assessment

Structure: ~5,500 installation firms (Techniek Nederland ~6,000 members), acute
technician shortage (~20k), top-5 wholesalers (Technische Unie, Rensa, Wasco/Rexel,
Solar, Plieger) all standardized on 2BA/ETIM product data; Dutch-HQ manufacturers
(Remeha/BDR, Intergas/Rheem, Itho Daalderop) plus scale-ups Quatt and WeHeat;
housing associations committed to 450k gas-free rentals by 2034 (Nationale
Prestatieafspraken); energy companies running vertically integrated channels
(Vattenfall/Feenstra, Eneco rental hybrids). Demand drivers despite volatility:
gas-free new build (since 2018), refrigerant transition churn ("is this model still
available/eligible?" — configurations halved in 3 years), ISDE subsidy mechanics
(meldcode errors cause rejections — an explainer-site micro-industry exists), the
40 dB placement rule, and grid-connection sizing questions. Pain points map almost
one-to-one onto the product's existing feature set; the NL-specific additions with
real pull are subsidy-amount display, sound-power prominence, and refrigerant/GWP
status against the 2026/2027 bans.

## D. Regulatory and subsidy assessment (presentation rules)

| System | Nature | Present as | Hard rule |
|---|---|---|---|
| ISDE meldcodelijst | Product-level subsidy overlay (code + indicative amount) | Badge "ISDE-meldcode" + fields (meldcode, bedrag, 2e-wp bedrag, subsidiabel vermogen, koudemiddel/GWP, categorie), category filter | Amount is *indicative*; applicant/property conditions decide; absence from list ≠ ineligible (documentation route) → wording mirrors PEL/ZUM: never "not eligible" |
| SVVE | VvE scheme reusing the same list | Note on the ISDE badge | Same caveats |
| EIA Energielijst 2026 | Technology-level tax deduction (halogen-free refrigerant only) | Informational note only | Never per-model claims |
| Warmtefonds | Income-dependent 0% loan | Static note | Never per-product |
| 2029 hybrid standard | Coalition plan, not law | News content | State the 2026 scrapping as official fact |
| Bbl 40 dB noise | Placement rule | Sound-power field + explanatory note | Never mark a unit "compliant" — placement-dependent |
| BCRG kwaliteitsverklaring | BENG calculation values | Optional later overlay (NF-PAC pattern), confident matches only | No stated licence — verify before bulk reuse |
| BRL 100/200, BRL 6000-21, InstallQ | Installer-side | Notes only | Distinguish legal vs voluntary |

Eligibility taxonomy is explicitly separated in all copy: product (meldcode) ≠
installer (BRL/F-gas) ≠ property (pre-2019, boundary noise) ≠ application (before/
after purchase, 24-month windows) ≠ final approval (RVO decision).

## E. Product-data source inventory (condensed)

| Source | Authority | Coverage | Access | Automation | Legality | Role |
|---|---|---|---|---|---|---|
| RVO meldcodelijst (XLSX + JSON API) | Official | 3,246 devices, subsidy overlay fields | Public, monthly, month-stamped URL + API | **Trivial** (verified) | Who 2024 default reuse; no licence stated; "no rights derived"; facts-only + attribution; optional formal Who request | **Primary overlay** |
| Canonical catalogue (existing) | Own | ~7.1k EU products, full specs | Local | n/a | n/a | **Technical baseline** |
| EPREL (local snapshot + API) | Official EU | 45k+ HP records; ηs/capacity/noise | Local + API | Proven | T&C permit comparison tools; attribution + sync duty | Spec completion for natives |
| BCRG register | Official-ish (sector clearinghouse) | HP quality declarations (BENG values) | Public web | Moderate | No licence stated — needs clarification | Optional later overlay |
| HP Keymark / Eurovent directories | Certifiers | Certified models | Public | Moderate | Directory reuse unclear | Supplementary evidence |
| Manufacturer sites/portals (incl. Dutch brands) | Primary per brand | Model-level PDFs | Public | Hard at scale | Per-source; link-don't-host | Native-record evidence, linked docs |
| 2BA/ETIM | Sector datapool | 4M+ articles, logistics-oriented | Paid contracts (€2.1–5.1k/yr mfr side) | API/batch | Contractual | Not needed for launch; possible future partner |
| CBS / Trendrapport | Official / research | Market statistics | Public / registration | Easy | Open | Content, not product data |

## F. Product coverage estimate

Counting unit recommendation: **the meldcode entry** (device/combination as listed by
RVO) mapped onto the existing canonical/product identity — the same "one local id →
one product" rule as PEL/ZUM; DHW boilers (371) become native records exactly like
Poland's ZUM DHW extension class. Estimated composition of a launch catalogue:
canonical baseline ~7.1k products (unchanged, EU-presented) + ISDE overlay on the
matched subset + ISDE-native records for Dutch-only/non-BAFA brands. Evidence-based
range for **ISDE-linked products at launch: ~1,900–2,700 of 3,246** (59–83%) —
lower bound = sample direct-match rate + natives spec-completed via EPREL at PL-like
yields; upper bound = PL-grade recovery machinery outcome (PL closed at 83% of its
registry). The pivotal unknown is EPREL string-bridging yield for the ~500–900
non-canonical entries because the meldcodelijst prints no EPREL id (unlike ZUM).
Range presented as estimate, not fact; the §Q PoC resolves it.

## G. Data-schema gap analysis

Reusable unchanged: the entire 88-field neutral public schema from PL (identity,
performance, physical, component, EPREL link, listing overlay pattern). New
market-overlay fields needed (NL block, mirroring `zum_*`): `isde_meldcode`,
`isde_status` (confirmed/verification_required — never absent), `isde_amount_eur`,
`isde_amount_second_eur`, `isde_capacity_kw` (the *subsidiabel* value — kept separate
from our rated capacity; the RVO file itself warns they differ), `isde_category`,
`isde_gwp`, snapshot/date fields. Fields to surface more prominently for NL:
sound power (already held), refrigerant + GWP (GWP is new — available from the RVO
file per device and from EPREL). Fields NOT to introduce: per-model "Bbl compliant",
per-model EIA eligibility, energy-label class *from the RVO amount* (derive labels
from ηs as everywhere). Hybrid flagging: the list has no hybrid marker — do not
invent one; hybrids remain air-water products (note in copy), consistent with CBS
definitions.

## H. Competitive landscape

No direct paid competitor bundles selection + subsidy + compliance data. RVO: raw
XLSX only, no search UI. meldcodezoeker.nl: free, single-purpose, found broken
(0 products). Consumer comparison sites: lead-gen, shallow, no meldcode/sound/BENG
depth. 2BA/ETIM: entrenched, paid, logistics-oriented — a *standard*, not a
selection tool; long-term partner potential rather than competitor. BENG software
(Uniec €460–890/yr, Vabi): calculation tools consuming BCRG values — adjacent,
proves willingness to pay. Sound-compliance micro-tools: fragmented, single-feature.
Differentiation: the only place where a professional sees specs + meldcode + amount +
refrigerant/2027 status + sound data + comparison + branded PDF data sheets, in
Dutch, across 200+ brands.

## I. Commercial feasibility

Addressable: ~5,500 installer firms + consultants/engineers + housing associations +
manufacturers/wholesalers. WTP evidence: 2BA manufacturer contracts €2,150–5,070/yr;
Uniec 3 €460–890/yr; association tools membership-gated; trade press subscription-
based. Hypothesis (labelled): Professional/Team pricing at existing EUR levels is
plausible against those anchors; validation = 8–12 structured interviews (§Q).
Existing Professional/Team 3/Team 5 structure fits (installer firms are small;
Team 3 matches typical firm size). Same EUR pricing as other euro markets; 7-day
trial appropriate; before charging: coverage ≥ the §O threshold, native-reviewed
Dutch, and the ISDE disclaimer framework in place. Risk: free-data perception
("RVO list is free") — countered by integration value, exactly as DE (BAFA is also
free) has proven.

## J. Legal and compliance review

Confirmed: Who 2024 default commercial reuse; Databankenwet art. 8(2) no reserved
government database right absent express reservation (none found on the list); RVO
attribution optional (we attribute anyway + snapshot month); EPREL T&C compliance
plan (attribution, sync, no raw resale — all already practiced); VAT 21%/reverse
charge via Paddle; Van Dam consumer-only; English B2B T&C valid; EAA carve-outs.
Probable: BW 3:15d service-info duties (satisfied by existing imprint on the NL
site); link-don't-host for manuals. Requires Dutch counsel (non-blocking, before
paid launch): ZZP reflexwerking on auto-renewal; T&C terhandstelling mechanics;
exoneration drafting; optional formal Who reuse request to freeze terms.

## K. Technical feasibility (no changes made)

The expansion checklist is proven (FR: 3 commits; PL: 7 commits). NL specifics:
- Reuse unchanged: segmentation (23 kW — see below), eligibility rule, gate +
  LOCAL_OVERLAY family (add `ISDE` mapping), neutral-public-schema machinery
  (NEUTRAL_PUBLIC_MARKETS += NL), honeytoken system (new canary pair), listing
  resolver (add `ISDE` source), news pipeline (MARKETS + `_nl` fields), admin
  auto-discovery, Apple/Google auth (NL domains already authorized; Return URL
  unchanged), Paddle EUR catalogue (NL uses EUR — *simpler than PL*: subscriptions
  can be live at launch).
- New: `scripts/nl/` (fetch-isde.mjs — trivial vs ZUM: JSON API or monthly XLSX;
  parse; match-canonical-to-isde.mjs reusing the PL matcher primitives incl.
  containment/component/capacity resolution + committed isde-match-history.json;
  build-app-products-nl.mjs on the PL template incl. EPREL-enriched native
  records), `NL_NL`+`NL_EN` dictionaries, Dutch legal set, flag/icons/SEO entries,
  hosting site `heatpumpdb-nl` + targets + build:nl/deploy:nl, tests (loops +
  Dutch regexes, e.g. /nominaal vermogen|verwarmingsvermogen/).
- **23 kW rule:** keep unchanged. Dutch market context supports it (residential
  units cluster 3–16 kW; ISDE business rules change at 70 kW for label duty — a
  subsidy-administrative boundary, not a market-segmentation one; presented as a
  note, not a segment change). Cascades up to 500 kW exist on the business side —
  same treatment as everywhere (per-unit capacity governs).
- Effort by workstream: data pipeline S–M (easiest acquisition yet) · matcher M
  (no EPREL join key → string+capacity work) · i18n/content L (full Dutch, native
  review) · legal L-in-content/S-in-code · app config S · hosting/SEO S · tests M.
  Overall: comparable to PL minus the scraping pain, plus equal content load.

## L. Data-maintenance plan

Monthly cadence aligned with the existing attended run: fetch new month XLSX/API →
diff against committed match history → gate change-thresholds catch collapses (the
2027 refrigerant cliff will legitimately shrink the list — the shrink guard's
`--allow-shrink` + note flow covers it; entries removed from the list become
`review_required`, never "delisted" claims). Detection: month-stamp URL change +
row-count/facet drift. Workload estimate: monthly ~1–2h attended (same window as
DE/GB/FR/PL); quarterly: subsidy-copy verification against rvo.nl (amount formula
changes annually per Staatscourant — the 2027 scheme consultation closes
2026-08-21, a known upcoming change); annual: regulatory sweep. No source found
whose maintenance burden is disqualifying; the RVO source is the cheapest to
maintain of all five markets.

## M. Parity and gap matrix (NL vs DE/GB/FR/PL)

| Area | Classification |
|---|---|
| Market config, routing, hosting, admin, auth, billing (EUR) | Reusable with configuration (billing simpler than PL/GB) |
| Product data (canonical baseline) | Reusable as-is |
| Local overlay (ISDE) | New NL configuration on the shared overlay pattern (+ subsidy-amount fields = new shared-pattern extension, evidence-backed) |
| Native records (Dutch brands, DHW) | Reusable pattern (PL extension class) — coverage unresolved pending PoC |
| Energy labels / EPREL | Reusable as-is |
| Search/filters/compare/data sheets/PDF (incl. diacritics — Dutch needs no new glyphs) | Reusable as-is |
| Segmentation 23 kW | Reusable as-is (evaluated, no deviation) |
| Localization NL_NL/NL_EN + legal | Requires full new content (L) |
| SEO/sitemap/hreflang/PWA | Reusable with configuration |
| Pipeline/gates/tests/monitoring | Reusable with configuration + new NL suites |
| Custom domain | Requires site creation + owner DNS (domains pre-authorized in Firebase Auth) |
| Sound-rule content, refrigerant-cliff content | New NL-specific content (differentiators) |

## N. Risk register (top items)

| Risk | P | I | Mitigation | Blocks? |
|---|---|---|---|---|
| Model-match rate too low (no EPREL id in list) | M | H | §Q PoC with explicit threshold before build authorization | **Yes → condition 1** |
| Demand volatility (mandate scrapped; 106k–216k forecast; netcongestie) | M | H | Owner risk acceptance; position on structural drivers (refrigerant cliff, noise rule, housing associations); EUR billing live at launch to test demand early | **Yes → condition 2 (decision)** |
| Free-data perception vs paid product | M | M | Integration value; DE precedent (BAFA free, DE edition sells) | No |
| ISDE scheme changes (2027 consultation; annual amount changes) | H | M | Amounts labelled indicative + month snapshot; quarterly copy verification | No |
| Reuse terms never formalized ("no rights derived", no licence) | L | M | Who 2024 + art. 8(2) defaults favor us; facts-only + attribution; optional formal Who request | No |
| Dutch content quality | M | M | Native-speaker review before paid launch (same as PL follow-up) | No |
| 2BA/ETIM ecosystem lock-in for installers | L | M | Different job-to-be-done (selection vs logistics); partnership option | No |
| Legal drafting (ZZP reflexwerking, T&C mechanics) | L | M | Dutch counsel before paid launch (non-blocking for build) | No |

## O. Go/no-go decision

**CONDITIONAL GO.** Conditions to convert to GO:
1. **Coverage PoC passes:** full 65-page enumeration (trivial, ~2 min of polite API
   calls) + PL-grade matching + EPREL string-bridge for natives achieves
   **≥60% of the 3,246 entries as confirmed-or-spec-complete products** with the
   unresolved remainder honestly classified (the PL machinery reached 83% on a
   harder source; falling materially below 60% here would signal the missing EPREL
   join key is decisive and demand a rethink — e.g. requesting EPREL ids from RVO
   or manufacturer outreach first).
2. **Owner accepts the market-timing risk** (volatile demand, scrapped mandate,
   netcongestie) — a business judgment, not a research gap.
3. **Dutch localization plan** (native review arranged for legal + funding copy
   before paid launch; build can start with my Dutch draft as PL did with Polish).
Optional (recommended, non-blocking): file a formal Who-2024 reuse request to RVO to
freeze terms in writing; Dutch counsel review of T&C before charging NL customers.
NO-GO triggers checked and absent: no legal barrier, no inaccessible primary source,
no disqualifying maintenance burden, no entrenched direct competitor.

## P. Evidence-based implementation plan (post-conditions)

Phase 0 — coverage PoC (S, the condition-1 gate; feasibility-workspace style, no
production artifacts) → Phase 1 — pipeline: scripts/nl fetch/parse/match/build +
gate/canary/orchestrator wiring (S–M; acceptance: gate green, counts reconciled,
match report reviewed) → Phase 2 — edition: profile/market/i18n NL_NL+NL_EN/legal/
flag/SEO/icons (M–L; acceptance: build:nl green, e2e Dutch regex suite green,
BAFA-leak sweeps green — note NEUTRAL_PUBLIC_MARKETS from day one) → Phase 3 —
hosting/news/domain: site creation, targets, MARKETS NL, first news run, DNS owner
action (S) → Phase 4 — verification + publication: full matrix, upload, approve,
atomic deploy (S) → Phase 5 — paid-launch gate: native review, counsel items,
demand validation interviews (M, partly external). Critical path: Phase 0 → 1 → 2;
content (Phase 2 dictionaries) is the schedule driver, as in PL.

## Q. Immediate next-action package

1. **First action:** run the Phase-0 coverage PoC (bounded: 65 API pages, matching
   only, no production writes) and report the rate against the 60% threshold.
2. First five tasks: (a) the PoC; (b) draft the formal Who reuse request text for
   owner sign-off; (c) inventory Dutch-native brands' EPREL presence (local
   snapshot query); (d) verify BCRG field-level content (one detail page) for the
   later overlay decision; (e) terminology map finalization against RVO/BCRG usage.
3. Owner decisions: conditions 2–3 above; whether to send the Who request;
   heatpumpdb-nl site creation timing; validation-interview outreach approval
   (external contact was out of scope this phase).
4. Accounts/permissions/documents: none new for build (Firebase/gcloud suffice);
   Dutch counsel engagement for paid launch; DNS access at the .nl registrar.
5. First safe technical PoC: (already done) API schema + sample match — next is
   the full-enumeration PoC of item 1.
6. First data-source PoC: (already done) XLSX parsed + JSON API verified.
7. First commercial validation: 8–12 interviews (installers ×4, consultants ×3,
   housing association ×2, wholesaler/manufacturer ×2) testing the integration-gap
   hypothesis and price anchors; proceed-signal: majority confirm weekly selection
   tasks + willingness to trial; warning: "2BA/wholesaler data is enough for us".
8. First legal question: confirm no copyright/database-right reservation notice
   inside the monthly XLSX releases (check each ingest) + send the Who request.
9. Must NOT begin yet: production ingestion, hosting-site creation, dictionary
   build-out, any deployment, external outreach.
10. Authorization condition: conditions 1–3 of §O confirmed → implementation
    proceeds on the phase plan without further approval gates except paid launch.

## R. Source register (principal entries; all accessed 2026-07-17)

RVO ISDE hub + warmtepomp pages + meldcodelijsten + wat-wijzigt-er-2026 + wet-en-
regelgeving (official, NL) · Meldcodelijst XLSX juli 2026 (official file, parsed) ·
rvo.nl JSON API /api/rvo/v1/search-products/21 (official, tested) ·
wetten.overheid.nl BWBR0035474 (ISDE legal basis) + BWBR0010591 Databankenwet art. 8
(official, text verified) · rijksoverheid.nl 2024-10-31 normering-vervallen document
(official) · iplo.nl geluid-bouwwerkinstallaties (official) · CBS 2025/19 heat-pump
statistics + maatwerk table (official) · warmte-pompen.nl sales pages (association)
· Trendrapport 2026 via warmte365.nl/vakbladwarmtepompen.nl (secondary) · bcrg.nl
(official-sector) · 2ba.nl rates/contract pages (official-2BA) · uniec3.nl tarieven,
vabi.nl (official-vendor) · minbzk.github.io Who 2024 Handleiding + rvo.nl open-data
+ english.rvo.nl copyright (official) · EPREL API T&C PDF (official EU) ·
eerstekamer.nl 36380 EAA implementation (official) · autoriteitpersoonsgegevens.nl,
communicatierijk.nl TW 11.7a (official) · aedes.nl prestatieafspraken (official-
sector) · installatie.nl, ewmagazine.nl, simpelsubsidie.nl, meldcodezoeker.nl,
nvkl.nl, warmtepompgeluid.com (secondary/evidence-of-need). Reliability notes and
unverified items are flagged inline throughout §§B–L.

## S. Open questions

1. Full-population match rate (Phase-0 PoC — the decision variable).
2. EPREL coverage of Dutch-native brands (local query, cheap).
3. Historical meldcodelijst archive availability (only current month published).
4. BCRG field-level content + reuse terms.
5. 2029 hybrid-standard legislative trajectory (watch item).
6. Consumentenbond/2BA installer-side pricing details (competitive fine print).
7. ZZP reflexwerking + T&C mechanics (Dutch counsel).
8. Willingness-to-pay validation (interviews — requires owner authorization for
   external contact).
9. Whether RVO would add EPREL ids to the public list on request (would upgrade
   matching to PL-grade precision overnight — worth asking in the Who request).
