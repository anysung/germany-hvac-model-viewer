#!/usr/bin/env node
/**
 * build-shorts-storyboard.mjs — render a Shorts storyboard sheet (PNG) from a
 * JSON spec: one panel per beat, each showing the 9:16 frame as it will
 * actually look, plus the direction and the voiceover line.
 *
 * WHY A RENDERER AND NOT A DOCUMENT
 * A storyboard's whole job is to settle what the viewer sees. A table of text
 * cannot do that: "big keyword, centred" reads fine in a table and comes back
 * from the editor at half the size. Drawing the frame at its real proportions,
 * with the type at its real weight, makes the decision visible before anyone
 * renders a second of video — and a change is a re-render, not a redraw.
 *
 * KEYWORD DISCIPLINE (owner, 2026-08-26)
 * Shorts carry ONE word per beat. The supporting line exists to keep the
 * keyword honest ("LOWER CO₂" alone would be a claim; "less energy can mean"
 * above it is the qualifier), and it is deliberately small — it is read by the
 * people who stop, not by the people who scroll.
 *
 * ONE-SOURCE RULE: the lockup is the official brand SVG export, never redrawn,
 * and the sheet says so where the editor will see it — the end card's logo is
 * composited from the asset file, not generated with the footage.
 *
 * SPEC: { id, title, concept, duration, format, beats: [beat], end: beat }
 *   beat: { t, key, sub, mood, icon, dir: [string], vo, url? }
 *   mood: sky | haze | bright | hero | end
 *
 * Run:  node scripts/build-shorts-storyboard.mjs <spec.json> <out.png>
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IC, esc } from './lib/trends-card-blocks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';

const specPath = process.argv[2];
const outPath = process.argv[3];
if (!specPath || !outPath) {
  console.error('Usage: build-shorts-storyboard.mjs <spec.json> <out.png>');
  process.exit(1);
}
const S = JSON.parse(readFileSync(specPath, 'utf8'));

/** Official lockups — read, never reconstructed. */
const svg = (name, fallback) => {
  const f = join(BRIDGE_SVG, name);
  return existsSync(f) ? readFileSync(f, 'utf8') : fallback;
};
const lockupInk = svg('heatpumpdb-3a-lockup-light.svg', '<b>HeatPump DB</b>');
const lockupOnDark = svg('heatpumpdb-3a-lockup-dark.svg', '<b style="color:#fff">HeatPump DB</b>');

/* The five frame moods. Each is the sky at that point in the story — the haze
   IS the message in beat 1, so it is a palette, not a filter note. */
const MOOD = {
  haze:   'linear-gradient(180deg,#8e97a3 0%,#aab3bd 55%,#c2c8d0 100%)',
  sky:    'linear-gradient(180deg,#2f8fe0 0%,#68b7f0 55%,#a8d8fb 100%)',
  bright: 'linear-gradient(180deg,#1f7fd6 0%,#5cb4f2 45%,#bfe4fd 100%)',
  hero:   'linear-gradient(180deg,#1a6fc4 0%,#4fa9ee 40%,#d6efff 100%)',
  end:    'linear-gradient(160deg,#0b2340 0%,#123a63 60%,#0d2a4a 100%)',
};

/** Keyword size: set by the LONGEST WORD, not the whole string — a two-word
 *  beat must not shrink to half the height of a one-word beat when on screen
 *  they are meant to land with the same weight. Long keywords wrap instead. */
const keySize = (k) => {
  const longest = Math.max(...String(k).split(/\s+/).map((w) => w.length), 4);
  return Math.min(44, Math.round(240 / longest));
};

/**
 * One 9:16 frame mock.
 *
 * The dashed rules are the platform safe areas, drawn rather than described:
 * top 10% disappears into LinkedIn's feed crop, bottom 20% under the Shorts
 * title and buttons. Type that sits inside them is type nobody reads.
 */
const frame = (b, big = false) => {
  const w = 206;
  const h = Math.round(w * 16 / 9);
  const dark = b.mood === 'end';
  const ink = dark ? '#ffffff' : '#0d2b4e';
  return `<div class="fr" style="width:${w}px;height:${h}px;background:${MOOD[b.mood] ?? MOOD.sky}">
    <div class="safe top"></div><div class="safe bot"></div>
    <div class="fc" style="color:${ink}">
      ${b.frameIcon ? `<div class="fbadge" style="background:${dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.55)'}">${IC(b.frameIcon, dark ? '#7fd4ff' : '#0d2b4e', 22)}</div>` : ''}
      ${b.sub ? `<div class="fsub" style="color:${dark ? '#9fc6ef' : '#124a80'}">${esc(b.sub)}</div>` : ''}
      <div class="fkey" style="font-size:${big ? 26 : keySize(b.key)}px">${esc(b.key)}</div>
      ${b.note ? `<div class="fnote" style="color:${dark ? '#cfe4fb' : '#0f3d69'}">${esc(b.note)}</div>` : ''}
      ${b.lock || dark ? `<div class="flock">${dark ? lockupOnDark : lockupInk}</div>` : ''}
    </div>
    ${b.url ? `<div class="furl" style="color:${dark ? '#7fd4ff' : '#ffffff'}">${esc(b.url)}</div>` : ''}
  </div>`;
};

/** One panel: the frame on top, under it what the editor has to do to produce
 *  it. Six panels in three columns fill the sheet exactly — a half-empty cell
 *  is where the eye stops, and a storyboard is read left to right. */
const panel = (b, i) => `
  <div class="pnl">
    <div class="num">${b.endCard ? 'END' : i + 1}</div>
    ${frame(b, b.endCard === true)}
    <div class="body">
      <div class="t">${esc(b.t)}</div>
      <div class="ic">${IC(b.icon ?? 'leaf', '#1f7fd6', 26)}<span>${esc(b.role ?? '')}</span></div>
      <ul>${(b.dir ?? []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      ${b.vo ? `<div class="vo"><span>VO</span>“${esc(b.vo)}”</div>` : ''}
    </div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1400px; background: #f4f7fb; padding: 34px 34px 26px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    -webkit-font-smoothing: antialiased; color: #10243c; }
  header { display: flex; align-items: flex-start; justify-content: space-between;
    padding-bottom: 18px; border-bottom: 3px solid #1f7fd6; margin-bottom: 22px; }
  h1 { font-size: 31px; font-weight: 800; letter-spacing: -.02em; color: #0d2b4e; }
  .cc { font-size: 17px; color: #40597a; margin-top: 7px; max-width: 760px; line-height: 1.5; }
  .meta { display: flex; gap: 8px; margin-top: 12px; }
  .chip { font-size: 12.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    background: #e3eefb; color: #1a5fa8; padding: 5px 11px; border-radius: 999px; }
  header svg { height: 40px; width: auto; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .pnl { display: flex; flex-direction: column; gap: 14px; background: #fff;
    border: 1px solid #dbe6f3; border-radius: 14px; padding: 16px; position: relative; }
  .fr { align-self: center; }
  .num { position: absolute; top: -10px; left: -10px; width: 30px; height: 30px; border-radius: 50%;
    background: #1f7fd6; color: #fff; font-size: 13px; font-weight: 800; display: flex;
    align-items: center; justify-content: center; letter-spacing: .02em; }
  .pnl:last-child .num { width: auto; padding: 0 11px; border-radius: 15px; }

  /* The frame mock — real 9:16 proportions, type at its real relative weight. */
  .fr { position: relative; border-radius: 11px; overflow: hidden; flex: 0 0 auto;
    box-shadow: 0 4px 14px rgba(13,43,78,.16); }
  .safe { position: absolute; left: 0; right: 0; background: rgba(255,255,255,.10); }
  .safe.top { top: 0; height: 10%; border-bottom: 1px dashed rgba(255,255,255,.55); }
  .safe.bot { bottom: 0; height: 20%; border-top: 1px dashed rgba(255,255,255,.55); }
  .fc { position: absolute; left: 8%; right: 8%; top: 16%; text-align: center; }
  .fkey { font-weight: 900; letter-spacing: -.035em; line-height: .95; text-transform: uppercase;
    text-shadow: 0 2px 10px rgba(0,0,0,.16); }
  .fsub { font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    margin-bottom: 6px; }
  .fnote { font-size: 10px; line-height: 1.35; margin-top: 8px; font-weight: 600; }
  .fbadge { width: 34px; height: 34px; border-radius: 50%; margin: 0 auto 8px;
    display: flex; align-items: center; justify-content: center; }
  .flock { margin-top: 12px; display: flex; justify-content: center; }
  .flock svg { width: 128px; height: auto; }
  .furl { position: absolute; left: 0; right: 0; bottom: 22%; text-align: center;
    font-size: 11px; font-weight: 800; letter-spacing: .01em; text-shadow: 0 1px 6px rgba(0,0,0,.35); }

  .body { min-width: 0; }
  .t { font-size: 17px; font-weight: 800; color: #1f7fd6; letter-spacing: .01em; }
  .ic { display: flex; align-items: center; gap: 7px; margin: 6px 0 10px;
    font-size: 13.5px; font-weight: 700; color: #40597a; text-transform: uppercase; letter-spacing: .05em; }
  ul { padding-left: 15px; }
  li { font-size: 15px; line-height: 1.55; color: #29405c; margin-bottom: 2px; }
  .vo { margin-top: 12px; font-size: 15px; line-height: 1.45; color: #0d2b4e;
    background: #f0f6fd; border-left: 3px solid #1f7fd6; padding: 8px 10px; border-radius: 0 7px 7px 0; }
  .vo span { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .1em;
    color: #1f7fd6; margin-right: 7px; }

  footer { margin-top: 20px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .rule { background: #fff; border: 1px solid #dbe6f3; border-radius: 11px; padding: 12px 13px; }
  .rule b { display: block; font-size: 12.5px; font-weight: 800; color: #1f7fd6;
    text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
  .rule p { font-size: 13.5px; line-height: 1.5; color: #29405c; }
</style></head><body>
  <header>
    <div>
      <h1>${esc(S.title)}</h1>
      <div class="cc">${esc(S.concept)}</div>
      <div class="meta">
        <span class="chip">${esc(S.id)}</span>
        <span class="chip">${esc(S.duration)}s</span>
        <span class="chip">${esc(S.format)}</span>
        <span class="chip">${(S.beats ?? []).length} beats + end card</span>
      </div>
    </div>
    ${lockupInk}
  </header>
  <div class="grid">
    ${(S.beats ?? []).map((b, i) => panel(b, i)).join('')}
    ${S.end ? panel({ ...S.end, endCard: true }, 0) : ''}
  </div>
  <footer>
    ${(S.rules ?? []).map((r) => `<div class="rule"><b>${esc(r.k)}</b><p>${esc(r.v)}</p></div>`).join('')}
  </footer>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log(`${S.id} storyboard → ${outPath}`);
