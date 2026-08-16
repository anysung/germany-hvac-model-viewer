#!/usr/bin/env node
/**
 * build-special-report.mjs — the monthly European Special Report, published on
 * every market site and on the EU hub.
 *
 * WHAT THIS PUBLISHES
 * The report itself is ONE self-contained HTML file written by the owner
 * (data_sources/special_report/<edition>/report.html): 18 pages, five
 * languages switched inside the document, charts whose values appear on
 * hover, and its own "Print / Save PDF" control. We do not rebuild, re-style
 * or re-chart it — it ships byte-for-byte. This script builds the ARTICLE that
 * introduces it, the download, and the series index around it.
 *
 * WHY AN ARTICLE PAGE AND NOT JUST A FILE
 * A bare .html download has no headline, no description, no share preview and
 * nothing for a search engine to index. The article page is the market's
 * landing surface: market-language copy, og:image (the report cover rendered
 * in that language), Article structured data, and the two actions the owner
 * asked for — read it, or take it away.
 *
 * ONE SOURCE, FIVE MARKETS
 * data_sources/special_report/<edition>/article.json holds the published copy
 * per UI language; the figures in it are transcribed from the owner's article
 * pack verbatim. Each market renders its own language plus an English twin
 * (GB is English-only), with reciprocal hreflang so the pair is never read as
 * duplicated content. The report file and the cover images are identical
 * everywhere — this is a European report, not five national ones.
 *
 * Run:  node scripts/build-special-report.mjs <MARKET|EU> <outDir>
 * Wired into every build:<market> BEFORE build-public-news.mjs (which owns the
 * sitemap), and into build:hub.
 */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKET = (process.argv[2] || 'DE').toUpperCase();
const OUT_DIR = process.argv[3] || join(ROOT, 'dist');
const STORE = join(ROOT, 'data_sources', 'special_report');

const HOSTS = {
  DE: 'https://www.heatpumpdb.de', GB: 'https://www.heatpumpdb.uk',
  FR: 'https://www.heatpumpdb.fr', PL: 'https://www.heatpumpdb.pl',
  IT: 'https://www.heatpumpdb.it', EU: 'https://www.heatpumpdb.eu',
};
/** Market UI language. GB is English-only; the hub is English-first. */
const LANG = { DE: 'de', GB: 'en', FR: 'fr', PL: 'pl', IT: 'it', EU: 'en' };
const HREFLANG = { DE: 'de-DE', GB: 'en-GB', FR: 'fr-FR', PL: 'pl-PL', IT: 'it-IT', EU: 'en' };
const ICON = { DE: '/icons/de-32.png', GB: '/icons/uk-32.png', FR: '/icons/fr-32.png',
  PL: '/icons/pl-32.png', IT: '/icons/it-32.png', EU: '/appicon-48.png?v=2026-08' };

const host = HOSTS[MARKET];
if (!host) { console.error(`build-special-report: unknown market ${MARKET}`); process.exit(1); }
const primary = LANG[MARKET];
const HAS_EN = primary !== 'en';           // the English twin exists only where the market language is not English

if (!existsSync(STORE)) {
  console.log(`special report (${MARKET}): no content store — skipped`);
  process.exit(0);
}
/** Editions are folders named YYYY-MM; newest first. */
const editions = readdirSync(STORE)
  .filter((d) => /^\d{4}-\d{2}$/.test(d) && statSync(join(STORE, d)).isDirectory())
  .sort().reverse()
  .map((id) => {
    const dir = join(STORE, id);
    const metaFile = join(dir, 'article.json');
    if (!existsSync(metaFile)) return null;
    return { id, dir, meta: JSON.parse(readFileSync(metaFile, 'utf8')) };
  })
  .filter(Boolean);

if (!editions.length) {
  console.log(`special report (${MARKET}): no editions — skipped`);
  process.exit(0);
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Copy for a language, falling back to English so a not-yet-translated
 *  edition still renders a complete page rather than an empty one. */
const copyOf = (ed, lang) => ed.meta.copy[lang] ?? ed.meta.copy.en;

const DATE_FMT = {
  en: 'en-GB', de: 'de-DE', fr: 'fr-FR', pl: 'pl-PL', it: 'it-IT',
};
const fmtDate = (iso, lang) => {
  try {
    return new Intl.DateTimeFormat(DATE_FMT[lang] ?? 'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
  } catch { return iso; }
};

/** Cover image for a language, falling back to the English cover. */
const coverFile = (ed, lang) => {
  const want = `special-report-${ed.id}-${lang}.webp`;
  return existsSync(join(ed.dir, 'img', want)) ? want : `special-report-${ed.id}-en.webp`;
};

const FLAG = { DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', PL: '🇵🇱', IT: '🇮🇹' };

/* ── shared page chrome ──────────────────────────────────────────────────── */

const STYLE = `
  *{box-sizing:border-box} body{margin:0;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#1d1d1f;background:#fff;-webkit-font-smoothing:antialiased}
  .wrap{max-width:860px;margin:0 auto;padding:34px 20px 70px}
  .top{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .crumb{font-size:13.5px;color:#0066cc;text-decoration:none}
  .langs{margin-left:auto;display:flex;border:1px solid #d8d8dd;border-radius:999px;overflow:hidden;font-size:12px}
  .langs a{padding:5px 12px;color:#6e6e73;text-decoration:none}
  .langs a.on{background:#1d1d1f;color:#fff;font-weight:600}
  .eyebrow{display:block;margin-top:16px;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#0a7d5a}
  h1{font-size:clamp(27px,4.4vw,38px);letter-spacing:-.7px;line-height:1.18;margin:8px 0 12px}
  .stand{font-size:18px;line-height:1.55;color:#3a3a3c;margin:0 0 16px}
  .meta{color:#7a7a7a;font-size:13.5px;margin:0 0 24px;border-bottom:1px solid #ececf0;padding-bottom:18px}
  .hero{display:block;width:100%;height:auto;border-radius:16px;margin:0 0 8px;border:1px solid #e8e8ee}
  .herocap{font-size:12.5px;color:#8a8a8f;margin:0 0 28px}
  .body p{margin:0 0 16px;font-size:16.5px;color:#2a2a2c}
  h2{font-size:20px;letter-spacing:-.3px;margin:32px 0 10px}
  h3{font-size:16px;margin:28px 0 12px;color:#1d1d1f}
  ul.mk{list-style:none;padding:0;margin:0 0 8px}
  ul.mk li{display:flex;gap:12px;padding:13px 0;border-bottom:1px solid #f0f0f4;font-size:15.5px;color:#2a2a2c}
  ul.mk li b{flex:0 0 168px;font-weight:700;color:#1d1d1f}
  ul.mk li .fl{flex:0 0 auto}
  .cta{margin-top:34px;background:linear-gradient(160deg,#0b1626,#132741);color:#fff;border-radius:20px;padding:30px 30px 28px}
  .cta h2{margin:0 0 8px;font-size:21px;color:#fff}
  .cta p{margin:0 0 20px;color:#b9c8dc;font-size:14.5px;line-height:1.6}
  .acts{display:flex;flex-wrap:wrap;gap:12px}
  .btn{display:inline-block;border-radius:999px;padding:12px 26px;font-size:14.5px;text-decoration:none;font-weight:600}
  .btn.p{background:#2997ff;color:#fff}
  .btn.s{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25)}
  .dlnote{margin:16px 0 0;font-size:12.5px;color:#8ea3bd;line-height:1.6}
  .editions{list-style:none;padding:0;margin:26px 0 0}
  .editions li{border:1px solid #e8e8ee;border-radius:18px;overflow:hidden;margin-bottom:20px}
  .editions a.cardlink{display:block;text-decoration:none;color:inherit}
  .editions img{display:block;width:100%;height:auto}
  .editions .txt{padding:20px 22px 22px}
  .editions .txt span{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0a7d5a}
  .editions .txt h2{margin:7px 0 6px;font-size:20px;letter-spacing:-.3px}
  .editions .txt p{margin:0;color:#5a5a5f;font-size:14.5px}
  footer{margin-top:44px;border-top:1px solid #ececf0;padding-top:16px;color:#8a8a8f;font-size:12.5px}
  footer a{color:#8a8a8f}
  @media(max-width:560px){ ul.mk li{flex-direction:column;gap:3px} ul.mk li b{flex:none} .cta{padding:24px 20px} }
`;

const head = ({ title, desc, canonical, ogImage, lang, alternates, ld }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">${alternates}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="${ICON[MARKET]}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>${STYLE}</style>
</head>
<body><div class="wrap">`;

const foot = (t) => `
  <footer>© ${new Date().getFullYear()} HeatPump DataBase (Europe)™ · <a href="${HOSTS.EU}">heatpumpdb.eu</a> · ${esc(t.langNote)}</footer>
</div></body></html>`;

/* ── the edition article ─────────────────────────────────────────────────── */

function renderEdition(ed, lang) {
  const t = copyOf(ed, lang);
  const english = lang === 'en';
  const base = `/special-report/${ed.id}/`;
  const file = english && HAS_EN ? 'en.html' : 'index.html';
  const canonical = `${host}${base}${english && HAS_EN ? 'en.html' : ''}`;
  const cover = coverFile(ed, lang);
  const ogImage = `${host}/special-report/img/${cover}`;

  const alternates = HAS_EN ? `
<link rel="alternate" hreflang="${HREFLANG[MARKET]}" href="${host}${base}">
<link rel="alternate" hreflang="en" href="${host}${base}en.html">` : '';

  const toggle = HAS_EN ? `
  <div class="langs">
    <a class="${english ? '' : 'on'}" href="${base}">${primary.toUpperCase()}</a>
    <a class="${english ? 'on' : ''}" href="${base}en.html">EN</a>
  </div>` : '';

  const ld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: t.title, description: t.standfirst,
    datePublished: ed.meta.published, inLanguage: english ? 'en' : HREFLANG[MARKET],
    image: ogImage, mainEntityOfPage: canonical,
    author: { '@type': 'Organization', name: 'HeatPump DataBase (Europe)' },
    publisher: { '@type': 'Organization', name: 'HeatPump DataBase (Europe)' },
  };

  const html = head({
    title: t.metaTitle, desc: t.metaDesc, canonical, ogImage, lang,
    alternates, ld,
  }) + `
  <div class="top"><a class="crumb" href="/special-report/">← ${esc(t.backLabel)}</a>${toggle}</div>
  <span class="eyebrow">${esc(t.eyebrow)}</span>
  <h1>${esc(t.title)}</h1>
  <p class="stand">${esc(t.standfirst)}</p>
  <p class="meta">${esc(t.byline)} · ${esc(fmtDate(ed.meta.published, lang))}</p>

  <a href="${base}${ed.meta.reportFile}"><img class="hero" src="/special-report/img/${cover}" alt="${esc(t.title)}"></a>
  <p class="herocap">${esc(t.ctaSub)}</p>

  <div class="body">
    ${t.lead.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}

    <h2>${esc(t.bulletsTitle)}</h2>
    <ul class="mk">
      ${t.bullets.map((b) => `<li><span class="fl">${FLAG[b.cc] ?? ''}</span><b>${esc(b.label)}</b><span>${esc(b.text)}</span></li>`).join('\n      ')}
    </ul>

    ${t.sections.map((s) => `<h2>${esc(s.h)}</h2>\n    ${s.p.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}`).join('\n\n    ')}
  </div>

  <div class="cta">
    <h2>${esc(t.ctaTitle)}</h2>
    <p>${esc(t.ctaSub)}</p>
    <div class="acts">
      <a class="btn p" href="${base}${ed.meta.reportFile}">${esc(t.openLabel)}</a>
      <a class="btn s" href="${base}${ed.meta.reportFile}" download="${esc(ed.meta.downloadName)}">${esc(t.downloadLabel)}</a>
    </div>
    <p class="dlnote">${esc(t.downloadNote)}</p>
  </div>
` + foot(t);

  return { file, html };
}

/* ── the series index ────────────────────────────────────────────────────── */

function renderIndex(lang) {
  const english = lang === 'en';
  const t = copyOf(editions[0], lang);
  const canonical = `${host}/special-report/${english && HAS_EN ? 'en.html' : ''}`;
  const cover = coverFile(editions[0], lang);

  const alternates = HAS_EN ? `
<link rel="alternate" hreflang="${HREFLANG[MARKET]}" href="${host}/special-report/">
<link rel="alternate" hreflang="en" href="${host}/special-report/en.html">` : '';

  const toggle = HAS_EN ? `
  <div class="langs">
    <a class="${english ? '' : 'on'}" href="/special-report/">${primary.toUpperCase()}</a>
    <a class="${english ? 'on' : ''}" href="/special-report/en.html">EN</a>
  </div>` : '';

  const html = head({
    title: `${t.seriesTitle} | HeatPump DB`, desc: t.seriesSub,
    canonical, ogImage: `${host}/special-report/img/${cover}`, lang, alternates, ld: null,
  }) + `
  <div class="top"><a class="crumb" href="/">← HeatPump DB</a>${toggle}</div>
  <span class="eyebrow">HeatPump DataBase Europe</span>
  <h1>${esc(t.seriesTitle)}</h1>
  <p class="stand">${esc(t.seriesSub)}</p>
  <ul class="editions">
    ${editions.map((ed) => {
      const et = copyOf(ed, lang);
      const href = `/special-report/${ed.id}/${english && HAS_EN ? 'en.html' : ''}`;
      return `<li><a class="cardlink" href="${href}">
        <img src="/special-report/img/${coverFile(ed, lang)}" alt="${esc(et.title)}">
        <div class="txt"><span>${esc(et.editionLabel)}</span><h2>${esc(et.title)}</h2><p>${esc(et.standfirst)}</p></div>
      </a></li>`;
    }).join('\n    ')}
  </ul>
` + foot(t);

  return { file: english && HAS_EN ? 'en.html' : 'index.html', html };
}

/* ── write ───────────────────────────────────────────────────────────────── */

const outRoot = join(OUT_DIR, 'special-report');
mkdirSync(join(outRoot, 'img'), { recursive: true });

const langs = HAS_EN ? [primary, 'en'] : ['en'];

for (const ed of editions) {
  const edOut = join(outRoot, ed.id);
  mkdirSync(edOut, { recursive: true });

  // The report ships byte-for-byte — it is the owner's document, not ours to rebuild.
  copyFileSync(join(ed.dir, ed.meta.reportFile), join(edOut, ed.meta.reportFile));

  for (const lang of langs) {
    const { file, html } = renderEdition(ed, lang);
    writeFileSync(join(edOut, file), html);
  }

  // Covers for every language ship to every market: the English twin needs the
  // English cover, and a share of the market page needs the market's own.
  const imgDir = join(ed.dir, 'img');
  if (existsSync(imgDir)) {
    for (const f of readdirSync(imgDir).filter((f) => f.endsWith('.webp'))) {
      copyFileSync(join(imgDir, f), join(outRoot, 'img', f));
    }
  }
}

for (const lang of langs) {
  const { file, html } = renderIndex(lang);
  writeFileSync(join(outRoot, file), html);
}

const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`special report (${MARKET}): ${editions.length} edition(s), languages ${langs.join('+')} — ` +
  editions.map((e) => `${e.id} (report ${kb(join(outRoot, e.id, e.meta.reportFile))} kB)`).join(', '));
