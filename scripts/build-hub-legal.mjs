#!/usr/bin/env node
/**
 * build-hub-legal.mjs — publish the policy documents on the EU hub.
 *
 * WHY THE HUB NEEDS THEM
 * Google requires an app's privacy policy to live on the SAME domain as the
 * homepage it declares on the OAuth consent screen. Ours declared
 * heatpumpdb.eu as the homepage while the policies existed only on the market
 * sites, so brand verification kept failing (2026-08-13) — and, verification
 * aside, a hub that presents itself as the European home of the product should
 * carry the operator's legal identity rather than point at Germany for it.
 *
 * ONE SOURCE OF TRUTH
 * The text is NOT rewritten here. It is read from src/legal/legalContent.ts —
 * the same module the app renders — via esbuild, so a wording or version change
 * lands on the hub and in the app together. English is used: the hub's own
 * copy is English-first, and the identity facts (operator, address,
 * registration number, merchant of record) are never translated anyway.
 *
 * Run:  node scripts/build-hub-legal.mjs            (after build-hub-landing)
 * Out:  hub-landing/{privacy,terms,refund-policy,imprint}/index.html
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'hub-landing');
const TMP = join(ROOT, '.hub-legal-bundle.mjs');

/* The legal module imports app types and market config; bundling resolves the
   lot without pulling React in (the content module is data only). */
await build({
  entryPoints: [join(ROOT, 'src', 'legal', 'legalContent.ts')],
  outfile: TMP,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { LEGAL_CONTENT } = await import(pathToFileURL(TMP).href);
rmSync(TMP, { force: true });

const DOCS = {
  privacy: { slug: 'privacy', nav: 'Privacy' },
  terms: { slug: 'terms', nav: 'Terms' },
  refund: { slug: 'refund-policy', nav: 'Refunds' },
  imprint: { slug: 'imprint', nav: 'Legal Notice' },
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bare email addresses and URLs in the source text become real links. */
const linkify = (s) => esc(s)
  .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>')
  .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" rel="noopener">$1</a>');

const page = (doc, content) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(content.title)} · HeatPump DB</title>
<meta name="description" content="${esc(content.title)} — HeatPump DataBase (Europe).">
<link rel="canonical" href="https://www.heatpumpdb.eu/${DOCS[doc].slug}/">
<link rel="icon" href="/favicon.ico?v=2026-08" sizes="any">
<link rel="icon" type="image/png" sizes="48x48" href="/appicon-48.png?v=2026-08">
<style>
  :root { --ink:#0f172a; --mut:#5b6a7f; --line:#e4e9f0; --blue:#2997ff; --bg:#f6f8fb; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--ink); font:16px/1.7 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased; }
  .top { background:#0b1626; border-bottom:1px solid rgba(255,255,255,.08); }
  .top .in { max-width:820px; margin:0 auto; padding:16px 22px; display:flex; align-items:center; gap:14px; }
  .top a.brand { color:#fff; font-weight:700; font-size:16px; text-decoration:none; letter-spacing:-.01em; }
  .top a.brand em { color:var(--blue); font-style:normal; }
  .top nav { margin-left:auto; display:flex; gap:14px; }
  .top nav a { color:#9fb0c6; font-size:13px; text-decoration:none; }
  .top nav a:hover, .top nav a[aria-current] { color:#fff; }
  main { max-width:820px; margin:0 auto; padding:38px 22px 70px; }
  h1 { font-size:clamp(26px,4vw,34px); font-weight:700; letter-spacing:-.5px; margin-bottom:6px; }
  .upd { color:var(--mut); font-size:12.5px; margin-bottom:26px; }
  .intro { font-size:15.5px; color:#334155; margin-bottom:28px; }
  section { margin-bottom:26px; }
  h2 { font-size:17px; font-weight:700; margin-bottom:8px; }
  section p { font-size:15px; color:#334155; margin-bottom:9px; }
  a { color:#0066cc; }
  footer { border-top:1px solid var(--line); margin-top:34px; padding-top:18px; color:var(--mut); font-size:12px; line-height:1.9; }
  footer a { color:var(--mut); margin-right:10px; }
</style>
</head>
<body>
  <div class="top"><div class="in">
    <a class="brand" href="/">HeatPump <em>DB</em></a>
    <nav>${Object.entries(DOCS).map(([k, d]) =>
      `<a href="/${d.slug}/"${k === doc ? ' aria-current="page"' : ''}>${d.nav}</a>`).join('')}</nav>
  </div></div>
  <main>
    <h1>${esc(content.title)}</h1>
    <p class="upd">Last updated: ${esc(content.updated)}</p>
    ${content.intro ? `<p class="intro">${linkify(content.intro)}</p>` : ''}
    ${content.sections.map((s) => `<section>
      <h2>${esc(s.h)}</h2>
      ${s.p.map((t) => `<p>${linkify(t)}</p>`).join('')}
    </section>`).join('')}
    <footer>
      <div>${Object.values(DOCS).map((d) => `<a href="/${d.slug}/">${d.nav}</a>`).join('')}</div>
      <div>© ${new Date().getFullYear()} HeatPump DataBase (Europe)™ · <a href="mailto:support@heatpumpdb.eu">support@heatpumpdb.eu</a></div>
    </footer>
  </main>
</body>
</html>
`;

if (!existsSync(OUT)) {
  console.error('hub-landing/ missing — run scripts/build-hub-landing.mjs first');
  process.exit(1);
}

for (const [doc, { slug }] of Object.entries(DOCS)) {
  const content = LEGAL_CONTENT.en[doc];
  if (!content) { console.error(`no English content for ${doc}`); process.exit(1); }
  mkdirSync(join(OUT, slug), { recursive: true });
  writeFileSync(join(OUT, slug, 'index.html'), page(doc, content));
  console.log(`  /${slug}/  ${content.sections.length} sections · updated ${content.updated}`);
}
console.log(`hub legal pages: ${Object.keys(DOCS).length} written (source: src/legal/legalContent.ts)`);
