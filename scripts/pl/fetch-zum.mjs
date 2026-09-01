/**
 * fetch-zum.mjs — Lista ZUM public-list snapshot fetcher (PL market source).
 *
 * Downloads the public heat-pump entries of Lista ZUM (lista-zum.ios.edu.pl,
 * operator IOŚ-PIB) into data_sources/lista_zum/raw/YYYY-MM/:
 *   - per-category result-grid pages (identity rows + detail link tokens)
 *   - per-entry public detail pages (ben002.aspx — specs, EPREL id, dates)
 *   - _meta.json with fetch timestamps and counts
 *
 * Facts-only acquisition: NO attachment/document downloads, no logos, public
 * pages only, honest User-Agent, ≥1.5 s between requests, resumable via
 * checkpoint (safe to re-run; already-fetched detail pages are skipped).
 *
 * The grid is fetched in full every run. Detail pages are CARRIED FORWARD from
 * the previous snapshot when the entry's grid row is unchanged, with a rolling
 * sixth re-verified from source each month — see the carry-forward note below.
 * The delay stays 1.5 s: the fix for a five-hour crawl is not asking a public
 * registry for the same 10,000 pages faster, it is not asking twice.
 * Transport is curl (the host serves an incomplete TLS chain that the system
 * trust store resolves; TLS verification is never disabled).
 *
 * The site is ASP.NET WebForms: tab selection is a hidden field (hfPanel),
 * search and grid paging are __doPostBack calls carrying the full hidden-field
 * set of the PREVIOUS response (per-response __VIEWSTATE).
 *
 * Usage: node scripts/pl/fetch-zum.mjs [--snapshot=YYYY-MM] [--grid-only] [--no-reuse]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT = (process.argv.find(a => a.startsWith('--snapshot=')) ?? '').split('=')[1]
  || new Date().toISOString().slice(0, 7);
const GRID_ONLY = process.argv.includes('--grid-only');
const OUT = path.join(ROOT, 'data_sources/lista_zum/raw', SNAPSHOT);
fs.mkdirSync(path.join(OUT, 'grid'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'detail'), { recursive: true });

const BASE = 'https://lista-zum.ios.edu.pl/bepub/ben001.aspx';
const UA = 'HeatPumpDB-market-research/1.0 (read-only; contact: owner of heatpumpdb.de)';
const JAR = path.join(OUT, 'cookies.txt');
const DELAY_MS = 1500;

// Heat-pump category tabs (sidebar panel ids) + the removed/suspended tab.
const PANELS = [
  { key: 'PW', panel: 'PW_p', label: 'Pompa ciepła powietrze/woda (55°C)' },
  { key: 'PWX', panel: 'PWxp', label: 'Pompa ciepła powietrze/woda o podwyższonej klasie' },
  { key: 'PU', panel: 'PU_p', label: 'Pompa ciepła powietrze/woda do C.W.U.' },
  { key: 'PG', panel: 'PG_p', label: 'Gruntowa pompa ciepła o podwyższonej klasie' },
  { key: 'PP', panel: 'PP_p', label: 'Pompa ciepła powietrze/powietrze' },
  { key: 'EX', panel: 'EX_p', label: 'Usunięte / zawieszone' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let requestCount = 0;

function curl(args) {
  requestCount++;
  return execFileSync('curl', ['-sS', '--max-time', '120', '-A', UA,
    '-c', JAR, '-b', JAR, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
async function get(url) { await sleep(DELAY_MS); return curl([url]); }
async function post(url, fields) {
  await sleep(DELAY_MS);
  const body = Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const tmp = path.join(OUT, '.postbody.tmp');
  fs.writeFileSync(tmp, body);
  return curl(['--data', `@${tmp}`, url]);
}

const hiddenFields = html => {
  const out = {};
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    if (!/type="hidden"/.test(tag)) continue;
    const name = tag.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    out[name] = decodeEntities(tag.match(/value="([^"]*)"/)?.[1] ?? '');
  }
  return out;
};
function decodeEntities(s) {
  return s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'");
}

export function parseGrid(html, categoryKey) {
  const rows = [];
  const table = html.match(/<table[^>]*id="MainContent_gvTable"[^>]*>([\s\S]*?)<\/table>/)?.[1] ?? '';
  for (const tr of table.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
    // The row tag carries the detail link: onclick="window.open(&#39;/bepub/ben002.aspx?rq=…&#39;…
    const onclick = tr[1].match(/window\.open\(&#39;([^&]*(?:&(?!#39;)[^&]*)*)&#39;/)
      ?? tr[1].match(/window\.open\(&#39;(.*?)&#39;/);
    const cells = [...tr[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(c => decodeEntities(c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()));
    if (!cells.length) continue; // header row
    rows.push({ category: categoryKey, detailPath: onclick ? decodeEntities(onclick[1]) : null, cells });
  }
  const total = Number(html.match(/id="MainContent_lblRowCount"[^>]*>(\d+)</)?.[1] ?? NaN);
  return { rows, total };
}

// Pager: collect every distinct Page$N event argument present in the response.
const pagerArgs = html =>
  [...new Set([...html.matchAll(/__doPostBack\('([^']*gvTable[^']*)','(Page\$\d+)'\)/g)]
    .map(m => JSON.stringify([m[1].replace(/\\'/g, "'"), m[2]])))].map(s => JSON.parse(s));

/* ── Carrying detail pages forward ────────────────────────────────────────────
   Until 2026-09 every monthly run re-downloaded all ~10,200 public detail
   pages. Measured against the July snapshot, 99.5% of them were byte-identical
   in the grid and only 53 entries had actually appeared or changed: five and a
   quarter hours of requests to a public IOŚ-PIB server to learn almost nothing,
   every month, and the single reason the maintenance window could not finish.

   WHAT IS AND IS NOT CARRIED FORWARD
   The GRID is re-fetched in full every run and is never reused. That matters,
   because the grid is what LISTING state is read from — whether an entry is on
   the list this month, and whether it has moved to the removed/suspended tab.
   So "Na liście ZUM" is always an observation made this month.

   Only the DETAIL page is carried forward, and only when the entry's whole grid
   row is byte-identical to the previous snapshot. The detail page supplies
   specifications, which move far more slowly than listing state.

   NEVER carried forward:
     - an id that is new, or whose grid row changed in any field
     - anything in the EX (removed/suspended) tab — status-critical by definition
     - a rolling 1/6 of everything else, chosen by a stable hash of the id, so
       the entire register is re-verified from source within six months even
       where the grid never showed a change

   PROVENANCE IS TRANSITIVE, AND THAT IS THE POINT
   A carried page records where it was ACTUALLY fetched, not where it was copied
   from. If October carries a page from September that September had itself
   carried from July, the recorded origin stays July. Without that a page would
   quietly age up and look fresh for ever. PL publishes registry-native records
   whose only evidence is this snapshot, so a detail page dated to a month it
   was not fetched in would be us overstating our own evidence.

   --no-reuse forces the old behaviour (full refetch).
   ───────────────────────────────────────────────────────────────────────── */

/* ── The removed/suspended tab is identity-only ───────────────────────────────
   parse-zum.mjs has said since the beginning that the "Usunięte / zawieszone"
   entries are "identity-level records ... (no detail pages are fetched for
   them)" — it builds them from the grid row alone and never opens a detail
   page for one. The fetcher did not know that and downloaded them anyway:
   7,171 of the register's 12,782 rows are in that tab, so roughly 7,100 public
   pages a month were fetched, stored, and never read by anything.

   They are skipped now. An id that appears in the EX tab AND in an active tab
   still gets its page — the active listing is what the catalogue publishes —
   and it is always fetched fresh rather than carried, because a suspension is
   the last thing to serve from a copy.
   ───────────────────────────────────────────────────────────────────────── */

const NO_REUSE = process.argv.includes('--no-reuse');
const ROLLING_DIVISOR = 6;          // re-verify 1/6 of the carried set each month

/** Stable across runs and machines — Math.random() or insertion order would
 *  re-roll the slice on every retry and verify nothing in particular. */
export function idHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/** Which sixth of the register this snapshot re-verifies. Derived from the
 *  month so six consecutive runs cover all of it exactly once. */
export function rollingSlice(snapshot) {
  const [y, m] = snapshot.split('-').map(Number);
  return ((y * 12 + (m - 1)) % ROLLING_DIVISOR + ROLLING_DIVISOR) % ROLLING_DIVISOR;
}

/**
 * The whole rule, in one place and with no I/O, so it can be tested.
 *   'fetch'    — go to the source
 *   'carry'    — copy the previous snapshot's page forward
 *   'reverify' — unchanged, but this month's rolling slice; fetch it anyway
 * Order matters: EX is checked before anything else, because the removed and
 * suspended tab is the one state that must never be taken on trust.
 */
export function carryDecision({ category, id, prevIdentity, nowIdentity, slice, hasPrevFile }) {
  if (category === 'EX') return 'fetch';
  if (!hasPrevFile) return 'fetch';
  if (prevIdentity == null || prevIdentity !== nowIdentity) return 'fetch';
  return (idHash(id) % ROLLING_DIVISOR) === slice ? 'reverify' : 'carry';
}

/** Newest snapshot before this one that actually has something to carry. */
function previousSnapshot() {
  const base = path.join(ROOT, 'data_sources/lista_zum/raw');
  if (!fs.existsSync(base)) return null;
  return fs.readdirSync(base)
    .filter(d => /^\d{4}-\d{2}$/.test(d) && d < SNAPSHOT)
    .filter(d => fs.existsSync(path.join(base, d, 'grid-rows.json'))
              && fs.existsSync(path.join(base, d, 'detail')))
    .sort()
    .pop() ?? null;
}

/** id -> the row's identity (every cell). The TAB is deliberately excluded: an
 *  entry listed under both PW and PWX yields two rows and one detail page, and
 *  which tab was scanned first is an artefact of our crawl, not a change in the
 *  register. Including it made 2,538 untouched entries look modified. */
export function identityById(rows) {
  const m = new Map();
  for (const r of rows) {
    const id = (r.cells?.[0] ?? '').replace(/[^A-Za-z0-9-]/g, '');
    if (!id || m.has(id)) continue;
    m.set(id, r.cells.join('|'));
  }
  return m;
}

/** What the previous snapshot can offer: identities, and for each detail page
 *  the run it was REALLY fetched in (its own carry record, or itself). */
function carryForwardSource() {
  if (NO_REUSE) return null;
  const prev = previousSnapshot();
  if (!prev) return null;
  const dir = path.join(ROOT, 'data_sources/lista_zum/raw', prev);
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(path.join(dir, 'grid-rows.json'), 'utf8')).rows ?? []; }
  catch { return null; }

  let prevFetchedAt = null;
  try { prevFetchedAt = JSON.parse(fs.readFileSync(path.join(dir, '_meta.json'), 'utf8')).finishedAt ?? null; }
  catch { /* a snapshot without _meta is still usable; the origin is just the folder */ }

  // Inherited origins, so a page copied twice still names the month it was fetched.
  const inherited = new Map();
  try {
    const prov = JSON.parse(fs.readFileSync(path.join(dir, 'detail-provenance.json'), 'utf8'));
    for (const [id, o] of Object.entries(prov.carried ?? {})) inherited.set(id, o);
  } catch { /* previous run predates provenance — it fetched everything itself */ }

  return { snapshot: prev, dir, identity: identityById(rows), prevFetchedAt, inherited };
}

async function fetchDetails(allRows, categories) {
  // Detail phase — one public detail page per row (resumable, keyed by ZUM id).
  let done = 0, skipped = 0, failed = 0, carried = 0, reverified = 0;
  const idRe = /^[A-Z]{2,3}-\d+/;
  const src = carryForwardSource();
  const slice = rollingSlice(SNAPSHOT);
  const now = identityById(allRows);

  // Which tabs each id appears in. An id can be in both — the active tab wins
  // for whether we fetch at all, and EX membership still forces a fresh fetch.
  const activeIds = new Set(), exIds = new Set();
  for (const r of allRows) {
    const rid = (r.cells?.[0] ?? '').replace(/[^A-Za-z0-9-]/g, '');
    if (!rid) continue;
    (r.category === 'EX' ? exIds : activeIds).add(rid);
  }
  let exOnly = 0;
  const provenance = {};                       // id -> { snapshot, fetched_at }

  if (src) {
    console.log(`[detail] carrying forward from ${src.snapshot} where the grid row is unchanged; `
      + `re-verifying slice ${slice}/${ROLLING_DIVISOR} from source`);
  } else {
    console.log(`[detail] no carry-forward source${NO_REUSE ? ' (--no-reuse)' : ''} — fetching every page`);
  }

  for (const row of allRows) {
    if (categories && !categories.includes(row.category)) { continue; }
    if (!idRe.test(row.cells[0] ?? '')) { continue; } // pager/footer rows
    const id = row.cells[0].replace(/[^A-Za-z0-9-]/g, '');
    const file = path.join(OUT, 'detail', `${id}.html`);
    if (!row.detailPath) { skipped++; continue; }
    // Removed/suspended and nothing else: the parser reads these from the grid
    // row, so a detail page for one would be downloaded and never opened.
    if (row.category === 'EX' && !activeIds.has(id)) { exOnly++; continue; }
    if (fs.existsSync(file) && fs.statSync(file).size > 2000) { skipped++; continue; }

    // Carry the previous page forward when nothing about the entry changed —
    // except for the removed/suspended tab, which is exactly the state we must
    // never take on trust, and except for this month's re-verification slice.
    if (src) {
      const prevFile = path.join(src.dir, 'detail', `${id}.html`);
      const decision = carryDecision({
        category: exIds.has(id) ? 'EX' : row.category,
        id,
        prevIdentity: src.identity.get(id),
        nowIdentity: now.get(id),
        slice,
        hasPrevFile: fs.existsSync(prevFile) && fs.statSync(prevFile).size > 2000,
      });
      if (decision === 'carry') {
        fs.copyFileSync(prevFile, file);
        // Where it was REALLY fetched, not where it was copied from.
        provenance[id] = src.inherited.get(id)
          ?? { snapshot: src.snapshot, fetched_at: src.prevFetchedAt };
        carried++;
        continue;
      }
      if (decision === 'reverify') reverified++;
    }

    try {
      const html = await get(`https://lista-zum.ios.edu.pl${row.detailPath}`);
      fs.writeFileSync(file, html);
      done++;
      if (done % 50 === 0) console.log(`[detail] ${done} fetched, ${carried} carried, ${skipped} skipped, ${failed} failed`);
    } catch (e) {
      failed++;
      console.warn(`[detail] FAIL ${id}: ${e.message}`);
      if (failed > 30) throw new Error('too many detail failures — aborting');
    }
  }

  // The record of what this snapshot actually observed itself. parse-zum reads
  // it to stamp every entry, so a carried specification can never be presented
  // as evidence gathered this month.
  fs.writeFileSync(path.join(OUT, 'detail-provenance.json'), JSON.stringify({
    snapshot: SNAPSHOT,
    carried_from: src ? src.snapshot : null,
    rolling_slice: `${slice}/${ROLLING_DIVISOR}`,
    counts: { fetched: done, carried, reverified, skipped, failed, removed_tab_skipped: exOnly },
    carried_pages: Object.keys(provenance).length,
    carried: provenance,
  }, null, 1));

  console.log(`detail phase complete: ${done} fetched (${reverified} of them re-verified on the rolling slice), `
    + `${carried} carried forward, ${exOnly} removed-tab rows skipped, ${skipped} skipped, ${failed} failed`);
  return { done, carried, reverified, skipped, failed, exOnly, slice, carriedFrom: src ? src.snapshot : null };
}

async function run() {
  const startedAt = new Date().toISOString();

  // --details-from-rows[=CAT,CAT]: skip the grid phase, reuse grid-rows.json.
  const dfr = process.argv.find(a => a.startsWith('--details-from-rows'));
  if (dfr) {
    const cats = dfr.includes('=') ? dfr.split('=')[1].split(',') : null;
    const saved = JSON.parse(fs.readFileSync(path.join(OUT, 'grid-rows.json'), 'utf8'));
    // Dedupe by ZUM id across tabs (PWX is a filtered view of PW ids).
    const seen = new Set();
    const rows = saved.rows.filter(r => {
      const id = r.cells[0];
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    await fetchDetails(rows, cats);
    console.log(`requests this run: ${requestCount}`);
    return;
  }

  const allRows = [];
  let detailStats = null;
  const first = await get(BASE);
  fs.writeFileSync(path.join(OUT, 'grid', 'landing.html'), first);

  for (const { key, panel, label } of PANELS) {
    // Fresh search postback for this panel (fresh landing fields each time).
    const landing = await get(BASE);
    let fields = hiddenFields(landing);
    fields['ctl00$MainContent$hfPanel'] = panel;
    fields.__EVENTTARGET = 'ctl00$MainContent$btnSearch';
    fields.__EVENTARGUMENT = '';
    let page = await post(BASE, fields);
    let pageNo = 1;
    let expectedTotal = null;
    const seenPages = new Set([1]);
    for (;;) {
      fs.writeFileSync(path.join(OUT, 'grid', `${key}-page-${String(pageNo).padStart(3, '0')}.html`), page);
      const { rows, total } = parseGrid(page, key);
      if (expectedTotal == null && Number.isFinite(total)) expectedTotal = total;
      allRows.push(...rows);
      console.log(`[${key}] page ${pageNo}: +${rows.length} rows (category total ${expectedTotal ?? '?'})`);
      // find the next page link
      const next = pagerArgs(page).find(([, arg]) => Number(arg.slice(5)) === pageNo + 1
        || (arg === 'Page$Last' && false));
      if (!next) {
        // "..." pager: the next block may only be reachable via the literal next number;
        // if absent and we have fewer rows than total, try Page$<n+1> against the grid name.
        const gridName = pagerArgs(page)[0]?.[0] ?? 'ctl00$MainContent$gvTable';
        const rowsSoFar = allRows.filter(r => r.category === key).length;
        if (expectedTotal != null && rowsSoFar < expectedTotal) {
          const f = hiddenFields(page);
          f['ctl00$MainContent$hfPanel'] = panel;
          f.__EVENTTARGET = gridName;
          f.__EVENTARGUMENT = `Page$${pageNo + 1}`;
          const candidate = await post(BASE, f);
          const parsed = parseGrid(candidate, key);
          if (parsed.rows.length) { page = candidate; pageNo++; seenPages.add(pageNo); continue; }
        }
        break;
      }
      const f = hiddenFields(page);
      f['ctl00$MainContent$hfPanel'] = panel;
      f.__EVENTTARGET = next[0];
      f.__EVENTARGUMENT = next[1];
      page = await post(BASE, f);
      pageNo++;
      seenPages.add(pageNo);
    }
    const got = allRows.filter(r => r.category === key).length;
    console.log(`[${key}] done: ${got} rows${expectedTotal != null ? ` / expected ${expectedTotal}` : ''} — ${label}`);
    if (expectedTotal != null && got !== expectedTotal) {
      console.warn(`[${key}] WARNING: row count mismatch (${got} ≠ ${expectedTotal})`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'grid-rows.json'), JSON.stringify({
    fetchedAt: startedAt, rows: allRows,
  }, null, 1));
  console.log(`grid phase complete: ${allRows.length} rows, ${requestCount} requests`);

  if (!GRID_ONLY) {
    detailStats = await fetchDetails(allRows, null);
  }

  fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify({
    source: 'https://lista-zum.ios.edu.pl (Lista ZUM, IOŚ-PIB)',
    snapshot: SNAPSHOT,
    startedAt, finishedAt: new Date().toISOString(),
    requestCount, rowCount: allRows.length,
    politenessDelayMs: DELAY_MS,
    detail: detailStats,
    scope: 'public heat-pump grid pages + public detail pages; no attachments',
  }, null, 2));
  console.log('DONE');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error(e); process.exit(1); });
}
