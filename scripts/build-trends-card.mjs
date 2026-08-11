#!/usr/bin/env node
/**
 * build-trends-card.mjs — generate a Market & Trends infographic card
 * (1254×1254, the owner's Bulletin design language) from a JSON spec.
 *
 * WHY GENERATED AND NOT HAND-MADE
 * With a template, the monthly pipeline collapses to: owner sends a Korean
 * brief → Claude writes the market-language spec → this renders the card →
 * the existing ingestion converts (WebP/JPEG) and publishes. No design tool
 * in the loop, identical branding every month, and a card can be corrected
 * and re-rendered in seconds.
 *
 * ONE-SOURCE RULE: the footer lockup is the official brand SVG from the
 * marketing bridge (an export of brandSvg.ts) and the header badge is the
 * market's official app icon — nothing is redrawn by hand.
 *
 * SPEC (JSON): {
 *   country: "DE", month: "JULI 2026", lang: "de",
 *   title: ["BEG-Reform für Wärmepumpen", "ab 21. Juli 2026"],   // line 2 in blue
 *   sub: "…",
 *   hero: { icon: "euro-hand", pre: "Bis zu", big: "80 %", post: "Förderung",
 *           caption: ["für selbstnutzende Eigentümer", "mit niedrigem Einkommen"] },
 *   leftPanel:  { icon: "scales", title: "Was ändert sich?",
 *                 colFrom: "BISHER", colTo: "NEU AB 21.07.2026",
 *                 rows: [{ label, from, to }] },
 *   rightPanel: { icon: "people", title: "Wer profitiert?",
 *                 rows: [{ icon, label, value }],
 *                 note: { icon: "gift", title: "Familienzuschlag:", text: "+10.000 € …" } },
 *   kurzfazit: { title: "Kurzfazit", lines: ["…", "…"], icon: "hp-unit" },
 *   footer: "HeatPump DB Germany Editorial Team",
 * }
 *
 * Run:  node scripts/build-trends-card.mjs <spec.json> <out.png>
 * Out:  2508×2508 PNG master (crisp for LinkedIn), plus nothing else — the
 *       ingestion step owns WebP/JPEG conversion and registration.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';

const specPath = process.argv[2];
const outPath = process.argv[3];
if (!specPath || !outPath) { console.error('Usage: build-trends-card.mjs <spec.json> <out.png>'); process.exit(1); }
const S = JSON.parse(readFileSync(specPath, 'utf8'));

/* Brand on-dark palette (brandSvg.ts) */
const RED = '#ff6b52', BLUE = '#2997ff', INK = '#0c1118', PANEL = '#131a24', LINE = 'rgba(255,255,255,.09)';

/* Minimal line-icon library — stroke style matched to the Bulletin cards. */
const IC = (name, color = BLUE, size = 44) => {
  const P = {
    'euro-hand': `<circle cx="14" cy="7" r="4.6" stroke="${RED}"/><path d="M12.2 5.9h3.6M12.2 8.1h3.6M15.8 4.7c-1.9-.8-3.7.6-3.7 2.3s1.8 3.1 3.7 2.3" stroke="${RED}"/><path d="M6 16.8c1.8-1.3 3.6-1.5 5.8-.8l3.2 1c1.3.4 1.1 2.1-.4 2.1h-4.4" stroke="${color}"/><rect x="2.8" y="15.2" width="2.4" height="5.6" rx="0.8" stroke="${color}"/>`,
    scales: `<path d="M12 4v14M6.5 6.5h11M12 18h4M8 18h4" stroke="${color}"/><path d="M6.5 6.5 4 12h5L6.5 6.5zM17.5 6.5 15 12h5l-2.5-5.5z" stroke="${color}"/><path d="M4 12c0 1.4 1.1 2.4 2.5 2.4S9 13.4 9 12M15 12c0 1.4 1.1 2.4 2.5 2.4S20 13.4 20 12" stroke="${color}"/>`,
    people: `<circle cx="8" cy="8" r="2.6" stroke="${color}"/><circle cx="16" cy="8" r="2.6" stroke="${color}"/><path d="M3.5 18c.5-3 2.2-4.5 4.5-4.5S12 15 12.5 18M11.5 18c.5-3 2.2-4.5 4.5-4.5s4 1.5 4.5 4.5" stroke="${color}"/>`,
    person: `<circle cx="12" cy="8" r="3" stroke="${color}"/><path d="M6 19c.6-3.4 2.8-5.2 6-5.2s5.4 1.8 6 5.2" stroke="${color}"/>`,
    'person-2': `<circle cx="9" cy="8" r="2.6" stroke="${color}"/><circle cx="15.5" cy="8.6" r="2.1" stroke="${color}"/><path d="M4.5 18.5c.5-3 2.2-4.6 4.5-4.6 1.5 0 2.7.6 3.5 1.7M12 18.5c.4-2.3 1.7-3.6 3.5-3.6s3.1 1.3 3.5 3.6" stroke="${color}"/>`,
    'person-3': `<circle cx="7" cy="8.5" r="2.2" stroke="${color}"/><circle cx="12" cy="7.5" r="2.4" stroke="${color}"/><circle cx="17" cy="8.5" r="2.2" stroke="${color}"/><path d="M3 18.5c.4-2.6 1.9-4 4-4M9 18.5c.5-2.9 1.6-4.4 3-4.4s2.5 1.5 3 4.4M17 14.5c2.1 0 3.6 1.4 4 4" stroke="${color}"/>`,
    gift: `<rect x="4" y="10" width="16" height="10" rx="1.4" stroke="${color}"/><path d="M12 10v10M4 13.5h16M12 10c-2 0-4.5-.7-4.5-2.8C7.5 5.6 9 5 10 5.4c1.4.6 2 2.6 2 4.6zm0 0c2 0 4.5-.7 4.5-2.8C16.5 5.6 15 5 14 5.4c-1.4.6-2 2.6-2 4.6z" stroke="${color}"/>`,
    bulb: `<path d="M12 3.5a5.5 5.5 0 0 1 3.2 10c-.7.5-1.2 1.2-1.2 2v.5h-4v-.5c0-.8-.5-1.5-1.2-2A5.5 5.5 0 0 1 12 3.5z" stroke="${color}"/><path d="M10 18.5h4M10.7 20.5h2.6" stroke="${color}"/>`,
    'hp-unit': `<rect x="2.5" y="7" width="14" height="10" rx="1.5" stroke="${color}"/><circle cx="8" cy="12" r="3.1" stroke="${color}"/><path d="M8 10v4M6.3 11l3.4 2M9.7 11l-3.4 2" stroke="${color}"/><path d="M18.5 9.5h3M18.5 12h3M18.5 14.5h3" stroke="${color}"/><path d="M5 17v1.6M14 17v1.6" stroke="${color}"/>`,
    house: `<path d="M4 11.5 12 5l8 6.5M6 10v9h12v-9" stroke="${color}"/><rect x="10" y="13.5" width="4" height="5.5" stroke="${color}"/>`,
    leaf: `<path d="M6 18C6 10 11 6 19 5.5c.6 8-3.5 13-11 12.5-.7 0-2-.5-2 0z" stroke="${color}"/><path d="M6.5 17.5C9 13 12 10.5 16 8.5" stroke="${color}"/>`,
    percent: `<circle cx="8" cy="8.5" r="2.6" stroke="${color}"/><circle cx="16" cy="15.5" r="2.6" stroke="${color}"/><path d="M17.5 6 6.5 18" stroke="${color}"/>`,
    coins: `<ellipse cx="12" cy="6.5" rx="6.5" ry="2.6" stroke="${color}"/><path d="M5.5 6.5v5c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-5" stroke="${color}"/><path d="M5.5 11.5v5c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-5" stroke="${color}"/>`,
    calendar: `<rect x="4" y="6" width="16" height="14" rx="1.6" stroke="${color}"/><path d="M4 10.5h16M8.5 4v4M15.5 4v4" stroke="${color}"/>`,
    check: `<circle cx="12" cy="12" r="8.5" stroke="${color}"/><path d="m8 12.5 2.6 2.6L16 9.5" stroke="${color}"/>`,
    snow: `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 3l-2 2m2-2 2 2M12 21l-2-2m2 2 2-2M4.2 7.5 4.9 10m-.7-2.5L6.7 7M19.8 16.5l-.7-2.5m.7 2.5L17.3 17M4.2 16.5l2.5-.5m-2.5.5.7 2.5M19.8 7.5 17.3 7m2.5.5-.7 2.5" stroke="${color}"/>`,
  }[name] ?? `<circle cx="12" cy="12" r="8" stroke="${color}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P}</svg>`;
};

/** Footer lockup: the official dark export from the bridge — never redrawn. */
const lockupFile = join(BRIDGE_SVG, 'heatpumpdb-3a-lockup-dark.svg');
const lockup = existsSync(lockupFile) ? readFileSync(lockupFile, 'utf8') : '<b style="color:#fff">HeatPump <span style="color:' + RED + '">DB</span></b>';

/** Header badge: the market's official flag-badged app icon. */
const cc = S.country.toUpperCase();
const badgeFile = join(ROOT, 'public', 'icons', `${cc === 'GB' ? 'uk' : cc.toLowerCase()}-192.png`);
const badge = existsSync(badgeFile)
  ? `data:image/png;base64,${readFileSync(badgeFile).toString('base64')}`
  : '';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

const leftRows = (S.leftPanel?.rows ?? []).map((r) => `
  <div class="trow"><span class="tl">${esc(r.label)}</span>
    <span class="tf">${esc(r.from)}</span><span class="arr">→</span>
    <span class="tt">${esc(r.to)}</span></div>`).join('');

const rightRows = (S.rightPanel?.rows ?? []).map((r) => `
  <div class="rrow"><span class="ric">${IC(r.icon ?? 'person', RED, 40)}</span>
    <span class="rl">${esc(r.label)}</span><span class="rv">${esc(r.value)}</span></div>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1254px; height: 1254px; background: #050709; padding: 26px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased; }
  .card { width: 100%; height: 100%; background: ${INK}; border-radius: 26px;
    padding: 40px 56px 34px 118px; position: relative; display: flex; flex-direction: column; }
  .rail { position: absolute; left: 0; top: 0; bottom: 0; width: 92px;
    border-right: 1px solid ${LINE}; }
  .railtxt { position: absolute; left: 34px; top: 46%; transform: rotate(180deg);
    writing-mode: vertical-rl; letter-spacing: 5px; font-size: 15px; color: #4a525c; }
  .raildash { position: absolute; left: 36px; bottom: 66px; width: 22px; height: 4px;
    border-radius: 2px; background: ${RED}; }
  .badge { position: absolute; left: 22px; top: 40px; width: 52px; height: 52px;
    border-radius: 12px; }
  .month { position: absolute; right: 56px; top: 52px; color: #5a626c;
    font-size: 17px; letter-spacing: 3px; font-weight: 600; }
  h3.country { font-size: 33px; color: #fff; font-weight: 700; margin-bottom: 16px; }
  h1 { font-size: 47px; line-height: 1.14; color: #fff; font-weight: 800; letter-spacing: -0.8px; }
  h1 .l2 { color: ${BLUE}; display: block; }
  .sub { margin-top: 12px; color: #9aa2ac; font-size: 20.5px; line-height: 1.4; }
  .motif { position: absolute; right: 60px; top: 118px; opacity: .28; }

  .hero { margin-top: 26px; background: linear-gradient(135deg, #101b2a, #0d1520);
    border: 1px solid rgba(41,151,255,.18); border-radius: 20px;
    padding: 26px 34px; display: flex; align-items: center; gap: 30px; }
  .hico { flex: none; }
  .hsep { width: 1px; align-self: stretch; background: ${LINE}; }
  .hbig { font-size: 33px; color: #fff; font-weight: 700; line-height: 1.15; }
  .hbig b { color: ${RED}; font-size: 56px; font-weight: 800; }
  .hcap { margin-top: 6px; color: #9aa2ac; font-size: 20px; line-height: 1.35; }

  .panels { display: flex; gap: 22px; margin-top: 24px; flex: 1; }
  .panel { background: ${PANEL}; border: 1px solid ${LINE}; border-radius: 18px;
    padding: 24px 26px; }
  .pL { flex: 1.15; } .pR { flex: 1; display: flex; flex-direction: column; }
  .ph { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .ph b { color: #fff; font-size: 24.5px; font-weight: 700; }
  .cols { display: flex; justify-content: flex-end; gap: 0; font-size: 13.5px;
    letter-spacing: 1.5px; margin-bottom: 8px; }
  .cols .c1 { color: #6a727c; width: 128px; text-align: center; }
  .cols .c2 { color: ${BLUE}; width: 172px; text-align: right; font-weight: 700; }
  .trow { display: flex; align-items: center; padding: 13px 0; border-top: 1px solid ${LINE};
    font-size: 18.5px; }
  .tl { flex: 1; color: #c6ccd4; padding-right: 8px; }
  .tf { width: 96px; text-align: center; color: #8a929c; }
  .arr { width: 44px; text-align: center; color: ${BLUE}; }
  .tt { min-width: 150px; text-align: right; color: ${RED}; font-weight: 700; white-space: nowrap; }
  .rrow { display: flex; align-items: center; gap: 15px; padding: 12px 0; }
  .ric { flex: none; display: grid; place-items: center; width: 52px; height: 52px;
    border: 1.6px solid ${RED}; border-radius: 50%; }
  .rl { flex: 1; color: #c6ccd4; font-size: 19.5px; }
  .rv { color: ${RED}; font-size: 23px; font-weight: 800; }
  .rnote { margin-top: auto; border-top: 1px solid ${LINE}; padding-top: 16px;
    display: flex; gap: 15px; align-items: center; }
  .rnt b { display: block; color: #fff; font-size: 19px; text-decoration: underline; }
  .rnt span { color: ${RED}; font-size: 18.5px; font-weight: 700; }
  .rnt span i { color: #9aa2ac; font-style: normal; font-weight: 400; }

  .fazit { margin-top: 22px; background: ${PANEL}; border: 1px solid ${LINE};
    border-radius: 18px; padding: 24px 30px; display: flex; gap: 24px; align-items: center; }
  .fico { flex: none; width: 76px; height: 76px; border: 1.6px solid ${BLUE};
    border-radius: 50%; display: grid; place-items: center; }
  .ftxt b { display: block; color: #fff; font-size: 25px; margin-bottom: 6px; }
  .ftxt p { color: #9aa2ac; font-size: 19px; line-height: 1.42; }
  .fmotif { margin-left: auto; flex: none; }

  .foot { margin-top: 24px; display: flex; align-items: center; }
  .foot svg { height: 40px; width: auto; }
  .fteam { margin-left: auto; color: #5a626c; font-size: 17px; }
</style></head><body>
<div class="card">
  <div class="rail"></div>
  ${badge ? `<img class="badge" src="${badge}">` : ''}
  <div class="railtxt">HEATPUMPDB${cc === 'GB' ? '.UK' : '.' + cc}</div>
  <div class="raildash"></div>
  <div class="month">${esc(S.month)}</div>
  <div class="motif">${IC(S.motif ?? 'house', '#3a434e', 150)}</div>

  <h3 class="country">${esc(S.countryLabel ?? S.country)}</h3>
  <h1>${esc(S.title[0])}${S.title[1] ? `<span class="l2">${esc(S.title[1])}</span>` : ''}</h1>
  <p class="sub">${esc(S.sub)}</p>

  <div class="hero">
    <span class="hico">${IC(S.hero.icon ?? 'euro-hand', BLUE, 96)}</span>
    <span class="hsep"></span>
    <div>
      <div class="hbig">${esc(S.hero.pre ?? '')} <b>${esc(S.hero.big)}</b> ${esc(S.hero.post ?? '')}</div>
      <div class="hcap">${(S.hero.caption ?? []).map(esc).join('<br>')}</div>
    </div>
  </div>

  <div class="panels">
    ${S.leftPanel ? `<div class="panel pL">
      <div class="ph">${IC(S.leftPanel.icon ?? 'scales', BLUE, 40)}<b>${esc(S.leftPanel.title)}</b></div>
      <div class="cols"><span class="c1">${esc(S.leftPanel.colFrom ?? '')}</span><span class="c2">${esc(S.leftPanel.colTo ?? '')}</span></div>
      ${leftRows}
    </div>` : ''}
    ${S.rightPanel ? `<div class="panel pR">
      <div class="ph">${IC(S.rightPanel.icon ?? 'people', BLUE, 42)}<b>${esc(S.rightPanel.title)}</b></div>
      ${rightRows}
      ${S.rightPanel.note ? `<div class="rnote">
        <span class="ric">${IC(S.rightPanel.note.icon ?? 'gift', RED, 38)}</span>
        <div class="rnt"><b>${esc(S.rightPanel.note.title)}</b>
          <span>${esc(S.rightPanel.note.text)} <i>${esc(S.rightPanel.note.suffix ?? '')}</i></span></div>
      </div>` : ''}
    </div>` : ''}
  </div>

  <div class="fazit">
    <span class="fico">${IC('bulb', BLUE, 44)}</span>
    <div class="ftxt"><b>${esc(S.kurzfazit.title)}</b>
      <p>${(S.kurzfazit.lines ?? []).map(esc).join('<br>')}</p></div>
    <span class="fmotif">${IC(S.kurzfazit.icon ?? 'hp-unit', BLUE, 120)}</span>
  </div>

  <div class="foot">${lockup}<span class="fteam">${esc(S.footer)}</span></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await (await browser.newContext({
  viewport: { width: 1254, height: 1254 }, deviceScaleFactor: 2,
})).newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.screenshot({ path: outPath });
await browser.close();
console.log(`→ ${outPath} (2508×2508)`);
