#!/usr/bin/env node
/**
 * record-demo.mjs — record the app demonstrating itself.
 *
 * WHY SCRIPTED AND NOT HAND-RECORDED
 * A hand-recorded demo has to be re-shot every time the UI moves, and five
 * market editions means shooting it five times with a steady hand. This drives
 * the real app through a fixed choreography, so a re-record is one command,
 * every language comes out on the identical path, and nothing on screen is
 * mocked — it is the actual product against the actual 7,190-model catalogue.
 *
 * TWO THINGS PLAYWRIGHT DOES NOT GIVE YOU, ADDED HERE
 *  - a cursor: browser video has no pointer, so clicks look like the page
 *    changing by itself. A synthetic one is injected and moved with the mouse.
 *  - captions: a silent product tour is hard to follow without a voice-over.
 *
 * OUTPUT is webm (what Chromium records). LinkedIn and YouTube both accept it;
 * convert with ffmpeg only if you need mp4.
 *
 * Run:  node scripts/record-demo.mjs            # GB edition, English
 *       node scripts/record-demo.mjs DE         # any market
 * Out:  demo_video/<MARKET>/*.webm  (gitignored)
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKET = (process.argv[2] || 'GB').toUpperCase();
const PORT = process.env.PORT || '5302';
const BASE = `http://localhost:${PORT}/?preview=hpiq`;
const OUT = join(ROOT, 'demo_video', MARKET);

/** 720p 16:9 — the size LinkedIn and YouTube both want, and small enough that
 *  the UI is not scaled down into illegibility. */
const VIEWPORT = { width: 1280, height: 720 };

/* ── Cursor, click effect and captions ───────────────────────────────────
   None of this comes from the browser: a recorded page has no pointer, so a
   click looks like the screen changing on its own, and a silent product tour
   is hard to follow without a voice-over. All three are injected here, which
   also means they are ours to style — brand colours, brand font, icons. */

/** Brand palette (src/components/brandSvg.ts — one source, never re-typed). */
const BRAND = { red: '#e0452c', blue: '#0066cc', ink: '#1d1d1f' };

const OVERLAY_SCRIPT = `
  window.__demoInit = () => {
    if (document.getElementById('__demo_style')) return;
    const st = document.createElement('style');
    st.id = '__demo_style';
    st.textContent = \`
      #__demo_cursor { position:fixed; left:0; top:0; width:24px; height:24px;
        margin:-2px 0 0 -2px; z-index:2147483647; pointer-events:none;
        filter:drop-shadow(0 2px 6px rgba(0,0,0,.35));
        transition:transform .06s linear, scale .12s ease; }
      #__demo_cursor.press { scale:.82; }

      /* Concentric rings: three, staggered, each expanding as it fades. One
         ring reads as a glitch; three read as a deliberate tap. */
      /* Position with left/top, NOT transform: the keyframes animate transform,
         which would overwrite an inline translate and stack every ripple in the
         top-left corner. */
      .__demo_ripple { position:fixed; border-radius:50%;
        margin:-6px 0 0 -6px; width:12px; height:12px; z-index:2147483646;
        pointer-events:none; border:2.5px solid __BLUE__;
        animation:__demoRipple .85s cubic-bezier(.2,.7,.3,1) forwards; }
      @keyframes __demoRipple {
        0%   { transform:scale(.4); opacity:.85; border-width:3px; }
        70%  { opacity:.35; }
        100% { transform:scale(5.6); opacity:0; border-width:1px; }
      }
      /* A soft fill under the rings so the tap point itself is visible. */
      .__demo_flash { position:fixed; border-radius:50%;
        margin:-14px 0 0 -14px; width:28px; height:28px; z-index:2147483645;
        pointer-events:none; background:__BLUE__;
        animation:__demoFlash .5s ease-out forwards; }
      @keyframes __demoFlash { 0%{opacity:.30;transform:scale(.5)} 100%{opacity:0;transform:scale(1.6)} }

      #__demo_caption { position:fixed; left:50%; bottom:56px;
        transform:translateX(-50%) translateY(10px); z-index:2147483644;
        pointer-events:none; max-width:74%;
        display:flex; align-items:center; gap:13px;
        padding:15px 30px 15px 24px; border-radius:18px;
        background:rgba(20,24,23,.90); backdrop-filter:blur(14px) saturate(1.2);
        box-shadow:0 12px 40px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.09);
        color:#fff; font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
        font-size:22px; font-weight:600; letter-spacing:-.3px; line-height:1.3;
        opacity:0; transition:opacity .38s ease, transform .38s cubic-bezier(.2,.8,.3,1); }
      #__demo_caption.show { opacity:1; transform:translateX(-50%) translateY(0); }
      #__demo_caption .ico { flex:none; width:26px; height:26px; display:grid; place-items:center;
        color:__BLUE__; }
      #__demo_caption .ico svg { width:26px; height:26px; }
    \`;
    st.textContent = st.textContent.split('__BLUE__').join(window.__demoBlue || '#0066cc');
    document.documentElement.appendChild(st);

    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24">' +
      '<path d="M5 2l14 9-6 1.2 3.2 6.4-2.6 1.3L10.4 13.5 5 18z" fill="#fff" stroke="#1d1d1f" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);

    window.__moveCursor = (x, y) => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };

    window.__clickFx = (x, y) => {
      c.classList.add('press');
      setTimeout(() => c.classList.remove('press'), 160);
      const flash = document.createElement('div');
      flash.className = '__demo_flash';
      flash.style.left = x + 'px'; flash.style.top = y + 'px';
      document.documentElement.appendChild(flash);
      setTimeout(() => flash.remove(), 600);
      [0, 130, 260].forEach((delay) => setTimeout(() => {
        const r = document.createElement('div');
        r.className = '__demo_ripple';
        r.style.left = x + 'px'; r.style.top = y + 'px';
        document.documentElement.appendChild(r);
        setTimeout(() => r.remove(), 950);
      }, delay));
    };

    const cap = document.createElement('div');
    cap.id = '__demo_caption';
    cap.innerHTML = '<span class="ico"></span><span class="txt"></span>';
    document.documentElement.appendChild(cap);
    window.__caption = (text, icon) => {
      if (!text) { cap.classList.remove('show'); return; }
      cap.querySelector('.txt').textContent = text;
      const ic = cap.querySelector('.ico');
      ic.innerHTML = icon || '';
      ic.style.display = icon ? 'grid' : 'none';
      cap.classList.add('show');
    };
  };
  window.addEventListener('DOMContentLoaded', () => window.__demoInit());
`;

/** Caption icons — inline SVG so nothing is fetched and nothing can fail to load. */
const ICONS = {
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
};

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: VIEWPORT },
  reducedMotion: 'no-preference',
});
await context.addInitScript(`window.__demoBlue=${JSON.stringify(BRAND.blue)};` + OVERLAY_SCRIPT);
const page = await context.newPage();

/** Where the cursor currently is, so moves start from the right place. */
let at = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

const caption = (t, icon) => page.evaluate(([x, i]) => window.__caption?.(x, i), [t, icon]).catch(() => {});

/** Move like a hand, not like a teleport: eased, in steps, cursor following. */
async function glide(x, y, ms = 550) {
  const steps = Math.max(12, Math.round(ms / 16));
  const from = { ...at };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // easeInOut
    const px = from.x + (x - from.x) * e;
    const py = from.y + (y - from.y) * e;
    await page.mouse.move(px, py);
    await page.evaluate(([a, b]) => window.__moveCursor?.(a, b), [px, py]).catch(() => {});
    await page.waitForTimeout(ms / steps);
  }
  at = { x, y };
}

/** PROOF=1 saves a still at each click. Playwright records variable-frame-rate
 *  video, so scrubbing the webm to a guessed timestamp is an unreliable way to
 *  check whether the click effect painted — this looks at the live page. */
const PROOF = process.env.PROOF === '1';
let clickNo = 0;

async function clickAt(locator, { pause = 500 } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box — cannot click');
  await glide(box.x + box.width / 2, box.y + Math.min(box.height / 2, 24));
  await page.evaluate(([x, y]) => window.__clickFx?.(x, y), [at.x, at.y]).catch(() => {});
  if (PROOF) {
    clickNo++;
    await page.waitForTimeout(220);
    const rings = await page.locator('.__demo_ripple').count();
    await page.screenshot({ path: join(OUT, `proof-click${clickNo}.png`) });
    console.log(`  click ${clickNo}: ${rings} ring(s) painted`);
  }
  await page.waitForTimeout(320);
  await locator.click();
  await page.waitForTimeout(pause);
}

const beat = (ms) => page.waitForTimeout(ms);

/* ── The choreography ────────────────────────────────────────────────────── */
console.log(`\nRecording ${MARKET} — ${BASE}\n`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);                        // datasets load
await page.evaluate(() => window.__demoInit?.()).catch(() => {});

// 1. Establish what this is.
await caption('Every heat pump on the market. One database.', ICONS.database);
await beat(2600);

// 2. Search — typed at human speed, results appear as it goes.
const search = page.locator('input').first();
await clickAt(search, { pause: 250 });
await caption('Search 7,190 models by name, code or manufacturer', ICONS.search);
await search.pressSequentially('Vitocal', { delay: 155 });
await beat(2200);

// 3. The specs that matter are on the card already.
await caption('SCOP, sound power, refrigerant — before you open anything', ICONS.gauge);
await glide(640, 430, 700);
await beat(2400);
await page.mouse.wheel(0, 240);
await beat(1800);

// 4. The data sheet — the thing installers actually need.
// The card link carries a '›'; the nav item does not — without that the
// cursor flew to the top navigation instead of the result card.
const sheet = page.getByText(/(Data sheet|Datenblatt|Fiche technique|Karta danych|Scheda tecnica)\s*›/i).first();
await caption('A quote-ready data sheet for any model', ICONS.sheet);
await clickAt(sheet, { pause: 2600 });
await beat(2600);

await caption('');
await beat(600);

console.log('closing context (this is when the video is written)…');
await context.close();
await browser.close();

// Playwright names videos by an internal id — rename to something meaningful.
const files = readdirSync(OUT).filter((f) => f.endsWith('.webm'));
for (const f of files) renameSync(join(OUT, f), join(OUT, `demo-${MARKET.toLowerCase()}.webm`));
console.log(`\n→ demo_video/${MARKET}/demo-${MARKET.toLowerCase()}.webm\n`);
