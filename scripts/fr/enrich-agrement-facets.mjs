#!/usr/bin/env node
/**
 * enrich-agrement-facets.mjs — recover the fields the register displays but does
 * not print on a record.
 *
 * WHY
 * A record carries marque/gamme/modèle/configuration/numéro, and nothing else.
 * Two of the fields we need most are missing from it: the heat SOURCE type
 * (air/water vs ground/water — required by the shared data-sheet rule) and the
 * REFRIGERANT (one of the five measured fields, and the filter French installers
 * actually use). Both were about to be sourced from manufacturer catalogues.
 *
 * They do not have to be. The register's own search filters on both, so the
 * facet is public data the site already publishes — it is simply exposed as a
 * query rather than as a field. Asking for one facet value at a time and
 * recording which records come back reconstructs the column exactly, with the
 * register as the source. No inference, no catalogue, no guessing from a name.
 *
 *   typePac      Air/Eau · Eau glycolée/Eau · Eau/Eau · Sol/Eau
 *   typeFluide   R290 · R32 · R407C · R410A · R452B · R454B · R454C · R513A
 *   usage        heating · +DHW · +cooling combinations
 *
 * INTEGRITY: each dimension is a partition of the register, so the values must
 * sum to the register total. A short sum means a record carries a value we did
 * not ask for (or none at all) and is reported rather than hidden — a silently
 * missing facet would become a silently missing spec.
 *
 * Run:  node scripts/fr/enrich-agrement-facets.mjs [--snapshot=YYYY-MM]
 * Out:  data_sources/ademe_agrement/raw/<snapshot>/facets.json
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://bonus-pac.ademe.fr/eligibilite/recherche';
const POLITE_MS = 1600;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const newest = (d) => readdirSync(resolve(ROOT, d)).filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse()[0];
const SNAP = process.argv.find((a) => a.startsWith('--snapshot='))?.split('=')[1] ?? newest('data_sources/ademe_agrement/raw');
const DIR = join(ROOT, 'data_sources/ademe_agrement/raw', SNAP);
const filters = JSON.parse(readFileSync(join(DIR, 'filters.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(DIR, '_meta.json'), 'utf8'));

/** Facet parameter names are SINGULAR — the plural forms the filter file uses
 *  are silently ignored by the API and return the whole register, which would
 *  have labelled every record with every value. Verified before use. */
const DIMENSIONS = [
  { param: 'typePac', field: 'type_pac', values: filters.typesPac ?? [] },
  { param: 'typeFluide', field: 'refrigerant', values: filters.typesFluide ?? [] },
  { param: 'usage', field: 'usage', values: filters.usages ?? [] },
];

async function idsFor(param, value) {
  const ids = [];
  let page = 1, totalPages = 1, total = 0;
  do {
    const url = `${BASE}?${param}=${encodeURIComponent(value)}&page=${page}&perPage=27`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${param}=${value} page ${page}: HTTP ${res.status}`);
    const j = await res.json();
    totalPages = j.totalPages ?? 1; total = j.total ?? 0;
    for (const r of j.records ?? []) ids.push(r.id);
    if (page < totalPages) await sleep(POLITE_MS);
    page++;
  } while (page <= totalPages);
  return { ids, total };
}

const facets = {};                       // record id -> { type_pac, refrigerant, usage }
const report = [];
for (const dim of DIMENSIONS) {
  let sum = 0;
  const multi = [];
  for (const value of dim.values) {
    const { ids, total } = await idsFor(dim.param, value);
    sum += ids.length;
    for (const id of ids) {
      facets[id] = facets[id] ?? {};
      // A record answering to two values of one dimension would make the column
      // ambiguous; record it rather than let the last write win.
      if (facets[id][dim.field] && facets[id][dim.field] !== value) multi.push({ id, had: facets[id][dim.field], also: value });
      facets[id][dim.field] = value;
    }
    console.log(`  ${dim.param}=${value} → ${ids.length} (reported ${total})`);
    await sleep(POLITE_MS);
  }
  const covered = sum;
  report.push({ dimension: dim.param, values: dim.values.length, covered, register_total: meta.total_reported,
    complete: covered === meta.total_reported, ambiguous: multi.length });
  console.log(`  ${dim.param}: ${covered}/${meta.total_reported}${covered === meta.total_reported ? ' ✓ partition complete' : '  ← INCOMPLETE'}${multi.length ? ` · ${multi.length} ambiguous` : ''}\n`);
}

writeFileSync(join(DIR, 'facets.json'), JSON.stringify({
  _meta: { generated: new Date().toISOString(), snapshot: SNAP, source: BASE,
    import_date: meta.import_date, register_total: meta.total_reported, dimensions: report,
    note: 'Facet values recovered by querying the register one filter value at a time. Source is the register itself — nothing here is inferred from a model name.' },
  facets,
}, null, 1));

const n = Object.keys(facets).length;
console.log(`facets → ${join(DIR, 'facets.json')}`);
console.log(`  ${n}/${meta.total_reported} records carry at least one facet`);
for (const f of ['type_pac', 'refrigerant', 'usage']) {
  const c = Object.values(facets).filter((x) => x[f]).length;
  console.log(`  ${f.padEnd(12)} ${c} (${Math.round(c / meta.total_reported * 100)}%)`);
}
