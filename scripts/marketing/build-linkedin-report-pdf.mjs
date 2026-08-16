#!/usr/bin/env node
/**
 * build-linkedin-report-pdf.mjs — the public LinkedIn edition of a Special
 * Report: the same 18 pages, with the deep-dive page of each country chapter
 * gated behind a blur and a call to action.
 *
 * WHY A PDF WHEN WE HAVE AN INTERACTIVE REPORT
 * LinkedIn accepts images, video and DOCUMENTS (pdf/ppt/doc) as native posts.
 * It cannot host an HTML file — an interactive report can only be linked, and
 * a link post reaches far fewer people than a native document. So the PDF is
 * not a downgrade of the report; it is the advertisement FOR it, and the thing
 * the PDF cannot do (hover a chart, read the numbers, switch language) is
 * exactly the reason to click through.
 *
 * WHY THE GATE LEAVES THE HEADLINE READABLE
 * A LinkedIn document is swiped, and its reach follows how far people swipe. A
 * fully blanked page stops the swipe and reads as bait — expensive for a brand
 * whose whole promise is not overstating what the data says. Each gated page
 * therefore keeps its headline and standfirst sharp and blurs only the
 * evidence below: the reader learns WHAT was found and has to come to us for
 * the numbers behind it.
 *
 * WHY THE COPY SAYS "FREE"
 * The full report is already published, free and without an account, on all
 * five market sites and the hub. A gate that reads like a paywall would both
 * misdescribe it and suppress the click. The blur is a doorway, not a paywall.
 *
 * LINKS: inside LinkedIn's document viewer a PDF's hyperlinks are not
 * clickable — it renders pages as images. Every destination is therefore
 * printed as visible text as well as wired as a link (which works once the
 * file is downloaded), and the post itself must carry the real link.
 *
 * Run:  node scripts/marketing/build-linkedin-report-pdf.mjs [--edition 2026-08] [--lang en]
 * Out:  <marketing>/06_CAMPAIGNS/.../HeatPump-DB-Europe-Special-Report-<edition>-LinkedIn.pdf
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { editions, copyOf } from '../lib/special-report-store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const LANG = arg('lang', 'en');
const OUT_DIR = arg('out', join(ROOT, 'marketing-out'));

const all = editions(ROOT);
const wantEd = arg('edition', null);
const ed = wantEd ? all.find((e) => e.id === wantEd) : all[0];
if (!ed) { console.error('no such edition'); process.exit(1); }

/* The deep-dive page of each country chapter. Page 1 of a chapter states the
   market; page 2 is the analysis that only we publish — DE 7/8, UK 9/10,
   FR 11/12, PL 13/14. Italy has a single page and stays open. */
const GATED = (arg('gate', '8,10,12,14')).split(',').map(Number);
const PAGES = 18;

/* ── Brand artwork from the ONE source (never redrawn) ── */
const tmp = join(ROOT, 'node_modules', '.li-brandsvg.mjs');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  'src/components/brandSvg.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${tmp}`,
  // brandSvg's import chain reads vite-only import.meta.env — pin it for node.
  '--define:import.meta.env={"VITE_COUNTRY_CODE":"DE","VITE_APP_MODE":"app"}',
], { cwd: ROOT, stdio: 'pipe' });
const { flagSvgDoc, logoInner, BRAND_COLORS } = await import(pathToFileURL(tmp).href);

const cDark = BRAND_COLORS.dark;
const LOCKUP = `<svg viewBox="0 0 348 64" fill="none" style="height:26px;--hp-db-a:${cDark.red};--hp-db-b:${cDark.blue}">${logoInner({ theme: 'dark', symbolOnly: false, animated: false })}</svg>`;

const MARKETS = [
  { cc: 'DE', name: 'Germany', host: 'heatpumpdb.de' },
  { cc: 'GB', name: 'United Kingdom', host: 'heatpumpdb.uk' },
  { cc: 'FR', name: 'France', host: 'heatpumpdb.fr' },
  { cc: 'PL', name: 'Poland', host: 'heatpumpdb.pl' },
  { cc: 'IT', name: 'Italy', host: 'heatpumpdb.it' },
];
for (const m of MARKETS) {
  m.flag = flagSvgDoc(m.cc, false).replace('<svg ', '<svg style="width:38px;height:26px" ');
  // Every destination is measured: ?ref=<channel> is what the signup form
  // records, so a subscriber can be traced back to this file.
  m.url = `https://www.${m.host}/special-report/${ed.id}/?ref=li-report-${m.cc.toLowerCase()}`;
}
const HUB = `https://www.heatpumpdb.eu/?ref=li-report`;
const qr = await QRCode.toString(HUB, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });

const t = copyOf(ed, LANG);

/* ── 1. Render every page of the report to an image ─────────────────────── */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(ed.dir, ed.meta.reportFile)).href, { waitUntil: 'networkidle' });
await page.evaluate((l) => {
  const s = document.querySelector('select');
  if (s) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); }
}, LANG);
// The report's own chrome is navigation, not content — our deck supplies its own.
await page.addStyleTag({ content: '.nav-zone,.footer,.footerNav,.footerStatus,.topbar{display:none!important}' });
await page.waitForTimeout(500);

const shots = [];
for (let i = 0; i < PAGES; i++) {
  await page.evaluate((n) => {
    document.querySelectorAll('.page').forEach((el, j) => {
      el.classList.remove('active', 'old-left', 'old-right');
      if (j === n) el.classList.add('active');
    });
  }, i);
  await page.waitForTimeout(320);
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
  shots.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
  process.stdout.write(`\r  rendering page ${i + 1}/${PAGES}`);
}
console.log('');

/* ── 2. Compose the deck ─────────────────────────────────────────────────── */

const gateCard = () => `
  <div class="gate">
    <span class="glabel">Continued in the full report</span>
    <h3>Read the complete edition — free, no sign-up</h3>
    <a class="ghub" href="${HUB}">www.heatpumpdb.eu</a>
    <p class="gsub">Interactive edition: hover any chart to read the exact figures. Available in English, German, French, Polish and Italian.</p>
    <div class="gflags">
      ${MARKETS.map((m) => `<a class="gflag" href="${m.url}"><span class="fl">${m.flag}</span><span class="fh">${m.host}</span></a>`).join('')}
    </div>
  </div>`;

const slide = (img, n) => {
  const gated = GATED.includes(n);
  return `
  <section class="slide">
    ${gated ? `
      <img class="base blur" src="${img}">
      <img class="sharp" src="${img}">
      <div class="scrim"></div>
      ${gateCard()}
    ` : `<img class="base" src="${img}">`}
    <div class="brandbar">
      <span class="bl">${LOCKUP}</span>
      <span class="bd">heatpumpdb.eu</span>
      <span class="bn">${n} / ${PAGES}</span>
    </div>
  </section>`;
};

const closing = () => `
  <section class="slide closing">
    <div class="cwrap">
      <span class="clock">${LOCKUP}</span>
      <h2>The full interactive report is free.</h2>
      <p class="clead">${escape_(t.ctaSub)}</p>
      <div class="ccta">
        <a class="cbtn" href="${HUB}">www.heatpumpdb.eu</a>
        <span class="cqr">${qr}</span>
      </div>
      <p class="cmark">Or open your market's edition directly:</p>
      <div class="cflags">
        ${MARKETS.map((m) => `<a class="cflag" href="${m.url}"><span class="fl">${m.flag}</span><span class="fn">${m.name}</span><span class="fh">${m.host}</span></a>`).join('')}
      </div>
      <div class="cprod">
        <b>HeatPump DB</b> — the registry-based heat pump database for five European markets.
        Search any model, compare four side by side, print a quote-ready data sheet.
        <span class="ctrial">Free first week with every new account — no card required.</span>
      </div>
    </div>
    <div class="brandbar">
      <span class="bl">${LOCKUP}</span>
      <span class="bd">heatpumpdb.eu</span>
      <span class="bn">${PAGES + 1} / ${PAGES + 1}</span>
    </div>
  </section>`;

function escape_(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const deck = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 1600px 900px; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #0b1626; font: 15px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .slide { position: relative; width: 1600px; height: 900px; overflow: hidden; page-break-after: always; background: #0b1626; }
  .slide:last-child { page-break-after: auto; }
  img.base, img.sharp { position: absolute; inset: 0; width: 1600px; height: 900px; display: block; }
  /* The gate: the page is blurred, then its headline band is re-laid sharp on
     top. The reader always learns what the page found — only the evidence
     behind it is held back. */
  img.blur { filter: blur(17px) saturate(.85) brightness(.72); transform: scale(1.04); }
  /* The sharp band FADES into the blur rather than ending on a hard line: a
     straight cut lands in the middle of a sentence on whichever page it falls
     and reads as a rendering fault instead of a deliberate teaser. 34% clears
     the headline and the full standfirst on every page of this report. */
  img.sharp {
    -webkit-mask-image: linear-gradient(180deg, #000 0 27%, rgba(0,0,0,.55) 31%, transparent 35%);
    mask-image: linear-gradient(180deg, #000 0 27%, rgba(0,0,0,.55) 31%, transparent 35%);
  }
  .scrim { position: absolute; left: 0; right: 0; top: 30%; bottom: 0; background: linear-gradient(180deg, rgba(8,16,28,.22), rgba(8,16,28,.8) 22%); }

  /* Anchored to the BOTTOM, not centred: the card's height depends on how the
     five market chips wrap, and a percentage top pushed them under the brand
     bar. Bottom-anchoring clears the 46px bar by a fixed margin whatever the
     card does. */
  .gate { position: absolute; left: 50%; bottom: 78px; transform: translateX(-50%); width: 980px; text-align: center;
    background: rgba(9,18,32,.86); border: 1px solid rgba(255,255,255,.16); border-radius: 24px; padding: 30px 40px 26px; }
  .glabel { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #4ade80; }
  .gate h3 { margin: 12px 0 16px; font-size: 30px; letter-spacing: -.5px; color: #fff; font-weight: 700; }
  .ghub { display: inline-block; background: #2997ff; color: #fff; text-decoration: none; font-size: 22px; font-weight: 700;
    border-radius: 999px; padding: 12px 34px; letter-spacing: -.2px; }
  .gsub { margin: 15px auto 0; max-width: 720px; font-size: 14.5px; color: #b9c8dc; line-height: 1.6; }
  .gflags { display: flex; justify-content: center; gap: 10px; margin-top: 20px; }
  .gflag { display: flex; align-items: center; gap: 8px; text-decoration: none; background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 8px 12px; }
  .gflag .fh { font-size: 13px; color: #dbe6f4; font-weight: 600; }

  .brandbar { position: absolute; left: 0; right: 0; bottom: 0; height: 46px; display: flex; align-items: center; gap: 14px;
    padding: 0 30px; background: linear-gradient(180deg, rgba(6,12,22,0), rgba(6,12,22,.92)); }
  .bd { color: #8fb6e6; font-size: 13.5px; font-weight: 700; letter-spacing: .01em; }
  .bn { margin-left: auto; color: rgba(255,255,255,.5); font-size: 12.5px; }

  .closing { background: radial-gradient(1200px 700px at 50% 0%, #143050, #0a1524 70%); }
  .cwrap { position: absolute; inset: 0 0 46px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 90px; text-align: center; }
  .clock { margin-bottom: 22px; }
  .closing h2 { font-size: 46px; letter-spacing: -1px; color: #fff; margin-bottom: 12px; }
  .clead { font-size: 16.5px; color: #b9c8dc; max-width: 780px; line-height: 1.6; }
  .ccta { display: flex; align-items: center; gap: 22px; margin: 26px 0 8px; }
  .cbtn { background: #2997ff; color: #fff; text-decoration: none; font-size: 26px; font-weight: 700; border-radius: 999px; padding: 15px 44px; }
  .cqr { width: 92px; height: 92px; background: #fff; border-radius: 12px; padding: 7px; display: block; }
  .cqr svg { width: 100%; height: 100%; display: block; }
  .cmark { margin-top: 20px; font-size: 13.5px; color: #8ea3bd; }
  .cflags { display: flex; gap: 12px; margin-top: 12px; }
  .cflag { display: flex; flex-direction: column; align-items: center; gap: 5px; text-decoration: none;
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 12px 16px; min-width: 150px; }
  .cflag .fn { font-size: 13.5px; color: #fff; font-weight: 600; }
  .cflag .fh { font-size: 12px; color: #8fb6e6; }
  .cprod { margin-top: 26px; max-width: 900px; font-size: 14px; color: #93a7be; line-height: 1.7; }
  .cprod b { color: #fff; }
  .ctrial { color: #4ade80; font-weight: 600; }
</style></head><body>
${shots.map((img, i) => slide(img, i + 1)).join('')}
${closing()}
</body></html>`;

/* ── 3. Print ────────────────────────────────────────────────────────────── */
const deckPage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await deckPage.setContent(deck, { waitUntil: 'networkidle' });
mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `HeatPump-DB-Europe-Special-Report-${ed.id}-LinkedIn${LANG === 'en' ? '' : `-${LANG.toUpperCase()}`}.pdf`);
await deckPage.pdf({
  path: outFile, width: '1600px', height: '900px', printBackground: true, pageRanges: `1-${PAGES + 1}`,
});
await browser.close();

const mb = (readFileSync(outFile).length / 1048576).toFixed(1);
console.log(`\nLinkedIn edition: ${outFile}`);
console.log(`  ${PAGES + 1} pages · ${mb} MB · language ${LANG.toUpperCase()} · gated ${GATED.join(', ')}`);
console.log(`  hub ${HUB}`);
for (const m of MARKETS) console.log(`  ${m.cc} ${m.url}`);
