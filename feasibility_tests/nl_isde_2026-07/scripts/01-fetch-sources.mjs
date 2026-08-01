// NL Phase-0 PoC — fetch the official RVO sources (bounded, cached, polite).
// Non-production tooling: writes only inside this workspace.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(here, '../raw');
fs.mkdirSync(RAW, { recursive: true });
const UA = 'HeatPumpDB-research/1.0 (bounded PoC; contact: owner of heatpumpdb.de)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

function curl(url, out) {
  const code = execFileSync('curl', ['-sS', '-L', '--max-time', '60', '-A', UA,
    '-o', out, '-w', '%{http_code}', url], { encoding: 'utf8' });
  return code.trim();
}

const meta = { fetchedAt: new Date().toISOString(), files: {} };

// 1) Current XLSX (month-stamped URL, verified in the feasibility study)
const XLSX_URL = 'https://www.rvo.nl/sites/default/files/2026-07/Meldcodelijst%20Warmtepompen%20-%20juli%202026.xlsx';
const xlsxOut = path.join(RAW, 'meldcodelijst-2026-07.xlsx');
if (!fs.existsSync(xlsxOut)) {
  const st = curl(XLSX_URL, xlsxOut);
  console.log('XLSX juli 2026:', st, fs.statSync(xlsxOut).size, 'bytes');
}
meta.files.xlsx_current = { url: XLSX_URL, path: 'raw/meldcodelijst-2026-07.xlsx', sha256_16: sha(xlsxOut), bytes: fs.statSync(xlsxOut).size };

// 2) Previous month for the maintenance simulation (URL pattern probe; fallback: web archive)
const PREV_CANDIDATES = [
  ['https://www.rvo.nl/sites/default/files/2026-06/Meldcodelijst%20Warmtepompen%20-%20juni%202026.xlsx', 'meldcodelijst-2026-06.xlsx'],
  ['https://www.rvo.nl/sites/default/files/2026-05/Meldcodelijst%20Warmtepompen%20-%20mei%202026.xlsx', 'meldcodelijst-2026-05.xlsx'],
];
for (const [url, name] of PREV_CANDIDATES) {
  const out = path.join(RAW, name);
  if (fs.existsSync(out)) { meta.files[name] = { url, sha256_16: sha(out), bytes: fs.statSync(out).size }; continue; }
  await sleep(1500);
  const st = curl(url, out);
  const ok = st === '200' && fs.statSync(out).size > 50000 && fs.readFileSync(out).subarray(0, 2).toString() === 'PK';
  console.log(name, '→', st, fs.statSync(out).size, 'bytes', ok ? 'OK(xlsx)' : 'NOT-XLSX/missing');
  if (!ok) { fs.rmSync(out); continue; }
  meta.files[name] = { url, sha256_16: sha(out), bytes: fs.statSync(out).size };
}

// 3) Full API enumeration (65 pages @ 50 rows, 1.5 s politeness, cached per page)
const API = 'https://www.rvo.nl/api/rvo/v1/search-products/21';
let page = 0, total = null, pages = null;
for (;;) {
  const out = path.join(RAW, `api-page-${String(page).padStart(3, '0')}.json`);
  if (!fs.existsSync(out)) {
    await sleep(1500);
    const st = curl(`${API}?page=${page}`, out);
    if (st !== '200') { console.error(`page ${page}: HTTP ${st} — stopping`); break; }
  }
  const d = JSON.parse(fs.readFileSync(out, 'utf8'));
  if (total == null) { total = d.pager.count; pages = d.pager.pages; console.log(`API: total ${total}, pages ${pages}, perPage ${d.pager.itemsPerPage}`); }
  if (page % 10 === 0) console.log(`page ${page}/${pages - 1} cached`);
  page++;
  if (page >= pages) break;
}
meta.api = { url: API, total, pages, perPage: 50 };
fs.writeFileSync(path.join(RAW, '_meta.json'), JSON.stringify(meta, null, 2));
console.log('DONE', JSON.stringify(meta.files, null, 1).slice(0, 400));
