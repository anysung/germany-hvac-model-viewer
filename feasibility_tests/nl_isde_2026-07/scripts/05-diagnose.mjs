// NL Phase-0 PoC — failure-cause diagnosis for unresolved rows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityKeys, compact } from '../../../scripts/ofgem/pel-match-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../out');
const results = JSON.parse(fs.readFileSync(path.join(OUT, 'match-results.json'), 'utf8'));
const { records, byKey } = JSON.parse(fs.readFileSync(path.join(OUT, 'canonical-index.json'), 'utf8'));
const { eprel, eByKey } = JSON.parse(fs.readFileSync(path.join(OUT, 'eprel-index.json'), 'utf8'));

const LEGAL = new Set(['GMBH','KG','CO','BV','LTD','THE','GROUP','EUROPE','NEDERLAND','ELECTRIC','ELECTRONICS','MARKETING']);
const brandTokens = s => new Set(String(s ?? '').toUpperCase().normalize('NFKD')
  .replace(/[^A-Z ]+/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !LEGAL.has(t)));
const canonBrands = new Set();
for (const r of records) for (const t of brandTokens(r.manufacturer_short ?? r.manufacturer)) canonBrands.add(t);
const eprelBrands = new Set();
for (const e of Object.values(eprel)) for (const t of brandTokens(e.supplier)) eprelBrands.add(t);

const causes = {};
const un = results.filter(r => r.status === 'eligibility_only');
for (const r of un) {
  const tokens = [...brandTokens(r.brand)];
  const inCanon = tokens.some(t => canonBrands.has(t));
  const inEprel = tokens.some(t => eprelBrands.has(t));
  const keys = [...identityKeys(r.model), compact(r.model)].filter(Boolean);
  const keyHitsCanon = keys.some(k => byKey[k]?.length);
  const keyHitsEprel = keys.some(k => eByKey[k]?.length);
  let cause;
  if (!inCanon && !inEprel) cause = 'brand_absent_everywhere';
  else if (!inCanon && inEprel && !keyHitsEprel) cause = 'brand_in_eprel_but_model_untraceable';
  else if (!inCanon && inEprel && keyHitsEprel) cause = 'eprel_key_hit_but_filtered'; // capacity/mfr/ambiguity filters
  else if (inCanon && !keyHitsCanon && !keyHitsEprel) cause = 'brand_in_canonical_but_model_untraceable';
  else cause = 'key_hit_but_filtered';
  causes[cause] = (causes[cause] ?? 0) + 1;
  r.__cause = cause;
}
console.log('eligibility_only causes:', JSON.stringify(causes, null, 1));

// per-cause brand tops
for (const cause of Object.keys(causes)) {
  const byBrand = {};
  for (const r of un.filter(x => x.__cause === cause)) byBrand[r.brand] = (byBrand[r.brand] ?? 0) + 1;
  console.log(`\n${cause}: top brands`, Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 8));
  const s = un.find(x => x.__cause === cause);
  console.log('  sample:', s.brand, '|', s.model, '|', s.category);
}

// how many EPREL entries per problem brand actually have usable model strings?
console.log('\nEPREL model-string usability for key NL brands:');
for (const b of ['DAIKIN', 'ATAG', 'REMEHA', 'NEFIT', 'VAILLANT', 'ALPHA INNOTEC', 'THERMIA', 'ATLANTIC', 'LG', 'SAMSUNG', 'BOSCH', 'STIEBEL']) {
  const es = Object.values(eprel).filter(e => [...brandTokens(e.supplier)].some(t => b.includes(t) || t === b.split(' ')[0]));
  const usable = es.filter(e => identityKeys(e.model).size > 0).length;
  console.log(` ${b.padEnd(14)} eprel:${String(es.length).padStart(6)}  with-strong-model-keys:${String(usable).padStart(6)}`);
}
