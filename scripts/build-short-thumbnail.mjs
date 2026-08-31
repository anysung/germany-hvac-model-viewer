#!/usr/bin/env node
/**
 * build-short-thumbnail.mjs — a Shorts thumbnail built ON a frame of the clip
 * itself, so the still and the first second of playback are the same picture.
 *
 * WHY THE CLIP'S OWN FRAME
 * A thumbnail made from unrelated artwork reads as an ad and, worse, breaks:
 * the viewer taps a designed card and lands in a different-looking video. Using
 * the opening frame means playback starts from what they were already looking
 * at — the only thing that changes is that our overlay lifts. It also keeps the
 * flag badge in the same corner across still and video.
 *
 * WHY SO LITTLE TEXT (owner, 2026-08-29)
 * The clip's own title card is already in the frame. A thumbnail that repeats
 * it in full competes with it; one line naming the subject is enough to tell a
 * scroller what this is, and everything else is noise at grid size.
 *
 * ONE-SOURCE RULE: the lockup is the official SVG export, never redrawn.
 *
 * SPEC: { video, at?, headline, kicker?, host, country? }
 *   video   clip to take the background frame from (relative to the spec file)
 *   at      seconds — default 0, i.e. the frame playback begins on
 *
 * Run:  node scripts/build-short-thumbnail.mjs <spec.json> <out.png>
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';
const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error('Usage: build-short-thumbnail.mjs <spec.json> <out.png>'); process.exit(1);
}
const S = JSON.parse(readFileSync(specPath, 'utf8'));
const specDir = dirname(resolve(specPath));

const svgOf = (name) => {
  const f = join(BRIDGE_SVG, name);
  if (!existsSync(f)) { console.error(`missing brand asset: ${f}`); process.exit(1); }
  return readFileSync(f, 'utf8');
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ── the background: one frame of the clip, at its own resolution ───────── */
const video = isAbsolute(S.video) ? S.video : resolve(specDir, S.video);
if (!existsSync(video)) { console.error(`no such video: ${video}`); process.exit(1); }
const [W, H] = execFileSync('ffprobe',
  ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
   '-of', 'default=nw=1:nk=1', video], { encoding: 'utf8' }).trim().split('\n').map(Number);

const work = mkdtempSync(join(tmpdir(), 'thumb-'));
const framePng = join(work, 'frame.png');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(S.at ?? 0), '-i', video,
  '-frames:v', '1', framePng]);
const frameData = `data:image/png;base64,${readFileSync(framePng).toString('base64')}`;

/* Headline size falls back as the line grows — a long German compound has to
   fit the width rather than run off the frame. */
const titleSize = Math.round(Math.min(W * 0.125, (W * 1.65) / Math.max(String(S.headline).length, 1)));

/* The overlay sits in the BOTTOM third: the clip's own title card is at the
   top and the middle carries its graphic, so this is the one band that is
   ours to use without covering what the viewer came to see. */
const html = `<style>*{box-sizing:border-box}</style><body style="margin:0"><div style="
  width:${W}px;height:${H}px;position:relative;overflow:hidden;
  background:url('${frameData}') center/cover no-repeat;
  font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#fff;
  -webkit-font-smoothing:antialiased">

  <div style="position:absolute;left:0;right:0;bottom:0;height:${Math.round(H * 0.42)}px;
    background:linear-gradient(180deg,rgba(6,20,36,0) 0%,rgba(6,20,36,.88) 38%,rgba(6,20,36,.985) 100%)"></div>

  <div style="position:absolute;left:0;right:0;bottom:${Math.round(H * 0.055)}px;
    padding:0 ${Math.round(W * 0.07)}px;text-align:center">
    ${S.kicker ? `<div style="font-size:${Math.round(W * 0.032)}px;font-weight:800;
      letter-spacing:.16em;text-transform:uppercase;color:#8fc4f2;
      margin-bottom:${Math.round(H * 0.014)}px">${esc(S.kicker)}</div>` : ''}

    <div style="font-size:${titleSize}px;font-weight:900;line-height:1.02;letter-spacing:-.035em;
      text-shadow:0 8px 38px rgba(0,0,0,.65)">${esc(S.headline)}</div>

    <div style="margin-top:${Math.round(H * 0.03)}px;display:flex;align-items:center;
      justify-content:center;gap:${Math.round(W * 0.028)}px">
      <div style="width:${Math.round(W * 0.33)}px">${svgOf('heatpumpdb-3a-lockup-dark.svg')
        .replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '')}</div>
      <div style="font-size:${Math.round(W * 0.030)}px;font-weight:800;color:#7fd4ff">${esc(S.host)}</div>
    </div>
  </div>
</div></body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: outPath });
await browser.close();
console.log(`thumbnail ${W}×${H} (frame @ ${S.at ?? 0}s) → ${outPath}`);
