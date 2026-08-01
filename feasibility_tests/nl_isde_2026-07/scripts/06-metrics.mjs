// NL Phase-0 PoC — coverage metrics under all required counting units.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compact } from '../../../scripts/ofgem/pel-match-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../out');
const res = JSON.parse(fs.readFileSync(path.join(OUT, 'match-results.json'), 'utf8'));

const CONFIRMED = s => s.startsWith('confirmed');
const T12 = r => CONFIRMED(r.status) || r.status === 'native_spec_complete';

/* counting units */
const units = {
  official_row: r => r.meldcode,                       // = unique meldcode (verified 1:1)
  unique_norm_model: r => compact(r.brand) + '|' + compact(r.model),
  brand_model_kw: r => compact(r.brand) + '|' + compact(r.model) + '|' + r.kw,
};
const coverage = {};
for (const [name, keyFn] of Object.entries(units)) {
  const groups = new Map();
  for (const r of res) {
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  let covered = 0;
  for (const [, g] of groups) if (g.some(T12)) covered++;
  coverage[name] = { total: groups.size, covered, pct: +(100 * covered / groups.size).toFixed(1) };
}

/* per-brand matrix */
const brands = {};
for (const r of res) {
  const b = (brands[r.brand] ??= { rows: 0, confirmed: 0, native: 0, ambiguous: 0, eligibility_only: 0, other: 0 });
  b.rows++;
  if (CONFIRMED(r.status)) b.confirmed++;
  else if (r.status === 'native_spec_complete') b.native++;
  else if (r.status === 'ambiguous_multiple_candidates') b.ambiguous++;
  else if (r.status === 'eligibility_only') b.eligibility_only++;
  else b.other++;
}
for (const b of Object.values(brands)) b.pct = +(100 * (b.confirmed + b.native) / b.rows).toFixed(0);
const brandMatrix = Object.entries(brands).sort((a, b) => b[1].rows - a[1].rows);

/* segment metrics (RVO category + kW threshold) */
const seg = {};
for (const r of res) {
  const s = r.category ?? '?';
  (seg[s] ??= { rows: 0, t12: 0 });
  seg[s].rows++; if (T12(r)) seg[s].t12++;
  const rc = r.kw == null ? 'unknown_kw' : r.kw > 23 ? 'commercial(>23kW)' : 'residential(≤23kW)';
  (seg[rc] ??= { rows: 0, t12: 0 });
  seg[rc].rows++; if (T12(r)) seg[rc].t12++;
}
for (const s of Object.values(seg)) s.pct = +(100 * s.t12 / s.rows).toFixed(1);

/* market-priority-weighted coverage — transparent weights:
   w = ln(1 + brand rows) per row's brand (volume proxy), ×1.5 for Dutch-HQ/
   strategic brands (documented list), ×1.25 for R290/R32 rows (current products
   surviving the 2027 transition), ×1 otherwise. */
const STRATEGIC = new Set(['Itho Daalderop', 'Intergas', 'Quatt', 'WeHeat', 'Remeha', 'Nefit', 'ATAG']);
let wTot = 0, wCov = 0;
for (const r of res) {
  let w = Math.log(1 + brands[r.brand].rows);
  if (STRATEGIC.has(r.brand)) w *= 1.5;
  if (/R290|R32\b|R032/.test(r.refrigerant ?? '')) w *= 1.25;
  wTot += w; if (T12(r)) wCov += w;
}

const statusDist = {};
for (const r of res) statusDist[r.status] = (statusDist[r.status] ?? 0) + 1;

const summary = {
  generatedAt: new Date().toISOString(),
  totals: { rows: res.length, tier12: res.filter(T12).length },
  status_distribution: statusDist,
  coverage_by_unit: coverage,
  weighted_coverage_pct: +(100 * wCov / wTot).toFixed(1),
  segments: seg,
  brand_matrix_top40: brandMatrix.slice(0, 40).map(([b, v]) => ({ brand: b, ...v })),
  brands_zero_coverage_with_10plus_rows: brandMatrix.filter(([, v]) => v.rows >= 10 && v.confirmed + v.native === 0).map(([b, v]) => `${b}(${v.rows})`),
};
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, brand_matrix_top40: summary.brand_matrix_top40.slice(0, 12) }, null, 1));
