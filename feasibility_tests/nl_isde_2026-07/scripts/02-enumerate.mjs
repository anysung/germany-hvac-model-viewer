// NL Phase-0 PoC — parse XLSX + API, normalize every official row, reconcile.
// Output: out/rows.json (one record per official row, both sources merged),
//         out/enumeration.json (all reconciliation counts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const XLSX = require('xlsx');

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(here, '../raw');
const OUT = path.resolve(here, '../out');
fs.mkdirSync(OUT, { recursive: true });

/* ── XLSX ── */
const wb = XLSX.readFile(path.join(RAW, 'meldcodelijst-2026-07.xlsx'));
console.log('sheets:', wb.SheetNames);
const dataSheet = wb.SheetNames.find(n => /meldcode/i.test(n)) ?? wb.SheetNames[1];
const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[dataSheet], { header: 1, defval: null });
// find the header row (contains MELDCODE)
const hIdx = sheetRows.findIndex(r => r?.some(c => String(c ?? '').toUpperCase().includes('MELDCODE')));
const header = sheetRows[hIdx].map(h => String(h ?? '').trim());
console.log('header @row', hIdx, ':', header.join(' | '));
const xl = [];
for (let i = hIdx + 1; i < sheetRows.length; i++) {
  const r = sheetRows[i];
  if (!r || r.every(c => c == null || c === '')) continue;
  const o = Object.fromEntries(header.map((h, j) => [h, r[j] ?? null]));
  o.__xlsxRow = i + 1;
  xl.push(o);
}
console.log('xlsx data rows:', xl.length);

const col = name => header.find(h => h.toUpperCase().includes(name));
const C = {
  meldcode: col('MELDCODE'), brand: col('FABRIKANT') ?? col('MERK'),
  model: col('MODEL'), kw: col('VERMOGEN'), amount: col('SUBSIDIEBEDRAG'),
  amount2: header.find(h => /2e/i.test(h)), refrigerant: col('KOUDEMIDDEL'),
  gwp: col('GWP'), category: col('CATEGORIE'),
};
console.log('column map:', JSON.stringify(C));

const euro = v => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[€.\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const num = v => {
  if (v == null) return null;
  const n = Number(String(v).replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(n) ? n : null;
};

const xlRows = xl.map(o => ({
  source: 'xlsx',
  meldcode: String(o[C.meldcode] ?? '').trim(),
  brand: String(o[C.brand] ?? '').trim(),
  model: String(o[C.model] ?? '').trim(),
  kw: num(o[C.kw]),
  amount: euro(o[C.amount]),
  amount2: euro(o[C.amount2]),
  refrigerant: String(o[C.refrigerant] ?? '').trim() || null,
  gwp: num(o[C.gwp]),
  category: String(o[C.category] ?? '').trim() || null,
  xlsxRow: o.__xlsxRow,
}));

/* ── API ── */
const parseSummary = s => {
  const g = k => s?.match(new RegExp('<b>' + k + ':? ?</b>:? ?([^<]+)'))?.[1]?.trim() ?? null;
  return { model: g('Model/Type'), brand: g('Merk'), meldcode: g('Meldcode'),
    category: g('Categorie'), amount: euro(g('Subsidiebedrag')), kw: num(g('Subsidiabel Vermogen')),
    refrigerant: g('Koudemiddel') };
};
const api = [];
for (const f of fs.readdirSync(RAW).filter(x => /^api-page-\d+\.json$/.test(x)).sort()) {
  for (const r of JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).searchResults) {
    api.push({ source: 'api', nid: r.nid, title: r.title, urlAlias: r.urlAlias, ...parseSummary(r.summary) });
  }
}
console.log('api rows:', api.length);

/* ── Reconcile by meldcode ── */
const xlBy = new Map(xlRows.map(r => [r.meldcode, r]));
const apiBy = new Map(api.map(r => [r.meldcode, r]));
const common = [...xlBy.keys()].filter(k => apiBy.has(k));
const xlOnly = [...xlBy.keys()].filter(k => !apiBy.has(k));
const apiOnly = [...apiBy.keys()].filter(k => !xlBy.has(k));

// field agreement on common records
let agree = { model: 0, brand: 0, kw: 0, amount: 0, category: 0 };
for (const k of common) {
  const a = xlBy.get(k), b = apiBy.get(k);
  if (String(a.model).replace(/\s+/g, '') === String(b.model ?? '').replace(/\s+/g, '')) agree.model++;
  if (a.brand.toUpperCase() === String(b.brand ?? '').toUpperCase()) agree.brand++;
  if (a.kw === b.kw) agree.kw++;
  if (a.amount === b.amount) agree.amount++;
  if (a.category === b.category) agree.category++;
}

/* ── Merged canonical row set (XLSX authoritative; API adds nid/urlAlias) ── */
const rows = xlRows.map(r => ({ ...r, nid: apiBy.get(r.meldcode)?.nid ?? null, urlAlias: apiBy.get(r.meldcode)?.urlAlias ?? null }));
for (const k of apiOnly) rows.push({ ...apiBy.get(k), xlsxRow: null, amount2: null, gwp: null });

/* ── Enumeration stats ── */
const norm = s => String(s ?? '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, '');
const stats = {
  fetchedAt: JSON.parse(fs.readFileSync(path.join(RAW, '_meta.json'), 'utf8')).fetchedAt,
  xlsx_rows: xlRows.length, api_rows: api.length,
  common_meldcodes: common.length, xlsx_only: xlOnly.length, api_only: apiOnly.length,
  xlsx_only_codes: xlOnly.slice(0, 20), api_only_codes: apiOnly.slice(0, 20),
  field_agreement_on_common: agree,
  unique_meldcodes: new Set(rows.map(r => r.meldcode)).size,
  duplicate_meldcode_rows: rows.length - new Set(rows.map(r => r.meldcode)).size,
  missing_brand: rows.filter(r => !r.brand).length,
  missing_model: rows.filter(r => !r.model).length,
  missing_kw: rows.filter(r => r.kw == null).length,
  missing_refrigerant: rows.filter(r => !r.refrigerant).length,
  missing_gwp: rows.filter(r => r.gwp == null).length,
  missing_amount: rows.filter(r => r.amount == null).length,
  unique_brands_raw: new Set(rows.map(r => r.brand)).size,
  unique_brands_norm: new Set(rows.map(r => norm(r.brand))).size,
  unique_models_raw: new Set(rows.map(r => r.brand + '|' + r.model)).size,
  unique_models_norm: new Set(rows.map(r => norm(r.brand) + '|' + norm(r.model))).size,
  unique_brand_model_kw: new Set(rows.map(r => norm(r.brand) + '|' + norm(r.model) + '|' + r.kw)).size,
  by_category: rows.reduce((a, r) => { a[r.category ?? '?'] = (a[r.category ?? '?'] ?? 0) + 1; return a; }, {}),
  by_refrigerant_top: Object.entries(rows.reduce((a, r) => { a[r.refrigerant ?? '?'] = (a[r.refrigerant ?? '?'] ?? 0) + 1; return a; }, {})).sort((x, y) => y[1] - x[1]).slice(0, 8),
};
fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rows));
fs.writeFileSync(path.join(OUT, 'enumeration.json'), JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 1));
