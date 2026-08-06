#!/usr/bin/env node
/**
 * build-linkedin-posts.mjs — turn the published news archive into ready-to-post
 * LinkedIn packages for the company page "HeatPump Database Europe".
 *
 * WHY A PACKAGE AND NOT AN API CALL
 * Posting to a company Page needs LinkedIn's Community Management API, which is
 * a separate application review (weeks, and refusable), and its tokens expire
 * every 60 days — so "automatic" would still mean a human re-authenticating
 * several times a year. With a page at zero followers we do not yet know which
 * stories land, and automating an unread feed is the expensive way to learn
 * nothing. This produces everything the post needs; publishing stays a
 * 60-second copy/paste until the numbers say it is worth the API.
 *
 * WHAT EACH PACKAGE CONTAINS
 *   post.txt     the post body — hook, three lines, hashtags. NO link.
 *   comment.txt  the article link, to be pasted as the FIRST COMMENT.
 *   image.jpg    the article's image, converted from WebP (LinkedIn rejects WebP).
 *   meta.json    market, date, category, headline — for the queue and for later API use.
 *
 * The link lives in the comment because LinkedIn suppresses the reach of posts
 * that carry an outbound link in the body. The image is what earns the stop;
 * the comment is what earns the click.
 *
 * English only, on purpose: one page serving DE/FR/PL/IT/GB in four languages
 * would be unreadable to 80% of its own audience, and "five markets in one
 * place" is the actual pitch. Every article already has an English original
 * (the localized copies are translations of it), so nothing is re-translated.
 *
 * Run:  node scripts/build-linkedin-posts.mjs            # all markets
 *       node scripts/build-linkedin-posts.mjs PL         # one market
 * Out:  linkedin_posts/  (gitignored — regenerate any time)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = join(ROOT, 'data_sources', 'news_public');
const IMAGES = join(ROOT, 'public', 'news-images');
const OUT = join(ROOT, 'linkedin_posts');

// `adj` is the adjective ("the German market"), `tag` the label and hashtag.
const MARKETS = {
  DE: { adj: 'German', host: 'https://www.heatpumpdb.de', tag: 'Germany', scheme: 'BAFA / KfW' },
  GB: { adj: 'UK', host: 'https://www.heatpumpdb.uk', tag: 'UK', scheme: 'BUS / Ofgem PEL' },
  FR: { adj: 'French', host: 'https://www.heatpumpdb.fr', tag: 'France', scheme: "MaPrimeRénov' / CEE" },
  PL: { adj: 'Polish', host: 'https://www.heatpumpdb.pl', tag: 'Poland', scheme: 'Czyste Powietrze / ZUM' },
  IT: { adj: 'Italian', host: 'https://www.heatpumpdb.it', tag: 'Italy', scheme: 'Conto Termico / GSE' },
};

/** Hashtags: a small, stable set beats a long tail. LinkedIn's own guidance is
 *  three to five; more reads as spam and does not widen reach. */
const TAGS_BY_CATEGORY = {
  FUNDING: ['HeatPumps', 'EnergyEfficiency', 'Subsidies'],
  MARKET: ['HeatPumps', 'HVAC', 'EnergyTransition'],
  TECHNOLOGY: ['HeatPumps', 'HVAC', 'Engineering'],
  'INSTALLER INSIGHT': ['HeatPumps', 'HVAC', 'Installers'],
  POLICY: ['HeatPumps', 'EnergyPolicy', 'EnergyTransition'],
};

const only = (process.argv[2] || '').toUpperCase();
const codes = only ? [only] : Object.keys(MARKETS);

/** Collapse whitespace and drop the trailing period a hook does not need. */
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Cut at a sentence end within the limit, never mid-word. */
function trimTo(text, limit) {
  const t = clean(text);
  if (t.length <= limit) return t;
  const slice = t.slice(0, limit);
  const stop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '));
  if (stop > limit * 0.5) return slice.slice(0, stop + 1);
  return slice.slice(0, slice.lastIndexOf(' ')) + '…';
}

/**
 * The first ~140 characters decide whether anyone expands the post — LinkedIn
 * truncates there behind a "see more". So the headline goes first, on its own
 * line, and the market is named immediately: a German installer must know in
 * one glance that this is about Germany.
 */
function buildPost(a, M) {
  const headline = clean(a.titleEn || a.title);
  const summary = trimTo(a.summaryEn || a.summary, 320);
  const cat = String(a.category || 'MARKET').toUpperCase();
  const tags = (TAGS_BY_CATEGORY[cat] ?? TAGS_BY_CATEGORY.MARKET)
    .concat(M.tag.replace(/\s/g, ''))
    .map((t) => `#${t}`)
    .join(' ');

  // Most headlines already name the country ("Germany Adjusts…"). Prefixing
  // those would read "Germany — Germany Adjusts…", so the label is only added
  // when the headline does not carry the market itself.
  const namesMarket = new RegExp(`\\b(${M.tag}|${M.adj})\\b`, 'i').test(headline);
  const opener = namesMarket ? headline : `${M.tag} — ${headline}`;

  return [
    opener,
    '',
    summary,
    '',
    `We track every heat pump model on the ${M.adj} market in one database — ${M.scheme} status, SCOP, sound power and refrigerant, on one data sheet.`,
    '',
    'Full article in the first comment ↓',
    '',
    tags,
  ].join('\n');
}

const slug = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, '-');

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const queue = [];
let built = 0, noImage = 0;

for (const cc of codes) {
  const M = MARKETS[cc];
  const file = join(SNAP, `${cc}.json`);
  if (!M || !existsSync(file)) { console.error(`skip ${cc}: no snapshot`); continue; }
  const items = JSON.parse(readFileSync(file, 'utf8')).items ?? [];

  for (const a of items) {
    if (!(a.titleEn || a.title)) continue;
    const dir = join(OUT, `${cc}-${slug(a.id)}`);
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, 'post.txt'), buildPost(a, M) + '\n');
    writeFileSync(join(dir, 'comment.txt'),
      `Full article: ${M.host}/news/${slug(a.id)}.html?ref=li\n`);

    // LinkedIn does not accept WebP uploads — convert. sips ships with macOS;
    // a missing image is reported, never silently skipped (a post without one
    // gets a fraction of the reach).
    let image = '';
    const src = a.imageUrl ? join(IMAGES, a.imageUrl.replace(/^\/news-images\//, '')) : '';
    if (src && existsSync(src)) {
      const dst = join(dir, 'image.jpg');
      try {
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', src, '--out', dst],
          { stdio: 'ignore' });
        image = 'image.jpg';
      } catch { /* fall through to the missing-image count */ }
    }
    if (!image) noImage++;

    const meta = {
      market: cc, id: a.id, date: a.date, category: a.category,
      headline: clean(a.titleEn || a.title),
      articleUrl: `${M.host}/news/${slug(a.id)}.html?ref=li`,
      image,
    };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    queue.push({ ...meta, folder: `${cc}-${slug(a.id)}` });
    built++;
  }
}

// The news function re-reports a running story across months, so the same
// headline can appear twice. Publishing it twice looks like a bot with a stuck
// feed — keep the newest telling and drop the rest.
const seen = new Set();
const deduped = [];
for (const q of [...queue].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
  const key = `${q.market}::${q.headline.toLowerCase()}`;
  if (seen.has(key)) { rmSync(join(OUT, q.folder), { recursive: true, force: true }); continue; }
  seen.add(key);
  deduped.push(q);
}
const dropped = queue.length - deduped.length;
queue.length = 0;
queue.push(...deduped);

/**
 * Posting order. Two rules, both about not looking like a bot:
 *  - newest first, because funding news decays;
 *  - never the same market twice in a row, so the feed reads as European
 *    coverage rather than a German page that occasionally mentions Poland.
 */
queue.sort((a, b) => String(b.date).localeCompare(String(a.date)));
const ordered = [];
const pool = [...queue];
let lastMarket = '';
while (pool.length) {
  let i = pool.findIndex((q) => q.market !== lastMarket);
  if (i === -1) i = 0;                       // only one market left — take it
  ordered.push(pool[i]);
  lastMarket = pool[i].market;
  pool.splice(i, 1);
}

/**
 * Launch batch — what to publish when the page is still empty.
 * A page with one post reads as abandoned, and with zero followers there is no
 * feed audience for the posts to compete over, so the usual "two a week" only
 * starts applying once somebody is actually following. Two per market: the
 * newest funding story (the most shared kind) and the newest market story (the
 * one that says we cover the whole continent).
 */
const launch = [];
for (const cc of Object.keys(MARKETS)) {
  const mine = queue.filter((q) => q.market === cc);
  for (const cat of ['FUNDING', 'MARKET']) {
    const pick = mine.find((q) => String(q.category).toUpperCase() === cat && !launch.includes(q));
    if (pick) launch.push(pick);
  }
}
// Interleave so the first ten posts read as European coverage, not five pairs.
const launchOrdered = [];
for (let round = 0; round < 2; round++) {
  for (const cc of Object.keys(MARKETS)) {
    const forCc = launch.filter((q) => q.market === cc);
    if (forCc[round]) launchOrdered.push(forCc[round]);
  }
}
writeFileSync(join(OUT, 'launch-batch.json'), JSON.stringify(launchOrdered, null, 2) + '\n');

const lines = [
  '# LinkedIn posting queue — HeatPump Database Europe',
  '#',
  '# Two or three a week, not more: a page at zero followers grows on rhythm,',
  '# and a burst of five posts in a day costs reach on every one of them.',
  '# Tuesday-Thursday, 08:00-10:00 CET is when this audience is on LinkedIn.',
  '#',
  '# Per post: open the folder, paste post.txt, attach image.jpg, publish,',
  '# then paste comment.txt as the FIRST comment.',
  '',
  ...ordered.map((q, i) => `${String(i + 1).padStart(2, '0')}. [${q.market}] ${String(q.date).slice(0, 10)}  ${q.folder}\n    ${q.headline}`),
];
writeFileSync(join(OUT, 'QUEUE.md'), lines.join('\n') + '\n');

console.log(`\nlinkedin_posts/  ${queue.length} packages` + (noImage ? `  (${noImage} without an image)` : '')
  + (dropped ? `  · ${dropped} repeated headline(s) dropped` : ''));
console.log(`launch batch: ${launchOrdered.length} posts — see linkedin_posts/launch-batch.json`);
console.log(`queue: ${ordered.length} posts, markets interleaved — see linkedin_posts/QUEUE.md\n`);
for (const cc of codes) {
  const n = queue.filter((q) => q.market === cc).length;
  if (n) console.log(`  ${cc}: ${n}`);
}
