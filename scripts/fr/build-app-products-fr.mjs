/**
 * build-app-products-fr.mjs  v1.0  (France dataset builder)
 *
 * Strategy (user decision 2026-07-07): manufacturers sell largely the same
 * hardware in France as in Germany, so the FR catalogue is DERIVED FROM THE
 * GERMAN BAFA-BASED DATASET — faster and far more complete than building from
 * a French registry. NF PAC (Certita) certification references are attached
 * as an optional enrichment overlay ONLY where a confident match exists;
 * uncertain matches are never shown.
 *
 * Inputs:
 *   public/data/products.json + products-commercial.json
 *     (DE builder output — run build-app-products-from-master-seed.mjs first)
 *   data_sources/nf_pac/matching/YYYY-MM/fr-nfpac-matches.json (optional)
 *     { matches: [{ bafa_id, nf_pac_reference, ... }] }
 *
 * Outputs: public/data/products-fr.json + products-commercial-fr.json
 *
 * Honesty policy (FR):
 *   - Specs are German BAFA registry values presented in the French market —
 *     a technical cross-reference (performance_source='BAFA_REFERENCE'), not
 *     French certification data. The data sheet says so.
 *   - MaPrimeRénov'/CEE eligibility is CRITERIA-based (ηs thresholds, RGE
 *     installer) — the app never claims eligibility; it links to official
 *     sources. NF PAC references appear only on confident matches.
 *   - German type strings are localised (Luft/Wasser → Air/Eau) for display.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { eprelNativeEligibility } from '../lib/data-sheet-eligibility.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const EXPECTED_FIELD_COUNT = 87; // DE 78 − 4 German status/funding fields (they do not travel)
                                 //        + performance_source + bafa_reference_*(3) + nf_pac_reference
                                 //        + the 8 ADEME agrément fields, present on EVERY record.
                                 // The native layer must not give itself a wider shape than the rest
                                 // of the dataset: a field that exists on some records and not others
                                 // is a field consumers cannot rely on.
const PRICE_KEY_FRAGMENTS = ['price', 'brand_tier', 'price_confidence', 'package_scope', 'capacity_band', 'refrigerant_group'];

function loadJSON(relPath, hint) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) {
    console.error(`Missing ${relPath}${hint ? ` — ${hint}` : ''}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(abs, 'utf8'));
}

const deResidential = loadJSON('public/data/products.json', 'run scripts/bafa/build-app-products-from-master-seed.mjs first');
const deCommercial = loadJSON('public/data/products-commercial.json', 'run scripts/bafa/build-app-products-from-master-seed.mjs first');

// Optional NF PAC overlay — newest matching snapshot if present.
const NFPAC_DIR = resolve(ROOT, 'data_sources/nf_pac/matching');
const nfpacSnapshot = existsSync(NFPAC_DIR)
  ? readdirSync(NFPAC_DIR).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().reverse()[0] ?? null
  : null;
const nfpacFile = nfpacSnapshot
  ? JSON.parse(readFileSync(resolve(NFPAC_DIR, nfpacSnapshot, 'fr-nfpac-matches.json'), 'utf8'))
  : null;
const nfpacByBafaId = new Map((nfpacFile?.matches ?? []).map(m => [String(m.bafa_id), m]));
console.log(nfpacFile
  ? `NF PAC overlay: ${nfpacByBafaId.size} confident matches (snapshot ${nfpacSnapshot})`
  : 'NF PAC overlay: none (references will appear once confident match data exists)');

/* ── ADEME agrément: two distinct files, two distinct jobs ────────────────────
   canonical-agrement-overlay.json   listing status for products that already
                                     exist in the canonical baseline — attaches a
                                     number, never a specification
   agrement-eprel-enrichment.json    the FR-edition native layer further down —
                                     register entries the baseline never had

   The overlay used to be written and then read by nobody: every German-derived
   record was published with a hardcoded null agrément, so the matcher's confirmed
   mappings never reached a single user. The assertion after the build exists so
   that silence can never come back. */
const AGR_DIR = resolve(ROOT, 'data_sources/ademe_agrement/matching');
const agrSnapshot = existsSync(AGR_DIR)
  ? readdirSync(AGR_DIR).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().reverse()[0] : null;

const agrOverlayPath = `data_sources/ademe_agrement/matching/${agrSnapshot}/canonical-agrement-overlay.json`;
const agrOverlay = agrSnapshot && existsSync(resolve(ROOT, agrOverlayPath)) ? loadJSON(agrOverlayPath) : null;
/** canonical id → confirmed listing. Anything short of confirmed stays null:
 *  "vérification requise" is the honest reading of every other state. */
const agrByCanonicalId = new Map();
/** Agrément numbers the baseline already accounts for — see the native layer. */
const agrementInCanonical = new Set();
for (const e of agrOverlay?.entries ?? []) {
  if (e.status !== 'confirmed') continue;
  agrByCanonicalId.set(String(e.canonical_id), e);
  agrementInCanonical.add(e.agrement_number);
}
console.log(agrOverlay
  ? `ADEME listing overlay: ${agrByCanonicalId.size} confirmed canonical listings (snapshot ${agrSnapshot})`
  : 'ADEME listing overlay: none (run scripts/fr/match-canonical-to-agrement.mjs)');

const generatedAt = new Date().toISOString();

/** German BAFA type strings → French display strings. Unknown values pass through. */
const TYPE_FR = {
  'Luft / Wasser': 'Air / Eau',
  'Sole / Wasser': 'Eau glycolée / Eau',
  'Wasser / Wasser': 'Eau / Eau',
  'Luft / Luft': 'Air / Air',
};

/** German registry status / funding fields — German facts. They do not travel. */
const GERMAN_ONLY_FIELDS = [
  'bafa_listing_status', 'bafa_foerderung_von', 'bafa_foerderung_bis', 'bafa_snapshot_fetched_at',
];

function toFrItem(p) {
  const base = { ...p };
  for (const f of GERMAN_ONLY_FIELDS) delete base[f];
  const agr = agrByCanonicalId.get(String(p.bafa_id));
  return {
    ...base,
    type: TYPE_FR[p.type] ?? p.type,
    country: 'FR',
    // Specs are the same hardware's German BAFA registry values — mark them as
    // a cross-reference exactly like the GB edition does.
    performance_source: 'BAFA_REFERENCE',
    bafa_reference_id: p.bafa_id != null ? String(p.bafa_id) : null,
    bafa_reference_model: p.model ?? null,
    bafa_reference_match_type: 'same_record',
    nf_pac_reference: nfpacByBafaId.get(String(p.bafa_id))?.nf_pac_reference ?? null,
    // The agrément block exists on every FR record. A canonical product that the
    // register confirms carries its number; one we cannot confirm carries nulls,
    // which read as "vérification requise" — never as absence from the register.
    // usage and the commercial reference are register-row facts the listing
    // overlay does not carry, so they stay null outside the native layer.
    agrement_number: agr?.agrement_number ?? null,
    agrement_match_status: agr ? 'confirmed' : null,
    agrement_gamme: agr?.register_gamme ?? null,
    agrement_commercial_ref: null,
    agrement_usage: null,
    agrement_snapshot: agr ? agrSnapshot : null,
    agrement_import_date: agr?.import_date ?? null,
    performance_basis_note: null,
  };
}

const residential = deResidential.items.map(toFrItem);
const commercial = deCommercial.items.map(toFrItem);

/* ── FR-market native layer: ADEME agrément × EPREL ──────────────────────────
   The German baseline never carried the brands that dominate the French subsidy
   register — Atlantic, De Dietrich, Saunier Duval, Thermor, Intuis. Those models
   are exactly the ones a French installer must put an agrément number against
   from 2026-09-01, so a catalogue without them answers the wrong question.

   The register supplies identity, heat-source type, refrigerant, usage and the
   agrément number; EPREL supplies ηs, rated output and sound power for the same
   model identifier. Neither alone can produce a data sheet. Nothing is inferred
   from a model name, and no figure is carried over from the German records.

   These are FR-EDITION ONLY: source_id is 'FR-<agrément number>' and no other
   builder reads this file.

   THE LAYER EXISTS FOR ENTRIES THE BASELINE DOES NOT HAVE — so an entry the
   listing overlay has already confirmed against a canonical product is skipped
   here. Publishing both would put the same machine in the catalogue twice under
   one agrément number: once with German reference values and once with EPREL
   values, in two data sheets a French installer would have to choose between.
   The canonical record wins and simply carries the number, which is what a
   listing overlay is for. (Publishing both is exactly what happened on the
   layer's first day, because the overlay was not wired in and the collision was
   invisible: 87 duplicate pairs.) */
const agrFile = agrSnapshot && existsSync(resolve(AGR_DIR, agrSnapshot, 'agrement-eprel-enrichment.json'))
  ? loadJSON(`data_sources/ademe_agrement/matching/${agrSnapshot}/agrement-eprel-enrichment.json`) : null;

/** Register type strings are already French; they are used verbatim. */
const TYPE_AGR = {
  'Air/Eau': 'Air / Eau',
  'Eau glycolée/Eau': 'Eau glycolée / Eau',
  'Eau/Eau': 'Eau / Eau',
  'Sol/Eau': 'Sol / Eau',
};
const CONFIG_AGR = { Monobloc: 'Monoblock', Split: 'Split' };

const TEMPLATE_KEYS = Object.keys(residential[0] ?? {});
const nativeRejected = {};
const native = [];
for (const e of (agrFile?.entries ?? [])) {
  if (e.status !== 'matched' || !e.publishable) continue;
  if (agrementInCanonical.has(e.agrement)) { nativeRejected.already_in_canonical_baseline = (nativeRejected.already_in_canonical_baseline ?? 0) + 1; continue; }
  const candidate = Object.fromEntries(TEMPLATE_KEYS.map(k => [k, null]));
  Object.assign(candidate, {
    bafa_id: `FR-${e.agrement}`,
    source_id: `FR-${e.agrement}`,
    country: 'FR',
    primary_source: 'ADEME_AGREMENT',
    performance_source: 'EPREL',
    manufacturer: e.brand,
    manufacturer_normalized: String(e.brand ?? '').toUpperCase().normalize('NFKD')
      .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(),
    manufacturer_short: e.brand,
    model: e.model,
    type: TYPE_AGR[e.type_pac] ?? e.type_pac,
    installation_type: CONFIG_AGR[e.configuration] ?? null,
    refrigerant: e.refrigerant ?? null,
    // Performance exactly as EPREL publishes it. The energy class is NOT copied:
    // the app derives it from ηs per EU 811/2013, the same way it does for every
    // other record, so one rule decides every class on the site.
    power_35C_kw: e.rated_kw_35 ?? null,
    power_55C_kw: e.rated_kw_55 ?? null,
    efficiency_35C_percent: e.eta_s_35 ?? null,
    efficiency_55C_percent: e.eta_s_55 ?? null,
    noise_outdoor_dB: e.noise_outdoor_dB ?? null,
    noise_indoor_dB: e.noise_indoor_dB ?? null,
    outdoor_side_display_model: e.model,
    outdoor_side_identified: false,
    // Listing block: the record IS an agrément entry, so it is confirmed by
    // construction. It carries the number a devis and a facture must show.
    agrement_number: e.agrement,
    agrement_match_status: 'confirmed',
    agrement_gamme: e.gamme ?? null,
    agrement_commercial_ref: e.commercial_ref ?? null,
    agrement_usage: e.usage ?? null,
    agrement_snapshot: agrSnapshot,
    agrement_import_date: agrFile?._meta?.register_import_date ?? null,
    eprel_registration_number: e.eprel_registration_number ?? null,
    eprel_model: e.eprel_model ?? null,
    eprel_match_type: e.match_method ?? null,
    performance_basis_note: 'EPREL (EU energy label registry); listing and refrigerant from the ADEME agrément register',
    source_snapshot_generated_at: agrFile?._meta?.generated ?? null,
    market_segment: null,   // resolved by the shared segmentation rule below
  });
  candidate.market_segment = (candidate.power_35C_kw ?? 0) > 23 ? 'commercial' : 'residential_core';

  const r = eprelNativeEligibility(candidate);
  if (!r.eligible) { for (const x of r.reasons) nativeRejected[x] = (nativeRejected[x] ?? 0) + 1; continue; }
  native.push(candidate);
}
console.log(agrFile
  ? `ADEME×EPREL native layer: ${native.length} FR-edition records (snapshot ${agrSnapshot})`
    + (Object.keys(nativeRejected).length ? ` · rejected ${JSON.stringify(nativeRejected)}` : '')
  : 'ADEME×EPREL native layer: none (run scripts/fr/enrich-agrement-from-eprel.mjs)');

const nativeRes = native.filter(i => i.market_segment !== 'commercial');
const nativeCom = native.filter(i => i.market_segment === 'commercial');
const allItems = [...residential, ...commercial, ...native];

// ── Validate ──────────────────────────────────────────────────────────────────

const fieldCount = Object.keys(allItems[0]).length;
if (fieldCount !== EXPECTED_FIELD_COUNT) {
  console.error(`FAIL: field count mismatch: expected ${EXPECTED_FIELD_COUNT}, got ${fieldCount}`);
  console.error('Fields:', Object.keys(allItems[0]).join(', '));
  process.exit(1);
}

const priceKeysFound = Object.keys(allItems[0]).filter(k =>
  PRICE_KEY_FRAGMENTS.some(frag => k.includes(frag))
);
if (priceKeysFound.length > 0) {
  console.error('FAIL: price-like keys present:', priceKeysFound.join(', '));
  process.exit(1);
}

const badProvenance = allItems.filter(i =>
  !i.bafa_id || !i.source_id || i.country !== 'FR'
  || !['BAFA_REFERENCE', 'EPREL'].includes(i.performance_source)
  // An EPREL-native record without its agrément number is the one thing this
  // layer may never publish — the number is why the record exists.
  || (i.performance_source === 'EPREL' && (!i.agrement_number || !String(i.source_id).startsWith('FR-')))
  // …and no German-derived record may ever claim EPREL provenance.
  || (i.performance_source === 'BAFA_REFERENCE' && String(i.source_id).startsWith('FR-'))
);
if (badProvenance.length > 0) {
  console.error(`FAIL: ${badProvenance.length} items missing required FR provenance`);
  process.exit(1);
}

if (allItems.length !== deResidential.items.length + deCommercial.items.length + native.length) {
  console.error('FAIL: record count mismatch vs DE source datasets + native layer');
  process.exit(1);
}

/* The listing overlay must actually reach the dataset. It did not for the whole
   of the layer's first day: the matcher confirmed mappings, the builder ignored
   the file, and every German-derived record shipped with a null agrément while
   the gate — which reads the published dataset — saw the native layer's 1,078
   confirmations and reported a healthy count. A silent disconnect that a guard
   cannot see is the failure mode worth spending an assertion on. */
if (agrOverlay) {
  const canonicalIds = new Set([...residential, ...commercial].map(i => String(i.bafa_id)));
  const applicable = [...agrByCanonicalId.keys()].filter(id => canonicalIds.has(id)).length;
  const applied = [...residential, ...commercial].filter(i => i.agrement_match_status === 'confirmed').length;
  if (applied !== applicable) {
    console.error(`FAIL: listing overlay not applied — ${applicable} confirmed mappings match a canonical product, ${applied} reached the dataset`);
    process.exit(1);
  }
  console.log(`ADEME listing applied:   ${applied} canonical products carry an agrément number`);
}

// NF PAC references must never be guessed — every value must come from the overlay.
const nfpacSet = allItems.filter(i => i.nf_pac_reference !== null).length;
if (!nfpacFile && nfpacSet > 0) {
  console.error('FAIL: NF PAC references present without an overlay file');
  process.exit(1);
}

// ── Write output ──────────────────────────────────────────────────────────────

function writeOutput(relPath, items, dataset, sourceMeta) {
  const payload = {
    _meta: {
      generated: generatedAt,
      generator: 'build-app-products-fr.mjs v1.0',
      dataset,
      country: 'FR',
      primary_source: 'BAFA',
      description: 'French market catalogue derived from the German BAFA-based dataset (same hardware sold in '
        + 'both markets). All technical specifications are German BAFA registry values presented as a '
        + "cross-reference (performance_source='BAFA_REFERENCE'), not French certification data. "
        + "MaPrimeRénov'/CEE eligibility is criteria-based — this app makes no eligibility claims. "
        + 'NF PAC (Certita) references are attached only where a confident match exists; uncertain matches '
        + 'are never shown.',
      total_items: items.length,
      derived_from: {
        de_dataset_generated: sourceMeta.generated,
        de_generator: sourceMeta.generator,
        bafa_seed: sourceMeta.primary_source,
      },
      nf_pac_overlay_source: nfpacFile ? `data_sources/nf_pac/matching/${nfpacSnapshot}/fr-nfpac-matches.json` : null,
      nf_pac_referenced_total: items.filter(i => i.nf_pac_reference !== null).length,
      eprel_linked_total: items.filter(i => i.eprel_registration_number != null).length,
      segments_included: dataset === 'residential' ? ['residential_core'] : ['light_commercial', 'commercial_project'],
    },
    items,
  };
  writeFileSync(resolve(ROOT, relPath), JSON.stringify(payload));
  console.log(`Wrote ${items.length} items → ${relPath}`);
}

writeOutput('public/data/products-fr.json', [...residential, ...nativeRes], 'residential', deResidential._meta);
writeOutput('public/data/products-commercial-fr.json', [...commercial, ...nativeCom], 'commercial', deCommercial._meta);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
console.log('── Build summary (FR) ─────────────────────────────────────');
console.log(`Derived from DE dataset:  ${allItems.length} items (residential ${residential.length}, commercial ${commercial.length})`);
console.log(`  EPREL linked:           ${allItems.filter(i => i.eprel_registration_number != null).length}`);
console.log(`  NF PAC referenced:      ${nfpacSet}${nfpacFile ? '' : '  (no overlay yet)'}`);
console.log(`Field count:              ${fieldCount} ✓`);
console.log(`No price keys:            ✓`);
console.log(`FR provenance complete:   ✓`);
console.log('──────────────────────────────────────────────────────────');
