// ZUM public-list enumerator — feasibility test only.
//
// ██ TIME GATE: owner instruction forbids running this before 2026-07-20. ██
//
// Behavior contract (per METHODOLOGY.md §2 and the owner's constraints):
//   - identity fields only (ID, manufacturer, product name, category, rated kW,
//     class(es), test-report flag, EPREL number if shown, informacja dodatkowa)
//   - NO attachment downloads; NO bulk document fetching
//   - ≤ 1 request per 2 s, single session, honest User-Agent
//   - proper TLS: build the CA chain via `openssl s_client -showcerts` into
//     out/zum/ca-chain.pem and pass it as extra CA; NEVER disable verification
//   - every response snapshotted to out/zum/raw/ before parsing
//   - ASP.NET WebForms: control names are session-randomized (verified in the
//     2026-07-16 saved HTML) → discover field names at runtime from the live
//     form; carry __VIEWSTATE/__EVENTVALIDATION; abort loudly on any structure
//     change instead of guessing
//   - modes: --counts-only (filter counts, no row enumeration) | --enumerate
//     (grid rows for HP categories + removed/suspended tab) | --sample-frame
//     (fallback: emit the stratified manual-reading worklist)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = '2026-07-20';
if (new Date().toISOString().slice(0, 10) < GATE) {
  console.error(`BLOCKED: owner instruction forbids external ZUM acquisition before ${GATE}.`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../out/zum');
const rawDir = path.join(outDir, 'raw');
fs.mkdirSync(rawDir, { recursive: true });

const BASE = 'https://lista-zum.ios.edu.pl';
const SEARCH = `${BASE}/bepub/ben001.aspx`;
const UA = 'HeatPumpDB-feasibility-study/1.0 (bounded read-only research; contact: owner)';
const DELAY_MS = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- TLS: supply the real chain, never skip verification -------------------
function ensureCaChain() {
  const pem = path.join(outDir, 'ca-chain.pem');
  if (!fs.existsSync(pem)) {
    const chain = execFileSync('openssl',
      ['s_client', '-connect', 'lista-zum.ios.edu.pl:443', '-servername',
       'lista-zum.ios.edu.pl', '-showcerts'],
      { input: '', encoding: 'utf8', timeout: 30000 });
    const certs = chain.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certs?.length) throw new Error('could not read server certificate chain');
    fs.writeFileSync(pem, certs.join('\n'));
    console.log(`CA chain written (${certs.length} certs). If Node still rejects, the`
      + ` missing intermediate must be fetched from the issuer's official AIA URL.`);
  }
  process.env.NODE_EXTRA_CA_CERTS = pem; // NOTE: must be set before node starts to
  // take effect; the wrapper re-execs itself once with it exported.
  return pem;
}

// re-exec once with NODE_EXTRA_CA_CERTS in place (env var is read at startup)
if (!process.env.__ZUM_CA_READY) {
  const pem = ensureCaChain();
  const r = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, NODE_EXTRA_CA_CERTS: pem, __ZUM_CA_READY: '1' },
    stdio: 'inherit',
  });
  process.exit(0);
}

let cookies = '';
let reqCount = 0;
async function get(url, opts = {}) {
  await sleep(DELAY_MS);
  reqCount++;
  const res = await fetch(url, {
    ...opts,
    headers: { 'user-agent': UA, ...(cookies ? { cookie: cookies } : {}), ...opts.headers },
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookies = setCookie.map(c => c.split(';')[0]).join('; ');
  const body = await res.text();
  const snap = path.join(rawDir, `${String(reqCount).padStart(4, '0')}-${res.status}.html`);
  fs.writeFileSync(snap, body);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url} (snapshot ${snap})`);
  return body;
}

// --- WebForms helpers -------------------------------------------------------
function hiddenFields(html) {
  const out = {};
  for (const m of html.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]*value="([^"]*)"/g))
    out[m[1]] = m[2];
  return out;
}
function formControls(html) {
  // checkboxes chk_<group>_<idx> with paired hf_<group>_<idx>, plus selects/buttons.
  // Control ids beyond the chk_/hf_ convention are session-randomized — always
  // read them fresh from THIS response, never from a previous run.
  const checkboxes = [...html.matchAll(/<input[^>]+type="checkbox"[^>]+name="([^"]+)"/g)].map(m => m[1]);
  const submits = [...html.matchAll(/<input[^>]+type="submit"[^>]+name="([^"]+)"[^>]*value="([^"]*)"/g)]
    .map(m => ({ name: m[1], value: m[2] }));
  return { checkboxes, submits };
}
function filterCounts(html) {
  // labels look like: `A++&nbsp;(2383)` — capture label + count with group context
  return [...html.matchAll(/>([^<>]{0,60}?)&nbsp;\((\d{1,5})\)</g)]
    .map(m => ({ label: m[1].trim(), count: Number(m[2]) }));
}

// --- Modes ------------------------------------------------------------------
const mode = process.argv.includes('--enumerate') ? 'enumerate'
  : process.argv.includes('--sample-frame') ? 'sample-frame' : 'counts-only';

const page = await get(SEARCH);
const counts = filterCounts(page);
fs.writeFileSync(path.join(outDir, 'filter-counts.json'), JSON.stringify({
  fetchedAt: new Date().toISOString(), url: SEARCH, counts,
}, null, 2));
console.log(`filter labels captured: ${counts.length}`);

if (mode === 'counts-only') {
  console.log('counts-only done. Inspect out/zum/filter-counts.json and the raw snapshot,');
  console.log('then map label→category-group ids by hand before running --enumerate.');
  process.exit(0);
}

// The enumeration flow below is intentionally conservative: it requires a human
// to have inspected the counts-only snapshot first and written the category
// postback plan to out/zum/enumeration-plan.json:
//   { categories: [{ key:'air_water', checkbox:'chk_1_…', submit:'…' }, …],
//     rowSelectorNote: '…' }
// This guarantees the script never guesses at a changed form.
const planFile = path.join(outDir, 'enumeration-plan.json');
if (!fs.existsSync(planFile)) {
  console.error(`No ${planFile}. Run --counts-only, inspect the snapshot, write the plan.`);
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const rows = [];
for (const cat of plan.categories) {
  let current = page;
  let pageNo = 1;
  for (;;) {
    const fields = hiddenFields(current);
    const body = new URLSearchParams({
      ...fields,
      [cat.checkbox]: 'on',
      ...(pageNo === 1 ? { [cat.submit]: cat.submitValue ?? 'Szukaj' }
                       : { __EVENTTARGET: cat.gridName, __EVENTARGUMENT: `Page$${pageNo}` }),
    });
    current = await get(SEARCH, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const parsed = (plan.parseRows ?? defaultParseRows)(current, cat.key);
    if (!parsed.length) break;
    rows.push(...parsed);
    console.log(`[${cat.key}] page ${pageNo}: +${parsed.length} (total ${rows.length})`);
    if (!current.includes(`Page$${pageNo + 1}`)) break;
    pageNo++;
  }
}
function defaultParseRows(html, category) {
  // Grid row shape must be confirmed from the counts-only snapshot; this default
  // targets <tr> cells in the results grid and will be replaced by the plan.
  const out = [];
  for (const tr of html.matchAll(/<tr[^>]*class="[^"]*(?:row|item)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length >= 3) out.push({ category, cells });
  }
  return out;
}
fs.writeFileSync(path.join(outDir, 'zum-rows-raw.json'), JSON.stringify({
  fetchedAt: new Date().toISOString(), requestCount: reqCount, rows,
}, null, 2));
console.log(`enumeration finished: ${rows.length} rows, ${reqCount} requests.`);
