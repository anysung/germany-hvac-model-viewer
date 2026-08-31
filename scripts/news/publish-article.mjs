#!/usr/bin/env node
/**
 * publish-article.mjs — publish ONE editorial article into a market's news feed
 * from a reviewed JSON file.
 *
 * WHY A FILE AND NOT A PROMPT
 * The monthly market articles are written by the cloud function; this is for the
 * pieces we write ourselves against a primary source. Committing the copy as a
 * file first means the exact text that reaches production has been read by a
 * person, and the same file is the record of what was published — a subsidy rate
 * typed straight into an API call has no reviewable form.
 *
 * SCHEMA, WHICH IS NOT OPTIONAL
 * Base fields are ENGLISH and the market language goes in *_<lang> fields. Every
 * market edition is at least bilingual — the FR site serves FR|EN — so an
 * article published in one language only shows the other language's readers a
 * wall of text they did not ask for. Both are required here rather than
 * defaulted, so the omission cannot happen quietly.
 *
 * News is APPEND-ONLY. This creates a document and, if the id already exists,
 * overwrites that one document; it never deletes anything else.
 *
 * Run:  node scripts/news/publish-article.mjs <article.json> [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'gen-lang-client-0324244302';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const LANG = { DE: 'de', GB: 'en', FR: 'fr', PL: 'pl', IT: 'it' };

const file = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!file) { console.error('Usage: publish-article.mjs <article.json> [--dry-run]'); process.exit(1); }
if (!existsSync(resolve(file))) { console.error(`no such file: ${file}`); process.exit(1); }
const A = JSON.parse(readFileSync(resolve(file), 'utf8'));

const cc = String(A.country || '').toUpperCase();
const lang = LANG[cc];
if (!lang) { console.error(`country must be one of ${Object.keys(LANG).join(', ')} — got "${A.country}"`); process.exit(1); }

/* Fail before the network call, not after: a half-written article is worse than
   an unpublished one, and Firestore will happily accept a document missing its
   summary. */
const required = ['id', 'date', 'category', 'author', 'title', 'summary', 'body', 'imageUrl'];
const missing = required.filter((k) => !A[k]);
if (lang !== 'en') {
  for (const k of ['title', 'summary', 'body']) if (!A[`${k}_${lang}`]) missing.push(`${k}_${lang}`);
}
if (missing.length) { console.error(`missing required field(s): ${missing.join(', ')}`); process.exit(1); }

/* The image must exist in the shipped pool. It is served from public/, which
   means a NEW image only reaches readers after the market site is rebuilt and
   deployed — publishing the document first would show a broken image until then. */
const gallery = A.images?.length ? A.images : [A.imageUrl];
if (gallery[0] !== A.imageUrl) {
  console.error('images[0] must be the same file as imageUrl — it is the lead image');
  console.error('  used by the cards, the social preview and the article PDF.');
  process.exit(1);
}
for (const img of gallery) {
  const local = img.startsWith('/news-images/')
    ? resolve(process.cwd(), 'public', img.replace(/^\//, '')) : null;
  if (local && !existsSync(local)) {
    console.error(`image not in the pool: ${img}`);
    console.error('  add the .webp to public/news-images/, register it in manifest.json,');
    console.error(`  then rebuild and deploy the ${cc} site before publishing.`);
    process.exit(1);
  }
}

const S = (stringValue) => ({ stringValue });
const B = (booleanValue) => ({ booleanValue });

const fields = {
  id: S(A.id), date: S(A.date), category: S(A.category), author: S(A.author),
  original: B(true),
  title: S(A.title), summary: S(A.summary), body: S(A.body),
  imageUrl: S(A.imageUrl),
  // backfill-news-images.mjs reassigns every article's image on each run; an
  // article whose picture was chosen for it has to be exempt or it silently
  // loses it to the rotation.
  ...(A.imagePinned ? { imagePinned: B(true) } : {}),
  /* The full ordered set, only when there is more than one — a single-image
     article keeps exactly the shape it had before galleries existed. */
  ...(gallery.length > 1
    ? { images: { arrayValue: { values: gallery.map((u) => S(u)) } } }
    : {}),
  ...(A.sourceUrl ? { sourceUrl: S(A.sourceUrl) } : {}),
  ...(A.ctaUrl ? { ctaUrl: S(A.ctaUrl), ctaLabel: S(A.ctaLabel ?? 'Read more') } : {}),
  ...(A.sources?.length ? {
    sources: { arrayValue: { values: A.sources.map((s) => ({
      mapValue: { fields: { title: S(s.title), url: S(s.url) } } })) } },
  } : {}),
};
if (lang !== 'en') {
  for (const k of ['title', 'summary', 'body']) fields[`${k}_${lang}`] = S(A[`${k}_${lang}`]);
}

console.log(`[${cc}] ${A.id}`);
console.log(`      ${A.title}`);
if (lang !== 'en') console.log(`      ${A[`title_${lang}`]}`);
console.log(`      ${A.date.slice(0, 10)} · ${A.category} · ${A.imageUrl}${gallery.length > 1 ? ` (+${gallery.length - 1} in gallery)` : ''}`);
console.log(`      본문 ${A.body.length}자 / ${lang} ${A[`body_${lang}`]?.length ?? 0}자 · 출처 ${A.sources?.length ?? 0}건`);
if (DRY) { console.log('\nDRY RUN — 아무것도 쓰지 않았습니다.'); process.exit(0); }

const TOKEN = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const authed = { Authorization: `Bearer ${TOKEN}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };

let res = await fetch(`${BASE}/countries/${cc}/news?documentId=${A.id}`,
  { method: 'POST', headers: authed, body: JSON.stringify({ fields }) });
if (res.status === 409) {
  res = await fetch(`${BASE}/countries/${cc}/news/${A.id}`,
    { method: 'PATCH', headers: authed, body: JSON.stringify({ fields }) });
  console.log('      (기존 문서 — 덮어씀)');
}
if (!res.ok) { console.error(`FAILED ${res.status}: ${(await res.text()).slice(0, 400)}`); process.exit(1); }
console.log('\n✓ 게재 완료');
