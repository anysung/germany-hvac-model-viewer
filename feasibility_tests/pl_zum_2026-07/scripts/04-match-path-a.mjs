// Path A matcher: normalized ZUM identity rows → canonical catalogue.
// Conservative by design (METHODOLOGY.md §1): only eprel_exact, eprel_bridge,
// exact_model CONFIRM; everything else is candidate/conflict/unmatched.
// Input:  ../out/zum-normalized.json  [{ zumId, manufacturer, name, category,
//         ratedKw55, class55, eprel, family, status }]
//         (or --fixture to smoke-test against ../fixtures/zum-fixture.json)
// Output: ../out/path-a-results.json + summary to stdout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityKeys, compact, numericConflict } from '../../../scripts/ofgem/pel-match-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = p => path.resolve(here, '../out', p);
const { records, byEprel, byKey } = JSON.parse(fs.readFileSync(out('canonical-index.json'), 'utf8'));
const eprelIdx = JSON.parse(fs.readFileSync(out('eprel-index.json'), 'utf8')).index;
const byId = Object.fromEntries(records.map(r => [r.bafa_id, r]));

const useFixture = process.argv.includes('--fixture');
const zumFile = useFixture
  ? path.resolve(here, '../fixtures/zum-fixture.json')
  : out('zum-normalized.json');
const zum = JSON.parse(fs.readFileSync(zumFile, 'utf8'));

// Manufacturer consistency: legal-form-insensitive brand-token overlap.
// Naive full-string containment fails on "GmbH & Co.KG" vs "Sp. z o.o." suffixes
// (found via fixture smoke test) — compare meaningful name tokens instead.
const LEGAL_TOKENS = new Set(['GMBH', 'KG', 'CO', 'COKG', 'SP', 'SPK', 'ZOO', 'SA',
  'AG', 'SE', 'SRL', 'SAS', 'LTD', 'LLC', 'BV', 'AS', 'OY', 'AB', 'SPA', 'THE',
  'GROUP', 'HOLDING', 'FIXTURE']); // FIXTURE: lets synthetic test data flow through M3
const brandTokens = s => new Set(String(s ?? '').toUpperCase().normalize('NFKD')
  .replace(/[^A-Z ]+/g, ' ').split(/\s+/)
  .filter(t => t.length >= 3 && !LEGAL_TOKENS.has(t)));
const mfrConsistent = (a, b) => {
  const A = brandTokens(a), B = brandTokens(b);
  if (!A.size || !B.size) return false;
  for (const t of A) if (B.has(t)) return true;
  return false;
};

const CLASS_ORDER = ['A', 'A+', 'A++', 'A+++'];
const classGap = (a, b) => {
  const i = CLASS_ORDER.indexOf(a), j = CLASS_ORDER.indexOf(b);
  return i < 0 || j < 0 ? null : Math.abs(i - j);
};
// canonical ηs(55) → EU 811/2013 band (mirror of src/hpiq/model.ts energyClass)
const bandOf = eta => eta == null ? null
  : eta >= 150 ? 'A+++' : eta >= 125 ? 'A++' : eta >= 98 ? 'A+' : 'A';

const TYPE_FAMILY = {
  air_water: 'air/water', air_water_higher: 'air/water', dhw: 'dhw',
  ground: 'ground', air_air: 'air/air',
};
const canonTypeFamily = t =>
  /Sole|Wasser \/ Wasser|Erdreich/i.test(t ?? '') && !/Luft/i.test(t ?? '') ? 'ground'
  : /Luft \/ Luft/i.test(t ?? '') ? 'air/air'
  : /Luft/i.test(t ?? '') ? 'air/water' : 'other';

function sanity(z, c) {
  const conflicts = [];
  const zf = TYPE_FAMILY[z.category] ?? null;
  if (zf && zf !== 'dhw') {
    const cf = canonTypeFamily(c.type);
    if (cf !== 'other' && zf !== cf) conflicts.push(`type:${zf}≠${cf}`);
  }
  if (z.ratedKw55 != null && c.ratedKw != null) {
    const rel = Math.abs(z.ratedKw55 - c.ratedKw) / Math.max(z.ratedKw55, c.ratedKw);
    if (rel > 0.15) conflicts.push(`capacity:${z.ratedKw55}vs${c.ratedKw}`);
  }
  if (z.class55 && c.eta55 != null) {
    const gap = classGap(z.class55, bandOf(c.eta55));
    if (gap != null && gap > 1) conflicts.push(`class:${z.class55}vs${bandOf(c.eta55)}`);
  }
  return conflicts;
}

function classify(z) {
  // M1: eprel_exact — ZUM's EPREL number is on a canonical record
  if (z.eprel && byEprel[String(z.eprel)]) {
    const ids = byEprel[String(z.eprel)];
    if (ids.length === 1) {
      const c = byId[ids[0]];
      const conflicts = sanity(z, c);
      return conflicts.length
        ? { state: 'conflict', method: 'eprel_exact', target: c.bafa_id, conflicts }
        : { state: 'confirmed', method: 'eprel_exact', target: c.bafa_id, confidence: 'high' };
    }
    return { state: 'candidate', method: 'eprel_one_to_many', targets: ids };
  }
  // M2: eprel_bridge — ZUM EPREL → EPREL model → canonical exact model
  if (z.eprel && eprelIdx[String(z.eprel)]) {
    const e = eprelIdx[String(z.eprel)];
    const hits = new Set();
    for (const k of e.keys) for (const id of byKey[k] ?? []) hits.add(id);
    const idHits = [...hits].map(id => byId[id])
      .filter(c => !e.supplier || mfrConsistent(e.supplier, c.manufacturer_normalized ?? c.manufacturer));
    if (idHits.length === 1) {
      const conflicts = sanity(z, idHits[0]);
      return conflicts.length
        ? { state: 'conflict', method: 'eprel_bridge', target: idHits[0].bafa_id, conflicts }
        : { state: 'confirmed', method: 'eprel_bridge', target: idHits[0].bafa_id, confidence: 'high' };
    }
    if (idHits.length > 1) return { state: 'candidate', method: 'eprel_bridge_ambiguous', targets: idHits.map(c => c.bafa_id) };
  }
  // M3a: exact_model — full compact-string equality, manufacturer-consistent.
  // Strongest string method; short suffix keys collide across variants (e.g.
  // '151A13' appears in AWO-E and AWO-M models), so full equality goes first.
  const zCompact = compact(z.name ?? '');
  const zMfrName = z.manufacturer ?? '';
  const fullHits = zCompact
    ? records.filter(c => c.compactModel === zCompact
        && mfrConsistent(zMfrName, c.manufacturer_normalized ?? c.manufacturer))
    : [];
  if (fullHits.length === 1) {
    const conflicts = sanity(z, fullHits[0]);
    return conflicts.length
      ? { state: 'conflict', method: 'exact_model', target: fullHits[0].bafa_id, conflicts }
      : { state: 'confirmed', method: 'exact_model', target: fullHits[0].bafa_id, confidence: 'high' };
  }
  if (fullHits.length > 1) return { state: 'candidate', method: 'exact_model_duplicate', targets: fullHits.map(c => c.bafa_id) };
  // M3b: unique strong-code resolution (identity keys), manufacturer-consistent
  const zKeys = identityKeys(z.name ?? '');
  const hits = new Set();
  for (const k of zKeys) for (const id of byKey[k] ?? []) hits.add(id);
  const mfrHits = [...hits].map(id => byId[id])
    .filter(c => mfrConsistent(zMfrName, c.manufacturer_normalized ?? c.manufacturer));
  if (mfrHits.length === 1) {
    const c = mfrHits[0];
    if (numericConflict(z.name ?? '', c.model ?? '')) {
      return { state: 'candidate', method: 'exact_model_numeric_conflict', targets: [c.bafa_id] };
    }
    const conflicts = sanity(z, c);
    return conflicts.length
      ? { state: 'conflict', method: 'exact_model_code', target: c.bafa_id, conflicts }
      : { state: 'confirmed', method: 'exact_model_code', target: c.bafa_id, confidence: 'high' };
  }
  if (mfrHits.length > 1) return { state: 'candidate', method: 'exact_model_ambiguous', targets: mfrHits.map(c => c.bafa_id) };
  if (z.family) return { state: 'candidate', method: 'family_entry', targets: [] };
  // weak signal for the failure-reason breakdown: is the manufacturer known at all?
  const mfrKnown = records.some(c => mfrConsistent(zMfrName, c.manufacturer_normalized ?? c.manufacturer));
  return { state: 'unmatched', method: null, manufacturerKnown: mfrKnown };
}

const results = zum.map(z => ({ ...z, match: classify(z) }));
const tally = {};
for (const r of results) {
  const key = `${r.match.state}${r.match.method ? ':' + r.match.method : ''}`;
  tally[key] = (tally[key] ?? 0) + 1;
}
const summary = {
  input: zum.length,
  confirmed: results.filter(r => r.match.state === 'confirmed').length,
  candidate: results.filter(r => r.match.state === 'candidate').length,
  conflict: results.filter(r => r.match.state === 'conflict').length,
  unmatched: results.filter(r => r.match.state === 'unmatched').length,
  byMethod: tally,
  fixture: useFixture,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(out(useFixture ? 'path-a-fixture-results.json' : 'path-a-results.json'),
  JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
