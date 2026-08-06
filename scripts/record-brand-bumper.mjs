#!/usr/bin/env node
/**
 * record-brand-bumper.mjs — the 5s intro/closing bumper for every marketing
 * video (owner spec, 2026-08-07): the German site's landing page in ENGLISH,
 * which after a beat blurs away under the animated HeatPump DB logo, and the
 * five country icons pop in beneath it, one by one. No audio.
 *
 * ONE-SOURCE RULE, KEPT THE HONEST WAY: the big centred logo is not redrawn —
 * the script lifts the <svg> the page's own header already rendered (animated
 * arrows and all, straight from brandSvg.ts via BrandLogo) and simply scales
 * it up. The country icons are the official /icons/<cc>-192.png files the
 * sites actually serve. If the brand changes, this bumper changes with it.
 *
 * Run:  node scripts/record-brand-bumper.mjs          (DE dev server on PORT)
 * Out:  demo_video/uvp/brand-bumper.mp4  (5.0s, silent)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'demo_video', 'uvp');
const PORT = process.env.PORT || '5303';
const BASE = `http://localhost:${PORT}/`;
const VIEWPORT = { width: 1280, height: 720 };

mkdirSync(OUT, { recursive: true });
const tmpDir = join(OUT, '_rec-bumper');
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
mkdirSync(tmpDir);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: tmpDir, size: VIEWPORT } });
const page = await context.newPage();
const pageCreatedAt = Date.now();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('header', { timeout: 30000 });
await page.waitForTimeout(1800);

// The German landing in ENGLISH — flip the language pill before the window.
const en = page.getByRole('button', { name: 'EN', exact: true }).first();
if (await en.count()) { await en.click(); await page.waitForTimeout(900); }

/* Build the overlay from what the page already has. */
await page.evaluate(() => {
  const st = document.createElement('style');
  st.textContent = `
    /* The page itself fades into the background… */
    #root { transition: filter .7s ease, opacity .7s ease; }
    .bumper-on #root { filter: blur(14px) saturate(.85) brightness(.8); }

    #bumper { position:fixed; inset:0; z-index:2147483000; pointer-events:none;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:44px; }
    /* …the animated logo takes the stage… */
    #bumperLogo { opacity:0; transform:scale(.82); }
    .bumper-on #bumperLogo { animation:bumperLogo .8s cubic-bezier(.2,.85,.3,1.05) .15s forwards; }
    @keyframes bumperLogo { to { opacity:1; transform:scale(1); } }
    #bumperLogo svg { width:620px; height:auto;
      filter:drop-shadow(0 10px 44px rgba(0,0,0,.5)); }
    /* …and the five markets answer, one by one. */
    #bumperFlags { display:flex; gap:26px; }
    #bumperFlags img { width:84px; height:84px; border-radius:20px;
      box-shadow:0 10px 30px rgba(0,0,0,.45);
      opacity:0; transform:translateY(26px) scale(.7); }
    .bumper-on #bumperFlags img { animation:bumperFlag .5s cubic-bezier(.2,1.25,.4,1) forwards; }
    .bumper-on #bumperFlags img:nth-child(1) { animation-delay:1.05s; }
    .bumper-on #bumperFlags img:nth-child(2) { animation-delay:1.23s; }
    .bumper-on #bumperFlags img:nth-child(3) { animation-delay:1.41s; }
    .bumper-on #bumperFlags img:nth-child(4) { animation-delay:1.59s; }
    .bumper-on #bumperFlags img:nth-child(5) { animation-delay:1.77s; }
    @keyframes bumperFlag { to { opacity:1; transform:translateY(0) scale(1); } }
  `;
  document.documentElement.appendChild(st);

  // Lift the official animated logo straight out of the header — never redraw.
  const headerLogo = document.querySelector('header svg');
  const wrap = document.createElement('div');
  wrap.id = 'bumper';
  wrap.innerHTML = `
    <div id="bumperLogo">${headerLogo ? headerLogo.outerHTML : ''}</div>
    <div id="bumperFlags">
      ${['de', 'uk', 'fr', 'pl', 'it'].map((cc) => `<img src="/icons/${cc}-192.png" alt="${cc}">`).join('')}
    </div>`;
  document.documentElement.appendChild(wrap);
});
await page.waitForTimeout(600);                          // icons preload

/* Choreography: 1.2s clean landing → blur + logo → flags → hold. 5.4s total. */
const choreoStart = Date.now();
await page.waitForTimeout(1200);
await page.evaluate(() => document.documentElement.classList.add('bumper-on'));
await page.waitForTimeout(5400 - (Date.now() - choreoStart));
const offsetMs = choreoStart - pageCreatedAt;

await context.close();
await browser.close();

const webm = readdirSync(tmpDir).find((f) => f.endsWith('.webm'));
const outFile = join(OUT, 'brand-bumper.mp4');
execFileSync('ffmpeg', [
  '-y', '-ss', (offsetMs / 1000).toFixed(3), '-i', join(tmpDir, webm),
  '-vf', 'fps=25,trim=duration=5,setpts=PTS-STARTPTS',
  '-an',                                                  // silent by design
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-t', '5', '-movflags', '+faststart', outFile,
], { stdio: 'ignore' });
rmSync(tmpDir, { recursive: true });
console.log('→ demo_video/uvp/brand-bumper.mp4  (5.0s, silent)');
