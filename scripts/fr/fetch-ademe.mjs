#!/usr/bin/env node
/**
 * fetch-ademe.mjs — snapshot the ADEME heat pump agrément register.
 *
 * WHY THIS EXISTS
 * From 2026-09-01 the agrément number must appear on the devis, the facture,
 * the attestation sur l'honneur and in the Emmy registry (Arrêté du 29 mai
 * 2026 / Décret n° 2026-413). A French installer's first question about a model
 * becomes "is it agréé, and what is the number" — which is exactly the question
 * our FR edition should already answer.
 *
 * WHY NOT FETCH THE PAGE
 * bonus-pac.ademe.fr renders its result list from script, so a plain HTML fetch
 * returns a well-formed page with "0 résultats" and an empty brand filter — the
 * worst failure mode there is, because it succeeds. A naive ingest built on it
 * would silently wipe the overlay (marketing flagged this on 2026-08-11).
 *
 * The search UI calls a JSON endpoint, and so do we:
 *   GET /eligibilite/recherche?page=<n>&perPage=<n>
 *   -> { records[], total, page, totalPages, filters{}, importDate }
 * `importDate` is the register's own publication stamp, so the snapshot date we
 * display comes from the source rather than from our clock.
 *
 * FACTS ONLY. Public data, no attachments, no logos, no ADEME branding. The
 * server clamps perPage to 27, so a full read is ~66 requests — spaced by
 * POLITE_MS, the same courtesy the ZUM fetcher observes.
 *
 * Run:  node scripts/fr/fetch-ademe.mjs [--out <dir>]
 * Out:  data_sources/ademe_agrement/raw/<YYYY-MM>/page-NNN.json + _meta.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://bonus-pac.ademe.fr/eligibilite/recherche';
const POLITE_MS = 1600;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(page) {
  const res = await fetch(`${BASE}?page=${page}&perPage=27`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
  return res.json();
}

const first = await getPage(1);
const { total, totalPages, importDate } = first;
if (!total || !Array.isArray(first.records) || !first.records.length) {
  // The exact failure the page fetch produces. Never write an empty snapshot:
  // a downstream builder cannot tell "register is empty" from "read failed".
  console.error(`ADEME: first page returned no records (total=${total}) — refusing to write a snapshot`);
  process.exit(1);
}
console.log(`ADEME agrément register: ${total} records · ${totalPages} pages · importDate ${importDate}`);

const pages = [first];
for (let p = 2; p <= totalPages; p++) {
  await sleep(POLITE_MS);
  pages.push(await getPage(p));
  process.stdout.write(`\r  fetched ${p}/${totalPages}`);
}
console.log('');

const seen = new Set();
const records = [];
for (const pg of pages) {
  for (const r of pg.records ?? []) {
    const key = String(r.id ?? `${r.marque}|${r.modele}|${r.numeroAgrement}`);
    if (seen.has(key)) continue;          // paging with a moving list can repeat
    seen.add(key);
    records.push(r);
  }
}

// A short read is a partial read. Say so loudly rather than publishing a gap.
const complete = records.length >= total;
if (!complete) console.warn(`  WARNING partial read: ${records.length} of ${total} — downstream must treat this as incomplete`);

const month = new Date().toISOString().slice(0, 7);
const argOut = process.argv.indexOf('--out');
const OUT = argOut >= 0 ? process.argv[argOut + 1]
  : join(ROOT, 'data_sources', 'ademe_agrement', 'raw', month);
mkdirSync(OUT, { recursive: true });

writeFileSync(join(OUT, 'records.json'), JSON.stringify(records, null, 1));
writeFileSync(join(OUT, 'filters.json'), JSON.stringify(first.filters ?? {}, null, 1));
writeFileSync(join(OUT, '_meta.json'), JSON.stringify({
  source: 'https://bonus-pac.ademe.fr/',
  endpoint: BASE,
  fetched_at: new Date().toISOString(),
  import_date: importDate,          // the register's OWN stamp — what we display
  total_reported: total,
  records_read: records.length,
  complete,
  pages: totalPages,
  note: 'Public register, facts only. No ADEME logo or branding is used. '
      + 'The web list is the working reference; the arrêté is the legal instrument.',
}, null, 1));

console.log(`  -> ${OUT}`);
console.log(`     records ${records.length}/${total}${complete ? '' : '  (PARTIAL)'} · importDate ${importDate}`);
const brands = new Set(records.map((r) => r.marque).filter(Boolean));
const withNo = records.filter((r) => r.numeroAgrement).length;
const transitory = records.filter((r) => r.isTransitorySite).length;
console.log(`     ${brands.size} brands · ${withNo} carry an agrément number · ${transitory} transitional-site`);
