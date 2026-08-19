/**
 * data-sheet-eligibility.mjs — the ONE rule deciding whether a canonical product
 * is fit to be a public product with a Data Sheet.
 *
 * Every country site publishes the same canonical technical products, so this
 * rule is shared: a product that cannot produce a useful Data Sheet in Germany
 * cannot produce one in the UK either.
 *
 * The rule is deliberately about the DATA SHEET, not about "having a record". A
 * sheet with a manufacturer, a model and a registration number is not a data
 * sheet — it is a business card. What makes the sheet worth generating is a
 * capacity the reader can size against, an energy class, and enough measured
 * performance to compare products.
 *
 * Thresholds were set from the actual field availability of the July 2026
 * canonical baseline (7,155 products) — never from what we wish existed:
 *
 *   manufacturer / model / canonical id / rated capacity / ηs(35°C) / type
 *                                                        → present on 100 %
 *   refrigerant 7,136 · sound power 6,961 · COP A7 6,225 · COP A2 6,150 · SCOP 4,488
 *   indoor sound power — the sound figure for indoor-sited (ground/exhaust) units
 *   dimensions & weight  3,321  (46 %)  → NOT required: too sparse to demand
 *   max water temp / operating range    → NOT in the schema at all
 *
 * So: everything universally present is REQUIRED, and of the five measured
 * performance fields a product must publish at least two (see MIN_CORE_FIELDS).
 * That keeps 7,063 products and rejects 92 whose performance section would be a
 * single lonely field.
 */

/**
 * Rated capacity — the SAME chain the app segments on (src/config/segmentation.ts).
 * `declared_capacity_kw` is the LAST fallback: a registry-declared rated heat
 * output whose measurement basis the source does not state (today: IT
 * GSE-native records whose single rating row carries no temperature label).
 * It exists only on such records — every other market's products resolve on
 * the measured-basis fields before ever reaching it.
 */
export const CAPACITY_CHAIN = ['power_35C_kw', 'power_design_35C_kw', 'power_55C_kw', 'power_design_55C_kw', 'declared_capacity_kw'];

export function ratedCapacityKw(p) {
  for (const f of CAPACITY_CHAIN) {
    const v = p?.[f];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/** The site's own segment rule. Identical in every country. Never `>=`. */
export const SEGMENT_THRESHOLD_KW = 23;
export function segmentOf(p) {
  const kw = ratedCapacityKw(p);
  if (kw == null) return 'unclassified';
  return kw > SEGMENT_THRESHOLD_KW ? 'commercial' : 'residential';
}

/** Present on every canonical product — a sheet without any of these is not a sheet. */
export const REQUIRED_FIELDS = [
  'manufacturer',              // who made it
  'model',                     // what it is
  'type',                      // air/water, ground/water …
  'efficiency_35C_percent',    // ηs → the energy class shown on the sheet
];

/**
 * The canonical identity requirement, kept separate from REQUIRED_FIELDS
 * because its FIELD NAME differs per public schema: DE/GB/FR publish
 * `bafa_id`; the PL public schema publishes the neutral
 * `european_reference_id` (same value — the German field name must not
 * appear in Polish public data). Either satisfies traceability.
 */
export const CANONICAL_ID_FIELDS = ['bafa_id', 'european_reference_id'];

/**
 * Measured performance. At least MIN_CORE_FIELDS of these must be published, or
 * the sheet has nothing to compare with. ηs is NOT in this list — it is required
 * above, and it is what the energy class is derived from.
 */
export const CORE_PERFORMANCE_FIELDS = [
  'refrigerant',
  'scop',
  'cop_A7W35',
  'cop_A2W35',
  'noise_outdoor_dB',
  // Indoor sound power (added 2026-07-17): for indoor-sited ground-source and
  // exhaust-air units this IS the sound figure — registries publish outdoor
  // sound as 0/absent for them. Excluding it rejected 43 real ground-source
  // records whose sheets carry capacity, ηs, refrigerant and indoor noise —
  // penalising a product class for its siting, not its data. Same measured-
  // field class as outdoor sound power; the ≥2-fields bar is unchanged.
  'noise_indoor_dB',
];

/**
 * Two, not three — and the difference is 838 real products, so it is worth stating.
 *
 * Requiring three would reject 930 canonical products, but 838 of those publish
 * refrigerant AND sound power on top of the required capacity and energy class.
 * That is a perfectly usable data sheet; it merely has no COP/SCOP, because the
 * registry does not publish those for that equipment class (large Aermec/Clivet
 * units, for instance). Throwing them away would buy no honesty — it would just
 * shrink the catalogue.
 *
 * At two, the rule still rejects the 92 products whose entire performance section
 * would be a single field. That is the line worth drawing: a sheet with a capacity
 * and nothing measurable next to it is not a data sheet.
 */
export const MIN_CORE_FIELDS = 2;

const present = v => v != null && v !== '';

export function coreFieldCount(p) {
  return CORE_PERFORMANCE_FIELDS.filter(f => present(p?.[f])).length;
}

/**
 * Is this canonical product fit to publish?
 * Returns { eligible, reasons[] } — reasons name the exact failing rule, so the
 * build can report failures by cause instead of a bare count.
 */
export function dataSheetEligibility(p) {
  const reasons = [];

  for (const f of REQUIRED_FIELDS) {
    if (!present(p?.[f])) reasons.push(`missing_${f}`);
  }
  if (!CANONICAL_ID_FIELDS.some(f => present(p?.[f]))) reasons.push('missing_canonical_id');
  if (ratedCapacityKw(p) == null) reasons.push('no_rated_capacity');
  // A product we cannot place in a segment cannot be published: the app would
  // have to show it in neither list. (Follows from the capacity rule, kept
  // explicit so the intent survives a future capacity-chain change.)
  if (segmentOf(p) === 'unclassified') reasons.push('unclassified_segment');

  const core = coreFieldCount(p);
  if (core < MIN_CORE_FIELDS) reasons.push(`insufficient_core_fields_${core}_of_${MIN_CORE_FIELDS}`);

  return { eligible: reasons.length === 0, reasons };
}

export const isDataSheetEligible = p => dataSheetEligibility(p).eligible;

/* ── Italy GSE-native publication tier (2026-07 owner decision) ─────────────
   The Italian edition additionally publishes ITALY-ONLY products built from
   the GSE Conto Termico catalogue (performance_source='GSE_CATALOGUE',
   source_id 'IT-<gse entry key>'). The GSE catalogue publishes capacity, ηs
   and SCOP but no refrigerant/sound/COP fields, so the global ≥2-of-5
   measured-fields rule is structurally unreachable for them; the owner
   approved an ITALY-SPECIFIC publication standard for THIS layer only:

     identity        manufacturer + model (a name alone is still refused —
                     the record must also carry its registry provenance and
                     its component identity where the catalogue publishes one)
     type + segment  supported family string + resolvable rated capacity
     performance     ηs and/or SCOP from the catalogue (gse_ratings), i.e.
                     the sheet always has capacity plus at least one seasonal
                     performance figure — never capacity alone
     provenance      gse_entry_key + catalogue identity (III.A)

   This function applies ONLY to GSE-native records on the IT build; every
   other market and the IT European-reference layer keep dataSheetEligibility
   unchanged. (docs/IT_GSE_MATCHING_AUDIT.md records the decision context.) */
export function gseNativeEligibility(p) {
  const reasons = [];
  if (p?.performance_source !== 'GSE_CATALOGUE') reasons.push('not_gse_native');
  for (const f of ['manufacturer', 'model', 'type']) {
    if (!present(p?.[f])) reasons.push(`missing_${f}`);
  }
  if (!present(p?.gse_entry_key)) reasons.push('missing_gse_provenance');
  if (!String(p?.source_id ?? '').startsWith('IT-')) reasons.push('missing_it_source_id');
  if (ratedCapacityKw(p) == null) reasons.push('no_rated_capacity');
  if (segmentOf(p) === 'unclassified') reasons.push('unclassified_segment');
  const ratings = Array.isArray(p?.gse_ratings) ? p.gse_ratings : [];
  const hasSeasonal = present(p?.efficiency_35C_percent) || present(p?.scop)
    || ratings.some(r => present(r?.etas) || present(r?.scop));
  if (!hasSeasonal) reasons.push('no_seasonal_performance');
  return { eligible: reasons.length === 0, reasons };
}

export const isGseNativeEligible = p => gseNativeEligibility(p).eligible;

/**
 * FRANCE-SPECIFIC publication tier — ADEME agrément entries carrying EPREL
 * performance (added 2026-08-19).
 *
 * The French market has the opposite problem to Germany. Its subsidy register
 * names the models that matter — Atlantic, De Dietrich, Saunier Duval, Thermor,
 * brands the German baseline never carried — but publishes no performance at
 * all. EPREL publishes the performance for the same model identifiers and no
 * agrément number. Neither source alone can produce a data sheet; together they
 * can, and an installer whose quote must carry the agrément number is exactly
 * the reader who needs it.
 *
 * What this tier requires that the global rule cannot get here:
 *   ηs and rated output come from EPREL, so the usual measured five are thin —
 *   EPREL has no refrigerant, COP or SCOP field at all. Refrigerant comes from
 *   the register's own facet, sound power from EPREL, and those two are the
 *   measured pair. Anything less publishes a sheet with nothing to compare.
 *
 * What it refuses to soften: identity, heat-source type, a rated capacity, a
 * classified segment, seasonal efficiency, and the agrément number that is the
 * record's whole reason to exist. A name and a number is a business card.
 *
 * These records never travel: source_id is 'FR-<agrément number>' and the FR
 * builder is the only one that emits them.
 */
export function eprelNativeEligibility(p) {
  const reasons = [];
  if (p?.performance_source !== 'EPREL') reasons.push('not_eprel_native');
  for (const f of ['manufacturer', 'model', 'type']) {
    if (!present(p?.[f])) reasons.push(`missing_${f}`);
  }
  if (!present(p?.agrement_number)) reasons.push('missing_agrement_provenance');
  if (!present(p?.eprel_registration_number)) reasons.push('missing_eprel_provenance');
  if (!String(p?.source_id ?? '').startsWith('FR-')) reasons.push('missing_fr_source_id');
  if (ratedCapacityKw(p) == null) reasons.push('no_rated_capacity');
  if (segmentOf(p) === 'unclassified') reasons.push('unclassified_segment');
  if (!present(p?.efficiency_35C_percent) && !present(p?.efficiency_55C_percent)) {
    reasons.push('no_seasonal_performance');
  }
  // The measured pair this tier is built on: refrigerant (register facet) and
  // sound power (EPREL). Two is the same floor the global rule sets.
  const measured = [p?.refrigerant, p?.noise_outdoor_dB, p?.noise_indoor_dB].filter(present).length;
  if (measured < MIN_CORE_FIELDS) reasons.push('insufficient_measured_fields');
  return { eligible: reasons.length === 0, reasons };
}

export const isEprelNativeEligible = p => eprelNativeEligibility(p).eligible;


/**
 * Publication rule for a MARKET's public dataset: the global rule, plus the
 * Italy-only GSE-native tier for records that declare that provenance. Used by
 * the IT builder and the dataset gate's IT section; other markets never
 * contain GSE_CATALOGUE records, so this is the global rule there.
 */
export const isPublishable = p =>
  p?.performance_source === 'GSE_CATALOGUE' ? isGseNativeEligible(p)
    : p?.performance_source === 'EPREL' ? isEprelNativeEligible(p)
      : isDataSheetEligible(p);

/** Split a canonical pool, with failure reasons tallied for the build report. */
export function applyEligibility(products) {
  const eligible = [];
  const rejected = [];
  const byReason = {};
  for (const p of products) {
    const r = dataSheetEligibility(p);
    if (r.eligible) { eligible.push(p); continue; }
    rejected.push({ id: p.bafa_id ?? null, model: p.model ?? null, reasons: r.reasons });
    for (const reason of r.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
  return { eligible, rejected, byReason };
}
