#!/usr/bin/env node
/**
 * publish-special-report-news.mjs — announce a Special Report edition in each
 * market's in-app news feed, pinned to the top until the next edition.
 *
 * WHY A SCRIPT AND NOT THE CLOUD FUNCTION
 * The news function generates the monthly market articles; this one article is
 * editorial and owner-written, so it is committed as reviewable copy
 * (data_sources/special_report/<edition>/news.json) and pushed from here. Same
 * collection, same schema, same append-only rule — nothing is ever deleted.
 *
 * WHAT MAKES THIS ARTICLE DIFFERENT FROM THE MONTHLY ONES
 *   pinned:true       holds it at the top of the feed (news is otherwise
 *                     strictly newest-first, so next month's batch would bury
 *                     the report the week it launched)
 *   imagePinned:true  keeps its cover out of the image-pool rotation —
 *                     backfill-news-images.mjs reassigns every article's image
 *                     on each run and would otherwise swap the report cover
 *                     for a stock photo
 *   ctaUrl            the article exists to hand the reader the report; the
 *                     news body renders as plain text, so this is its one link
 *
 * The cover is the market language's own render, and the CTA points at the
 * market's OWN site — a German reader downloads from heatpumpdb.de, not from
 * a hub they have never visited.
 *
 * Idempotent: re-running overwrites the same document ids rather than adding
 * duplicates.
 *
 *   node scripts/news/publish-special-report-news.mjs --dry-run
 *   node scripts/news/publish-special-report-news.mjs [--edition 2026-08]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editions } from '../lib/special-report-store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT = 'gen-lang-client-0324244302';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DRY = process.argv.includes('--dry-run');

const wanted = (() => {
  const i = process.argv.indexOf('--edition');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const MARKETS = {
  DE: { lang: 'de', host: 'https://www.heatpumpdb.de' },
  GB: { lang: 'en', host: 'https://www.heatpumpdb.uk' },
  FR: { lang: 'fr', host: 'https://www.heatpumpdb.fr' },
  PL: { lang: 'pl', host: 'https://www.heatpumpdb.pl' },
  IT: { lang: 'it', host: 'https://www.heatpumpdb.it' },
};

const all = editions(ROOT);
const ed = wanted ? all.find((e) => e.id === wanted) : all[0];
if (!ed) { console.error(`no such edition${wanted ? `: ${wanted}` : ''}`); process.exit(1); }

const newsFile = join(ed.dir, 'news.json');
if (!existsSync(newsFile)) { console.error(`edition ${ed.id} has no news.json`); process.exit(1); }
const N = JSON.parse(readFileSync(newsFile, 'utf8'));

const TOKEN = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const authed = { Authorization: `Bearer ${TOKEN}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };

/** Firestore REST value wrappers. */
const S = (stringValue) => ({ stringValue });
const B = (booleanValue) => ({ booleanValue });
const srcArray = (list) => ({
  arrayValue: { values: list.map((s) => ({ mapValue: { fields: { title: S(s.title), url: S(s.url) } } })) },
});

let wrote = 0;
for (const [cc, m] of Object.entries(MARKETS)) {
  const id = `news-${N.idDate}-${cc.toLowerCase()}-sr1`;
  const en = N.copy.en;
  const loc = N.copy[m.lang] ?? en;
  const sources = N.sources[cc] ?? [];
  const editionUrl = `${m.host}/special-report/${ed.id}/`;

  // English fields are the base (GB reads them directly); the market language
  // goes in the *_<lang> fields the app and the exporter already understand.
  const fields = {
    id: S(id),
    date: S(N.docDate),
    category: S(N.category),
    author: S(N.author),
    original: B(true),
    title: S(en.title),
    summary: S(en.summary),
    body: S(en.body),
    imageUrl: S(`/special-report/img/special-report-${ed.id}-${m.lang}.webp`),
    imagePinned: B(true),
    pinned: B(true),
    sourceUrl: S(sources[0]?.url ?? editionUrl),
    sources: srcArray(sources),
    ctaUrl: S(editionUrl),
    ctaLabel: S(en.ctaLabel),
  };
  if (m.lang !== 'en') {
    fields[`title_${m.lang}`] = S(loc.title);
    fields[`summary_${m.lang}`] = S(loc.summary);
    fields[`body_${m.lang}`] = S(loc.body);
    fields[`ctaLabel_${m.lang}`] = S(loc.ctaLabel);
  }

  const url = `${BASE}/countries/${cc}/news?documentId=${id}`;
  console.log(`[${cc}] ${id}`);
  console.log(`      "${loc.title}"`);
  console.log(`      image ${fields.imageUrl.stringValue} · cta ${editionUrl}`);
  if (DRY) continue;

  // Create, then fall back to a full overwrite when the id already exists —
  // append-only for the collection, idempotent for this one document.
  let res = await fetch(url, { method: 'POST', headers: authed, body: JSON.stringify({ fields }) });
  if (res.status === 409) {
    res = await fetch(`${BASE}/countries/${cc}/news/${id}`, {
      method: 'PATCH', headers: authed, body: JSON.stringify({ fields }),
    });
    console.log('      (existed — overwritten)');
  }
  if (!res.ok) { console.error(`      FAILED ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
  wrote++;
}

console.log(DRY
  ? `\nDRY RUN — nothing written. Edition ${ed.id}, ${Object.keys(MARKETS).length} markets.`
  : `\nEdition ${ed.id}: ${wrote} market news articles published and pinned.`);
