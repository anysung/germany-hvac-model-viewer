#!/usr/bin/env node
/**
 * export-brand-logo.mjs — transparent PNG/WebP exports of the brand mark.
 *
 * ONE SOURCE, ALWAYS. The artwork comes from src/components/brandSvg.ts, the
 * same module the React components and the PDF data sheet read. Nothing here
 * redraws anything: the SVG is rendered at size and screenshotted with the
 * background omitted, so an export can never drift from what the app shows.
 * (The PDF once shipped a hand-drawn mark and a square flag for exactly the
 * lack of a step like this — CLAUDE.md.)
 *
 * WHAT COMES OUT
 *   lockup  — mark + "HeatPump DB" wordmark, 348:64
 *   symbol  — the mark alone, square
 * each in two inks:
 *   on-dark  — light ink (#f5f5f7), for placing ON dark backgrounds
 *   on-light — dark ink (#1d1d1f), for placing ON light backgrounds
 *
 * Both are transparent. "On dark" does NOT mean it carries a dark background —
 * it means the artwork is inked to sit on one.
 *
 * The wordmark font (Inter 600) is embedded in the SVG as a woff2 data URI by
 * brandSvg.ts, so the text renders identically headless and needs no local font.
 *
 * Run:  node scripts/marketing/export-brand-logo.mjs [--out <dir>]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOut = process.argv.indexOf('--out');
const OUT = argOut >= 0 ? process.argv[argOut + 1] : join(ROOT, 'brand-out');

/* Bundle the TS source so node can import it (vite-only import.meta.env pinned). */
const tmp = join(ROOT, 'node_modules', '.brandlogo.mjs');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  'src/components/brandSvg.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${tmp}`,
  '--define:import.meta.env={"VITE_COUNTRY_CODE":"DE","VITE_APP_MODE":"app"}',
], { cwd: ROOT, stdio: 'pipe' });
const { logoSvgDoc, LOGO_ASPECT } = await import(pathToFileURL(tmp).href);

/** theme -> the background the artwork is MEANT to sit on. */
const INKS = [
  { theme: 'dark', name: 'on-dark' },   // light ink
  { theme: 'light', name: 'on-light' }, // dark ink
];
const LOCKUP_WIDTHS = [512, 1024, 2048];
const SYMBOL_SIZES = [256, 512, 1024];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const made = [];

async function shoot(svg, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  // No page background at all — omitBackground then yields true alpha.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`,
    { waitUntil: 'networkidle' },
  );
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
}

for (const { theme, name } of INKS) {
  for (const w of LOCKUP_WIDTHS) {
    const h = Math.round(w / LOGO_ASPECT);
    const png = join(OUT, `heatpumpdb-lockup-${name}-${w}.png`);
    await shoot(logoSvgDoc(theme, false), w, h, png);
    made.push(png);
  }
  for (const s of SYMBOL_SIZES) {
    const png = join(OUT, `heatpumpdb-symbol-${name}-${s}.png`);
    await shoot(logoSvgDoc(theme, true), s, s, png);
    made.push(png);
  }
}
await browser.close();

/* WebP alongside every PNG. -exact keeps the RGB of fully transparent pixels
   from being rewritten, which otherwise leaves a halo when the file is later
   composited onto a different background. */
for (const png of [...made]) {
  const webp = png.replace(/\.png$/, '.webp');
  execFileSync('cwebp', ['-quiet', '-exact', '-alpha_q', '100', '-q', '95', png, '-o', webp]);
  made.push(webp);
}

/* Also drop the SVGs — they are the real master; the rasters are conveniences. */
for (const { theme, name } of INKS) {
  const lock = join(OUT, `heatpumpdb-lockup-${name}.svg`);
  const sym = join(OUT, `heatpumpdb-symbol-${name}.svg`);
  writeFileSync(lock, logoSvgDoc(theme, false));
  writeFileSync(sym, logoSvgDoc(theme, true));
  made.push(lock, sym);
}

unlinkSync(tmp);
console.log(`brand logo exports → ${OUT}`);
for (const f of made.sort()) {
  console.log(`  ${(statSync(f).size / 1024).toFixed(1).padStart(7)} kB  ${f.split('/').pop()}`);
}
