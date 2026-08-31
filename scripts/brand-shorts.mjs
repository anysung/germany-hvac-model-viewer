#!/usr/bin/env node
/**
 * brand-shorts.mjs — put our branding on Shorts that were produced elsewhere:
 * a market flag in the top-left for the whole clip, and a ~3s end card with
 * the official lockup and the market's own address.
 *
 * WHY THIS EXISTS
 * The clips are made from public explainer material by an AI tool, and they
 * come back with no country marker and no sender. A viewer cannot tell which
 * market the rules apply to, and nobody learns who published it. Both are
 * fixed in post rather than by regenerating: the source clip is left exactly
 * as it is, and everything we add is our own artwork.
 *
 * ONE-SOURCE RULE: the flag and the lockup are rasterised from the official
 * SVG exports at output resolution. Nothing is redrawn, and no generator is
 * asked to imagine a logo — that is how the PDF once ended up with a square
 * flag. The flag is a waving cloth, never a rectangle.
 *
 * WHAT IT DOES NOT DO
 * It does not touch the source audio, re-cut the clip, or add claims. The end
 * card carries the address and nothing about funding eligibility or price —
 * eligibility is a matter of criteria and a qualified installer, and a price
 * window on a clip that lives for months is a promise we cannot keep.
 *
 * CUTTING A FOREIGN END CARD
 * Clips produced by an AI tool usually finish on that tool's own logo. --cut-at
 * drops everything from that second onward and puts ours there instead, so the
 * viewer's last frame is our address rather than a vendor's. It is a cut, not a
 * mask: the vendor card is gone from the file, not covered over.
 *
 * Run:  node scripts/brand-shorts.mjs <file-or-dir> [--country DE] [--out DIR]
 *                                     [--endcard 3] [--cut-at 294] [--flag-y .115]
 *                                     [--flag-w .10] [--flag-x .045]
 *                                     [--logo-w .42] [--logo-x .10] [--logo-y .13]
 *                                     [--ref yt] [--dry-run]
 *
 * --logo-w places our lockup ON the frame. It exists because the AI editors
 * stamp their own mark in the same spot on every clip: putting ours there is
 * both the branding we want and the one position that stops a competitor's
 * name riding along on our channel. Sized and placed by the caller, because
 * where the foreign mark sits differs per tool.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_SVG = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing/Claude Code/brand/svg';

/* ── arguments ─────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const target = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
const CC = String(flag('country', 'DE')).toUpperCase();
const END_SECS = Number(flag('endcard', 3));
/* Seconds at which the source is truncated. Everything from here is replaced by
   our end card. Unset = keep the whole clip and append. */
const CUT_AT = flag('cut-at', null) != null ? Number(flag('cut-at', null)) : null;
const REF = flag('ref', 'yt');
const DRY = argv.includes('--dry-run');
if (!target) { console.error('Usage: brand-shorts.mjs <file-or-dir> [--country DE] [--out DIR]'); process.exit(1); }

/* ── per-market presentation ───────────────────────────────────────────────
   The end card speaks the market's language and points at the market's OWN
   edition: a German viewer belongs on heatpumpdb.de, not on a hub they have
   never heard of. No funding programme is named anywhere. */
const MARKET = {
  DE: { flag: 'flag-de-onlight.svg', host: 'heatpumpdb.de',
        line1: 'WÄRMEPUMPEN VERGLEICHEN', line2: 'Modell für Modell · Deutschland' },
  GB: { flag: 'flag-gb-onlight.svg', host: 'heatpumpdb.uk',
        line1: 'COMPARE HEAT PUMPS', line2: 'Model by model · United Kingdom' },
  FR: { flag: 'flag-fr-onlight.svg', host: 'heatpumpdb.fr',
        line1: 'COMPARER LES POMPES À CHALEUR', line2: 'Modèle par modèle · France' },
  PL: { flag: 'flag-pl-onlight.svg', host: 'heatpumpdb.pl',
        line1: 'PORÓWNAJ POMPY CIEPŁA', line2: 'Model po modelu · Polska' },
  IT: { flag: 'flag-it-onlight.svg', host: 'heatpumpdb.it',
        line1: 'CONFRONTA LE POMPE DI CALORE', line2: 'Modello per modello · Italia' },
};
const M = MARKET[CC];
if (!M) { console.error(`No market presentation for ${CC}. Have: ${Object.keys(MARKET).join(', ')}`); process.exit(1); }

const svgOf = (name) => {
  const f = join(BRIDGE_SVG, name);
  if (!existsSync(f)) { console.error(`missing brand asset: ${f}`); process.exit(1); }
  return readFileSync(f, 'utf8');
};

/* ── inputs ────────────────────────────────────────────────────────────── */
const abs = resolve(target);
const inputs = statSync(abs).isDirectory()
  ? readdirSync(abs).filter((f) => /\.(mp4|mov|m4v)$/i.test(f) && !/-branded\./i.test(f)).map((f) => join(abs, f))
  : [abs];
if (!inputs.length) { console.error(`no video files in ${abs}`); process.exit(1); }
const OUT = resolve(flag('out', join(statSync(abs).isDirectory() ? abs : dirname(abs), 'branded')));
mkdirSync(OUT, { recursive: true });

const probe = (f, entries) =>
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'default=nw=1:nk=1', f],
    { encoding: 'utf8' }).trim().split('\n');

/* ── artwork, rasterised once at output resolution ─────────────────────────
   Rendered through the same headless Chromium the cards use, because it is
   the one rasteriser we can count on being here and it honours the SVG
   exactly. Sized against the FIRST clip's height so the badge occupies the
   same share of the frame in every output. */
const [W0, H0] = probe(inputs[0], 'stream=width,height').map(Number);
// 10% of frame width: the clips carry their own centred title card with about
// a 12% side margin, and a badge wider than that margin lands on its letters.
// A flag is read by colour, so it survives being small.
const flagW = Math.round(W0 * Number(flag('flag-w', 0.10)));
const flagH = Math.round(flagW * 66 / 96);
/* Lockup overlay. 0 = off, which is every clip that has no foreign mark. */
const LOGO_W = Math.round(W0 * Number(flag('logo-w', 0)));
const LOGO_H = Math.round(LOGO_W * 64 / 348);   // 공식 락업의 실제 비율

/* BADGE — 국기와 락업을 한 덩어리로, 배경판 없이.
   판을 깔면 그 아래 남의 워터마크는 확실히 가려지지만, 화면에 검은 막대가
   하나 생기고 클립 자신의 자막 카드까지 덮는다. 잉크만 얹고 흰 후광으로
   가독성을 주면 밝은 슬라이드에서도 읽히고 화면을 막지 않는다. */
const BADGE_W = Math.round(W0 * Number(flag('badge-w', 0)));
/* 남의 워터마크가 뜨는 시점부터만 보이게 한다. 클립 앞머리에는 제작 도구가
   자기 자막 카드를 띄우는데, 거기에 우리 로고를 얹으면 제목을 가린다. */
const BADGE_FROM = Number(flag('badge-from', 5));

async function raster(page, html, width, height, out) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, omitBackground: true });
}

const tmp = join(OUT, '.assets');
mkdirSync(tmp, { recursive: true });
const flagPng = join(tmp, `flag-${CC.toLowerCase()}.png`);
const endPng = join(tmp, `endcard-${CC.toLowerCase()}.png`);
const logoPng = join(tmp, 'lockup.png');

const browser = await chromium.launch();
const page = await browser.newPage();

/* The flag sits on a soft dark plate: these clips cut between bright slides and
   dark footage, and a bare flag disappears against half of them. */
await raster(page, `<body style="margin:0"><div style="
    width:${flagW + 26}px;height:${flagH + 26}px;display:flex;align-items:center;justify-content:center;
    background:rgba(10,20,35,.42);border-radius:${Math.round(flagW * 0.12)}px;
    backdrop-filter:blur(2px);">
  <div style="width:${flagW}px">${svgOf(M.flag).replace(/width="\d+"/, `width="${flagW}"`).replace(/height="\d+"/, `height="${flagH}"`)}</div>
</div></body>`, flagW + 26, flagH + 26, flagPng);

/* The lockup that goes on the footage, on a nearly opaque plate. The plate is
   not decoration: at 50% the foreign watermark underneath reads straight
   through our own mark, which is worse than leaving it alone — two logos in
   one place looks like a mistake rather than a brand. */
if (LOGO_W) {
  const padX = Math.round(LOGO_W * 0.07), padY = Math.round(LOGO_H * 0.42);
  await raster(page, `<body style="margin:0"><div style="
      width:${LOGO_W + padX * 2}px;height:${LOGO_H + padY * 2}px;
      display:flex;align-items:center;justify-content:center;
      background:rgba(10,20,35,.92);border-radius:${Math.round(LOGO_H * 0.42)}px;">
    <div style="width:${LOGO_W}px">${svgOf('heatpumpdb-3a-lockup-dark.svg')
      .replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '')}</div>
  </div></body>`, LOGO_W + padX * 2, LOGO_H + padY * 2, logoPng);
}

/* Flag + lockup as one unit, transparent, with a white halo so the ink reads
   on a teal slide as well as a beige one. */
const badgePng = join(tmp, 'badge.png');
if (BADGE_W) {
  const h = Math.round(BADGE_W * 0.155);              // 전체 높이
  const fw = Math.round(h * 96 / 66), gap = Math.round(h * 0.34);
  await raster(page, `<body style="margin:0"><div style="
      width:${BADGE_W}px;height:${h}px;display:flex;align-items:center;gap:${gap}px;
      filter:drop-shadow(0 0 ${Math.round(h * 0.14)}px rgba(255,255,255,.95))
             drop-shadow(0 1px 2px rgba(255,255,255,.9));">
    <div style="width:${fw}px;flex:0 0 auto">${svgOf(M.flag)}</div>
    <div style="flex:1">${svgOf('heatpumpdb-3a-lockup-light.svg')
      .replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '')}</div>
  </div></body>`, BADGE_W, h, badgePng);
}

/* The end card: our own frame, at the clip's own resolution. */
await raster(page, `<body style="margin:0"><div style="
    width:${W0}px;height:${H0}px;position:relative;overflow:hidden;
    background:linear-gradient(160deg,#0b2340 0%,#123a63 58%,#0d2a4a 100%);
    font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;color:#fff;-webkit-font-smoothing:antialiased">
  <div style="position:absolute;width:${W0 * 1.5}px;height:${W0 * 1.5}px;border-radius:50%;
    top:${-W0 * 0.55}px;left:${-W0 * 0.35}px;background:rgba(80,170,255,.16);filter:blur(${W0 * 0.09}px)"></div>
  <div style="position:relative;padding:0 ${W0 * 0.09}px">
    <div style="width:${W0 * 0.19}px;margin:0 auto ${H0 * 0.032}px">${svgOf(M.flag)}</div>
    <div style="font-size:${Math.round(W0 * 0.072)}px;font-weight:900;letter-spacing:-.02em;line-height:1.06">${M.line1}</div>
    <div style="font-size:${Math.round(W0 * 0.034)}px;font-weight:600;color:#a8cdf2;margin-top:${H0 * 0.016}px">${M.line2}</div>
    <div style="width:${W0 * 0.52}px;margin:${H0 * 0.055}px auto 0">${svgOf('heatpumpdb-3a-lockup-dark.svg').replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '')}</div>
    <div style="font-size:${Math.round(W0 * 0.042)}px;font-weight:800;color:#7fd4ff;margin-top:${H0 * 0.022}px;letter-spacing:.01em">${M.host}</div>
  </div>
</div></body>`, W0, H0, endPng);

await browser.close();
console.log(`artwork  flag ${flagW}×${flagH}  ·  end card ${W0}×${H0}\n`);

/* ── one pass per clip ─────────────────────────────────────────────────────
   Everything happens in a single filter graph so the clip is encoded once.
   concat needs both halves to agree on size, pixel format, frame rate and
   audio layout, so both are normalised before they meet — a mismatch there is
   the usual reason an appended end card silently drops. */
let done = 0;
for (const src of inputs) {
  const [w, h] = probe(src, 'stream=width,height').map(Number);
  const fps = probe(src, 'stream=r_frame_rate')[0] || '30/1';
  const hasAudio = probe(src, 'stream=codec_type').includes('audio');
  const out = join(OUT, `${basename(src, extname(src))} [${CC}].mp4`);

  // 가로 위치도 조정 가능해야 한다. 16:9 슬라이드물은 제목이 좌상단에서
  // 시작하는 경우가 많아, 세로만 내려서는 글자를 피하지 못한다.
  const margin = Math.round(w * Number(flag('flag-x', 0.045)));
  // 소스 클립이 상단에 자기 제목 카드를 얹고 나오는 경우가 많다. 모서리에 딱
  // 붙이면 그 제목의 첫 글자를 덮으므로, 기본값은 제목 띠 아래(높이의 11.5%)다.
  // 제목 카드가 없는 클립이면 --flag-y 0.045 로 모서리에 붙일 수 있다.
  const flagY = Math.round(h * Number(flag('flag-y', 0.115)));
  const logoX = Math.round(w * Number(flag('logo-x', 0.10)));
  const logoY = Math.round(h * Number(flag('logo-y', 0.13)));
  const badgeX = Math.round(w * Number(flag('badge-x', 0.055)));
  const badgeY = Math.round(h * Number(flag('badge-y', 0.118)));
  /* 오버레이 방식만 갈라지고, 엔드카드 이어붙이기는 항상 같다 —
     분기 안에 넣었다가 한쪽에서 [v] 가 만들어지지 않는 사고가 났다. */
  const marks = BADGE_W ? [
    `[base][2:v]overlay=x=${badgeX}:y=${badgeY}:enable='gte(t,${BADGE_FROM})'[main]`,
  ] : [
    `[2:v]scale=${flagW + 26}:-1[badge]`,
    `[base][badge]overlay=x=${margin}:y=${flagY}${LOGO_W ? '[flagged]' : '[main]'}`,
    ...(LOGO_W ? [`[flagged][4:v]overlay=x=${logoX}:y=${logoY}[main]`] : []),
  ];
  const vf = [
    `[0:v]scale=${w}:${h},fps=${fps},format=yuv420p,setsar=1[base]`,
    ...marks,
    `[1:v]scale=${w}:${h},fps=${fps},format=yuv420p,setsar=1,fade=t=in:st=0:d=0.35[end]`,
    `[main][end]concat=n=2:v=1:a=0[v]`,
  ].join(';');

  const args = [
    '-y',
    // -t before -i truncates on decode, so nothing after the cut is even read.
    ...(CUT_AT != null ? ['-t', String(CUT_AT)] : []), '-i', src,
    '-loop', '1', '-t', String(END_SECS), '-i', endPng,
    '-i', BADGE_W ? badgePng : flagPng,
    '-f', 'lavfi', '-t', String(END_SECS), '-i', 'anullsrc=r=48000:cl=stereo',
    ...(LOGO_W ? ['-i', logoPng] : []),
    '-filter_complex', hasAudio
      ? `${vf};[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];[a0][3:a]concat=n=2:v=0:a=1[a]`
      : `${vf};[3:a]anull[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    out,
  ];

  console.log(`${basename(src)}\n  ${w}×${h} @ ${fps}${hasAudio ? '' : ' · 무음 원본'}${CUT_AT != null ? ` · ${CUT_AT}초에서 잘라냄` : ''} → ${basename(out)}`);
  if (DRY) continue;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  const dur = Number(probe(out, 'format=duration')[0]).toFixed(2);
  console.log(`  ✓ ${dur}s\n`);
  done++;
}
console.log(DRY ? 'DRY RUN — nothing written.' : `${done}개 완료 → ${OUT}`);
