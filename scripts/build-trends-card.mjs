#!/usr/bin/env node
/**
 * build-trends-card.mjs — render a Market & Trends infographic card
 * (1254×1254 → 2508px PNG master) from a JSON spec.
 *
 * WHY GENERATED
 * With a template the monthly routine collapses to: owner sends a Korean
 * brief → Claude writes the market-language spec → this renders the card →
 * the existing ingestion converts (WebP for the site, JPEG for share
 * previews) and publishes. No design tool in the loop, identical branding
 * every month, and a correction is a re-render rather than a redraw.
 *
 * FIXED FRAME, FREE INTERIOR (owner 2026-08-12)
 * The frame is brand furniture and never varies: market-tinted ground, side
 * rail carrying the domain, flag badge, month, title block, footer lockup.
 * The interior is composed per card from the block vocabulary in
 * lib/trends-card-blocks.mjs — a market-data story gets bars, a rules change
 * gets before/after, a phased reform gets a timeline. The ground colour is
 * the market's own landing-page palette, so a card looks like it came from
 * the site it links to.
 *
 * ONE-SOURCE RULE: the footer lockup is the official brand SVG export and the
 * header badge is the market's real app icon — neither is ever redrawn.
 *
 * SPEC: { country, countryLabel, month, title[2], sub, motif?, footer,
 *         sections: [ block | [block, block] ] }   // blocks: see the lib
 * Legacy specs (hero/leftPanel/rightPanel/kurzfazit keys) are mapped onto the
 * same blocks, so the first cards still render from their original files.
 *
 * Run:  node scripts/build-trends-card.mjs <spec.json> <out.png>
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, IC, esc, renderSection } from './lib/trends-card-blocks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';

const specPath = process.argv[2];
const outPath = process.argv[3];
if (!specPath || !outPath) { console.error('Usage: build-trends-card.mjs <spec.json> <out.png>'); process.exit(1); }
const S = JSON.parse(readFileSync(specPath, 'utf8'));

const cc = String(S.country).toUpperCase();
const T = THEMES[cc] ?? THEMES.DE;

/** Legacy spec shape → sections, so the July specs keep rendering. */
const sections = S.sections ?? [
  { type: 'hero', ...S.hero },
  [
    { type: 'table', flex: 1.15, ...S.leftPanel },
    { type: 'list', flex: 1, ...S.rightPanel },
  ],
  { type: 'fazit', ...S.kurzfazit },
].filter(Boolean);

/** Footer lockup: the official dark export from the bridge — never redrawn. */
const lockupFile = join(BRIDGE_SVG, 'heatpumpdb-3a-lockup-dark.svg');
const lockup = existsSync(lockupFile)
  ? readFileSync(lockupFile, 'utf8')
  : `<b style="color:#fff">HeatPump <span style="color:${T.a}">DB</span></b>`;

/** Header badge: the market's official flag-badged app icon. */
const badgeFile = join(ROOT, 'public', 'icons', `${cc === 'GB' ? 'uk' : cc.toLowerCase()}-192.png`);
const badge = existsSync(badgeFile) ? `data:image/png;base64,${readFileSync(badgeFile).toString('base64')}` : '';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1254px; height: 1254px; background: ${T.deep}; padding: 26px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased; }
  .card { width: 100%; height: 100%; border-radius: 26px; padding: 40px 52px 32px 116px;
    position: relative; display: flex; flex-direction: column; overflow: hidden;
    background: radial-gradient(120% 100% at 30% 12%, ${T.mid} 0%, ${T.base} 58%, ${T.deep} 100%); }
  /* Two soft market glows — the same aurora the landing page shows. */
  .glowA, .glowB { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
  .glowA { width: 620px; height: 620px; top: -230px; left: -170px; background: ${T.a}1f; }
  .glowB { width: 560px; height: 560px; bottom: -240px; right: -160px; background: ${T.b}1a; }

  .rail { position: absolute; left: 0; top: 0; bottom: 0; width: 90px; border-right: 1px solid rgba(255,255,255,.08); }
  .railtxt { position: absolute; left: 33px; top: 44%; transform: rotate(180deg); writing-mode: vertical-rl;
    letter-spacing: 5px; font-size: 14.5px; color: rgba(255,255,255,.3); }
  .raildash { position: absolute; left: 35px; bottom: 62px; width: 22px; height: 4px; border-radius: 2px; background: ${T.b}; }
  .badge { position: absolute; left: 20px; top: 40px; width: 52px; height: 52px; border-radius: 12px; }
  .month { position: absolute; right: 52px; top: 50px; color: rgba(255,255,255,.42); font-size: 16.5px;
    letter-spacing: 3px; font-weight: 600; }
  .motif { position: absolute; right: 54px; top: 112px; opacity: .16; }

  h3.country { font-size: 32px; color: #fff; font-weight: 700; margin-bottom: 14px; position: relative; }
  h1 { font-size: ${S.titleSize ?? 45}px; line-height: 1.14; color: #fff; font-weight: 800; letter-spacing: -.8px; position: relative; }
  h1 .l2 { color: ${T.a}; display: block; }
  .sub { margin-top: 11px; color: rgba(255,255,255,.62); font-size: 20px; line-height: 1.4; max-width: 900px; position: relative; }

  .flow { display: flex; flex-direction: column; gap: 20px; margin-top: 24px; flex: 1; position: relative; min-height: 0; }
  /* The opening stat and the closing takeaway keep their natural height; the
     content blocks between them absorb whatever height is left and centre
     their content. Letting every block size to content left craters on short
     cards; letting every block stretch left empty rectangles under short
     lists — this does neither. */
  .flow > * { flex: 0 0 auto; }
  .flow > .row, .flow > .pnl, .flow > .stats { flex: 1 1 auto; }
  .pnl { justify-content: center; }
  .row { display: flex; gap: 20px; align-items: stretch; min-height: 0; }
  .cell { display: flex; flex-direction: column; min-width: 0; }
  .cell > * { flex: 1; }
  .pnl { background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.09); border-radius: 18px;
    padding: 22px 24px; display: flex; flex-direction: column; }
  .ph { display: flex; align-items: center; gap: 13px; margin-bottom: 14px; }
  .ph b { color: #fff; font-size: 23px; font-weight: 700; }

  /* hero */
  .hero { background: rgba(255,255,255,.05); border: 1px solid ${T.a}30; border-radius: 20px;
    padding: 24px 32px; display: flex; align-items: center; gap: 28px; }
  .hico { flex: none; } .hsep { width: 1px; align-self: stretch; background: rgba(255,255,255,.1); }
  .hbig { font-size: 31px; color: #fff; font-weight: 700; line-height: 1.15; }
  .hbig b { color: ${T.a}; font-size: 54px; font-weight: 800; }
  .hcap { margin-top: 5px; color: rgba(255,255,255,.6); font-size: 19px; line-height: 1.35; }
  .hside { margin-left: auto; text-align: right; }
  .hside span { display: block; color: ${T.b}; font-size: 30px; font-weight: 800; }
  .hside small { color: rgba(255,255,255,.55); font-size: 15px; }

  /* stats */
  .stats { display: flex; gap: 18px; }
  .stat { flex: 1; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.09);
    border-radius: 18px; padding: 20px 22px; display: flex; flex-direction: column; gap: 4px;
    justify-content: center; }
  .sv { font-size: 36px; font-weight: 800; letter-spacing: -1px; }
  .sl { color: rgba(255,255,255,.72); font-size: 17px; line-height: 1.3; }
  .sn { color: rgba(255,255,255,.42); font-size: 14px; margin-top: 2px; }

  /* bars */
  .bars { display: flex; gap: 20px; align-items: flex-end; flex: 1; padding-top: 8px; min-height: 230px; }
  .bar { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; gap: 8px; }
  .bv { font-size: 20px; font-weight: 700; }
  .bcol { width: 100%; max-width: 92px; border-radius: 10px 10px 3px 3px; }
  .bl { color: rgba(255,255,255,.55); font-size: 15px; text-align: center; }
  .bfoot { margin-top: 12px; color: rgba(255,255,255,.42); font-size: 14.5px; }

  /* table */
  .cols { display: flex; justify-content: flex-end; font-size: 13px; letter-spacing: 1.4px; margin-bottom: 6px; }
  .cols .c1 { color: rgba(255,255,255,.4); width: 120px; text-align: center; }
  .cols .c2 { width: 168px; text-align: right; font-weight: 700; }
  .trow { display: flex; align-items: center; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.08); font-size: 18px; }
  .tl { flex: 1; color: rgba(255,255,255,.78); padding-right: 8px; }
  .tf { width: 92px; text-align: center; color: rgba(255,255,255,.45); }
  .arr { width: 40px; text-align: center; }
  .tt { min-width: 146px; text-align: right; font-weight: 700; white-space: nowrap; }

  /* list */
  .rrow { display: flex; align-items: center; gap: 14px; padding: 11px 0; }
  .ric { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border: 1.6px solid; border-radius: 50%; }
  .rl { flex: 1; color: rgba(255,255,255,.78); font-size: 18.5px; line-height: 1.3; }
  .rv { font-size: 22px; font-weight: 800; white-space: nowrap; }
  .rnote { margin-top: auto; border-top: 1px solid rgba(255,255,255,.08); padding-top: 14px; display: flex; gap: 14px; align-items: center; }
  .rnt b { display: block; color: #fff; font-size: 18px; }
  .rnt span { font-size: 17.5px; font-weight: 700; }
  .rnt span i { color: rgba(255,255,255,.55); font-style: normal; font-weight: 400; }

  /* checks */
  .crow { display: flex; gap: 13px; align-items: flex-start; padding: 10px 0; }
  .cic { flex: none; margin-top: 1px; }
  .cl { color: rgba(255,255,255,.78); font-size: 18px; line-height: 1.42; }

  /* timeline */
  .tline { display: flex; flex-direction: column; gap: 18px; padding-top: 4px; }
  .tstep { display: flex; gap: 14px; align-items: flex-start; position: relative; }
  .tdot { flex: none; width: 15px; height: 15px; border-radius: 50%; margin-top: 5px; }
  .trail { position: absolute; left: 7px; top: 22px; width: 2px; height: calc(100% + 4px); }
  .ttx b { display: block; font-size: 16.5px; letter-spacing: .6px; }
  .ttx span { color: rgba(255,255,255,.75); font-size: 17.5px; line-height: 1.4; display: block; margin-top: 2px; }

  /* compare */
  .cmp { display: flex; gap: 18px; flex: 1; }
  .cmpc { flex: 1; border: 1px solid rgba(255,255,255,.1); border-radius: 15px; padding: 18px 20px;
    display: flex; flex-direction: column; gap: 9px; justify-content: center; }
  .cmph { font-size: 16px; font-weight: 800; letter-spacing: 1.4px; }
  .cmpr { display: flex; justify-content: space-between; gap: 12px; font-size: 17.5px; color: rgba(255,255,255,.72); }
  .cmpr b { font-size: 19px; white-space: nowrap; }

  /* fazit */
  .fazit { background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.09); border-radius: 18px;
    padding: 20px 28px; display: flex; gap: 22px; align-items: center; }
  .fico { flex: none; width: 72px; height: 72px; border: 1.6px solid; border-radius: 50%; display: grid; place-items: center; }
  .ftxt b { display: block; color: #fff; font-size: 24px; margin-bottom: 4px; }
  .ftxt p { color: rgba(255,255,255,.62); font-size: 18px; line-height: 1.4; }
  .fmotif { margin-left: auto; flex: none; opacity: .8; }

  .foot { margin-top: 20px; display: flex; align-items: center; position: relative; }
  .foot svg { height: 38px; width: auto; }
  .fteam { margin-left: auto; color: rgba(255,255,255,.34); font-size: 16px; }
</style></head><body>
<div class="card">
  <span class="glowA"></span><span class="glowB"></span>
  <div class="rail"></div>
  ${badge ? `<img class="badge" src="${badge}">` : ''}
  <div class="railtxt">HEATPUMPDB${cc === 'GB' ? '.UK' : '.' + cc}</div>
  <div class="raildash"></div>
  <div class="month">${esc(S.month)}</div>
  ${S.motif ? `<div class="motif">${IC(S.motif, '#ffffff', 140)}</div>` : ''}

  <h3 class="country">${esc(S.countryLabel ?? cc)}</h3>
  <h1>${esc(S.title[0])}${S.title[1] ? `<span class="l2">${esc(S.title[1])}</span>` : ''}</h1>
  ${S.sub ? `<p class="sub">${esc(S.sub)}</p>` : ''}

  <div class="flow">${sections.map((s) => renderSection(s, T)).join('')}</div>

  <div class="foot">${lockup}<span class="fteam">${esc(S.footer)}</span></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await (await browser.newContext({
  viewport: { width: 1254, height: 1254 }, deviceScaleFactor: 2,
})).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(250);

// A card that overflows its own frame ships a cut-off panel — say so loudly.
// The CONTENT column is what must fit: the card's own scrollHeight counts the
// decorative glows, which sit outside the frame on purpose.
const overflow = await page.evaluate(() => {
  const f = document.querySelector('.flow');
  return { h: f.scrollHeight, box: f.clientHeight };
});
if (overflow.h > overflow.box + 2) {
  console.error(`✗ content overflows the card by ${overflow.h - overflow.box}px — shorten a block or drop a row`);
}

await page.screenshot({ path: outPath });
await browser.close();
console.log(`→ ${outPath} (2508×2508, ${cc} palette)${overflow.h > overflow.box + 2 ? ' ⚠ OVERFLOW' : ''}`);
