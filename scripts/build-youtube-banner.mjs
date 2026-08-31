#!/usr/bin/env node
/**
 * build-youtube-banner.mjs — the channel banner, 2560×1440 PNG.
 *
 * WHY THE ODD GEOMETRY
 * YouTube shows a different crop of the same file on every device. Only the
 * centre 1546×423 is guaranteed to be visible everywhere; a TV shows the whole
 * 2560×1440 and a phone shows barely more than that centre strip. So the name
 * and the address live inside the safe area, and everything outside it is
 * pattern that can be cropped away without losing information. Designing the
 * other way round is how channel banners end up with half a wordmark on
 * mobile.
 *
 * THE REPEATING MOTIF (owner, 2026-08-29)
 * The banner cannot animate — YouTube renders it as a still even if the file is
 * an animated GIF. What it can do is repeat: a row of spec cards running off
 * both edges says "this is a catalogue" in the one glance a channel page gets,
 * and reads as a continuing pattern rather than a cropped picture on every
 * device width.
 *
 * The cards carry real field names from our own data sheet — capacity, ηs,
 * refrigerant, listing status — because a made-up spec on a brand asset is a
 * small lie that a professional audience spots immediately.
 *
 * ONE-SOURCE RULE: lockup and flags are the official SVG exports, never redrawn.
 *
 * Run:  node scripts/build-youtube-banner.mjs <out.png> [--tagline "…"]
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';
const out = process.argv[2];
if (!out) { console.error('Usage: build-youtube-banner.mjs <out.png> [--tagline "…"]'); process.exit(1); }
const tagIdx = process.argv.indexOf('--tagline');
const TAGLINE = tagIdx >= 0 ? process.argv[tagIdx + 1] : 'Compare. Research. Explore.';

const W = 2560, H = 1440;
const SAFE_W = 1546, SAFE_H = 423;

const svgOf = (n) => {
  const f = join(BRIDGE_SVG, n);
  if (!existsSync(f)) { console.error(`missing brand asset: ${f}`); process.exit(1); }
  return readFileSync(f, 'utf8');
};
const lockup = svgOf('heatpumpdb-3a-lockup-dark.svg')
  .replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '');
const FLAGS = ['de', 'gb', 'fr', 'pl', 'it'];

/* One spec card. The row is built long enough to run off both edges at every
   crop width, so the pattern never terminates inside the frame. */
const CARDS = [
  { cc: 'de', model: 'Luft/Wasser · Monoblock', rows: [['Nennleistung', '9,0 kW'], ['ηs (35 °C)', '182 %'], ['Kältemittel', 'R290']] },
  { cc: 'fr', model: 'Air/Eau · Bibloc', rows: [['Puissance', '12,0 kW'], ['ηs (35 °C)', '176 %'], ['Fluide', 'R32']] },
  { cc: 'gb', model: 'Air Source · Monobloc', rows: [['Rated output', '7,0 kW'], ['ηs (35 °C)', '189 %'], ['Refrigerant', 'R290']] },
  { cc: 'it', model: 'Aria/Acqua · Monoblocco', rows: [['Potenza', '16,0 kW'], ['ηs (35 °C)', '171 %'], ['Refrigerante', 'R32']] },
  { cc: 'pl', model: 'Powietrze/Woda · Split', rows: [['Moc', '5,0 kW'], ['ηs (35 °C)', '185 %'], ['Czynnik', 'R290']] },
];

const card = (c) => `<div class="card">
  <div class="ch"><span class="fl">${svgOf(`flag-${c.cc}-onlight.svg`)}</span><span class="cm">${c.model}</span></div>
  ${c.rows.map(([k, v]) => `<div class="cr"><span>${k}</span><b>${v}</b></div>`).join('')}
</div>`;

/* Three passes of the five cards: wide enough that the row overflows 2560px
   and keeps overflowing at any crop. */
const row = [...CARDS, ...CARDS, ...CARDS].map(card).join('');

const html = `<style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;overflow:hidden;
    font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#fff;
    -webkit-font-smoothing:antialiased}
  .bg{position:absolute;inset:0;
    background:radial-gradient(120% 90% at 50% 40%,#14406e 0%,#0c2846 52%,#071a2f 100%)}
  .glow{position:absolute;border-radius:50%;filter:blur(200px);pointer-events:none}
  .g1{width:1500px;height:1500px;top:-560px;left:-300px;background:rgba(70,160,255,.20)}
  .g2{width:1200px;height:1200px;bottom:-520px;right:-260px;background:rgba(224,69,44,.13)}

  /* The repeating band — two rows, offset, running off both edges. */
  .band{position:absolute;left:-320px;right:-320px;display:flex;gap:34px;
    opacity:.30;filter:saturate(.85)}
  .band.top{top:118px}
  .band.bot{bottom:118px;margin-left:-260px}
  .card{flex:0 0 auto;width:390px;background:rgba(255,255,255,.055);
    border:2px solid rgba(140,195,255,.20);border-radius:22px;padding:22px 26px}
  .ch{display:flex;align-items:center;gap:14px;padding-bottom:14px;
    border-bottom:2px solid rgba(140,195,255,.18);margin-bottom:14px}
  .fl{width:44px;display:block;flex:0 0 auto}
  .fl svg{width:44px;height:auto;display:block}
  .cm{font-size:19px;font-weight:700;color:#bcd8f5;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  .cr{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0}
  .cr span{font-size:19px;color:#8fb4d8}
  .cr b{font-size:23px;font-weight:800;color:#eaf4ff}

  /* Safe area: everything that must survive the phone crop. */
  .safe{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:${SAFE_W}px;height:${SAFE_H}px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;text-align:center}
  .scrim{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:${SAFE_W + 620}px;height:${SAFE_H + 300}px;
    background:radial-gradient(closest-side,rgba(7,26,47,.97) 0%,rgba(7,26,47,.90) 58%,rgba(7,26,47,0) 100%)}
  .lock{width:1080px}
  .tag{margin-top:30px;font-size:46px;font-weight:600;letter-spacing:.01em;color:#cfe4fa}
  .flags{margin-top:34px;display:flex;gap:26px;align-items:center}
  .flags svg{width:62px;height:auto;display:block}
  .host{margin-top:30px;font-size:36px;font-weight:800;letter-spacing:.02em;color:#7fd4ff}
</style>
<body>
  <div class="bg"></div><div class="glow g1"></div><div class="glow g2"></div>
  <div class="band top">${row}</div>
  <div class="band bot">${row}</div>
  <div class="scrim"></div>
  <div class="safe">
    <div class="lock">${lockup}</div>
    <div class="tag">${TAGLINE}</div>
    <div class="flags">${FLAGS.map((f) => svgOf(`flag-${f}-onlight.svg`)).join('')}</div>
    <div class="host">heatpumpdb.eu</div>
  </div>
</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: out });
await browser.close();
console.log(`banner ${W}×${H} (safe ${SAFE_W}×${SAFE_H}) → ${out}`);
