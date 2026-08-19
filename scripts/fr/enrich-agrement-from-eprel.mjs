#!/usr/bin/env node
/**
 * enrich-agrement-from-eprel.mjs — give each ADEME agrément entry the performance
 * the register does not publish, from the EU energy-label registry.
 *
 * WHY
 * The agrément register answers "is this model approved, and what is its number".
 * It publishes no performance at all. EPREL publishes ηs, rated heat output,
 * energy class and sound power for every model placed on the EU market — under
 * the model identifier the manufacturer actually registered. Joining the two
 * gives a French product a data sheet without inventing a single figure.
 *
 * WHAT THIS IS NOT: it does not touch the canonical baseline, publish anything,
 * or copy EPREL values onto BAFA-derived records. It writes one enrichment file
 * and measures how far the join reaches, so the size of any remaining catalogue
 * work is a number rather than a guess.
 *
 * THE JOIN, IN ORDER OF STRENGTH — every stage is scoped to the same brand:
 *   eprel_exact_model      identifier == agrément modèle, formatting folded away
 *   eprel_commercial_ref   identifier == agrément refCommerciale. The big one:
 *                          Atlantic, Thermor and others register their EPREL
 *                          model identifier AS the commercial reference, and the
 *                          register carries that reference on all 1,773 rows.
 *   eprel_cleaned_model    EPREL prefixes an article number and suffixes " 16 KW"
 *                          (Viessmann); stripping both restores the identity
 *   eprel_unique_contain   one identifier wholly contains the other, uniquely
 *   eprel_component_subset one side's strong product codes contain the other's
 *
 * DEDUPLICATION FIRST. The snapshot repeats rows: 134 references matched two or
 * three records that turned out to be the same product — same productModelCoreId,
 * same version, identical ηs and output. Treating repetition as ambiguity would
 * have thrown away a third of the strongest join. Rows are folded by
 * productModelCoreId, newest version kept, and only genuinely DIFFERENT products
 * are treated as ambiguous and refused.
 *
 * Run:  node scripts/fr/enrich-agrement-from-eprel.mjs [--snapshot=YYYY-MM]
 * Out:  data_sources/ademe_agrement/matching/<snapshot>/agrement-eprel-enrichment.json
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const newest = (d) => readdirSync(resolve(ROOT, d)).filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse()[0];
const SNAP = process.argv.find((a) => a.startsWith('--snapshot='))?.split('=')[1] ?? newest('data_sources/ademe_agrement/raw');
const RAW = join(ROOT, 'data_sources/ademe_agrement/raw', SNAP);

const meta = JSON.parse(readFileSync(join(RAW, '_meta.json'), 'utf8'));
if (!meta.complete) { console.error(`snapshot ${SNAP} is a partial read — refusing`); process.exit(1); }
const register = JSON.parse(readFileSync(join(RAW, 'records.json'), 'utf8'));
const facets = JSON.parse(readFileSync(join(RAW, 'facets.json'), 'utf8')).facets;

const EPDIR = join(ROOT, 'data_sources/eprel_raw/raw', newest('data_sources/eprel_raw/raw'), 'spaceheaters-heatpump');
let eprel = [];
for (const f of readdirSync(EPDIR).filter((f) => /^page/.test(f))) {
  const d = JSON.parse(readFileSync(join(EPDIR, f), 'utf8'));
  eprel = eprel.concat(Array.isArray(d) ? d : (d.hits ?? d.records ?? d.content ?? Object.values(d).find(Array.isArray) ?? []));
}

const norm = (s) => String(s ?? '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]/g, '');
/** EPREL wraps the commercial name: "2122563 Vitocal 222-S … 16 KW". */
const cleaned = (s) => norm(String(s ?? '').replace(/^\s*\d{6,8}\s+/, '').replace(/\s+\d{1,3}[.,]?\d*\s*KW\s*$/i, ''));
const strongCodes = (s) => [...new Set(String(s ?? '').split(/[/,+&]|\s+/).map(norm)
  .filter((k) => k.length >= 6 && /[A-Z]/.test(k) && /[0-9]/.test(k)))];

// ── Fold repeated rows to one product ────────────────────────────────────────
const byCore = new Map();
for (const r of eprel) {
  const key = r.productModelCoreId ?? `${r.supplierOrTrademark}|${r.modelIdentifier}`;
  const prev = byCore.get(key);
  if (!prev || (r.versionNumber ?? 0) > (prev.versionNumber ?? 0)) byCore.set(key, r);
}
const products = [...byCore.values()];

const brandIndex = new Map();
for (const r of products) {
  const b = norm(r.supplierOrTrademark); if (!b) continue;
  if (!brandIndex.has(b)) brandIndex.set(b, []);
  brandIndex.get(b).push(r);
}
const poolFor = (brand) => { const n = norm(brand); for (const [k, v] of brandIndex) if (k.includes(n) || n.includes(k)) return v; return []; };

/** One product, or nothing. Several DIFFERENT products is a refusal, not a guess. */
const only = (hits) => {
  if (!hits.length) return null;
  const cores = new Set(hits.map((h) => h.productModelCoreId ?? h.modelIdentifier));
  return cores.size === 1 ? hits[0] : null;
};

const out = [];
const stats = { register: register.length, matched: 0, ambiguous: 0, no_brand: 0, unmatched: 0, publishable: 0 };
const byMethod = {};

for (const r of register) {
  const pool = poolFor(r.marque);
  const f = facets[r.id] ?? {};
  if (!pool.length) { stats.no_brand++; out.push({ id: r.id, agrement: r.numeroAgrement, status: 'no_eprel_brand', ...f }); continue; }

  const m = norm(r.modele), ref = norm(r.refCommerciale);
  const stages = [
    ['eprel_exact_model', () => pool.filter((x) => norm(x.modelIdentifier) === m)],
    ['eprel_commercial_ref', () => (ref ? pool.filter((x) => norm(x.modelIdentifier) === ref) : [])],
    ['eprel_cleaned_model', () => pool.filter((x) => cleaned(x.modelIdentifier) === m || cleaned(x.modelIdentifier) === ref)],
    ['eprel_unique_contain', () => pool.filter((x) => { const e = norm(x.modelIdentifier); return e.length > 7 && m.length > 7 && (e.includes(m) || m.includes(e)); })],
    ['eprel_component_subset', () => {
      const rt = strongCodes(r.modele); if (!rt.length) return [];
      return pool.filter((x) => { const et = strongCodes(x.modelIdentifier); if (!et.length) return false;
        return rt.every((k) => et.includes(k)) || et.every((k) => rt.includes(k)); });
    }],
  ];

  let hit = null, method = null, refused = false;
  for (const [name, fn] of stages) {
    const hits = fn();
    if (!hits.length) continue;
    const one = only(hits);
    if (one) { hit = one; method = name; break; }
    refused = true;                        // several different products — stop, do not fall through
    break;
  }

  if (!hit) {
    if (refused) stats.ambiguous++; else stats.unmatched++;
    out.push({ id: r.id, agrement: r.numeroAgrement, brand: r.marque, model: r.modele,
      status: refused ? 'ambiguous' : 'no_eprel_match', ...f });
    continue;
  }

  stats.matched++; byMethod[method] = (byMethod[method] ?? 0) + 1;
  const noise = (hit.outdoorNoise > 0 ? hit.outdoorNoise : null) ?? (hit.noise > 0 ? hit.noise : null);
  // The shared rule: identity + type + ηs + a rated capacity + two measured fields.
  // Refrigerant comes from the register facet, sound power from EPREL.
  const measured = (f.refrigerant ? 1 : 0) + (noise ? 1 : 0);
  const publishable = !!(f.type_pac && hit.seasonalSpaceHeatingEnergyEfficiency != null
    && hit.ratedHeatOutput != null && measured >= 2);
  if (publishable) stats.publishable++;

  out.push({
    id: r.id, agrement: r.numeroAgrement, brand: r.marque, gamme: r.gamme, model: r.modele,
    commercial_ref: r.refCommerciale, configuration: r.configuration,
    type_pac: f.type_pac ?? null, refrigerant: f.refrigerant ?? null, usage: f.usage ?? null,
    eprel_registration_number: hit.eprelRegistrationNumber ?? null,
    eprel_model: hit.modelIdentifier,
    eta_s_35: hit.seasonalSpaceHeatingEnergyEfficiencyAverage35 ?? hit.seasonalSpaceHeatingEnergyEfficiency ?? null,
    eta_s_55: hit.seasonalSpaceHeatingEnergyEfficiencyAverage55 ?? null,
    rated_kw_35: hit.ratedHeatOutputAverage35 ?? hit.ratedHeatOutput ?? null,
    rated_kw_55: hit.ratedHeatOutputAverage55 ?? null,
    energy_class_35: hit.energyClass35 ?? hit.energyClass ?? null,
    energy_class_55: hit.energyClass55 ?? null,
    noise_outdoor_dB: hit.outdoorNoise > 0 ? hit.outdoorNoise : null,
    noise_indoor_dB: hit.noise > 0 ? hit.noise : null,
    match_method: method, status: 'matched', publishable,
  });
}

const outDir = join(ROOT, 'data_sources/ademe_agrement/matching', SNAP);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'agrement-eprel-enrichment.json'), JSON.stringify({
  _meta: { generated: new Date().toISOString(), snapshot: SNAP, register_import_date: meta.import_date,
    eprel_snapshot: newest('data_sources/eprel_raw/raw'),
    eprel_rows: eprel.length, eprel_products_after_dedup: products.length,
    stats, by_method: byMethod,
    note: 'Performance comes from EPREL; heat-source type, refrigerant and usage come from the ADEME register facets. Nothing here is inferred from a model name.' },
  entries: out,
}, null, 1));

console.log(`agrément ↔ EPREL — snapshot ${SNAP} (register ${meta.import_date})`);
console.log(`  EPREL rows ${eprel.length} → ${products.length} distinct products after dedup`);
console.log(`  matched ${stats.matched}/${stats.register} · ambiguous ${stats.ambiguous} · no EPREL match ${stats.unmatched} · brand absent ${stats.no_brand}`);
console.log(`  PUBLISHABLE under the shared rule: ${stats.publishable} (${Math.round(stats.publishable / stats.register * 100)}%)`);
console.log(`  by method: ${JSON.stringify(byMethod)}`);
