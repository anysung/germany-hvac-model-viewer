#!/usr/bin/env node
/**
 * images-to-pdf.mjs — a LinkedIn document post from an ordered set of images.
 *
 * WHY A PDF AT ALL
 * LinkedIn's document post is the only native format that lets a reader swipe
 * through a series in the feed. Posting eight infographics as eight images
 * gives a grid of thumbnails nobody opens; posting them as a document gives
 * the same panels with page-turn arrows and a progress counter, and it is
 * counted as a document view rather than an image impression.
 *
 * WHY IT ENDS ON OUR PAGE
 * The last page of a document post is where a reader stops with the content
 * still on screen. Leaving the vendor's last panel there wastes the one slot
 * that can carry an address. The end page is built from the official lockup —
 * never redrawn.
 *
 * Run:  node scripts/images-to-pdf.mjs <out.pdf> <img...> [--end fr]
 *       --end <cc>   append a branded end page for that market (omit for none)
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';
const argv = process.argv.slice(2);
const endIdx = argv.indexOf('--end');
const END_CC = endIdx >= 0 ? String(argv[endIdx + 1]).toLowerCase() : null;
const args = argv.filter((a, i) => a !== '--end' && i !== endIdx + 1);
const out = args[0];
const imgs = args.slice(1);
if (!out || !imgs.length) {
  console.error('Usage: images-to-pdf.mjs <out.pdf> <img...> [--end fr]'); process.exit(1);
}

const END = {
  fr: { l1: 'COMPARER LES POMPES À CHALEUR', l2: 'Modèle par modèle · France', host: 'heatpumpdb.fr' },
  de: { l1: 'WÄRMEPUMPEN VERGLEICHEN', l2: 'Modell für Modell · Deutschland', host: 'heatpumpdb.de' },
  gb: { l1: 'COMPARE HEAT PUMPS', l2: 'Model by model · United Kingdom', host: 'heatpumpdb.uk' },
  pl: { l1: 'PORÓWNAJ POMPY CIEPŁA', l2: 'Model po modelu · Polska', host: 'heatpumpdb.pl' },
  it: { l1: 'CONFRONTA LE POMPE DI CALORE', l2: 'Modello per modello · Italia', host: 'heatpumpdb.it' },
};
const svgOf = (n) => {
  const f = join(BRIDGE_SVG, n);
  if (!existsSync(f)) { console.error(`missing brand asset: ${f}`); process.exit(1); }
  return readFileSync(f, 'utf8');
};

const dataUri = (p) => {
  const abs = resolve(p);
  if (!existsSync(abs)) { console.error(`no such image: ${p}`); process.exit(1); }
  const ext = abs.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
};

/* 16:9 pages at 1280×720 CSS px. The panels are 16:9 too, so each fills its
   page edge to edge — a document post with letterboxing looks unfinished. */
const W = 1280, H = 720;
const pages = imgs.map((p) => `<section style="background-image:url('${dataUri(p)}')"></section>`).join('\n');

const E = END_CC ? END[END_CC] : null;
if (END_CC && !E) { console.error(`no end page for "${END_CC}" — have ${Object.keys(END).join(', ')}`); process.exit(1); }
const endPage = E ? `<section class="end">
  <div class="flag">${svgOf(`flag-${END_CC}-onlight.svg`)}</div>
  <h1>${E.l1}</h1>
  <p class="sub">${E.l2}</p>
  <div class="lock">${svgOf('heatpumpdb-3a-lockup-dark.svg').replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '')}</div>
  <p class="host">${E.host}</p>
</section>` : '';

const html = `<style>
  @page { size: ${W}px ${H}px; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  section { width: ${W}px; height: ${H}px; page-break-after: always; overflow: hidden;
    background-size: cover; background-position: center; background-repeat: no-repeat; }
  section:last-child { page-break-after: auto; }
  .end { background: linear-gradient(160deg,#0b2340 0%,#123a63 58%,#0d2a4a 100%);
    color: #fff; font-family: Inter, -apple-system, 'Segoe UI', Arial, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .end .flag { width: 132px; margin-bottom: 26px; }
  .end h1 { font-size: 60px; font-weight: 900; letter-spacing: -.02em; line-height: 1.05; padding: 0 90px; }
  .end .sub { font-size: 26px; font-weight: 600; color: #a8cdf2; margin-top: 16px; }
  .end .lock { width: 420px; margin-top: 46px; }
  .end .host { font-size: 30px; font-weight: 800; color: #7fd4ff; margin-top: 20px; }
</style>
<body>${pages}${endPage}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({ path: out, width: `${W}px`, height: `${H}px`, printBackground: true, pageRanges: '' });
await browser.close();
console.log(`${imgs.length}${E ? ' + 엔드페이지' : ''} → ${out}`);
