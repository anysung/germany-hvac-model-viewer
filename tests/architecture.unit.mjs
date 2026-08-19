/**
 * Architecture tests — canonical technical baseline + local listing overlay.
 *
 * Run: node tests/architecture.unit.mjs
 *
 * Guards docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md:
 *   1. public products come from the canonical baseline, never from a local registry
 *   2. a local match failure changes nothing — not the product, not the segment
 *   3. "no match" is never rendered as "not listed"
 *   4. Data Sheet eligibility is one shared, measurable rule
 *   5. the publication gate blocks a bad candidate BEFORE anything is uploaded
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  dataSheetEligibility, isDataSheetEligible, applyEligibility, isPublishable,
  ratedCapacityKw, segmentOf, coreFieldCount,
  REQUIRED_FIELDS, CORE_PERFORMANCE_FIELDS, MIN_CORE_FIELDS, SEGMENT_THRESHOLD_KW,
} from '../scripts/lib/data-sheet-eligibility.mjs';

let failed = 0;
const is = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};

/** A canonical product that passes everything — the baseline for the variations below. */
const good = (over = {}) => ({
  manufacturer: 'Acme GmbH', model: 'HP-12', bafa_id: 123456, type: 'Luft / Wasser',
  efficiency_35C_percent: 185, power_35C_kw: 12,
  refrigerant: 'R290', scop: 4.8, cop_A7W35: 5.1, cop_A2W35: 4.2, noise_outdoor_dB: 54,
  noise_indoor_dB: 42,
  ...over,
});

console.log('\nData Sheet eligibility — the required fields');
is('a complete product is publishable', isDataSheetEligible(good()), true);
for (const f of REQUIRED_FIELDS) {
  is(`missing ${f} → not publishable`, isDataSheetEligible(good({ [f]: null })), false);
}
is('a record with only manufacturer, model and an id is NOT a data sheet',
  dataSheetEligibility({ manufacturer: 'Acme', model: 'X', bafa_id: 1 }).eligible, false);
is('no rated capacity → not publishable',
  isDataSheetEligible(good({ power_35C_kw: null, power_design_35C_kw: null, power_55C_kw: null, power_design_55C_kw: null })), false);
is('the reason is named, not just a boolean',
  dataSheetEligibility(good({ power_35C_kw: null })).reasons.includes('no_rated_capacity'), true);

console.log('\nData Sheet eligibility — the measured minimum');
is(`${MIN_CORE_FIELDS} core fields is enough`,
  isDataSheetEligible(good({ scop: null, cop_A7W35: null, cop_A2W35: null })), true);   // refrigerant + sound
is('one lone core field is not',
  isDataSheetEligible(good({ scop: null, cop_A7W35: null, cop_A2W35: null, noise_outdoor_dB: null, noise_indoor_dB: null })), false);
is('and it says so', dataSheetEligibility(good({ scop: null, cop_A7W35: null, cop_A2W35: null, noise_outdoor_dB: null, noise_indoor_dB: null })).reasons,
  ['insufficient_core_fields_1_of_2']);
is('indoor sound power counts as a measured field (ground/exhaust units)',
  isDataSheetEligible(good({ scop: null, cop_A7W35: null, cop_A2W35: null, noise_outdoor_dB: null })), true);
is('core fields are counted, not assumed', coreFieldCount(good()), CORE_PERFORMANCE_FIELDS.length);

console.log('\nSegmentation is shared and unchanged');
is(`threshold is ${SEGMENT_THRESHOLD_KW} kW`, SEGMENT_THRESHOLD_KW, 23);
is('23.00 kW → residential', segmentOf({ power_35C_kw: 23 }), 'residential');
is('23.01 kW → commercial', segmentOf({ power_35C_kw: 23.01 }), 'commercial');
is('no capacity → unclassified (and so never publishable)', segmentOf({}), 'unclassified');
is('an unclassified product can never be published', isDataSheetEligible({ ...good(), power_35C_kw: null, power_design_35C_kw: null, power_55C_kw: null, power_design_55C_kw: null }), false);

console.log('\napplyEligibility reports causes, not just counts');
{
  const { eligible, rejected, byReason } = applyEligibility([good(), good({ noise_outdoor_dB: null, noise_indoor_dB: null, scop: null, cop_A7W35: null, cop_A2W35: null })]);
  is('one in, one out', [eligible.length, rejected.length], [1, 1]);
  is('the cause is tallied', byReason.insufficient_core_fields_1_of_2, 1);
}

// ── The built datasets ───────────────────────────────────────────────────────
const GB = 'public/data/products-gb.json';
if (!existsSync(GB)) {
  console.log('\n(datasets not built — dataset architecture assertions skipped)');
} else {
  const load = f => JSON.parse(readFileSync(f, 'utf8'));
  const de = [...load('public/data/products.json').items, ...load('public/data/products-commercial.json').items];
  const gb = [...load(GB).items, ...load('public/data/products-commercial-gb.json').items];
  const fr = [...load('public/data/products-fr.json').items, ...load('public/data/products-commercial-fr.json').items];

  console.log('\nUK products come from the canonical baseline — not from the PEL');
  const canonicalIds = new Set(de.map(p => String(p.bafa_id)));
  is('every UK product is a canonical product', gb.every(p => canonicalIds.has(String(p.bafa_id))), true);
  is('no UK product was created by the PEL', gb.every(p => p.primary_source !== 'OFGEM_PEL'), true);
  is('the UK catalogue is the canonical catalogue', gb.length, de.length);
  // France also publishes an FR-EDITION-ONLY layer (2026-08-19): ADEME agrément
  // entries carrying EPREL performance, for models the German baseline never had.
  // The canonical part must still travel whole, and the native part must stay put.
  const frCanonical = fr.filter(p => p.performance_source !== 'EPREL');
  const frNative = fr.filter(p => p.performance_source === 'EPREL');
  is('every canonical product travels to France', frCanonical.length, de.length);
  is('French natives are FR-scoped and carry the agrément number they exist for',
    frNative.length > 0 && frNative.every(p =>
      String(p.source_id).startsWith('FR-') && p.agrement_number && p.country === 'FR'), true);
  is('no French native leaked into the UK catalogue',
    gb.every(p => p.performance_source !== 'EPREL'), true);
  is('no French native leaked into the German canonical baseline',
    de.every(p => p.performance_source !== 'EPREL'), true);

  console.log('\nA failed local match changes NOTHING');
  const unmatched = gb.filter(p => p.pel_match_status !== 'confirmed');
  is('unmatched products are still published', unmatched.length > 0, true);
  is('…and still have a rated capacity', unmatched.every(p => ratedCapacityKw(p) != null), true);
  is('…and still have a segment', unmatched.every(p => segmentOf(p) !== 'unclassified'), true);
  is('…and still pass eligibility', unmatched.every(isDataSheetEligible), true);
  // The overlay may not touch technical data: compare with the canonical record.
  const byId = new Map(de.map(p => [String(p.bafa_id), p]));
  const tech = ['power_35C_kw', 'scop', 'cop_A7W35', 'refrigerant', 'efficiency_35C_percent', 'noise_outdoor_dB'];
  is('the overlay never overwrote a technical field',
    gb.every(p => tech.every(f => JSON.stringify(p[f] ?? null) === JSON.stringify(byId.get(String(p.bafa_id))?.[f] ?? null))), true);
  is('the overlay never changed a segment',
    gb.every(p => segmentOf(p) === segmentOf(byId.get(String(p.bafa_id)))), true);

  console.log('\nListing semantics');
  is('every product has a listing state',
    gb.every(p => ['confirmed', 'review_required', 'verification_required'].includes(p.pel_match_status)), true);
  is('a confirmed listing always carries the registry id',
    gb.every(p => p.pel_match_status !== 'confirmed' || !!p.mcs_number), true);
  is('an unconfirmed product carries NO registry id (nothing is implied)',
    gb.every(p => p.pel_match_status === 'confirmed' || p.mcs_number == null), true);
  is('no UK product is marked "not listed" — absence of a match is not absence',
    gb.every(p => p.pel_match_status !== 'not_listed' && p.bafa_listing_status === undefined), true);

  console.log('\nNo German registration status leaves Germany');
  for (const [cc, items] of [['GB', gb], ['FR', fr]]) {
    is(`[${cc}] no bafa_listing_status field`, items.every(p => !('bafa_listing_status' in p)), true);
    is(`[${cc}] no German funding fields`, items.every(p => !('bafa_foerderung_von' in p)), true);
  }
  is('[DE] Germany keeps its own listing status', de.every(p => 'bafa_listing_status' in p), true);

  console.log('\nEvery published product is publishable, everywhere');
  for (const [cc, items] of [['DE', de], ['GB', gb], ['FR', fr]]) {
    is(`[${cc}] all products pass Data Sheet eligibility`, items.every(isDataSheetEligible), true);
    is(`[${cc}] no unclassified public product`, items.every(p => segmentOf(p) !== 'unclassified'), true);
    is(`[${cc}] residential ≤ 23 kW, commercial > 23 kW`,
      items.every(p => (segmentOf(p) === 'residential') === (ratedCapacityKw(p) <= 23)), true);
  }

  // ── Honeytokens: reserved id block, absent from every real catalogue ──────
  console.log('\nHoneytokens live in a reserved id block and never in real data');
  {
    const canaries = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/canary/canary-records.json'), 'utf8'));
    const inBlock = r => [r?.source_id, r?.bafa_id, r?.european_reference_id]
      .some(id => id != null && /^1699\d{4}$/.test(String(id)));
    const canaryRecs = Object.entries(canaries).filter(([k]) => k !== '_readme')
      .flatMap(([, v]) => [v.residential, v.commercial]).filter(Boolean);
    is('every canary record carries an id in the reserved 1699xxxx block (the app filters this block)',
      canaryRecs.every(inBlock), true);
    const allBuilt = [...de, ...gb, ...fr];
    is('no REAL product occupies the reserved honeytoken block',
      allBuilt.every(p => !inBlock(p)), true);
    is('no canary identity appears in any committed dataset',
      !allBuilt.some(p => /Grzewpol|Nordvik|Calderra|Thermalis|Termoclima/i.test(String(p.manufacturer ?? ''))), true);
  }

  // ── Poland: canonical baseline + ZUM overlay + spec-complete PL extension ──
  const PL = 'public/data/products-pl.json';
  if (!existsSync(PL)) {
    console.log('\n(PL datasets not built — Poland assertions skipped)');
  } else {
    const pl = [...load(PL).items, ...load('public/data/products-commercial-pl.json').items];
    console.log('\nPoland: canonical baseline + Lista ZUM overlay + ZUM-native extension');
    const derived = pl.filter(p => p.performance_source === 'EU_MEASURED_REFERENCE');
    const native = pl.filter(p => p.performance_source === 'ZUM_REGISTRY' || p.performance_source === 'ZUM_EPREL');
    is('[PL] derived catalogue is the canonical catalogue', derived.length, de.length);
    is('[PL] every derived product is a canonical product (neutral id, same value)',
      derived.every(p => canonicalIds.has(String(p.european_reference_id))), true);
    is('[PL] the public schema carries NO German-market field names',
      pl.every(p => Object.keys(p).every(k => !/bafa/i.test(k))), true);
    is('[PL] no German-market provenance labels in public values',
      pl.every(p => !/BAFA/i.test(String(p.performance_source ?? '')) && !/^BAFA$/i.test(String(p.primary_source ?? ''))), true);
    is('[PL] no real product occupies the honeytoken block',
      pl.every(p => !/^1699\d{4}$/.test(String(p.source_id ?? ''))), true);
    is('[PL] catalogue = canonical + extension (nothing dropped, nothing duplicated)',
      pl.length, de.length + native.length);
    is('[PL] extension records are ZUM-native, PL-prefixed and never leak elsewhere',
      native.every(p => p.zum_match_method === 'zum_native' && String(p.source_id).startsWith('PL-')), true);
    is('[PL] every product has a listing state',
      pl.every(p => ['confirmed', 'review_required', 'verification_required'].includes(p.zum_match_status)), true);
    is('[PL] a confirmed listing always carries the ZUM id — and only then',
      pl.every(p => (p.zum_match_status === 'confirmed') === Boolean(p.zum_id)), true);
    is('[PL] the overlay never overwrote a technical field',
      derived.every(p => tech.every(f => JSON.stringify(p[f] ?? null) === JSON.stringify(byId.get(String(p.european_reference_id))?.[f] ?? null))), true);
    is('[PL] the overlay never changed a segment',
      derived.every(p => segmentOf(p) === segmentOf(byId.get(String(p.european_reference_id)))), true);
    is('[PL] no German registry fields',
      pl.every(p => !('bafa_listing_status' in p) && !('bafa_foerderung_von' in p)), true);
    is('[PL] all products (incl. extension) pass Data Sheet eligibility', pl.every(isDataSheetEligible), true);
    is('[PL] no unclassified public product', pl.every(p => segmentOf(p) !== 'unclassified'), true);
  }

  // ── Italy: canonical baseline + GSE Conto Termico overlay (no extension) ──
  const IT = 'public/data/products-it.json';
  if (!existsSync(IT)) {
    console.log('\n(IT datasets not built — Italy assertions skipped)');
  } else {
    const it = [...load(IT).items, ...load('public/data/products-commercial-it.json').items];
    console.log('\nItaly: European reference catalogue + Italy-only GSE-native layer');
    const itDerived = it.filter(p => p.performance_source === 'EU_MEASURED_REFERENCE');
    const itNative = it.filter(p => p.performance_source === 'GSE_CATALOGUE');
    is('[IT] catalogue = European reference + GSE-native (nothing else)',
      it.length, itDerived.length + itNative.length);
    is('[IT] the European-reference layer IS the canonical catalogue', itDerived.length, de.length);
    is('[IT] every derived product is a canonical product (neutral id, same value)',
      itDerived.every(p => canonicalIds.has(String(p.european_reference_id))), true);
    is('[IT] native records are GSE-catalogue products, IT-prefixed, never leaking elsewhere',
      itNative.every(p => p.gse_match_method === 'gse_native' && String(p.source_id).startsWith('IT-')
        && p.gse_match_status === 'confirmed' && Array.isArray(p.gse_ratings) && p.gse_ratings.length > 0), true);
    is('[IT] no air/air, VRF or gas-driven product in the Italian catalogue',
      it.every(p => ['Aria / Acqua', 'Salamoia / Acqua', 'Acqua / Acqua', 'Aria / Aria'].includes(p.type)
        && !(p.performance_source === 'GSE_CATALOGUE' && p.type === 'Aria / Aria')), true);
    is('[IT] temperature-basis honesty: 35/55 fields only with a provable assignment',
      itNative.every(p => p.gse_temp_assignment != null
        || (p.power_35C_kw == null && p.power_55C_kw == null && p.efficiency_35C_percent == null
          && p.efficiency_55C_percent == null && p.scop == null && p.declared_capacity_kw != null)), true);
    is('[IT] native records never fabricate measured fields the catalogue does not publish',
      itNative.every(p => p.cop_A7W35 == null && p.cop_A2W35 == null && p.noise_outdoor_dB == null
        && p.eprel_registration_number == null && p.width_mm == null && p.weight_kg == null), true);
    is('[IT] the public schema carries NO German-market field names',
      it.every(p => Object.keys(p).every(k => !/bafa/i.test(k))), true);
    is('[IT] no German-market provenance labels in public values',
      it.every(p => !/BAFA/i.test(String(p.performance_source ?? '')) && !/^BAFA$/i.test(String(p.primary_source ?? ''))), true);
    is('[IT] no real product occupies the honeytoken block',
      it.every(p => !/^1699\d{4}$/.test(String(p.source_id ?? ''))), true);
    is('[IT] every product has a listing state',
      it.every(p => ['confirmed', 'review_required', 'verification_required'].includes(p.gse_match_status)), true);
    is('[IT] a confirmed listing always carries the entry key — and only then',
      it.every(p => (p.gse_match_status === 'confirmed') === Boolean(p.gse_entry_key)), true);
    is('[IT] one GSE catalogue entry confirms at most one product', (() => {
      const keys = it.filter(p => p.gse_entry_key).map(p => p.gse_entry_key);
      return new Set(keys).size === keys.length;
    })(), true);
    is('[IT] the overlay never overwrote a technical field (European-reference layer)',
      itDerived.every(p => tech.every(f => JSON.stringify(p[f] ?? null) === JSON.stringify(byId.get(String(p.european_reference_id))?.[f] ?? null))), true);
    is('[IT] the overlay never changed a segment (European-reference layer)',
      itDerived.every(p => segmentOf(p) === segmentOf(byId.get(String(p.european_reference_id)))), true);
    is('[IT] no German registry fields',
      it.every(p => !('bafa_listing_status' in p) && !('bafa_foerderung_von' in p)), true);
    is('[IT] derived products pass the GLOBAL Data Sheet eligibility rule', itDerived.every(isDataSheetEligible), true);
    is('[IT] every product passes its publication rule (global or Italy GSE tier)', it.every(isPublishable), true);
    is('[IT] no unclassified public product', it.every(p => segmentOf(p) !== 'unclassified'), true);
    // Isolation: Italy-only fields and records must not exist in any other market.
    const others = [...de, ...gb, ...fr,
      ...load('public/data/products-pl.json').items, ...load('public/data/products-commercial-pl.json').items];
    is('[cross] no GSE-native record outside Italy',
      others.every(p => p.performance_source !== 'GSE_CATALOGUE' && !String(p.source_id ?? '').startsWith('IT-')), true);
    is('[cross] no Italy-only field keys outside Italy',
      others.every(p => !('gse_ratings' in p) && !('declared_capacity_kw' in p) && !('gse_temp_assignment' in p)), true);
  }
}

// ── The publication gate ─────────────────────────────────────────────────────
// The gate is what stands between a broken candidate and production, so it is
// tested by actually running it against corrupted datasets in a throwaway copy.
console.log('\nPublication gate — a bad candidate must never reach production');
if (!existsSync(GB)) {
  console.log('  (datasets not built — gate simulation skipped)');
} else {
  const root = process.cwd();
  const gateBlocks = (mutate, extra = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'hpdb-gate-'));
    try {
      mkdirSync(join(dir, 'public/data'), { recursive: true });
      mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
      mkdirSync(join(dir, 'data_manifests'), { recursive: true });
      for (const f of ['products.json', 'products-commercial.json', 'products-gb.json',
        'products-commercial-gb.json', 'products-fr.json', 'products-commercial-fr.json',
        'products-pl.json', 'products-commercial-pl.json',
        'products-it.json', 'products-commercial-it.json']) {
        const j = JSON.parse(readFileSync(resolve(root, 'public/data', f), 'utf8'));
        writeFileSync(join(dir, 'public/data', f), JSON.stringify(mutate(j, f)));
      }
      mkdirSync(join(dir, 'data_sources/manufacturer_cross_reference'), { recursive: true });
      writeFileSync(join(dir, 'scripts/dataset-gate.mjs'), readFileSync(resolve(root, 'scripts/dataset-gate.mjs')));
      writeFileSync(join(dir, 'scripts/lib/data-sheet-eligibility.mjs'), readFileSync(resolve(root, 'scripts/lib/data-sheet-eligibility.mjs')));
      for (const f of ['data_manifests/production.json', 'data_manifests/migration.json',
        'data_sources/manufacturer_cross_reference/pel-one-to-many-exceptions.json',
        'data_sources/manufacturer_cross_reference/zum-one-to-many-exceptions.json']) {
        if (existsSync(resolve(root, f))) writeFileSync(join(dir, f), extra[f] ?? readFileSync(resolve(root, f)));
      }
      execFileSync(process.execPath, [join(dir, 'scripts/dataset-gate.mjs')], { cwd: dir, stdio: 'pipe' });
      return false;                       // exited 0 → it let the candidate through
    } catch {
      return true;                        // non-zero → blocked
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  is('an unchanged candidate passes', gateBlocks(j => j), false);
  is('a source that failed to parse (zero records) is BLOCKED',
    gateBlocks((j, f) => (f === 'products-gb.json' ? { ...j, items: [] } : j)), true);
  is('a truncated source (large product-count drop) is BLOCKED',
    gateBlocks((j, f) => (f === 'products-gb.json' ? { ...j, items: j.items.slice(0, Math.floor(j.items.length / 2)) } : j)), true);
  is('duplicate canonical ids are BLOCKED',
    gateBlocks((j, f) => (f === 'products-gb.json' ? { ...j, items: [...j.items, j.items[0]] } : j)), true);
  is('a product that lost its technical fields (eligibility regression) is BLOCKED',
    gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
      ...j,
      items: j.items.map((p, i) => (i < 200 ? { ...p, scop: null, cop_A7W35: null, cop_A2W35: null, noise_outdoor_dB: null, refrigerant: null } : p)),
    })), true);
  is('a product with no capacity (unclassifiable) is BLOCKED',
    gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
      ...j,
      items: j.items.map((p, i) => (i === 0 ? { ...p, power_35C_kw: null, power_design_35C_kw: null, power_55C_kw: null, power_design_55C_kw: null } : p)),
    })), true);
  is('a listing claimed with no registry id is BLOCKED',
    gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
      ...j,
      items: j.items.map((p, i) => (i === 0 ? { ...p, pel_match_status: 'confirmed', mcs_number: null } : p)),
    })), true);
  is('German registration status leaking into the UK dataset is BLOCKED',
    gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
      ...j,
      items: j.items.map(p => ({ ...p, bafa_listing_status: 'listed_in_snapshot' })),
    })), true);

  console.log('\nPublication gate — local-ID integrity');
  // One MCS number confirmed for two canonical products, with no approved exception.
  is('an ambiguous one-to-many CONFIRMED listing is BLOCKED',
    gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
      ...j,
      items: j.items.map((p, i) => (i < 2
        ? { ...p, pel_match_status: 'confirmed', mcs_number: 'MCS-AMBIGUOUS-1', pel_match_method: 'exact_model' }
        : p)),
    })), true);
  // The same thing, but with a document behind it → allowed.
  {
    // An approved exception still has to satisfy every compatibility check (§3.2):
    // same manufacturer, same capacity, same refrigerant, same family. So the pair
    // must be genuinely compatible — two packages of the same heat pump.
    const all = JSON.parse(readFileSync(resolve(root, 'public/data/products-gb.json'), 'utf8')).items;
    const key = p => `${p.manufacturer_short}|${p.type}|${p.refrigerant}|${p.installation_type}|${ratedCapacityKw(p)}`;
    const groups = {};
    all.forEach(p => { (groups[key(p)] ??= []).push(p); });
    const two = Object.values(groups).find(v => v.length >= 2).slice(0, 2);
    const exception = JSON.stringify({
      version: 1,
      exceptions: [{
        local_source: 'PEL', local_id: 'MCS-APPROVED-1',
        canonical_ids: two.map(p => String(p.source_id)),
        evidence_reference: 'manufacturer cross-reference, doc ref TEST-2026-01', approved: true,
      }],
    });
    const pairIds = new Set(two.map(p => String(p.source_id)));
    is('…but an EVIDENCED one-to-many exception is allowed through',
      gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
        ...j,
        items: j.items.map(p => (pairIds.has(String(p.source_id))
          ? { ...p, pel_match_status: 'confirmed', mcs_number: 'MCS-APPROVED-1', pel_match_method: 'approved_one_to_many' }
          : p)),
      }), { 'data_sources/manufacturer_cross_reference/pel-one-to-many-exceptions.json': exception }), false);
    // An exception with no document is an override in disguise.
    const noEvidence = JSON.stringify({
      version: 1,
      exceptions: [{ local_source: 'PEL', local_id: 'MCS-APPROVED-1', canonical_ids: two.map(p => String(p.source_id)), approved: true }],
    });
    is('an exception with NO evidence reference is BLOCKED',
      gateBlocks(j => j, { 'data_sources/manufacturer_cross_reference/pel-one-to-many-exceptions.json': noEvidence }), true);
  }
  is('a product carrying a PEL id WITHOUT a confirmed listing is BLOCKED',
    gateBlocks((j, f) => (f !== 'products-gb.json' ? j : {
      ...j,
      items: j.items.map((p, i) => (i === 0 ? { ...p, pel_match_status: 'verification_required', mcs_number: 'MCS-LEAK' } : p)),
    })), true);

  console.log('\nMigration allowance is narrow — it waives change gates, nothing else');
  // These two assertions only mean something while a migration allowance is ACTIVE.
  // The real data_manifests/migration.json is a one-time record that is now marked
  // completed, so the sandbox provisions its own ACTIVE allowance (test-only,
  // deterministic) rather than depending on that live state.
  const activeMigration = JSON.stringify({
    ...(existsSync(resolve(root, 'data_manifests/migration.json'))
      ? JSON.parse(readFileSync(resolve(root, 'data_manifests/migration.json'), 'utf8'))
      : {}),
    completed_at: null,
    expires_after: '2099-01-01T00:00:00.000Z',
  });
  const withActiveMigration = { 'data_manifests/migration.json': activeMigration };
  is('the allowance does NOT waive duplicate ids',
    gateBlocks((j, f) => (f === 'products-gb.json' ? { ...j, items: [...j.items, j.items[0]] } : j), withActiveMigration), true);
  // Mutate a market that actually DECLARES a target in the active allowance —
  // markets without a declared target are governed by the normal change gates,
  // where a 5-row drop is legitimately below the drop threshold.
  const migTargetMarket = Object.keys(JSON.parse(activeMigration).markets ?? {})[0] ?? 'GB';
  const migTargetFile = {
    DE: 'products.json', GB: 'products-gb.json', FR: 'products-fr.json',
    PL: 'products-pl.json', IT: 'products-it.json',
  }[migTargetMarket] ?? 'products-gb.json';
  is('the allowance does NOT apply when the candidate misses its declared target',
    gateBlocks((j, f) => (f === migTargetFile ? { ...j, items: j.items.slice(0, j.items.length - 5) } : j), withActiveMigration), true);
}

console.log(failed ? `\n✗ ${failed} assertion(s) failed\n` : '\n✓ all architecture assertions passed\n');
process.exit(failed ? 1 : 0);
