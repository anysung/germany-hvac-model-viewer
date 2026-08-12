/**
 * build-app-products-pl.mjs  v1.0  (Poland dataset builder)
 *
 * Strategy (owner decision 2026-07-17): the PL catalogue is the canonical
 * (German-registry-derived) European catalogue — same hardware sold across the
 * EU — PLUS spec-complete Poland-market records for Lista ZUM devices that do
 * not exist in the canonical catalogue (mostly DHW and PL-market variants).
 *
 * Layers:
 *   1. Canonical baseline (public/data/products*.json) — identity, specs and
 *      the 23 kW segmentation are inherited unchanged, exactly like FR/GB.
 *   2. Lista ZUM LISTING OVERLAY (data_sources/lista_zum/matching/YYYY-MM/
 *      canonical-zum-overlay.json) — a confirmed match may attach the ZUM id
 *      and registry facts; it never creates/changes/removes a canonical
 *      product. Unmatched products carry zum_match_status='verification_required'
 *      (never a claim of absence — the PEL rule).
 *   3. PL-MARKET EXTENSION (this builder, from the parsed ZUM snapshot):
 *      registry entries with NO canonical counterpart become PL-edition-only
 *      records IF AND ONLY IF the registry itself publishes enough measured
 *      data to pass the SAME shared Data-Sheet eligibility rule
 *      (scripts/lib/data-sheet-eligibility.mjs — no weaker Poland standard).
 *      Provenance: performance_source='ZUM_REGISTRY', source_id 'PL-<zum id>',
 *      zum_match_method='zum_native'. These records exist only in the PL
 *      datasets and never travel to other markets.
 *
 * Honesty policy (PL):
 *   - Canonical specs are European reference values (cross-reference,
 *     performance_source='BAFA_REFERENCE'), not Polish certification data.
 *   - ZUM listing is a product-side condition of the Czyste Powietrze program;
 *     the app NEVER claims grant eligibility (applicant/building/income rules).
 *   - Extension-record specs are the values Lista ZUM itself publishes
 *     (IOŚ-PIB-verified per EN 14511/14825, EU-accredited labs) — traceable
 *     via the ZUM id, plus the registry-published EPREL number where present.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataSheetEligibility, ratedCapacityKw, segmentOf } from '../lib/data-sheet-eligibility.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const EXPECTED_FIELD_COUNT = 88; // DE 78 − 4 German fields + performance_source
                                 // + bafa_reference_*(3) + zum_*(10) + zum_id
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

/* ── ZUM overlay (optional — build proceeds unenriched without it) ────────── */
const overlaySnapshot = newestSnapshot('data_sources/lista_zum/matching');
const overlayFile = overlaySnapshot
  ? JSON.parse(readFileSync(resolve(ROOT, 'data_sources/lista_zum/matching', overlaySnapshot, 'canonical-zum-overlay.json'), 'utf8'))
  : null;
const overlayByBafaId = new Map(Object.entries(overlayFile?.overlay ?? {}));
console.log(overlayFile
  ? `ZUM overlay: ${overlayByBafaId.size} products carry listing state (snapshot ${overlaySnapshot})`
  : 'ZUM overlay: none (all products will show verification_required)');

/* ── ZUM master seed (for the PL-market extension) ────────────────────────
   The seed, not the newest parsed snapshot: these records exist ONLY because
   the registry published them, so reading one fetch meant a failed fetch or a
   cleaned snapshot folder silently deleted products from the catalogue (the
   2026-07-12 German regression, which PL had no guard against until
   2026-08-12). The seed unions every snapshot and every previous seed.
   `seed.in_latest` is what keeps the listing claim honest below — a product
   the newest snapshot did not contain is still published, but never as
   "listed". Falls back to the parsed snapshot so a checkout without a built
   seed still works. */
const seedSnapshot = newestSnapshot('data_sources/lista_zum/master_seed');
const zumSeed = seedSnapshot
  ? JSON.parse(readFileSync(resolve(ROOT, 'data_sources/lista_zum/master_seed', seedSnapshot, 'zum-master-seed.json'), 'utf8'))
  : null;
const parsedSnapshot = newestSnapshot('data_sources/lista_zum/parsed');
const zumParsed = zumSeed ?? (parsedSnapshot
  ? JSON.parse(readFileSync(resolve(ROOT, 'data_sources/lista_zum/parsed', parsedSnapshot, 'zum-normalized.json'), 'utf8'))
  : null);
if (zumSeed) {
  console.log(`ZUM master seed: ${zumSeed.meta.total_entries} entries`
    + ` (in latest ${zumSeed.meta.in_latest}, absent ${zumSeed.meta.absent_from_latest}`
    + ` — absent entries publish as verification_required)`);
  if (zumSeed.meta.suspect_partial_fetch) {
    console.error('⚠️  ZUM: latest snapshot covers <70% of the seed — suspected partial fetch.'
      + ' Products are preserved; check the fetch before shipping.');
  }
} else if (zumParsed) {
  console.log('ZUM: no master seed on disk — falling back to the parsed snapshot'
    + ' (run scripts/pl/build-zum-master-seed.mjs to enable accumulation)');
}

const generatedAt = new Date().toISOString();

/* ── EPREL enrichment for PL-market records ────────────────────────────────
   Every active ZUM entry publishes its own EPREL registration number — an
   official EU identifier for the EXACT product. The local EPREL snapshot
   supplies label values the ZUM page does not repeat (ηs at 35 °C, indoor/
   outdoor sound power, 35 °C output). Values are copied only from the record
   with the identical registration number — identity by official id, never by
   name. Enriched records carry performance_source='ZUM_EPREL'.               */
function eprelValueIndex() {
  const dirRoot = resolve(ROOT, 'data_sources/eprel_raw/raw');
  const snaps = existsSync(dirRoot)
    ? readdirSync(dirRoot).filter(d => /^\d{4}-\d{2}$/.test(d)).sort() : [];
  const idx = new Map();
  if (!snaps.length) return idx;
  const dir = resolve(dirRoot, snaps[snaps.length - 1], 'spaceheaters-heatpump');
  if (!existsSync(dir)) return idx;
  for (const f of readdirSync(dir)) {
    if (!/^page-\d+\.json$/.test(f)) continue;
    for (const h of JSON.parse(readFileSync(resolve(dir, f), 'utf8')).hits ?? []) {
      idx.set(String(h.eprelRegistrationNumber), {
        etas35: h.seasonalSpaceHeatingEnergyEfficiencyAverage35
          ?? h.seasonalSpaceHeatingEnergyEfficiencyAverage ?? null,
        etas55: h.seasonalSpaceHeatingEnergyEfficiencyAverage55
          ?? h.mediumTempSeasonalSpaceHeatingEnergyEfficiencyAverage ?? null,
        kw35: h.ratedHeatOutputAverage35 ?? h.ratedHeatOutput ?? null,
        kw55: h.ratedHeatOutputAverage55 ?? h.mediumTempRatedHeatOutputAverage ?? null,
        noiseIndoor: h.noise ?? null,
        noiseOutdoor: h.outdoorNoise ?? null,
      });
    }
  }
  return idx;
}
const EPREL_VALUES = eprelValueIndex();
console.log(`EPREL value index: ${EPREL_VALUES.size} registration numbers (local snapshot)`);

/** German BAFA type strings → Polish display strings. Unknown values pass through. */
const TYPE_PL = {
  'Luft / Wasser': 'Powietrze / Woda',
  'Sole / Wasser': 'Solanka / Woda',
  'Wasser / Wasser': 'Woda / Woda',
  'Luft / Luft': 'Powietrze / Powietrze',
};

/** German registry status / funding fields — German facts. They do not travel. */
const GERMAN_ONLY_FIELDS = [
  'bafa_listing_status', 'bafa_foerderung_von', 'bafa_foerderung_bis', 'bafa_snapshot_fetched_at',
];

const EMPTY_ZUM_BLOCK = {
  zum_match_status: 'verification_required',
  zum_id: null,
  zum_product_name: null,
  zum_category: null,
  zum_class_55c: null,
  zum_match_method: null,
  zum_match_confidence: null,
  zum_snapshot: overlaySnapshot ?? parsedSnapshot ?? null,
  zum_snapshot_fetched_at: overlayFile?.meta?.generated_at ?? null,
  zum_first_matched_at: null,
  zum_last_confirmed_at: null,
};

function toPlItem(p) {
  const base = { ...p };
  for (const f of GERMAN_ONLY_FIELDS) delete base[f];
  const ov = overlayByBafaId.get(String(p.bafa_id));
  return {
    ...base,
    type: TYPE_PL[p.type] ?? p.type,
    country: 'PL',
    performance_source: 'BAFA_REFERENCE',
    bafa_reference_id: p.bafa_id != null ? String(p.bafa_id) : null,
    bafa_reference_model: p.model ?? null,
    bafa_reference_match_type: 'same_record',
    ...EMPTY_ZUM_BLOCK,
    ...(ov ?? {}),
  };
}

const residential = deResidential.items.map(toPlItem);
const commercial = deCommercial.items.map(toPlItem);

/* ── PL-market extension records (ZUM-native, spec-complete only) ────────── */
const TEMPLATE_KEYS = Object.keys(residential[0]);
const canonicalEprels = new Set(
  [...deResidential.items, ...deCommercial.items]
    .filter(i => i.eprel_registration_number != null)
    .map(i => String(i.eprel_registration_number)),
);
const confirmedZumIds = new Set(
  [...overlayByBafaId.values()].filter(o => o.zum_match_status === 'confirmed').map(o => o.zum_id),
);

const LEGAL_TOKENS = new Set(['GMBH', 'KG', 'CO', 'SP', 'ZOO', 'SA', 'AG', 'SE', 'SRL', 'SAS',
  'LTD', 'LLC', 'BV', 'AS', 'OY', 'AB', 'SPA', 'POLAND', 'POLSKA', 'EUROPE', 'AIRCONDITIONING']);
const shortName = mfr => {
  const t = String(mfr ?? '').normalize('NFKD').replace(/[^A-Za-z ]+/g, ' ').split(/\s+/)
    .find(w => w.length >= 3 && !LEGAL_TOKENS.has(w.toUpperCase()));
  return t ? t[0].toUpperCase() + t.slice(1) : (mfr ?? null);
};

const ZUM_TYPE = {
  PW: 'Powietrze / Woda',
  PG: 'Solanka / Woda',
  PU: 'Powietrze / Woda (C.W.U.)',
  PP: 'Powietrze / Powietrze',
};

// ZUM entries in the matcher's review queue have a PLAUSIBLE canonical
// counterpart (ambiguous identity, numeric conflict, one-to-many EPREL…).
// Publishing them as new PL records would put a near-duplicate next to their
// canonical sibling — they stay out of the extension until a human resolves
// the review row (or an official mapping/exception lands).
// EXCEPTION: rows the matcher marked `releasable` — their overlap was a shared
// SECONDARY component only (hydro-box/tank); the ZUM unit itself has no
// canonical counterpart and is safe to publish as a PL-market record.
const reviewFile = overlaySnapshot
  ? resolve(ROOT, 'data_sources/lista_zum/matching', overlaySnapshot, 'canonical-zum-review.json')
  : null;
const reviewRows = (reviewFile && existsSync(reviewFile)
  ? JSON.parse(readFileSync(reviewFile, 'utf8')).review ?? []
  : []);
// An id is blocked if ANY of its review rows is non-releasable.
const blockedIds = new Set(reviewRows.filter(r => r.releasable !== true).map(r => r.zum_id).filter(Boolean));
const reviewIds = blockedIds;
const releasableIds = new Set(reviewRows.filter(r => r.releasable === true).map(r => r.zum_id)
  .filter(id => id && !blockedIds.has(id)));

const extensionStats = { candidates: 0, alreadyConfirmed: 0, eprelInCanonical: 0, inReviewQueue: 0, ineligible: 0, added: 0, carriedNotInLatest: 0, byReason: {} };
const extension = [];

for (const z of zumParsed?.entries ?? []) {
  // Seedless fallback: without a seed every entry came from the newest snapshot.
  const inLatest = z.seed ? z.seed.in_latest === true : true;
  if (confirmedZumIds.has(z.zum_id)) { extensionStats.alreadyConfirmed++; continue; }
  // If the registry's EPREL number already exists in the canonical catalogue,
  // this device IS (a variant of) a canonical product — an ambiguity for the
  // review queue, never a duplicate product record.
  if (z.eprel_number && canonicalEprels.has(z.eprel_number)) { extensionStats.eprelInCanonical++; continue; }
  if (reviewIds.has(z.zum_id)) { extensionStats.inReviewQueue++; continue; }
  extensionStats.candidates++;
  if (releasableIds.has(z.zum_id)) extensionStats.releasedFromReview = (extensionStats.releasedFromReview ?? 0) + 1;

  // EPREL label values for the ZUM entry's own registration number.
  const ep = z.eprel_number ? EPREL_VALUES.get(z.eprel_number) ?? null : null;
  const usedEprel = Boolean(ep && (
    (z.etas_35 == null && ep.etas35 != null)
    || (z.etas_55 == null && ep.etas55 != null)
    || (!(z.noise_outdoor_db > 0) && ep.noiseOutdoor > 0)
    || (!(z.noise_indoor_db > 0) && ep.noiseIndoor > 0)
    || (z.rated_kw_55 == null && ep.kw55 != null)
    || ep.kw35 != null));

  const candidate = Object.fromEntries(TEMPLATE_KEYS.map(k => [k, null]));
  Object.assign(candidate, {
    bafa_id: `PL-${z.zum_id}`,
    source_id: `PL-${z.zum_id}`,
    uuid: null,
    country: 'PL',
    primary_source: 'LISTA_ZUM',
    manufacturer: z.manufacturer,
    manufacturer_normalized: String(z.manufacturer ?? '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(),
    manufacturer_short: shortName(z.manufacturer),
    model: z.model,
    type: ZUM_TYPE[z.category] ?? null,
    market_segment: null, // resolved by segmentOf at validation below
    installation_type: null,
    refrigerant: z.refrigerant ?? null,
    refrigerant_amount_kg: z.refrigerant_kg ?? null,
    power_55C_kw: z.rated_kw_55 ?? ep?.kw55 ?? null,
    power_35C_kw: ep?.kw35 ?? null,
    efficiency_55C_percent: z.etas_55 ?? ep?.etas55 ?? null,
    efficiency_35C_percent: z.etas_35 ?? ep?.etas35 ?? null,
    scop: z.scop ?? null,
    noise_outdoor_dB: z.noise_outdoor_db && z.noise_outdoor_db > 0 ? z.noise_outdoor_db
      : (ep?.noiseOutdoor && ep.noiseOutdoor > 0 ? ep.noiseOutdoor : null),
    noise_indoor_dB: z.noise_indoor_db && z.noise_indoor_db > 0 ? z.noise_indoor_db
      : (ep?.noiseIndoor && ep.noiseIndoor > 0 ? ep.noiseIndoor : null),
    website: z.producer_url ?? null,
    eprel_registration_number: z.eprel_number ?? null,
    eprel_match_type: z.eprel_number ? 'zum_published' : null,
    performance_source: usedEprel ? 'ZUM_EPREL' : 'ZUM_REGISTRY',
    bafa_reference_id: null,
    bafa_reference_model: null,
    bafa_reference_match_type: null,
    source_snapshot_generated_at: zumParsed.meta.latest_snapshot_generated_at ?? zumParsed.meta.generated_at,
    /**
     * A record the newest snapshot did not contain keeps its specification but
     * loses the listing claim: 'review_required' renders as "Weryfikacja ZUM
     * wymagana" and hides the ZUM id (src/hpiq/listing.ts). It never becomes
     * "not on the list" — absence in OUR fetch is a fact about our fetch, and
     * only a market that owns its registry may state a removal.
     */
    zum_match_status: inLatest ? 'confirmed' : 'review_required',
    // The published id follows the listing claim: it appears only where the
    // status is 'confirmed' (invariant enforced below). Traceability survives
    // regardless — source_id is `PL-<zum id>`.
    zum_id: inLatest ? z.zum_id : null,
    zum_product_name: z.product_name ?? null,
    zum_category: z.category,
    zum_class_55c: z.class_55 ?? z.single_class ?? null,
    zum_match_method: 'zum_native',
    zum_match_confidence: inLatest ? 'high' : 'medium',
    zum_snapshot: parsedSnapshot,
    zum_snapshot_fetched_at: zumParsed.meta.latest_snapshot_generated_at ?? zumParsed.meta.generated_at,
    zum_first_matched_at: z.added_at ?? null,
    // Only a product the NEWEST snapshot contained may carry today's date as
    // its confirmation; for the rest this stays the month we last saw it.
    zum_last_confirmed_at: inLatest ? generatedAt : (z.seed?.last_seen ?? null),
  });

  // THE SAME eligibility rule as every market — no weaker Poland standard.
  const elig = dataSheetEligibility(candidate);
  if (!elig.eligible) {
    extensionStats.ineligible++;
    for (const r of elig.reasons) extensionStats.byReason[r] = (extensionStats.byReason[r] ?? 0) + 1;
    continue;
  }
  extension.push(candidate);
  extensionStats.added++;
  if (!inLatest) extensionStats.carriedNotInLatest++;
}

// Extension-internal dedupe: distinct ZUM ids can carry the same physical
// product (re-registrations, category moves, trade-name variants). One model,
// one record — and one EPREL registration, one record: a shared EPREL number
// is the SAME registered product under two designations (Ecoforest "… EH" /
// "… HTR EH" pairs). The base (shortest) designation stays, deterministically.
extension.sort((a, b) => String(a.model ?? '').length - String(b.model ?? '').length
  || String(a.zum_id).localeCompare(String(b.zum_id)));
const seenModelKey = new Set();
const seenEprel = new Set();
const dedupedExtension = extension.filter(x => {
  const key = `${x.manufacturer_normalized}|${String(x.model ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  if (seenModelKey.has(key)) { extensionStats.added--; extensionStats.duplicateModel = (extensionStats.duplicateModel ?? 0) + 1; return false; }
  const ek = x.eprel_registration_number ? String(x.eprel_registration_number) : null;
  if (ek && seenEprel.has(ek)) { extensionStats.added--; extensionStats.duplicateEprel = (extensionStats.duplicateEprel ?? 0) + 1; return false; }
  seenModelKey.add(key);
  if (ek) seenEprel.add(ek);
  return true;
});
extension.length = 0;
extension.push(...dedupedExtension);

for (const x of extension) {
  x.market_segment = segmentOf(x) === 'commercial' ? 'commercial_project' : 'residential_core';
  (segmentOf(x) === 'commercial' ? commercial : residential).push(x);
}

/* ── Public-schema transform: no German-market field names leave Poland ────
   Internal building above uses the canonical field names (bafa_id, …) so the
   overlay/matching artifacts stay traceable. The PUBLIC Polish dataset renames
   them to neutral European-reference terminology — visible text was always
   neutral; this makes the machine-readable payload neutral too:
     bafa_id                   → european_reference_id
     bafa_reference_model      → european_reference_model
     bafa_reference_match_type → european_reference_match_type
     bafa_reference_id         → (dropped — same value as european_reference_id)
     performance_source        'BAFA_REFERENCE' → 'EU_MEASURED_REFERENCE'
     primary_source            'BAFA' → 'EU_REFERENCE'                        */
function toPublicPlItem(p) {
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
const publicResidential = residential.map(toPublicPlItem);
const publicCommercial = commercial.map(toPublicPlItem);

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

// The public Polish schema must carry NO German-market field names or source
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

const badProvenance = allItems.filter(i =>
  !i.european_reference_id || !i.source_id || i.country !== 'PL'
  || !['EU_MEASURED_REFERENCE', 'ZUM_REGISTRY', 'ZUM_EPREL'].includes(i.performance_source));
if (badProvenance.length > 0) {
  console.error(`FAIL: ${badProvenance.length} items missing required PL provenance`);
  process.exit(1);
}

const ids = allItems.map(i => String(i.source_id));
if (new Set(ids).size !== ids.length) {
  console.error('FAIL: duplicate source_id in PL catalogue');
  process.exit(1);
}

// Listing-state integrity: confirmed ⇔ has zum_id; nothing else carries an id.
const badListing = allItems.filter(i =>
  (i.zum_match_status === 'confirmed') !== Boolean(i.zum_id));
if (badListing.length > 0) {
  console.error(`FAIL: ${badListing.length} items violate confirmed⇔zum_id integrity`);
  process.exit(1);
}

// One ZUM id → one product.
const zumIds = allItems.filter(i => i.zum_id).map(i => i.zum_id);
if (new Set(zumIds).size !== zumIds.length) {
  console.error('FAIL: a ZUM id is attached to more than one product');
  process.exit(1);
}

// Every product must be publishable and classifiable.
const inelig = allItems.filter(i => !dataSheetEligibility(i).eligible);
if (inelig.length > 0) {
  console.error(`FAIL: ${inelig.length} items fail Data-Sheet eligibility`);
  process.exit(1);
}
const unclassified = allItems.filter(i => segmentOf(i) === 'unclassified');
if (unclassified.length > 0) {
  console.error(`FAIL: ${unclassified.length} items unclassifiable (no rated capacity)`);
  process.exit(1);
}

const derivedCount = deResidential.items.length + deCommercial.items.length;
if (allItems.length !== derivedCount + extension.length) {
  console.error('FAIL: record count mismatch vs DE source + extension');
  process.exit(1);
}

/* ── Write output ─────────────────────────────────────────────────────────── */

function writeOutput(relPath, items, dataset, sourceMeta) {
  const payload = {
    _meta: {
      generated: generatedAt,
      generator: 'build-app-products-pl.mjs v1.0',
      dataset,
      country: 'PL',
      primary_source: 'EU_REFERENCE',
      description: 'Polish market catalogue: the canonical European reference dataset — technical '
        + 'specifications are EU-harmonised measured reference values (EN 14511/14825, EU 811/2013; '
        + "performance_source='EU_MEASURED_REFERENCE'), not Polish certification data — plus a Lista ZUM "
        + 'listing overlay (confirmed matches only; a failed match is shown as verification-required, '
        + 'never as absence) and spec-complete PL-market records built from Lista ZUM\'s own published '
        + "measured values (performance_source='ZUM_REGISTRY'/'ZUM_EPREL', source_id PL-<zum id>). "
        + 'Czyste Powietrze / Moje Ciepło eligibility is applicant- and building-dependent — this app '
        + 'makes no eligibility claims.',
      total_items: items.length,
      reference_dataset_generated: sourceMeta.generated,
      zum_overlay_source: overlayFile ? `data_sources/lista_zum/matching/${overlaySnapshot}/canonical-zum-overlay.json` : null,
      zum_snapshot: parsedSnapshot ?? null,
      zum_confirmed_total: items.filter(i => i.zum_match_status === 'confirmed').length,
      zum_native_total: items.filter(i => i.zum_match_method === 'zum_native').length,
      eprel_linked_total: items.filter(i => i.eprel_registration_number != null).length,
      segments_included: dataset === 'residential' ? ['residential_core'] : ['light_commercial', 'commercial_project'],
    },
    items,
  };
  writeFileSync(resolve(ROOT, relPath), JSON.stringify(payload));
  console.log(`Wrote ${items.length} items → ${relPath}`);
}

writeOutput('public/data/products-pl.json', publicResidential, 'residential', deResidential._meta);
writeOutput('public/data/products-commercial-pl.json', publicCommercial, 'commercial', deCommercial._meta);

/* ── Summary ──────────────────────────────────────────────────────────────── */

const confirmedTotal = allItems.filter(i => i.zum_match_status === 'confirmed').length;
console.log('');
console.log('── Build summary (PL) ─────────────────────────────────────');
console.log(`Catalogue:                ${allItems.length} items (residential ${residential.length}, commercial ${commercial.length})`);
console.log(`  derived from DE:        ${derivedCount}`);
console.log(`  PL-market extension:    ${extension.length} (ZUM-native, spec-complete)`);
console.log(`  ZUM listed (confirmed): ${confirmedTotal}`);
console.log(`  review_required:        ${allItems.filter(i => i.zum_match_status === 'review_required').length}`);
console.log(`  EPREL linked:           ${allItems.filter(i => i.eprel_registration_number != null).length}`);
console.log(`Extension funnel:         zum entries ${extensionStats.candidates + extensionStats.alreadyConfirmed + extensionStats.eprelInCanonical + extensionStats.inReviewQueue}`
  + ` → matched ${extensionStats.alreadyConfirmed} | eprel-in-canonical ${extensionStats.eprelInCanonical}`
  + ` | review-queue ${extensionStats.inReviewQueue} | ineligible ${extensionStats.ineligible} | added ${extensionStats.added}`);
console.log(`  released from review (secondary-overlap only): ${extensionStats.releasedFromReview ?? 0}`
  + ` | EPREL-enriched natives: ${extension.filter(x => x.performance_source === 'ZUM_EPREL').length}`
  + ` | duplicate drops: ${extensionStats.duplicateModel ?? 0} model + ${extensionStats.duplicateEprel ?? 0} eprel`);
if (extensionStats.ineligible) console.log('  ineligible reasons:', JSON.stringify(extensionStats.byReason));
if (extensionStats.carriedNotInLatest) console.log(`  carried from the seed, absent from the latest snapshot: `
  + `${extensionStats.carriedNotInLatest} (published with verification_required, ZUM id hidden)`);
console.log(`Field count:              ${fieldCount} ✓   No price keys ✓   PL provenance ✓   listing integrity ✓`);
console.log('──────────────────────────────────────────────────────────');
