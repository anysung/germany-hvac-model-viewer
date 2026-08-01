# Poland ZUM Product-Database Commercial Feasibility Test — Methodology

Prepared 2026-07-17 (preparation window; external test gated to ≥ 2026-07-20).
Decision question: can ≥ ~50% of the relevant active ZUM heat-pump population become
**specification-complete, commercially usable** product records — via confirmed
canonical matches (Path A) or independent authoritative specifications (Path B)?
A model name alone is NOT a usable product.

## 0. Re-verification step (first action on/after 2026-07-20)

Re-fetch and record (URL + timestamp): ZUM Regulamin version in force; the
category/class population counts from the public filter UI (`bepub/ben001.aspx`);
the removed/suspended tab; the Czyste Powietrze condition that ZUM listing is
mandatory (incl. the 20.07.2026 advance-invoice rule that takes effect the same
day the test window opens). Compare against the 2026-07-16 evidence (prior session).

## 1. Standards (fixed before measurement)

### Data Sheet eligibility — the production standard, applied verbatim
`scripts/lib/data-sheet-eligibility.mjs` (inspected 2026-07-17): REQUIRED =
manufacturer, model, canonical id, type, ηs(35 °C); a rated capacity via
CAPACITY_CHAIN (power_35C → design35 → power_55C → design55); resolvable segment
(23 kW rule, `> 23` commercial, never `>=`); ≥ 2 of 5 core measured fields
(refrigerant, SCOP, COP A7/W35, COP A2/W35, outdoor sound power).
**Path B products are evaluated against exactly this rule** — with one honest
caveat to be reported, not papered over: ηs(35 °C) is REQUIRED by the rule, while
ZUM/EPREL publish 55 °C data primarily and 35 °C only where tested. A Path B
product with ηs(55 °C) but no 35 °C figure FAILS the production gate as-is; the
report must state how many fall in that bucket rather than silently relaxing the rule.

### Path A — confirmed canonical match (counts toward usable coverage)
Confirming methods only; every confirmation must pass sanity checks; anything
weaker is `candidate` (manual review) and does NOT count:
- **M1 `eprel_exact`** — ZUM's published EPREL number equals a canonical record's
  `eprel_registration_number`, AND no contradiction in type, capacity, class.
- **M2 `eprel_bridge`** — ZUM EPREL number → local EPREL snapshot record →
  exact-model identity (compact/identityKeys) against canonical, unique, sane.
- **M3 `exact_model`** — normalized exact model identity
  (`pel-match-lib.mjs` `compact`/`identityKeys`, `isStrongCode`) with matching
  manufacturer and no `numericConflict`, unique target.
- Explicitly NOT confirming (candidate/review only): fuzzy similarity, family/
  typoszereg-only, manufacturer+capacity, shared-ODU-only, EPREL matches where the
  ZUM record is a package but EPREL covers one component, one-EPREL-many-subtypes,
  any capacity/class/type contradiction.

Sanity checks per confirmation: type family consistent (air↔air, ground↔ground);
rated 55 °C capacity within ±15% where both sides publish one (ZUM rated output is
55 °C moderate-climate); energy class at 55 °C within one band of the canonical
ηs-derived class; refrigerant non-contradictory where visible. Any failure ⇒
`conflict`, not confirmed.

### Path B — independently specification-complete (counts toward usable coverage)
For entries with no confirmed canonical match: authoritative sources only —
official manufacturer site/product sheet/manual (PL or EU), EPREL record, public
ZUM product documentation, accredited test report, HP Keymark / EHPA Q / Eurovent
certificate. Retailer/reseller/aggregator pages are discovery leads only.
A Path B product must reach the production eligibility rule above with exact
identity (manufacturer, exact model/system configuration incl. IDU/ODU package
where applicable), traceable source URLs, and no unresolved conflict.
Local asset: the complete EPREL 2026-07 heat-pump snapshot (45,623 records) is on
disk — EPREL-based Path B evidence requires no external calls.

## 2. Population discovery

Primary denominator: **unique active ZUM heat-pump products/configurations**, by
unique ZUM ID, across categories 2.1–2.5, with the higher-efficiency air/water
category (2.2) deduplicated against 2.1 by ZUM ID (2026-07-16 filter evidence:
2,615 air/water incl. classes A+/A++/A+++; ground 442; DHW 39; air/air 1 ⇒
expected unique active N ≈ 3,100, to be established exactly).
Separately counted: suspended/removed tab (historical), family (typoszereg)
entries vs individual models, entries unresolvable to a single configuration.

Method order (least invasive first):
1. Official filter counts (no enumeration).
2. Row enumeration of identity fields only (ID, manufacturer, product name,
   category, rated output, class(es), test-report flag, EPREL number if shown,
   Informacja dodatkowa): ~3,100 rows ≈ ~65 grid pages @50/page + category
   filters; ≤1 request/2s ⇒ minutes of polite traffic; **no attachments**.
   ASP.NET notes: control names are session-randomized (verified in saved HTML) ⇒
   discover form fields at runtime; carry `__VIEWSTATE`/`__EVENTVALIDATION`;
   maintain one cookie session; abort on structure change.
   TLS: hosts serve incomplete chains ⇒ obtain the intermediate via
   `openssl s_client -showcerts` and pass through `NODE_EXTRA_CA_CERTS`
   (proper verification; NEVER `-k`/`rejectUnauthorized:false`).
3. If enumeration proves unreliable ⇒ stratified sample (§3) read manually from
   the public UI, n ≥ 300 identity rows.

## 3. Sampling design (for Path B and any non-enumerable measurement)

- **Path A runs on the full enumerated population** (automated, exact — no CI needed
  if enumeration succeeds).
- **Confirmation audit:** 40 uniformly random confirmed matches manually verified
  against public sources; >2 wrong (>5%) ⇒ tighten rules, rerun, re-audit.
- **Path B deep-dive sample:** n = 150 drawn from non-confirmed entries, stratified
  by: category (2.1/2.2 merged, 2.3, 2.4, 2.5) × capacity band
  (≤5 / 5–10 / 10–16 / 16–23 / >23 kW; 23 kW is the service's global
  residential/commercial boundary) × manufacturer tier (top-8 by entry count vs
  long tail; oversample long tail ≥ 40%; entry counts are NOT market share and
  will not be described as such). Weights = stratum population shares.
- **Precision:** Wilson 95% intervals. At n=150, worst-case half-width ≈ ±8.0 pp on
  p̂_B; combined coverage C = p_A + (1 − p_A)·p̂_B, CI width scaled by (1 − p_A).
  With expected p_A ≈ 0.25–0.45, combined half-width ≈ ±4.4–6.0 pp — sufficient to
  distinguish <50% / 50–70% / ≥70% unless the point estimate lands within ~5 pp of
  a threshold, in which case: report the ambiguity honestly and specify the
  smallest additional sample (pivotal strata only) that resolves it.

## 4. Metrics (reported separately, per owner spec)

Population: raw rows; active unique; suspended/removed; unique IDs; unique exact
configurations; typoszereg families; category overlap dedup; unresolvable.
Identity accessibility: manufacturer / exact model / ZUM ID / public EPREL /
component combination / family-only / detail page accessible / attachments accessible.
Path A: confirmed by method (M1/M2/M3); candidates; conflicts; unmatched.
Path B (among non-Path-A): spec-complete via official sources; production-eligible;
partial; name-only; docs inaccessible; only non-authoritative sources; conflicting.
Combined: usable = PathA_confirmed + PathB_complete (dedup); percentages with
bounds; candidate %; partial %; unusable %.
Breakdowns: manufacturer (top table with usable %, main failure reason), category,
residential/commercial, capacity band, family-vs-model, EPREL availability.
EPREL evaluation (§7 of the instruction): ZUM-side EPREL visibility %; overlap with
canonical `eprel_registration_number` (**known ceiling from prep: only 1,880 of
7,063 canonical records (26.6%) carry an EPREL number** — 1,705/5,158 residential,
175/1,905 commercial); one-to-one vs ambiguous; conflicts.
Reuse-risk split (§8): technical max coverage; coverage via non-ZUM official
sources; coverage dependent on ZUM factual fields; coverage dependent on ZUM
attachments; commercially uncertain pending IOŚ-PIB.

## 5. Evidence table

One row per tested product: ZUM ID; manufacturer (as shown, original string);
model/product name (original + normalized); category; rated kW; status; EPREL no.;
canonical candidate; match method; confidence; component/package consistency;
Data Sheet eligibility result (+ failing reasons); Path B source URLs; spec
completeness; failure reason; final class (A / B / candidate / partial / unusable);
verification date. Stored only in `out/` (temporary, internal, never redistributed).

## 6. Decision mapping

GO ≥70% combined usable & lower bound safely >50% & concentration/segment/
maintenance/reuse checks pass · CONDITIONAL GO 50–69.9% or strong-but-gappy or
unresolved reuse/maintenance (state exactly what converts it to GO) ·
HOLD/NO-GO <50% or lower bound materially <50% or name-only dominance or
weak-string dependence or un-refreshable or reuse unlikely or disproportionate
maintenance. Near-50% ⇒ report uncertainty + smallest decisive follow-up test.

## 7. Constraints honored

Read-only; no production code/data/config changes; no uploads; no bulk attachment
downloads; no scheduled scraper; no CAPTCHA/auth circumvention; no TLS-verification
disabling; no ZUM/IOŚ-PIB logos or presentation material; polite rate; findings not
redistributed; the final report in `docs/` is the only permanent repo artifact.
