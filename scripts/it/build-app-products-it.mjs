/**
 * build-app-products-it.mjs  v2.0  (Italy dataset builder — GSE-primary layer)
 *
 * Strategy (owner decision 2026-07-18): the Italian catalogue is the canonical
 * (German-registry-derived) European catalogue PLUS an ITALY-ONLY layer of
 * GSE-catalogue products — the Italian market's own registry entries that have
 * no canonical counterpart. Italy-only data NEVER travels to other markets and
 * never mutates the canonical datasets (read-only enrichment direction:
 * canonical → IT build; GSE → IT build; nothing flows back).
 *
 * Layers:
 *   1. Canonical baseline (public/data/products*.json) — identity, specs and
 *      the 23 kW segmentation are inherited unchanged (the "European
 *      reference" catalogue on the Italian site).
 *   2. GSE Conto Termico LISTING OVERLAY (matching/YYYY-MM/
 *      canonical-gse-overlay.json) — a confirmed match may attach the
 *      catalogue facts; it never creates/changes/removes a canonical product.
 *      Unmatched products carry gse_match_status='verification_required'
 *      (never a claim of absence — the PEL rule).
 *   3. IT-MARKET GSE-NATIVE LAYER (this builder, from the parsed GSE
 *      snapshot): in-scope catalogue entries (air/water, ground, water/water —
 *      the German taxonomy; NEVER air/air, VRF, water/air or gas-driven) with
 *      NO canonical counterpart become IT-edition-only records IF AND ONLY IF
 *      they pass the Italy GSE-native publication tier
 *      (scripts/lib/data-sheet-eligibility.mjs → gseNativeEligibility: identity
 *      + type + capacity + seasonal performance + provenance; a name alone is
 *      still refused). Provenance: performance_source='GSE_CATALOGUE',
 *      source_id 'IT-<gse entry key>', gse_match_method='gse_native'. Entries
 *      in the matcher's review queue (plausible canonical counterpart) are
 *      BLOCKED from this layer — publishing them would put a near-duplicate
 *      next to their canonical sibling.
 *
 * Honest field mapping for GSE-native records:
 *   - The catalogue's rating rows (potenza/ηs/SCOP) are kept verbatim in
 *     gse_ratings. They map onto the canonical 35°C/55°C fields ONLY where the
 *     basis is provable: a two-row entry whose ηs values are ≥8 % apart IS the
 *     low/medium-temperature application pair (ηs at 35 °C flow is physically
 *     always higher than at 55 °C; EU 813/2014 requires declaring both), and a
 *     single row whose model string carries an explicit "LWT 35/55" label is
 *     what it says. Everything else stays in gse_ratings with
 *     declared_capacity_kw (max declared output, basis unstated) as the
 *     capacity used for the 23 kW segmentation — never a fabricated basis.
 *   - refrigerant is set only when the catalogue row itself declares it in the
 *     model/denomination string (…R32, …R290).
 *   - No energy class is implied unless efficiency_35C_percent was provably
 *     mapped (the class derivation rule is unchanged, EU 811/2013).
 *
 * Honesty policy (IT):
 *   - Canonical specs are European reference values (performance_source =
 *     'EU_MEASURED_REFERENCE' publicly), not Italian certification data.
 *   - Catalogue presence is a condition of the Conto Termico incentive on the
 *     appliance side; the app NEVER claims incentive eligibility (applicant/
 *     building/intervention rules).
 *   - GSE data is used facts-only: source attribution + snapshot dates, no
 *     GSE branding, and records carry only what the catalogue publishes.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dataSheetEligibility, gseNativeEligibility, isPublishable, segmentOf,
} from '../lib/data-sheet-eligibility.mjs';
import { gseFamily, gseKws, compact, refrigerantIn } from './gse-match-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const EXPECTED_FIELD_COUNT = 91; // DE 78 − 4 German fields + performance_source
                                 // + european_reference_*(3, public names) + gse_*(11)
                                 // + gse_ratings + declared_capacity_kw + gse_temp_assignment
const PRICE_KEY_FRAGMENTS = ['price', 'brand_tier', 'price_confidence', 'package_scope', 'capacity_band', 'refrigerant_group'];

function loadJSON(relPath, hint) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) {
    console.error(`Missing ${relPath}${hint ? ` — ${hint}` : ''}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(abs, 'utf8'));
}
const newestSnapshot = rel => {
  const dir = resolve(ROOT, rel);
  return existsSync(dir)
    ? readdirSync(dir).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().reverse()[0] ?? null
    : null;
};

const deResidential = loadJSON('public/data/products.json', 'run the DE builder first');
const deCommercial = loadJSON('public/data/products-commercial.json', 'run the DE builder first');

/* ── GSE overlay (optional — build proceeds unenriched without it) ────────── */
const overlaySnapshot = newestSnapshot('data_sources/gse_ct/matching');
const overlayFile = overlaySnapshot
  ? JSON.parse(readFileSync(resolve(ROOT, 'data_sources/gse_ct/matching', overlaySnapshot, 'canonical-gse-overlay.json'), 'utf8'))
  : null;
const overlayByBafaId = new Map(Object.entries(overlayFile?.overlay ?? {}));
console.log(overlayFile
  ? `GSE overlay: ${overlayByBafaId.size} products carry listing state (snapshot ${overlaySnapshot})`
  : 'GSE overlay: none (all products will show verification_required)');

const generatedAt = new Date().toISOString();

/** German BAFA type strings → Italian display strings. Unknown values pass through. */
const TYPE_IT = {
  'Luft / Wasser': 'Aria / Acqua',
  'Sole / Wasser': 'Salamoia / Acqua',
  'Wasser / Wasser': 'Acqua / Acqua',
  'Luft / Luft': 'Aria / Aria',
};

/** German registry status / funding fields — German facts. They do not travel. */
const GERMAN_ONLY_FIELDS = [
  'bafa_listing_status', 'bafa_foerderung_von', 'bafa_foerderung_bis', 'bafa_snapshot_fetched_at',
];

const EMPTY_GSE_BLOCK = {
  gse_match_status: 'verification_required',
  gse_entry_key: null,
  gse_catalogue: null,
  gse_brand: null,
  gse_model: null,
  gse_match_method: null,
  gse_match_confidence: null,
  gse_snapshot: overlaySnapshot ?? null,
  gse_snapshot_fetched_at: overlayFile?.meta?.generated_at ?? null,
  gse_first_matched_at: null,
  gse_last_confirmed_at: null,
};

function toItItem(p) {
  const base = { ...p };
  for (const f of GERMAN_ONLY_FIELDS) delete base[f];
  const ov = overlayByBafaId.get(String(p.bafa_id));
  return {
    ...base,
    type: TYPE_IT[p.type] ?? p.type,
    country: 'IT',
    performance_source: 'BAFA_REFERENCE',
    bafa_reference_id: p.bafa_id != null ? String(p.bafa_id) : null,
    bafa_reference_model: p.model ?? null,
    bafa_reference_match_type: 'same_record',
    // GSE-native-layer fields — null on European-reference records.
    gse_ratings: null,
    declared_capacity_kw: null,
    gse_temp_assignment: null,
    ...EMPTY_GSE_BLOCK,
    ...(ov ?? {}),
  };
}

const residential = deResidential.items.map(toItItem);
const commercial = deCommercial.items.map(toItItem);

/* ── IT-market GSE-native layer (in-scope, no canonical counterpart) ─────── */
/* The GSE master seed, not one parsed snapshot: these records exist ONLY
   because the catalogue published them, so a failed fetch or a cleaned folder
   used to delete products from the Italian catalogue silently (the 2026-07-12
   German regression; IT had no guard until 2026-08-12). `seed.in_latest` keeps
   the listing claim honest — absent entries stay published, never as "listed".
   Falls back to the parsed snapshot when no seed is built. */
const seedSnapshot = newestSnapshot('data_sources/gse_ct/master_seed');
const gseSeed = seedSnapshot
  ? JSON.parse(readFileSync(resolve(ROOT, 'data_sources/gse_ct/master_seed', seedSnapshot, 'gse-master-seed.json'), 'utf8'))
  : null;
const parsedSnapshot = newestSnapshot('data_sources/gse_ct/parsed');
const gseParsed = gseSeed ?? (parsedSnapshot
  ? JSON.parse(readFileSync(resolve(ROOT, 'data_sources/gse_ct/parsed', parsedSnapshot, 'gse-normalized.json'), 'utf8'))
  : null);
if (gseSeed) {
  console.log(`GSE master seed: ${gseSeed.meta.total_entries} entries`
    + ` (in latest ${gseSeed.meta.in_latest}, absent ${gseSeed.meta.absent_from_latest}`
    + ` — absent entries publish as verification_required)`);
  if (gseSeed.meta.suspect_partial_fetch) {
    console.error('⚠️  GSE: latest catalogue covers <70% of the seed — suspected partial parse.'
      + ' Products are preserved; check the fetch before shipping.');
  }
}
const reviewPath = overlaySnapshot
  ? resolve(ROOT, 'data_sources/gse_ct/matching', overlaySnapshot, 'canonical-gse-review.json')
  : null;
const reviewKeys = new Set((reviewPath && existsSync(reviewPath)
  ? JSON.parse(readFileSync(reviewPath, 'utf8')).review ?? []
  : []).map(r => r.gse_entry_key).filter(Boolean));
const confirmedKeys = new Set([...overlayByBafaId.values()].map(o => o.gse_entry_key).filter(Boolean));

/** GSE exchange strings → the Italian display types (German taxonomy families). */
const SCAMBIO_TYPE = scambio =>
  /aria\s*\/\s*acqua/i.test(scambio ?? '') ? 'Aria / Acqua'
    : /salamoia/i.test(scambio ?? '') ? 'Salamoia / Acqua'
      : /acqua\s*\/\s*acqua/i.test(scambio ?? '') ? 'Acqua / Acqua'
        : null;
const IN_FAMILIES = new Set(['air_water', 'ground', 'water_water']);

const LEGAL_TOKENS = new Set(['GMBH', 'KG', 'CO', 'SP', 'ZOO', 'SA', 'AG', 'SE', 'SRL', 'SRLS', 'SAS',
  'LTD', 'LLC', 'BV', 'AS', 'OY', 'AB', 'SPA', 'ITALIA', 'ITALY', 'EUROPE', 'AIRCONDITIONING']);
const shortName = mfr => {
  const t = String(mfr ?? '').normalize('NFKD').replace(/[^A-Za-z ]+/g, ' ').split(/\s+/)
    .find(w => w.length >= 3 && !LEGAL_TOKENS.has(w.toUpperCase()));
  return t ? t[0].toUpperCase() + t.slice(1) : (mfr ?? null);
};

/**
 * Provable temperature-basis assignment for the catalogue's rating rows.
 *  - declared_pair: exactly two rows with DISTINCT ηs values — the low/medium
 *    temperature application pair required by EU 813/2013. ηs at 35 °C flow is
 *    physically always the higher one (verified on the German canonical data:
 *    5,698/5,698 pairs, zero inversions, minimum relative gap 9%), so the
 *    higher-ηs row is the 35 °C application whatever the gap size (owner
 *    decision 2026-07-18; the earlier ≥8% guard band was removed as redundant
 *    against the measured distribution). Equal ηs values stay unmapped — there
 *    is no "higher" row to assign.
 *  - model_label: a single row whose model string carries an explicit LWT
 *    temperature ("… - LWT 55°C").
 *  - null: basis unprovable — values stay in gse_ratings only.
 */
function assignTemps(z) {
  const rows = z.ratings.filter(r => r.kw > 0 || r.etas != null || r.scop != null);
  if (rows.length === 2 && rows[0].etas != null && rows[1].etas != null
    && rows[0].etas !== rows[1].etas) {
    const [a, b] = rows;
    const hi = a.etas > b.etas ? a : b;
    const lo = hi === a ? b : a;
    return { mode: 'declared_pair', r35: hi, r55: lo };
  }
  if (rows.length === 1) {
    if (/LWT\s*55/i.test(z.model ?? '')) return { mode: 'model_label', r55: rows[0] };
    if (/LWT\s*35/i.test(z.model ?? '')) return { mode: 'model_label', r35: rows[0] };
  }
  return { mode: null };
}

const TEMPLATE_KEYS = Object.keys(residential[0] ?? {});
const nativeStats = { in_scope: 0, blocked_confirmed: 0, blocked_review: 0, ineligible: 0, added: 0, mapped_pair: 0, mapped_label: 0, unmapped: 0, byReason: {} };
const native = [];

for (const z of gseParsed?.entries ?? []) {
  const fam = gseFamily(z.scambio);
  if (!IN_FAMILIES.has(fam) || /gas/i.test(z.funzionamento ?? '')) continue;
  nativeStats.in_scope++;
  if (confirmedKeys.has(z.gse_entry_key)) { nativeStats.blocked_confirmed++; continue; }
  if (reviewKeys.has(z.gse_entry_key)) { nativeStats.blocked_review++; continue; }

  // Seedless fallback: without a seed every entry came from the newest snapshot.
  const inLatest = z.seed ? z.seed.in_latest === true : true;
  const temps = assignTemps(z);
  const kws = gseKws(z);
  const declaredMax = kws.length ? Math.max(...kws) : null;
  const refr = refrigerantIn(z.model) ?? refrigerantIn(z.denominazione);
  const odu = compact(z.odu_id ?? '').length >= 4 ? z.odu_id : null;
  const idu = compact(z.idu_id ?? '').length >= 4 ? z.idu_id : null;

  const candidate = Object.fromEntries(TEMPLATE_KEYS.map(k => [k, null]));
  Object.assign(candidate, {
    bafa_id: `IT-${z.gse_entry_key}`,
    source_id: `IT-${z.gse_entry_key}`,
    uuid: null,
    country: 'IT',
    primary_source: 'GSE_CATALOGUE',
    performance_source: 'GSE_CATALOGUE',
    manufacturer: z.brand,
    manufacturer_normalized: String(z.brand ?? '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(),
    manufacturer_short: shortName(z.brand),
    model: z.model,
    type: SCAMBIO_TYPE(z.scambio),
    market_segment: null, // resolved after eligibility below
    installation_type: null, // the catalogue does not state it; never inferred
    refrigerant: refr ? `R${refr}` : null,
    grid_ready: null,
    // Component identity exactly as the catalogue publishes it.
    outdoor_unit_model: odu,
    idu_model: idu,
    outdoor_side_display_model: odu,
    outdoor_side_identified: Boolean(odu),
    outdoor_side_display_kind: odu ? 'exact_model' : null,
    // Provable temperature-basis mapping only (see assignTemps).
    power_35C_kw: temps.r35?.kw ?? null,
    power_55C_kw: temps.r55?.kw ?? null,
    efficiency_35C_percent: temps.r35?.etas ?? null,
    efficiency_55C_percent: temps.r55?.etas ?? null,
    scop: temps.r35?.scop ?? null,
    // The catalogue rows verbatim + the basis-unstated capacity fallback.
    gse_ratings: z.ratings.map(r => ({ kw: r.kw, etas: r.etas, scop: r.scop })),
    declared_capacity_kw: temps.mode ? null : declaredMax,
    gse_temp_assignment: temps.mode,
    source_snapshot_generated_at: gseParsed.meta.generated_at,
    // Listing block: the record IS a catalogue entry.
    /* A record the newest catalogue did not contain keeps its specification but
       loses the listing claim: anything other than 'confirmed' renders as
       "Verifica catalogo GSE richiesta" (src/hpiq/listing.ts). It never becomes
       "not in the catalogue" — absence in OUR parse is a fact about our parse. */
    gse_match_status: inLatest ? 'confirmed' : 'review_required',
    gse_entry_key: inLatest ? z.gse_entry_key : null,
    gse_catalogue: z.catalogue,
    gse_brand: z.brand,
    gse_model: z.model,
    gse_match_method: 'gse_native',
    gse_match_confidence: 'high',
    gse_snapshot: parsedSnapshot,
    gse_snapshot_fetched_at: gseParsed.meta.latest_snapshot_fetched_at ?? gseParsed.meta.fetched_at,
    gse_first_matched_at: gseParsed.meta.fetched_at,
    gse_last_confirmed_at: inLatest ? generatedAt : (z.seed?.last_seen ?? null),
  });

  const elig = gseNativeEligibility(candidate);
  if (!elig.eligible) {
    nativeStats.ineligible++;
    for (const r of elig.reasons) nativeStats.byReason[r] = (nativeStats.byReason[r] ?? 0) + 1;
    continue;
  }
  if (temps.mode === 'declared_pair') nativeStats.mapped_pair++;
  else if (temps.mode === 'model_label') nativeStats.mapped_label++;
  else nativeStats.unmapped++;
  native.push(candidate);
  nativeStats.added++;
}

for (const x of native) {
  x.market_segment = segmentOf(x) === 'commercial' ? 'commercial_project' : 'residential_core';
  (segmentOf(x) === 'commercial' ? commercial : residential).push(x);
}

/* ── Public-schema transform: no German-market field names leave Italy ─────
   Internal building above uses the canonical field names (bafa_id, …) so the
   overlay/matching artifacts stay traceable. The PUBLIC Italian dataset
   renames them to neutral European-reference terminology (same as PL):
     bafa_id                   → european_reference_id
     bafa_reference_model      → european_reference_model
     bafa_reference_match_type → european_reference_match_type
     bafa_reference_id         → (dropped — same value as european_reference_id)
     performance_source        'BAFA_REFERENCE' → 'EU_MEASURED_REFERENCE'
     primary_source            'BAFA' → 'EU_REFERENCE'                        */
function toPublicItItem(p) {
  const {
    bafa_id, bafa_reference_id, bafa_reference_model, bafa_reference_match_type,
    ...rest
  } = p;
  return {
    ...rest,
    european_reference_id: bafa_id != null ? String(bafa_id) : null,
    european_reference_model: bafa_reference_model ?? null,
    european_reference_match_type: bafa_reference_match_type ?? null,
    performance_source: p.performance_source === 'BAFA_REFERENCE' ? 'EU_MEASURED_REFERENCE' : p.performance_source,
    primary_source: p.primary_source === 'BAFA' ? 'EU_REFERENCE' : p.primary_source,
  };
}
const publicResidential = residential.map(toPublicItItem);
const publicCommercial = commercial.map(toPublicItItem);

const allItems = [...publicResidential, ...publicCommercial];

/* ── Validate ─────────────────────────────────────────────────────────────── */

const fieldCount = Object.keys(allItems[0]).length;
if (fieldCount !== EXPECTED_FIELD_COUNT) {
  console.error(`FAIL: field count mismatch: expected ${EXPECTED_FIELD_COUNT}, got ${fieldCount}`);
  console.error('Fields:', Object.keys(allItems[0]).join(', '));
  process.exit(1);
}
const badKeySets = allItems.filter(x => Object.keys(x).length !== fieldCount);
if (badKeySets.length) {
  console.error(`FAIL: ${badKeySets.length} public records deviate from the shared schema`);
  process.exit(1);
}

// The public Italian schema must carry NO German-market field names or source
// labels — machine-readable payloads included, not just visible text.
const bafaKeyLeak = Object.keys(allItems[0]).filter(k => /bafa/i.test(k));
const bafaValueLeak = allItems.filter(i => /BAFA/i.test(String(i.performance_source ?? '')) || /^BAFA$/i.test(String(i.primary_source ?? '')));
if (bafaKeyLeak.length || bafaValueLeak.length) {
  console.error(`FAIL: German-market provenance in the public schema (keys: ${bafaKeyLeak.join(',') || 'none'}; value leaks: ${bafaValueLeak.length})`);
  process.exit(1);
}

const priceKeysFound = Object.keys(allItems[0]).filter(k =>
  PRICE_KEY_FRAGMENTS.some(frag => k.includes(frag)));
if (priceKeysFound.length > 0) {
  console.error('FAIL: price-like keys present:', priceKeysFound.join(', '));
  process.exit(1);
}

const germanLeak = allItems.filter(i => GERMAN_ONLY_FIELDS.some(f => f in i));
if (germanLeak.length > 0) {
  console.error(`FAIL: ${germanLeak.length} items carry German-only registry fields`);
  process.exit(1);
}

const badProvenance = allItems.filter(i => {
  if (!i.european_reference_id || !i.source_id || i.country !== 'IT') return true;
  if (i.performance_source === 'EU_MEASURED_REFERENCE') return String(i.source_id).startsWith('IT-');
  if (i.performance_source === 'GSE_CATALOGUE') {
    return !String(i.source_id).startsWith('IT-') || i.gse_match_method !== 'gse_native'
      || !Array.isArray(i.gse_ratings) || !i.gse_ratings.length;
  }
  return true;
});
if (badProvenance.length > 0) {
  console.error(`FAIL: ${badProvenance.length} items missing required IT provenance`);
  process.exit(1);
}

// Scope guard: the German taxonomy only — an air/air, VRF or gas-driven record
// must never reach the Italian public catalogue.
const ALLOWED_TYPES = new Set(['Aria / Acqua', 'Salamoia / Acqua', 'Acqua / Acqua', 'Aria / Aria']);
const badType = allItems.filter(i => !ALLOWED_TYPES.has(i.type) || (i.performance_source === 'GSE_CATALOGUE' && i.type === 'Aria / Aria'));
if (badType.length > 0) {
  console.error(`FAIL: ${badType.length} items outside the supported type taxonomy:`, [...new Set(badType.map(i => i.type))].slice(0, 5));
  process.exit(1);
}

// Basis honesty: a GSE-native record may carry 35/55 °C values ONLY with a
// provable assignment, and must otherwise carry the basis-unstated fallback.
const badBasis = allItems.filter(i => i.performance_source === 'GSE_CATALOGUE' && (
  (i.gse_temp_assignment == null && (i.power_35C_kw != null || i.power_55C_kw != null
    || i.efficiency_35C_percent != null || i.efficiency_55C_percent != null || i.scop != null))
  || (i.gse_temp_assignment == null && i.declared_capacity_kw == null)
  || (i.gse_temp_assignment != null && i.declared_capacity_kw != null)));
if (badBasis.length > 0) {
  console.error(`FAIL: ${badBasis.length} GSE-native records violate the temperature-basis honesty rule`);
  process.exit(1);
}

const ids = allItems.map(i => String(i.source_id));
if (new Set(ids).size !== ids.length) {
  console.error('FAIL: duplicate source_id in IT catalogue');
  process.exit(1);
}

// Listing-state integrity: confirmed ⇔ has gse_entry_key; nothing else carries one.
const badListing = allItems.filter(i =>
  (i.gse_match_status === 'confirmed') !== Boolean(i.gse_entry_key));
if (badListing.length > 0) {
  console.error(`FAIL: ${badListing.length} items violate confirmed⇔gse_entry_key integrity`);
  process.exit(1);
}

// One GSE catalogue entry → one product.
const gseKeys = allItems.filter(i => i.gse_entry_key).map(i => i.gse_entry_key);
if (new Set(gseKeys).size !== gseKeys.length) {
  console.error('FAIL: a GSE entry is attached to more than one product');
  process.exit(1);
}

// Every product must be publishable and classifiable — European-reference
// records under the global rule, GSE-native records under the Italy tier.
const inelig = allItems.filter(i => !isPublishable(i));
if (inelig.length > 0) {
  console.error(`FAIL: ${inelig.length} items fail their publication rule`);
  process.exit(1);
}
const derivedInelig = allItems.filter(i => i.performance_source !== 'GSE_CATALOGUE' && !dataSheetEligibility(i).eligible);
if (derivedInelig.length > 0) {
  console.error(`FAIL: ${derivedInelig.length} European-reference items fail the GLOBAL eligibility rule`);
  process.exit(1);
}
const unclassified = allItems.filter(i => segmentOf(i) === 'unclassified');
if (unclassified.length > 0) {
  console.error(`FAIL: ${unclassified.length} items unclassifiable (no rated capacity)`);
  process.exit(1);
}

const derivedCount = deResidential.items.length + deCommercial.items.length;
if (allItems.length !== derivedCount + native.length) {
  console.error('FAIL: record count mismatch vs DE source + GSE-native layer');
  process.exit(1);
}

/* ── Write output ─────────────────────────────────────────────────────────── */

function writeOutput(relPath, items, dataset, sourceMeta) {
  const payload = {
    _meta: {
      generated: generatedAt,
      generator: 'build-app-products-it.mjs v1.0',
      dataset,
      country: 'IT',
      primary_source: 'EU_REFERENCE',
      description: 'Italian market catalogue: the canonical European reference dataset — technical '
        + 'specifications are EU-harmonised measured reference values (EN 14511/14825, EU 811/2013; '
        + "performance_source='EU_MEASURED_REFERENCE'), not Italian certification data — plus a GSE "
        + 'Conto Termico 3.0 pre-qualified-appliance listing overlay (catalogue III.A, confirmed '
        + 'matches only; a failed match is shown as verification-required, never as absence). '
        + 'Conto Termico / detrazioni fiscali eligibility is applicant-, building- and intervention-'
        + 'dependent — this app makes no eligibility claims.',
      total_items: items.length,
      reference_dataset_generated: sourceMeta.generated,
      gse_overlay_source: overlayFile ? `data_sources/gse_ct/matching/${overlaySnapshot}/canonical-gse-overlay.json` : null,
      gse_snapshot: overlaySnapshot ?? parsedSnapshot ?? null,
      gse_confirmed_total: items.filter(i => i.gse_match_status === 'confirmed').length,
      gse_native_total: items.filter(i => i.gse_match_method === 'gse_native').length,
      european_reference_total: items.filter(i => i.performance_source === 'EU_MEASURED_REFERENCE').length,
      segments_included: dataset === 'residential' ? ['residential_core'] : ['light_commercial', 'commercial_project'],
    },
    items,
  };
  writeFileSync(resolve(ROOT, relPath), JSON.stringify(payload));
  console.log(`Wrote ${items.length} items → ${relPath}`);
}

writeOutput('public/data/products-it.json', publicResidential, 'residential', deResidential._meta);
writeOutput('public/data/products-commercial-it.json', publicCommercial, 'commercial', deCommercial._meta);

/* ── Summary ──────────────────────────────────────────────────────────────── */

const confirmedTotal = allItems.filter(i => i.gse_match_status === 'confirmed').length;
console.log('');
console.log('── Build summary (IT) ─────────────────────────────────────');
console.log(`Catalogue:                ${allItems.length} items (residential ${residential.length}, commercial ${commercial.length})`);
console.log(`  European reference:     ${derivedCount}`);
console.log(`  GSE-native (IT-only):   ${native.length}`);
console.log(`  GSE listed (confirmed): ${confirmedTotal} (matched canonical ${confirmedTotal - native.length} + native ${native.length})`);
console.log(`  review_required:        ${allItems.filter(i => i.gse_match_status === 'review_required').length}`);
console.log(`  EPREL linked:           ${allItems.filter(i => i.eprel_registration_number != null).length}`);
console.log(`Native funnel:            in-scope ${nativeStats.in_scope} → confirmed-blocked ${nativeStats.blocked_confirmed}`
  + ` | review-blocked ${nativeStats.blocked_review} | ineligible ${nativeStats.ineligible} | added ${nativeStats.added}`);
console.log(`  temp-basis mapping:     declared-pair ${nativeStats.mapped_pair} | model-label ${nativeStats.mapped_label} | unmapped (declared kW only) ${nativeStats.unmapped}`);
if (nativeStats.ineligible) console.log('  ineligible reasons:', JSON.stringify(nativeStats.byReason));
console.log(`Field count:              ${fieldCount} ✓   No price keys ✓   IT provenance ✓   listing integrity ✓`);
console.log('──────────────────────────────────────────────────────────');
