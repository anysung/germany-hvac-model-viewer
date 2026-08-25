#!/usr/bin/env node
/**
 * build-report-linkedin.mjs — ready-to-post LinkedIn packages for the monthly
 * Special Report, one per market plus an English hub post.
 *
 * WHY A PACKAGE AND NOT AN API CALL
 * Same reasoning as build-linkedin-posts.mjs: posting to a company Page needs
 * LinkedIn's Community Management API — a separate review, refusable, with
 * tokens that expire every 60 days. Publishing stays a 60-second copy/paste
 * until the numbers say otherwise.
 *
 * WHY ONE POST PER MARKET AND NOT ONE FOR THE REPORT
 * The report covers five markets, but a German installer does not want to read
 * about Poland to reach the German paragraph. Each market post leads with its
 * OWN finding, in its own language, and links to its own edition's report page.
 * The English hub post is the only one that pitches the comparison itself,
 * because that is the one audience the comparison is actually for.
 *
 * THE LINK IS IN THE FIRST COMMENT, never the post. LinkedIn suppresses the
 * reach of posts carrying an outbound link; the post earns the impression and
 * the comment earns the click. The bare domain is written without https://
 * because LinkedIn rewrites long URLs into anonymous lnkd.in links, and a
 * reader trusts a domain they can read.
 *
 * ATTRIBUTION: every link carries a per-market ?ref= token so the admin
 * Marketing page can tell which edition actually pulled. Those tokens are a
 * CLOSED list in src/services/signupRef.ts — li-report-de/gb/fr/pl/it and
 * li-report — and anything outside it is filed as 'other'. They are already
 * registered; a new one must be added and deployed BEFORE a link goes out.
 *
 * Run:  node scripts/marketing/build-report-linkedin.mjs [edition]
 *       (defaults to the newest edition in data_sources/special_report/)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editions } from '../lib/special-report-store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'linkedin_report_posts');

const all = editions(ROOT);
if (!all.length) { console.error('No Special Report edition found.'); process.exit(1); }
const wanted = process.argv[2];
const ed = wanted ? all.find((e) => e.id === wanted) : all[0];
if (!ed) { console.error(`Edition ${wanted} not found. Have: ${all.map((e) => e.id).join(', ')}`); process.exit(1); }

const meta = ed.meta;
const copy = meta.copy ?? {};

/** Market presentation. `lang` picks the report's own translation of the copy. */
const MARKETS = {
  DE: { lang: 'de', host: 'www.heatpumpdb.de', ref: 'li-report-de', adj: 'German',
        tags: '#Wärmepumpe #Heizungsbau #SHK #Energiewende #HeatPumpDB' },
  GB: { lang: 'en', host: 'www.heatpumpdb.uk', ref: 'li-report-gb', adj: 'UK',
        tags: '#HeatPumps #Retrofit #NetZero #HVAC #HeatPumpDB' },
  FR: { lang: 'fr', host: 'www.heatpumpdb.fr', ref: 'li-report-fr', adj: 'French',
        tags: '#PompeAChaleur #Chauffage #RenovationEnergetique #RGE #HeatPumpDB' },
  PL: { lang: 'pl', host: 'www.heatpumpdb.pl', ref: 'li-report-pl', adj: 'Polish',
        tags: '#PompyCiepła #CzystePowietrze #OZE #HVAC #HeatPumpDB' },
  IT: { lang: 'it', host: 'www.heatpumpdb.it', ref: 'li-report-it', adj: 'Italian',
        tags: '#PompeDiCalore #ContoTermico #Riscaldamento #HVAC #HeatPumpDB' },
};

/** Per-market post furniture, in the market's language. */
const L = {
  de: { lead: 'Unser neuer monatlicher Special Report vergleicht fünf europäische Heizungsmärkte.',
        close: 'Der vollständige Report — 18 Seiten, fünf Märkte — im ersten Kommentar ↓',
        commentLabel: 'Report lesen' },
  en: { lead: 'Our new monthly Special Report compares five European heating markets.',
        close: 'The full report — 18 pages, five markets — in the first comment ↓',
        commentLabel: 'Read the report' },
  fr: { lead: 'Notre nouveau Special Report mensuel compare cinq marchés européens du chauffage.',
        close: 'Le rapport complet — 18 pages, cinq marchés — en premier commentaire ↓',
        commentLabel: 'Lire le rapport' },
  pl: { lead: 'Nasz nowy comiesięczny Special Report porównuje pięć europejskich rynków grzewczych.',
        close: 'Pełny raport — 18 stron, pięć rynków — w pierwszym komentarzu ↓',
        commentLabel: 'Przeczytaj raport' },
  it: { lead: 'Il nostro nuovo Special Report mensile mette a confronto cinque mercati europei del riscaldamento.',
        close: 'Il report completo — 18 pagine, cinque mercati — nel primo commento ↓',
        commentLabel: 'Leggi il report' },
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Standing copy constraints — a qualifier a market's figure may not travel
 * without (monitoring digest 2026-08-24, §G-15).
 *
 * The German half-year number is manufacturer deliveries to wholesalers and the
 * trade, NOT installations at end customers. The report's own bullet says
 * "sales" unqualified, and a post that repeats that in front of German
 * installers is a misstatement — they are precisely the audience that knows the
 * difference. So the qualifier is appended here rather than trusted to the
 * source copy.
 */
const QUALIFIER = {
  DE: { de: 'Absatz an Großhandel und Fachhandwerk, keine Installationszahlen.',
        en: 'Sell-in to wholesalers and the trade, not installations.' },
};

/** The market's own bullet from the report — its finding, in its language. */
function findingFor(cc, lang) {
  const bullets = copy[lang]?.bullets ?? copy.en?.bullets ?? [];
  const hit = bullets.find((b) => b.cc === cc);
  if (!hit) return null;
  const q = QUALIFIER[cc]?.[lang] ?? QUALIFIER[cc]?.en;
  return q ? `${clean(hit.text)} ${q}` : clean(hit.text);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const queue = [];

for (const [cc, M] of Object.entries(MARKETS)) {
  const t = L[M.lang] ?? L.en;
  const finding = findingFor(cc, M.lang) ?? findingFor(cc, 'en');
  if (!finding) { console.error(`skip ${cc}: no market bullet in the report`); continue; }

  const dir = join(OUT, cc);
  mkdirSync(dir, { recursive: true });

  // Lead with THIS market's finding. The report is the reason to click, not
  // the reason to stop scrolling.
  const post = [finding, '', t.lead, '', t.close, '', M.tags].join('\n');
  writeFileSync(join(dir, 'post.txt'), post + '\n');
  writeFileSync(join(dir, 'comment.txt'),
    `${t.commentLabel}: ${M.host}/special-report/?ref=${M.ref}\n`);

  // LinkedIn does not accept WebP. The cover ships per report language; fall
  // back to English so a market is never posted without an image (a post
  // without one gets a fraction of the reach).
  let image = '';
  for (const lang of [M.lang, 'en']) {
    const src = join(ed.dir, 'img', `special-report-${ed.id}-${lang}.webp`);
    if (!existsSync(src)) continue;
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85',
        src, '--out', join(dir, 'image.jpg')], { stdio: 'ignore' });
      image = `image.jpg (${lang})`;
      break;
    } catch { /* try the next language */ }
  }
  if (!image) console.error(`! ${cc}: no cover image converted`);

  writeFileSync(join(dir, 'meta.json'), JSON.stringify({
    market: cc, edition: ed.id, language: M.lang,
    url: `https://${M.host}/special-report/?ref=${M.ref}`,
    image, headline: finding,
  }, null, 2) + '\n');
  queue.push({ market: cc, lang: M.lang, image, folder: cc });
}

/* The hub post — the only one that pitches the comparison itself, in English,
   for the cross-market audience the comparison is actually for. */
const en = copy.en ?? {};
const hubDir = join(OUT, 'EU');
mkdirSync(hubDir, { recursive: true });
writeFileSync(join(hubDir, 'post.txt'), [
  clean(en.title) || "Europe's Heating Transition: Five Markets, Five Realities",
  '',
  clean(en.standfirst),
  '',
  ...(en.bullets ?? []).map((b) => `${b.label}: ${clean(b.text)}`),
  '',
  'The full report — 18 pages — in the first comment ↓',
  '',
  '#HeatPumps #EnergyTransition #HVAC #HeatingMarket #HeatPumpDB',
].join('\n') + '\n');
writeFileSync(join(hubDir, 'comment.txt'),
  `Read the report: www.heatpumpdb.eu/special-report/?ref=li-report\n`);
for (const lang of ['en']) {
  const src = join(ed.dir, 'img', `special-report-${ed.id}-${lang}.webp`);
  if (existsSync(src)) {
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85',
        src, '--out', join(hubDir, 'image.jpg')], { stdio: 'ignore' });
    } catch { /* reported below by the missing-image check */ }
  }
}
writeFileSync(join(hubDir, 'meta.json'), JSON.stringify({
  market: 'EU', edition: ed.id, language: 'en',
  url: 'https://www.heatpumpdb.eu/special-report/?ref=li-report',
  image: existsSync(join(hubDir, 'image.jpg')) ? 'image.jpg' : '',
}, null, 2) + '\n');
queue.push({ market: 'EU', lang: 'en', image: 'image.jpg', folder: 'EU' });

writeFileSync(join(OUT, 'README.txt'), [
  `Special Report ${ed.id} — LinkedIn packages`,
  '',
  'Per folder: paste post.txt, attach image.jpg, publish — then paste',
  'comment.txt as the FIRST comment. The link belongs in the comment because',
  'LinkedIn suppresses the reach of posts that carry one.',
  '',
  'Suggested order: EU first (the series announcement), then one market a day',
  'so the five posts do not compete with each other in the same feed.',
  '',
  ...queue.map((q) => `  ${q.folder.padEnd(4)} ${q.lang}  ${q.image || 'NO IMAGE'}`),
  '',
].join('\n'));

console.log(`Special Report ${ed.id} — ${queue.length} LinkedIn packages`);
for (const q of queue) console.log(`  ${q.folder.padEnd(4)} ${q.lang}  ${q.image || '! no image'}`);
console.log(`\n→ ${OUT}`);
