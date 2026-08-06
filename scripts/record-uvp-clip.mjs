#!/usr/bin/env node
/**
 * record-uvp-clip.mjs — 5-second UVP feature clips, marketing-grade.
 *
 * THE LIBRARY IDEA (owner, 2026-08-07): one 5s clip per UVP-table feature,
 * uniform in concept but each with its own effect, so any subset can be
 * stitched into a full reel or a 3-4 clip special. Everything on screen is the
 * REAL app against the real catalogue — no mockups (same rule as record-demo).
 *
 * WHAT A CLIP IS MADE OF
 *  - a scripted 5s interaction, recorded by Playwright (GB edition = English UI);
 *  - a tagline overlay injected into the page, animating in at ~1.2s;
 *  - an energetic English voice speaking the tagline, mixed at 1.2s
 *    (Google Cloud TTS Chirp3-HD — synthesized per run, different voice per
 *    concept, using the project's existing credentials);
 *  - ffmpeg finish: precise 5.0s trim, a slow camera move, H.264 + AAC.
 *
 * TIMING is measured, not hoped for: the recording starts before the page is
 * ready, so the script clocks the choreography's start relative to page
 * creation and trims exactly that offset — the tagline then lands at 1.2s of
 * the finished clip regardless of how long the dev server took.
 *
 * Run:  node scripts/record-uvp-clip.mjs easy-finding-a   (see CLIPS below)
 * Out:  demo_video/uvp/<name>.mp4  (gitignored)
 * Needs: vite dev server for GB on PORT (default 5302), ffmpeg.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'demo_video', 'uvp');
const PORT = process.env.PORT || '5302';
const BASE = `http://localhost:${PORT}/?preview=hpiq`;
const VIEWPORT = { width: 1280, height: 720 };
const BRAND = { red: '#e0452c', blue: '#0066cc', ink: '#1d1d1f' };

/** Tagline audio: energetic Chirp3-HD voices, one per concept so the reel
 *  doesn't sound like one narrator reading a list. */
async function tts(text, voice, outFile) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': 'gen-lang-client-0324244302',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'en-US', name: voice },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.12 },
    }),
  });
  const data = await res.json();
  if (!data.audioContent) throw new Error('TTS failed: ' + JSON.stringify(data).slice(0, 200));
  writeFileSync(outFile, Buffer.from(data.audioContent, 'base64'));
}

/* ── The three proof-of-concept treatments for "Easy & Quick Finding" ──────
   Same subject and choreography; what differs is the tagline's entrance and
   the camera. A = kinetic lower-third, B = glass spotlight, C = badge pop. */

const TAGLINE = 'Easy & Quick Finding';
const SPOKEN = 'Easy and quick finding!';

const CONCEPTS = {
  'easy-finding-a': {
    voice: 'en-US-Chirp3-HD-Puck',
    camera: 'in',                       // slow push-in
    css: `
      #uvp { position:fixed; left:0; bottom:64px; z-index:2147483000; pointer-events:none;
        transform:translateX(-105%); }
      #uvp.on { animation:uvpSlide .55s cubic-bezier(.2,.9,.25,1) forwards; }
      @keyframes uvpSlide { to { transform:translateX(0); } }
      #uvp .bar { display:flex; align-items:center; gap:16px;
        background:${BRAND.ink}; padding:20px 44px 20px 36px;
        border-radius:0 999px 999px 0; box-shadow:0 14px 44px rgba(0,0,0,.4);
        border-left:7px solid ${BRAND.blue}; }
      #uvp .word { color:#fff; font:800 40px/1 Inter,-apple-system,sans-serif;
        letter-spacing:-1px; opacity:0; transform:translateY(18px);
        animation:uvpWord .4s cubic-bezier(.2,.9,.3,1.4) forwards; }
      #uvp .word:nth-child(2){ animation-delay:.12s; }
      #uvp .word:nth-child(3){ animation-delay:.24s; color:${BRAND.blue};
        -webkit-text-stroke:0; }
      @keyframes uvpWord { to { opacity:1; transform:translateY(0); } }`,
    html: `<div class="bar"><span class="word">Easy</span><span class="word">&amp;&nbsp;Quick</span><span class="word">Finding</span></div>`,
  },

  'easy-finding-b': {
    voice: 'en-US-Chirp3-HD-Aoede',
    camera: 'none',
    css: `
      #uvpVig { position:fixed; inset:0; z-index:2147482999; pointer-events:none;
        background:radial-gradient(120% 90% at 50% 42%, transparent 55%, rgba(8,12,16,.55) 100%);
        opacity:0; transition:opacity .6s ease; }
      #uvpVig.on { opacity:1; }
      #uvp { position:fixed; left:50%; bottom:52px; transform:translateX(-50%) translateY(26px) scale(.96);
        z-index:2147483000; pointer-events:none; opacity:0;
        background:rgba(20,24,23,.72); backdrop-filter:blur(18px) saturate(1.3);
        border:1px solid rgba(255,255,255,.18); border-radius:22px;
        padding:22px 52px; box-shadow:0 18px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12); }
      #uvp.on { animation:uvpRise .6s cubic-bezier(.2,.85,.3,1) forwards; }
      @keyframes uvpRise { to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }
      #uvp .t { font:800 38px/1.1 Inter,-apple-system,sans-serif; letter-spacing:-.8px;
        background:linear-gradient(100deg, #fff 20%, #7cc4ff 45%, ${BRAND.blue} 60%, #ff8a70 85%);
        background-size:220% 100%; -webkit-background-clip:text; background-clip:text;
        color:transparent; animation:uvpShine 2.4s ease .5s forwards; }
      @keyframes uvpShine { from { background-position:120% 0; } to { background-position:0% 0; } }`,
    html: `<span class="t">${TAGLINE.replace('&', '&amp;')}</span>`,
    extra: `<div id="uvpVig"></div>`,
  },

  'easy-finding-c': {
    voice: 'en-US-Chirp3-HD-Fenrir',
    camera: 'out',                      // slight pull-back
    css: `
      #uvp { position:fixed; left:50%; top:88px; transform:translateX(-50%);
        z-index:2147483000; pointer-events:none; text-align:center; }
      #uvp .badge { display:inline-flex; align-items:center; gap:12px;
        background:linear-gradient(135deg, ${BRAND.blue}, #1f8bff);
        color:#fff; border-radius:999px; padding:16px 38px;
        font:800 34px/1 Inter,-apple-system,sans-serif; letter-spacing:-.6px;
        box-shadow:0 12px 40px rgba(0,102,204,.45);
        transform:scale(0); }
      #uvp.on .badge { animation:uvpPop .55s cubic-bezier(.2,1.4,.4,1) forwards; }
      @keyframes uvpPop { 60% { transform:scale(1.12); } to { transform:scale(1); } }
      #uvp .ring { position:absolute; left:50%; top:50%; width:30px; height:30px;
        margin:-15px 0 0 -15px; border-radius:50%; border:3px solid #7cc4ff; opacity:0; }
      #uvp.on .ring { animation:uvpRing .9s ease-out .15s forwards; }
      @keyframes uvpRing { from { opacity:.8; transform:scale(1); } to { opacity:0; transform:scale(9); } }
      #uvp .zap { display:inline-block; animation:uvpZap 1s ease .7s 2; }
      @keyframes uvpZap { 0%,100% { transform:rotate(0); } 25% { transform:rotate(-12deg); } 60% { transform:rotate(9deg); } }`,
    html: `<span class="ring"></span><span class="badge"><span class="zap">⚡</span>${TAGLINE.replace('&', '&amp;')}</span>`,
  },
};

const name = (process.argv[2] || '').toLowerCase();
const C = CONCEPTS[name];
if (!C) {
  console.error(`Usage: node scripts/record-uvp-clip.mjs <${Object.keys(CONCEPTS).join('|')}>`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const tmpDir = join(OUT, `_rec-${name}`);
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
mkdirSync(tmpDir);

/* ── 1. Voice first (network before browser, fail fast) ── */
const voiceFile = join(tmpDir, 'voice.mp3');
await tts(SPOKEN, C.voice, voiceFile);
console.log(`voice: ${C.voice} ✓`);

/* ── 2. Record ── */
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: tmpDir, size: VIEWPORT },
});
const page = await context.newPage();
const pageCreatedAt = Date.now();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input', { timeout: 30000 });
await page.waitForTimeout(2500);                       // datasets settle

// Overlay scaffolding (hidden until fired).
await page.evaluate(([css, html, extra]) => {
  const st = document.createElement('style');
  st.textContent = css;
  document.documentElement.appendChild(st);
  if (extra) document.documentElement.insertAdjacentHTML('beforeend', extra);
  const el = document.createElement('div');
  el.id = 'uvp';
  el.innerHTML = html;
  document.documentElement.appendChild(el);
}, [C.css, C.html, C.extra ?? '']);

/* Choreography — 5.2s of real product: type, results pour in, tagline lands. */
const choreoStart = Date.now();
const search = page.locator('input').first();
await search.click();
const typing = search.pressSequentially('Vitocal', { delay: 72 });   // ~0.5s
// tagline + (later) voice at +1.2s
const fire = (async () => {
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.getElementById('uvp')?.classList.add('on');
    document.getElementById('uvpVig')?.classList.add('on');
  });
})();
await typing;
await page.waitForTimeout(1400);                       // results render on screen
await page.mouse.wheel(0, 190);                        // proof of a live list
await fire;
await page.waitForTimeout(5400 - (Date.now() - choreoStart));  // pad to 5.4s total
const choreoOffsetMs = choreoStart - pageCreatedAt;

await context.close();
await browser.close();

const webm = readdirSync(tmpDir).find((f) => f.endsWith('.webm'));
const rawFile = join(tmpDir, webm);

/* ── 3. Finish: trim to the measured window, camera move, mix the voice ── */
const FPS = 25, DUR = 5;
const frames = FPS * DUR;
const zoom =
  C.camera === 'in'  ? `zoompan=z='1+0.014*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=${FPS}` :
  C.camera === 'out' ? `zoompan=z='1.07-0.014*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=${FPS}` :
  `fps=${FPS}`;

const outFile = join(OUT, `${name}.mp4`);
execFileSync('ffmpeg', [
  '-y',
  '-ss', (choreoOffsetMs / 1000).toFixed(3), '-i', rawFile,
  '-itsoffset', '1.2', '-i', voiceFile,
  '-filter_complex', `[0:v]${zoom},trim=duration=${DUR},setpts=PTS-STARTPTS[v];[1:a]apad[a]`,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k',
  '-t', String(DUR), '-movflags', '+faststart',
  outFile,
], { stdio: 'ignore' });
rmSync(tmpDir, { recursive: true });

console.log(`→ demo_video/uvp/${name}.mp4  (5.0s, voice at 1.2s)`);
