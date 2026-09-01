/**
 * parse-zum.mjs — normalize the Lista ZUM raw snapshot into one record per
 * unique ZUM device id.
 *
 * Input:  data_sources/lista_zum/raw/YYYY-MM/{grid-rows.json, detail/*.html}
 * Output: data_sources/lista_zum/parsed/YYYY-MM/zum-normalized.json
 *         { meta, entries: [...] , removed: [...] }
 *
 * entries — ACTIVE heat-pump devices (tabs PW/PWX/PU/PG/PP), detail-parsed:
 *   zum_id, category ('PW'|'PU'|'PG'|'PP'), higher_class (PWX membership),
 *   manufacturer, product_name, model, rated_kw_55, etas_55, etas_35,
 *   class_55, class_35, scop, annual_kwh_55, noise_indoor_db, noise_outdoor_db,
 *   refrigerant, refrigerant_kg, eprel_number, producer_url, additional_info,
 *   certificate {label, valid_to} | null, has_test_report, added_at, detail_ok
 * removed — identity-level records from the "Usunięte / zawieszone" tab,
 *   heat-pump prefixes only (no detail pages are fetched for them).
 *
 * Facts-only: attachments are never downloaded; only public field values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolveRoot();
const SNAPSHOT = (process.argv.find(a => a.startsWith('--snapshot=')) ?? '').split('=')[1]
  || latestSnapshot();
const RAW = path.join(ROOT, 'data_sources/lista_zum/raw', SNAPSHOT);
const OUT_DIR = path.join(ROOT, 'data_sources/lista_zum/parsed', SNAPSHOT);
fs.mkdirSync(OUT_DIR, { recursive: true });

function resolveRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}
function latestSnapshot() {
  const dir = path.join(resolveRoot(), 'data_sources/lista_zum/raw');
  const snaps = fs.readdirSync(dir).filter(d => /^\d{4}-\d{2}$/.test(d)).sort();
  if (!snaps.length) throw new Error('no lista_zum raw snapshot found');
  return snaps[snaps.length - 1];
}

const decode = s => (s ?? '')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&quot;', '"');

const clean = s => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const num = s => {
  const v = String(s ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return v ? Number(v[0]) : null;
};
const blank = v => v == null || v === '' || v === '-' || v === '—';

/** label/value pairs from the detail page's two-column table rows. */
function detailPairs(html) {
  const pairs = [];
  for (const m of html.matchAll(/<tr[^>]*>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    pairs.push([clean(m[1]), clean(m[2])]);
  }
  return pairs;
}

function parseDetail(html, zumId) {
  const pairs = detailPairs(html);
  const get = re => pairs.find(([k]) => re.test(k))?.[1] ?? null;
  const getAll = re => pairs.filter(([k]) => re.test(k)).map(([, v]) => v);

  // ηs and class rows repeat per temperature; the label carries 55°C / 35°C.
  const etasRows = pairs.filter(([k]) => /Sezonowa efektywność energetyczna/i.test(k) && !/Klasa/i.test(k));
  const classRows = pairs.filter(([k]) => /Klasa sezonowej efektywności/i.test(k));
  const byTemp = (rows, t) => rows.find(([k]) => k.includes(`${t}°C`))?.[1] ?? null;

  const cert = pairs.find(([k]) => /^Certyfikat/i.test(k));
  const certMatch = cert?.[0].match(/Certyfikat\s*-\s*(.+?),\s*ważny do\s*(\d{4}-\d{2}-\d{2})/i);

  // History rows: "YYYY-MM-DD == Urządzenie zostało dodane…" — first = added date.
  const historyDates = pairs
    .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && /dodane do wykazu/i.test(v))
    .map(([k]) => k)
    .sort();

  const device = get(/^Urządzenie$/i); // "PG-000621 (Gruntowa pompa ciepła …)"

  return {
    zum_id: zumId,
    device_label: device,
    manufacturer: get(/^Nazwa producenta/i),
    product_name: get(/^Nazwa własna produktu/i),
    model: get(/Oznaczenie \/ typ \/ identyfikator modelu/i),
    rated_kw_55: num(get(/Znamionowa moc cieplna/i)),
    etas_55: num(byTemp(etasRows, 55)) ?? (etasRows.length === 1 ? null : null),
    etas_35: num(byTemp(etasRows, 35)),
    class_55: byTemp(classRows, 55),
    class_35: byTemp(classRows, 35),
    scop: num(get(/średniej sezonowej sprawności wytwarzania ciepła/i)),
    single_class: classRows.length === 1 ? classRows[0][1] : null, // air/air, DHW
    annual_kwh_55: num(get(/Roczne zużycie energii/i)),
    noise_indoor_db: num(get(/mocy akustycznej wewnątrz/i)),
    noise_outdoor_db: num(get(/mocy akustycznej na zewnątrz/i)),
    refrigerant: blank(get(/Rodzaj czynnika chłodniczego/i)) ? null : get(/Rodzaj czynnika chłodniczego/i),
    refrigerant_kg: num(get(/^Masa czynnika/i)),
    eprel_number: (() => {
      const v = get(/Identyfikator rejestracji w bazie EPREL/i);
      return blank(v) ? null : String(num(v) ?? v).trim();
    })(),
    producer_url: blank(get(/Link do produktu na stronie producenta/i)) ? null : get(/Link do produktu/i),
    additional_info: blank(get(/^Informacja dodatkowa/i)) ? null : get(/^Informacja dodatkowa/i),
    certificate: certMatch ? { label: certMatch[1].trim(), valid_to: certMatch[2] } : null,
    has_test_report: pairs.some(([k]) => /^Raport z badań/i.test(k)),
    weather_control: get(/regulację pogodową/i) === 'TAK',
    added_at: historyDates[0] ?? null,
    detail_ok: Boolean(device),
  };
}

/* ── Load grid rows ─────────────────────────────────────────────────────── */
const grid = JSON.parse(fs.readFileSync(path.join(RAW, 'grid-rows.json'), 'utf8'));

/* Detail pages may have been CARRIED FORWARD from an earlier snapshot when the
   entry's grid row was unchanged (see fetch-zum.mjs). Listing state is always
   this month's — the grid is re-fetched in full — but a specification read from
   a carried page is evidence from the month it was actually fetched in, and
   that is what every entry is stamped with below. A snapshot that predates the
   carry-forward record simply fetched everything itself. */
const carried = (() => {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(RAW, 'detail-provenance.json'), 'utf8'));
    return new Map(Object.entries(p.carried ?? {}));
  } catch { return new Map(); }
})();
const detailOrigin = (id) => carried.get(id) ?? { snapshot: SNAPSHOT, fetched_at: null };
const HP_TABS = ['PW', 'PWX', 'PU', 'PG', 'PP'];
const HP_PREFIXES = ['PW', 'PU', 'PG', 'PP'];
const idRe = /^[A-Z]{2,3}-\d+/;

const higherClassIds = new Set(grid.rows.filter(r => r.category === 'PWX').map(r => r.cells[0]));

// active HP entries: unique ids across PW/PWX/PU/PG/PP tabs
const activeById = new Map();
for (const r of grid.rows) {
  if (!HP_TABS.includes(r.category) || !idRe.test(r.cells[0] ?? '')) continue;
  if (!activeById.has(r.cells[0])) {
    activeById.set(r.cells[0], {
      zum_id: r.cells[0],
      category: r.cells[0].split('-')[0].replace(/^PWX?$/, 'PW'),
      grid_product_name: r.cells[1] ?? null,
      grid_model: r.cells[2] ?? null,
      grid_manufacturer: r.cells[3] ?? null,
    });
  }
}

// removed/suspended: EX tab rows with HP prefixes
const removed = grid.rows
  .filter(r => r.category === 'EX' && idRe.test(r.cells[0] ?? '')
    && HP_PREFIXES.includes(r.cells[0].split('-')[0]))
  .map(r => ({
    zum_id: r.cells[0],
    category: r.cells[0].split('-')[0],
    product_name: r.cells[1] ?? null,
    model: r.cells[2] ?? null,
    manufacturer: r.cells[3] ?? null,
    status: 'removed_or_suspended',
  }));

/* ── Parse details ──────────────────────────────────────────────────────── */
const entries = [];
let missingDetail = 0, badDetail = 0;
for (const [id, base] of activeById) {
  const file = path.join(RAW, 'detail', `${id}.html`);
  if (!fs.existsSync(file)) {
    missingDetail++;
    entries.push({
      ...base,
      manufacturer: base.grid_manufacturer,
      model: base.grid_model,
      product_name: base.grid_product_name,
      higher_class: higherClassIds.has(id),
      detail_ok: false,
      detail_snapshot: null,
      detail_fetched_at: null,
      status: 'active',
    });
    continue;
  }
  const d = parseDetail(fs.readFileSync(file, 'utf8'), id);
  if (!d.detail_ok) badDetail++;
  const origin = detailOrigin(id);
  entries.push({
    ...base,
    ...d,
    manufacturer: d.manufacturer ?? base.grid_manufacturer,
    model: d.model ?? base.grid_model,
    product_name: d.product_name ?? base.grid_product_name,
    higher_class: higherClassIds.has(id),
    // Which run this entry's SPECIFICATIONS come from. Equal to the snapshot
    // for a page fetched this month; earlier for a carried one.
    detail_snapshot: origin.snapshot,
    detail_fetched_at: origin.fetched_at,
    status: 'active',
  });
}

/* ── Validations (fatal) ────────────────────────────────────────────────── */
const PARTIAL = process.argv.includes('--allow-partial'); // smoke-testing/ops only — never for a production build
const fail = m => { console.error(`FATAL: ${m}`); process.exit(1); };
if (activeById.size < 2500) fail(`only ${activeById.size} active HP entries — grid parse collapsed`);
if (!PARTIAL && missingDetail > activeById.size * 0.05) fail(`${missingDetail} entries have no detail page (>5%) — fetch incomplete; rerun fetch-zum.mjs --details-from-rows`);
if (badDetail > 20) fail(`${badDetail} detail pages failed to parse — page structure changed?`);
const withModel = entries.filter(e => e.model).length;
if (withModel < entries.length * 0.98) fail(`only ${withModel}/${entries.length} entries carry a model identifier`);

const summary = {
  snapshot: SNAPSHOT,
  generated_at: new Date().toISOString(),
  source: 'https://lista-zum.ios.edu.pl (Lista ZUM, IOŚ-PIB) — public pages, facts only',
  active_unique: activeById.size,
  detail_fetched_this_snapshot: entries.filter(e => e.detail_snapshot === SNAPSHOT).length,
  detail_carried_forward: entries.filter(e => e.detail_snapshot && e.detail_snapshot !== SNAPSHOT).length,
  detail_oldest_snapshot: entries.reduce((a, e) =>
    e.detail_snapshot && (a === null || e.detail_snapshot < a) ? e.detail_snapshot : a, null),
  by_category: entries.reduce((a, e) => { a[e.category] = (a[e.category] ?? 0) + 1; return a; }, {}),
  higher_class: entries.filter(e => e.higher_class).length,
  with_eprel: entries.filter(e => e.eprel_number).length,
  with_etas35: entries.filter(e => e.etas_35 != null).length,
  with_refrigerant: entries.filter(e => e.refrigerant).length,
  with_certificate: entries.filter(e => e.certificate).length,
  missing_detail: missingDetail,
  removed_or_suspended_hp: removed.length,
};

fs.writeFileSync(path.join(OUT_DIR, 'zum-normalized.json'),
  JSON.stringify({ meta: summary, entries, removed }, null, 1));
console.log(JSON.stringify(summary, null, 2));
console.log(`→ ${path.join(OUT_DIR, 'zum-normalized.json')}`);
