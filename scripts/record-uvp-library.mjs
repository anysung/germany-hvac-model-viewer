#!/usr/bin/env node
/**
 * record-uvp-library.mjs — the nine 5-second UVP clips (owner table, 2026-08-07).
 *
 * One clip per UVP row, every frame the real product. Uniform B×C hybrid
 * treatment — a glass card (concept B) that POPS in with a spring and an
 * expanding ring (concept C), gradient-shine tagline, small emphasis line —
 * with three energetic voices rotating so a stitched reel never sounds like
 * one narrator reading a list. A watermark (the page's own animated logo +
 * the flagless Europe icon) sits bottom-right on every clip.
 *
 * "The Latest Information" is about the DATABASE being current (owner
 * correction): the scene is the live catalogue and the emphasis line says
 * "Monthly update. Never fall behind." — not a news shot.
 *
 * Files are named exactly by tagline → demo_video/uvp/library/<Tagline>.mp4
 * (5.0s, voice at 1.2s, no music — reels add the music bed).
 *
 * Run:  node scripts/record-uvp-library.mjs            # all nine
 *       node scripts/record-uvp-library.mjs "EU Energy Label"   # one
 * Needs: GB dev server on PORT (default 5302), ffmpeg, network for the
 * Across-Europe scene (records the live heatpumpdb.eu hub).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'demo_video', 'uvp', 'library');
const PORT = process.env.PORT || '5302';
const APP = `http://localhost:${PORT}/?preview=hpiq`;
const LANDING = `http://localhost:${PORT}/`;
const VIEWPORT = { width: 1280, height: 720 };

const VOICES = ['en-US-Chirp3-HD-Puck', 'en-US-Chirp3-HD-Aoede', 'en-US-Chirp3-HD-Fenrir'];

/** The nine rows. `scene` runs BEFORE the recorded window (navigation, search
 *  pre-fill); `action` runs inside it (the 5 visible seconds). */
const CLIPS = [
  {
    tagline: 'Every HeatPump in Europe',
    spoken: 'Every heat pump in Europe!',
    sub: 'Every registered model — residential & commercial',
    url: LANDING,
    scene: async () => {},
    action: async (page) => {
      await page.waitForTimeout(1600);
      await page.mouse.wheel(0, 110);
      await page.waitForTimeout(900);
      await page.mouse.wheel(0, -110);
    },
  },
  {
    tagline: 'The Latest Information',
    spoken: 'The latest information!',
    sub: 'Monthly update. Never fall behind.',
    url: APP,
    scene: async (page) => {
      await page.getByText('Products', { exact: true }).first().click();
      await page.waitForTimeout(2200);
    },
    action: async (page) => {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1300);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1200);
      await page.mouse.wheel(0, 240);
    },
  },
  {
    tagline: 'Easy & Quick Finding',
    spoken: 'Easy and quick finding!',
    sub: 'Direct search, filter search — easy & quick',
    url: APP,
    scene: async () => {},
    action: async (page) => {
      const search = page.locator('input').first();
      await search.click();
      await search.pressSequentially('Vitocal', { delay: 72 });
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, 190);
    },
  },
  {
    tagline: 'Comparison at a glance',
    spoken: 'Comparison at a glance!',
    sub: '4 in 1 — intuitive comparison',
    url: APP,
    scene: async (page) => {
      const search = page.locator('input').first();
      await search.click();
      await search.fill('Vitocal');
      await page.waitForTimeout(1800);
    },
    action: async (page) => {
      const toggles = page.locator('[title="Add to compare"]');
      for (let i = 0; i < 3; i++) { await toggles.nth(i).click(); await page.waitForTimeout(260); }
      await page.getByText('Products', { exact: true }).first().click();
      await page.waitForTimeout(900);
      await page.getByText(/Compare 3/).first().click();
      await page.waitForTimeout(400);
    },
  },
  {
    tagline: 'Instant Data Sheet',
    spoken: 'Instant data sheet!',
    sub: 'A quote-ready data sheet for sales',
    url: APP,
    scene: async (page) => {
      const search = page.locator('input').first();
      await search.click();
      await search.fill('Vitocal');
      await page.waitForTimeout(1800);
    },
    action: async (page) => {
      await page.getByText(/Data sheet\s*›/).first().click();
      await page.waitForTimeout(2200);
      await page.mouse.wheel(0, 260);
    },
  },
  {
    tagline: 'EU Energy Label',
    spoken: 'E-U energy label!',
    sub: 'One click for the EU Energy Label',
    url: APP,
    scene: async (page) => {
      await page.getByText('EU energy label', { exact: false }).first().click();
      await page.waitForTimeout(2000);
    },
    action: async (page) => {
      await page.getByText('A+++', { exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(1400);
      await page.mouse.wheel(0, 280);
      await page.waitForTimeout(1000);
      await page.mouse.wheel(0, 220);
    },
  },
  {
    tagline: 'Practical Subsidy Guide',
    spoken: 'A practical subsidy guide!',
    sub: 'Funding programmes, explained step by step',
    url: APP,
    scene: async (page) => {
      await page.getByText('Funding guide', { exact: false }).first().click();
      await page.waitForTimeout(2000);
    },
    action: async (page) => {
      await page.mouse.wheel(0, 320);
      await page.waitForTimeout(1400);
      await page.mouse.wheel(0, 320);
      await page.waitForTimeout(1100);
      await page.mouse.wheel(0, 260);
    },
  },
  {
    tagline: 'Industry News Publishment',
    spoken: 'Industry news, every month!',
    sub: 'Market intelligence, published monthly',
    url: APP,
    scene: async (page) => {
      await page.getByText('News', { exact: true }).first().click();
      await page.waitForTimeout(2200);
    },
    action: async (page) => {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1400);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1100);
      await page.mouse.wheel(0, 240);
    },
  },
  {
    tagline: 'Across Europe',
    spoken: 'Across Europe!',
    sub: 'National-fit data — one platform, five markets',
    url: 'https://www.heatpumpdb.eu/',
    euIcon: '/appicon-48.png',
    scene: async () => {},
    action: async (page) => {
      await page.mouse.wheel(0, 360);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, 320);
      await page.waitForTimeout(1100);
      await page.mouse.wheel(0, 260);
    },
  },
];

/* ── B×C hybrid overlay + watermark ──────────────────────────────────────── */
const OVERLAY_CSS = (accent) => `
  #uvpVig { position:fixed; inset:0; z-index:2147482998; pointer-events:none;
    background:radial-gradient(120% 92% at 50% 40%, transparent 52%, rgba(8,12,16,.5) 100%);
    opacity:0; transition:opacity .55s ease; }
  #uvpVig.on { opacity:1; }
  #uvp { position:fixed; left:50%; bottom:56px; z-index:2147483000; pointer-events:none;
    transform:translateX(-50%) scale(0); text-align:center;
    background:rgba(20,24,23,.74); backdrop-filter:blur(18px) saturate(1.3);
    border:1px solid rgba(255,255,255,.18); border-radius:22px;
    padding:20px 48px 17px; box-shadow:0 18px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12); }
  #uvp.on { animation:uvpPop .6s cubic-bezier(.2,1.25,.35,1) forwards; }
  @keyframes uvpPop { 60% { transform:translateX(-50%) scale(1.06); } to { transform:translateX(-50%) scale(1); } }
  #uvp .ring { position:absolute; left:50%; top:50%; width:34px; height:34px;
    margin:-17px 0 0 -17px; border-radius:50%; border:3px solid ${accent}; opacity:0; }
  #uvp.on .ring { animation:uvpRing .9s ease-out .1s forwards; }
  @keyframes uvpRing { from { opacity:.75; transform:scale(1); } to { opacity:0; transform:scale(11); } }
  #uvp .t { display:block; font:800 36px/1.12 Inter,-apple-system,sans-serif; letter-spacing:-.8px;
    background:linear-gradient(100deg, #fff 22%, #7cc4ff 46%, #0066cc 60%, #ff8a70 86%);
    background-size:220% 100%; -webkit-background-clip:text; background-clip:text; color:transparent;
    animation:uvpShine 2.2s ease .45s forwards; }
  @keyframes uvpShine { from { background-position:120% 0; } to { background-position:0% 0; } }
  #uvp .s { display:block; margin-top:7px; font:600 16.5px/1.2 Inter,-apple-system,sans-serif;
    color:rgba(255,255,255,.82); letter-spacing:-.2px; opacity:0; transform:translateY(8px); }
  #uvp.on .s { animation:uvpSub .45s ease .4s forwards; }
  @keyframes uvpSub { to { opacity:1; transform:translateY(0); } }

  /* Watermark: always on, quiet, bottom-right. */
  #uvpWm { position:fixed; right:22px; bottom:20px; z-index:2147483001; pointer-events:none;
    display:flex; align-items:center; gap:10px; opacity:.85;
    filter:drop-shadow(0 2px 8px rgba(0,0,0,.45)); }
  #uvpWm svg { height:26px; width:auto; }
  #uvpWm img { height:30px; width:30px; border-radius:7px; }`;

async function tts(text, voice, outFile) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': 'gen-lang-client-0324244302', 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: 'en-US', name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.12 } }),
  });
  const data = await res.json();
  if (!data.audioContent) throw new Error('TTS failed: ' + JSON.stringify(data).slice(0, 160));
  writeFileSync(outFile, Buffer.from(data.audioContent, 'base64'));
}

async function recordClip(clip, voice, accent) {
  const tmpDir = join(OUT, `_rec`);
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const voiceFile = join(tmpDir, 'voice.mp3');
  await tts(clip.spoken, voice, voiceFile);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: tmpDir, size: VIEWPORT } });
  const page = await context.newPage();
  const pageCreatedAt = Date.now();
  await page.goto(clip.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(clip.url.startsWith('http://localhost') ? 3200 : 3800);
  await clip.scene(page);

  await page.evaluate(([css, tagline, sub, euIcon]) => {
    const st = document.createElement('style');
    st.textContent = css;
    document.documentElement.appendChild(st);
    document.documentElement.insertAdjacentHTML('beforeend', '<div id="uvpVig"></div>');
    const el = document.createElement('div');
    el.id = 'uvp';
    el.innerHTML = `<span class="ring"></span><span class="t">${tagline}</span><span class="s">${sub}</span>`;
    document.documentElement.appendChild(el);
    // Watermark: the page's own animated logo, plus the flagless Europe icon.
    const logo = document.querySelector('header svg');
    const wm = document.createElement('div');
    wm.id = 'uvpWm';
    wm.innerHTML = `${logo ? logo.outerHTML : ''}<img src="${euIcon}" alt="">`;
    document.documentElement.appendChild(wm);
  }, [OVERLAY_CSS(accent), clip.tagline.replace('&', '&amp;'), clip.sub.replace('&', '&amp;'), clip.euIcon ?? '/icons/eu-48.png']);
  await page.waitForTimeout(500);

  const choreoStart = Date.now();
  const fire = (async () => {
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      document.getElementById('uvp')?.classList.add('on');
      document.getElementById('uvpVig')?.classList.add('on');
    });
  })();
  await clip.action(page);
  await fire;
  const remain = 5400 - (Date.now() - choreoStart);
  if (remain > 0) await page.waitForTimeout(remain);
  const offsetMs = choreoStart - pageCreatedAt;

  await context.close();
  await browser.close();

  const webm = readdirSync(tmpDir).find((f) => f.endsWith('.webm'));
  const outFile = join(OUT, `${clip.tagline}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-ss', (offsetMs / 1000).toFixed(3), '-i', join(tmpDir, webm),
    '-itsoffset', '1.2', '-i', voiceFile,
    '-filter_complex', `[0:v]fps=25,trim=duration=5,setpts=PTS-STARTPTS[v];[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-t', '5', '-movflags', '+faststart', outFile,
  ], { stdio: 'ignore' });
  rmSync(tmpDir, { recursive: true });
  return outFile;
}

mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const list = only ? CLIPS.filter((c) => c.tagline.toLowerCase() === only.toLowerCase()) : CLIPS;
if (!list.length) { console.error('unknown tagline:', only); process.exit(1); }

const ACCENTS = ['#7cc4ff', '#ff8a70'];
for (const [i, clip] of list.entries()) {
  const idx = CLIPS.indexOf(clip);
  const voice = VOICES[idx % VOICES.length];
  process.stdout.write(`▸ ${clip.tagline}  (${voice.split('-').pop()}) … `);
  try {
    await recordClip(clip, voice, ACCENTS[idx % 2]);
    console.log('✓');
  } catch (e) {
    console.log('✗ ' + String(e.message ?? e).slice(0, 120));
  }
}
console.log(`\n→ demo_video/uvp/library/  (${readdirSync(OUT).filter((f) => f.endsWith('.mp4')).length} clips)`);
