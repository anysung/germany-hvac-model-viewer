#!/usr/bin/env node
/**
 * build-hub-landing.mjs — generates the heatpumpdb.eu HUB landing page
 * (hub-landing/) that introduces the five country editions and routes
 * visitors (owner request 2026-07-31).
 *
 * WHY GENERATED: the page must carry the REAL brand artwork (logo + waving
 * flags come from src/components/brandSvg.ts — the single source; never
 * redrawn) and per-market QR codes (rendered here as inline SVG, no external
 * QR service, no tracking). esbuild bundles the TS module so this script can
 * import it directly.
 *
 * Output is one self-contained index.html (inline CSS/JS/SVG — no runtime
 * requests except the Inter font), plus robots.txt / sitemap.xml / favicon.
 * Deploy: npm run deploy:eu  (Firebase Hosting target "eu").
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'hub-landing');
mkdirSync(OUT, { recursive: true });

/* ── Brand artwork from the ONE source ── */
const tmp = join(ROOT, 'node_modules', '.hub-brandsvg.mjs');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  'src/components/brandSvg.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${tmp}`,
  // brandSvg's import chain reads vite-only import.meta.env — pin it for node.
  '--define:import.meta.env={"VITE_COUNTRY_CODE":"DE","VITE_APP_MODE":"app"}',
], { cwd: ROOT });
const { logoSvgDoc, flagSvgDoc } = await import(pathToFileURL(tmp).href);
rmSync(tmp, { force: true });

/* energyClass: the app's own EU-811/2013 mapping (src/hpiq/model.ts) — bundled
   the same way so the public pages can never diverge from the app. */
const tmp2 = join(ROOT, 'node_modules', '.hub-model.mjs');
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  'src/hpiq/model.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${tmp2}`,
  '--define:import.meta.env={"VITE_COUNTRY_CODE":"DE","VITE_APP_MODE":"app"}',
], { cwd: ROOT });
const { energyClass } = await import(pathToFileURL(tmp2).href);
rmSync(tmp2, { force: true });

const LOGO = logoSvgDoc('dark');                       // full lockup, dark theme

/* ── Markets (counts = data_manifests/production.json, canary-free) ── */
const MARKETS = [
  { cc: 'DE', url: 'https://www.heatpumpdb.de', host: 'heatpumpdb.de', name: 'Deutschland',
    tag: 'Die Datenbank zur BAFA-Liste — für Fachhandwerk und Planer.',
    chip: 'BAFA-Liste · KfW 458', models: '7,190' },
  { cc: 'GB', url: 'https://www.heatpumpdb.uk', host: 'heatpumpdb.uk', name: 'United Kingdom',
    tag: 'The Ofgem PEL companion for MCS installers.',
    chip: 'Ofgem PEL · BUS', models: '7,190' },
  { cc: 'FR', url: 'https://www.heatpumpdb.fr', host: 'heatpumpdb.fr', name: 'France',
    tag: 'La base de référence des PAC air/eau pour les pros RGE.',
    chip: 'Référence européenne · NF PAC', models: '7,190' },
  { cc: 'PL', url: 'https://www.heatpumpdb.pl', host: 'heatpumpdb.pl', name: 'Polska',
    tag: 'Baza pomp ciepła z potwierdzonym statusem ZUM.',
    chip: 'Lista ZUM · Czyste Powietrze', models: '9,220' },
  { cc: 'IT', url: 'https://www.heatpumpdb.it', host: 'heatpumpdb.it', name: 'Italia',
    tag: 'Il database con lo stato nel catalogo GSE (Conto Termico).',
    chip: 'Catalogo GSE · Conto Termico', models: '10,919' },
];

/* QR: dark modules, transparent bg — sits on a white tile in CSS. Medium EC
   keeps modules coarse enough to scan at ~64 px on screen. */
for (const m of MARKETS) {
  m.qr = (await QRCode.toString(m.url, {
    type: 'svg', margin: 0, errorCorrectionLevel: 'M',
    color: { dark: '#10203a', light: '#0000' },
  })).replace('<svg ', '<svg class="qr" aria-hidden="true" ');
  m.flag = flagSvgDoc(m.cc, false).replace('<svg ', '<svg class="flag" aria-hidden="true" ');
}

const FEATURES = [
  ['⚡', 'Instant model search'],
  ['⚖️', 'Compare 4 side-by-side'],
  ['📄', 'Print-ready data sheets'],
  ['🏷️', 'EU energy label sheets'],
  ['💶', 'Funding tracked monthly'],
  ['📰', 'Market news briefings'],
];

const cardHtml = (m, i) => `
      <a class="card" href="${m.url}" style="--i:${i}">
        <div class="card-top">
          ${m.flag}
          <div class="card-names">
            <span class="card-name">${m.name}</span>
            <span class="card-host">${m.host}</span>
          </div>
        </div>
        <p class="card-tag">${m.tag}</p>
        <div class="card-meta">
          <span class="chip">${m.chip}</span>
          <span class="models">${m.models} <em>models</em></span>
        </div>
        <div class="card-foot">
          <span class="cta">Open ${m.host} <span class="arr">→</span></span>
          <span class="qr-tile" title="Scan to open on your phone">${m.qr}</span>
        </div>
      </a>`;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>HeatPump DB — Europe's Registry-Based Heat Pump Database · DE / UK / FR / PL / IT</title>
<meta name="description" content="Registry-based heat pump databases for five European markets: BAFA list (Germany), Ofgem PEL (UK), Lista ZUM (Poland), GSE Conto Termico catalogue (Italy) and France. Instant search, side-by-side comparison, print-ready data sheets and monthly funding updates for installers.">
<link rel="canonical" href="https://www.heatpumpdb.eu/">
<link rel="alternate" hreflang="de-DE" href="https://www.heatpumpdb.de/">
<link rel="alternate" hreflang="en-GB" href="https://www.heatpumpdb.uk/">
<link rel="alternate" hreflang="fr-FR" href="https://www.heatpumpdb.fr/">
<link rel="alternate" hreflang="pl-PL" href="https://www.heatpumpdb.pl/">
<link rel="alternate" hreflang="it-IT" href="https://www.heatpumpdb.it/">
<link rel="alternate" hreflang="x-default" href="https://www.heatpumpdb.eu/">
<meta property="og:site_name" content="HeatPump DB">
<meta property="og:title" content="HeatPump DB — Europe's Registry-Based Heat Pump Database">
<meta property="og:description" content="One database, five markets. Every listed heat pump — searchable, comparable, printable.">
<meta property="og:url" content="https://www.heatpumpdb.eu/">
<meta property="og:type" content="website">
<link rel="icon" type="image/png" sizes="48x48" href="/appicon-48.png">
<link rel="icon" type="image/png" sizes="192x192" href="/appicon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/appicon-180.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Organization',
  name: 'HeatPump DataBase (Europe)', url: 'https://www.heatpumpdb.eu/',
  email: 'support@heatpumpdb.eu',
  sameAs: MARKETS.map(m => m.url),
})}</script>
<style>
  :root { --red:#ff6b52; --blue:#2997ff; --ink:#f5f5f7; --mut:#93a1b8; --bg:#0b1626; --card:#101f36; --line:rgba(255,255,255,.09); }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:
      radial-gradient(1100px 600px at 85% -10%, rgba(255,107,82,.13), transparent 60%),
      radial-gradient(1000px 640px at 8% 108%, rgba(41,151,255,.14), transparent 60%),
      var(--bg);
    color:var(--ink); min-height:100dvh; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1120px; margin:0 auto; padding:0 24px; }

  /* ── Hero ── */
  header { padding:clamp(48px,9vh,92px) 0 clamp(30px,5vh,52px); text-align:center; }
  .logo { width:min(300px,66vw); height:auto; margin:0 auto 30px; display:block; }
  h1 { font-size:clamp(30px,5.4vw,52px); font-weight:700; letter-spacing:-.025em; line-height:1.12; }
  h1 .grad { background:linear-gradient(92deg,var(--red),var(--blue)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .sub { max-width:640px; margin:18px auto 0; color:var(--mut); font-size:clamp(14.5px,1.7vw,17px); line-height:1.65; }
  .chips { display:flex; flex-wrap:wrap; gap:9px; justify-content:center; margin-top:26px; }
  .fchip { border:1px solid var(--line); border-radius:999px; padding:7px 15px; font-size:12.8px; color:#c7d2e2; background:rgba(255,255,255,.03); backdrop-filter:blur(6px); }

  /* ── Market grid ── */
  .sect { font-size:12.5px; font-weight:700; letter-spacing:.14em; color:var(--mut); text-transform:uppercase; text-align:center; margin:clamp(18px,4vh,40px) 0 20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; padding-bottom:26px; }
  .card { position:relative; display:flex; flex-direction:column; gap:13px; padding:24px 24px 20px; border-radius:20px;
    background:var(--card); border:1px solid var(--line); text-decoration:none; color:var(--ink); overflow:hidden;
    transition:transform .35s cubic-bezier(.2,.8,.25,1), border-color .35s, box-shadow .35s;
    animation:rise .6s cubic-bezier(.2,.8,.3,1) both; animation-delay:calc(var(--i)*70ms); }
  @keyframes rise { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
  /* cursor-following glow */
  .card::before { content:''; position:absolute; inset:0; border-radius:inherit; opacity:0; transition:opacity .35s;
    background:radial-gradient(340px 340px at var(--mx,50%) var(--my,50%), rgba(41,151,255,.13), transparent 62%); pointer-events:none; }
  .card::after { content:''; position:absolute; inset:0; border-radius:inherit; padding:1px; opacity:0; transition:opacity .35s;
    background:linear-gradient(120deg,var(--red),var(--blue)) border-box;
    -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
  .card:hover { transform:translateY(-7px); box-shadow:0 22px 48px rgba(0,0,0,.42); }
  .card:hover::before, .card:hover::after { opacity:1; }
  .card-top { display:flex; align-items:center; gap:14px; }
  .flag { width:52px; height:auto; filter:drop-shadow(0 3px 8px rgba(0,0,0,.35)); transform-origin:14% 50%; }
  .card:hover .flag { animation:sway 1.6s ease-in-out infinite; }
  @keyframes sway { 0%,100% { transform:rotate(0deg); } 50% { transform:rotate(-2.4deg); } }
  .card-names { display:flex; flex-direction:column; gap:2px; }
  .card-name { font-size:19px; font-weight:700; letter-spacing:-.01em; }
  .card-host { font-size:12px; color:var(--mut); }
  .card-tag { font-size:13.8px; line-height:1.55; color:#c7d2e2; min-height:2.9em; }
  .card-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .chip { border:1px solid var(--line); border-radius:999px; padding:4px 11px; font-size:11px; color:#aab8cc; white-space:nowrap; }
  .models { margin-left:auto; font-size:14.5px; font-weight:700; }
  .models em { font-style:normal; font-weight:500; font-size:11px; color:var(--mut); }
  .card-foot { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-top:auto; padding-top:6px; }
  .cta { font-size:13.5px; font-weight:600; color:var(--blue); }
  .arr { display:inline-block; transition:transform .3s; }
  .card:hover .arr { transform:translateX(5px); }
  .qr-tile { flex:none; width:62px; height:62px; padding:6px; border-radius:12px; background:#fff;
    opacity:.82; transition:opacity .3s, transform .3s; box-shadow:0 3px 10px rgba(0,0,0,.3); }
  .card:hover .qr-tile { opacity:1; transform:scale(1.12); }
  .qr { width:100%; height:100%; display:block; }

  /* ── Value band + footer ── */
  .band { border-top:1px solid var(--line); border-bottom:1px solid var(--line); background:rgba(255,255,255,.025);
    padding:30px 0; text-align:center; }
  .band p { max-width:680px; margin:0 auto; color:#c7d2e2; font-size:14.5px; line-height:1.7; }
  .band strong { color:var(--ink); }
  footer { padding:30px 0 46px; text-align:center; color:var(--mut); font-size:12px; line-height:1.8; }
  footer a { color:#aab8cc; text-decoration:none; margin:0 7px; }
  footer a:hover { color:var(--ink); }
  .legal { margin-top:8px; font-size:11px; color:#6d7b91; }
  @media (prefers-reduced-motion:reduce) { .card, .card:hover .flag { animation:none; } .card { transition:none; } }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      ${LOGO.replace('<svg ', '<svg class="logo" role="img" aria-label="HeatPump DB" ')}
      <h1>Every listed heat pump in Europe.<br><span class="grad">One database.</span></h1>
      <p class="sub">Registry-based technical data for installers and professionals — searchable in seconds, comparable side-by-side, printable as quote-ready data sheets. Refreshed with every monthly update.</p>
      <div class="chips">${FEATURES.map(([e, l]) => `<span class="fchip">${e}&nbsp; ${l}</span>`).join('')}</div>
    </header>

    <div class="sect">Choose your market</div>
    <div class="grid" id="grid">${MARKETS.map(cardHtml).join('')}
    </div>
  </div>

  <div class="band">
    <p><strong>Built for daily installer work.</strong> Official listing status on every product, the EU energy label one click away, and the month's funding changes already summarised when you open the app. Professional &amp; Team subscriptions — the free first week is included with every new account.</p>
  </div>

  <footer>
    <div>${MARKETS.map(m => `<a href="${m.url}">${m.host}</a>`).join(' · ')}</div>
    <div><a href="mailto:support@heatpumpdb.eu">support@heatpumpdb.eu</a> · <a href="/models/">Model index</a></div>
    <div class="legal">© ${new Date().getFullYear()} HeatPump DataBase (Europe)™ · Product data is provided for information — verify against official sources before contractual use.</div>
  </footer>

<script>
  // Cursor-following glow per card (sets the radial-gradient origin).
  document.getElementById('grid').addEventListener('pointermove', e => {
    for (const c of e.currentTarget.children) {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }
  });
</script>
</body>
</html>
`;

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC MODEL INDEX — the "bait-level" SEO list (owner decision 2026-08-01).

   Strategy (recorded in the decision thread): expose ONLY six already-public
   facts per model (manufacturer · model · rated capacity · SCOP · refrigerant
   · EU energy class) for ~3–5% of the canonical catalogue, selected by a
   brand-power-law heuristic (top manufacturers by catalogue presence, their
   best complete models). NO listing status — that stays behind the account,
   both as the compliance-safe choice and as the reason to sign up. Pages are
   invisible in every app UI; discovery is this generator's sitemap + one
   low-profile hub-footer link + model-to-model interlinks (orphan pages do
   not rank; cloaking is never used). Phase 2 grows the set quarterly from
   our own search analytics, capped at ~10%.
   ══════════════════════════════════════════════════════════════════════════ */

const REG_OPEN = false;   // flip when registration reopens — changes CTA copy only
const TARGET = 300;       // ≈4% of the canonical 7,190
const TOP_MFRS = 12;

const canonical = [
  ...JSON.parse(readFileSync(join(ROOT, 'public/data/products.json'), 'utf8')).items,
  ...JSON.parse(readFileSync(join(ROOT, 'public/data/products-commercial.json'), 'utf8')).items,
];
const snapshotDate = JSON.parse(readFileSync(join(ROOT, 'public/data/products.json'), 'utf8'))._meta.generated.slice(0, 10);

/* Complete = all six public fields present. */
const complete = canonical.filter(x =>
  (x.manufacturer_short ?? x.manufacturer) && x.model &&
  (x.power_35C_kw ?? x.power_55C_kw) && x.scop && x.refrigerant && x.efficiency_35C_percent);

/* Brand power law: rank manufacturers by catalogue presence, take the top 12,
   then allocate the ~300 slots proportionally (min 8 each), best-SCOP first. */
const byMfr = new Map();
for (const x of complete) {
  const m = x.manufacturer_short ?? x.manufacturer;
  (byMfr.get(m) ?? byMfr.set(m, []).get(m)).push(x);
}
const ranked = [...byMfr.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, TOP_MFRS);
const totalTop = ranked.reduce((n, [, v]) => n + v.length, 0);
const picked = [];
for (const [mfr, items] of ranked) {
  const quota = Math.max(8, Math.round(TARGET * items.length / totalTop));
  const seen = new Set();
  const best = items
    .sort((a, b) => (b.scop ?? 0) - (a.scop ?? 0))
    .filter(x => { const k = x.model; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, quota);
  picked.push(...best.map(x => ({ x, mfr })));
}
picked.length = Math.min(picked.length, 340);

const slugOf = ({ x, mfr }) =>
  `${mfr}-${x.model}`.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) + '-' + String(x.source_id).slice(-4);

const models = picked.map(pk => ({
  slug: slugOf(pk),
  mfr: pk.mfr,
  model: pk.x.model,
  kw: (pk.x.power_35C_kw ?? pk.x.power_55C_kw).toFixed(1),
  scop: Number(pk.x.scop).toFixed(2),
  ref: String(pk.x.refrigerant),
  cls: energyClass(pk.x.efficiency_35C_percent),
}));
const bySlug = new Map(models.map(m => [m.slug, m]));
if (bySlug.size !== models.length) throw new Error('slug collision');

mkdirSync(join(OUT, 'models'), { recursive: true });

const pageShell = (title, desc, canonicalPath, body, ld) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="https://www.heatpumpdb.eu${canonicalPath}">
<link rel="icon" type="image/png" sizes="48x48" href="/appicon-48.png">
<link rel="icon" type="image/png" sizes="192x192" href="/appicon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/appicon-180.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>
  :root { --red:#ff6b52; --blue:#2997ff; --ink:#f5f5f7; --mut:#93a1b8; --bg:#0b1626; --card:#101f36; --line:rgba(255,255,255,.09); }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--ink); min-height:100dvh; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:880px; margin:0 auto; padding:34px 22px 60px; }
  a { color:var(--blue); text-decoration:none; }
  .crumb { font-size:12.5px; color:var(--mut); margin-bottom:22px; display:block; }
  h1 { font-size:clamp(22px,4.5vw,32px); font-weight:700; letter-spacing:-.02em; line-height:1.2; }
  .mfr { color:var(--mut); font-size:14px; margin-top:4px; }
  table { width:100%; border-collapse:collapse; margin:26px 0 8px; background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  th, td { text-align:left; padding:13px 16px; font-size:14px; border-bottom:1px solid var(--line); }
  th { color:var(--mut); font-weight:500; width:44%; }
  tr:last-child th, tr:last-child td { border-bottom:none; }
  .snap { font-size:11.5px; color:var(--mut); }
  .cta { margin:30px 0 10px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:22px; }
  .cta h2 { font-size:16.5px; margin-bottom:8px; }
  .cta p { font-size:13.5px; color:#c7d2e2; line-height:1.6; }
  .mgrid { display:flex; flex-wrap:wrap; gap:9px; margin-top:14px; }
  .mbtn { border:1px solid var(--line); border-radius:999px; padding:8px 16px; font-size:13px; color:var(--ink); background:rgba(255,255,255,.04); }
  .mbtn:hover { border-color:var(--blue); }
  .rel { margin-top:30px; }
  .rel h3 { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); margin-bottom:10px; }
  .rel a { display:inline-block; margin:0 12px 8px 0; font-size:13.5px; }
  ul.idx { list-style:none; column-width:260px; column-gap:28px; margin-top:20px; }
  ul.idx li { margin-bottom:9px; font-size:14px; break-inside:avoid; }
  ul.idx small { color:var(--mut); }
  footer { margin-top:44px; font-size:11.5px; color:var(--mut); line-height:1.7; }
</style>
</head>
<body><div class="wrap">
<a class="crumb" href="/">HeatPump DB</a> ${body}
<footer>Data from official European registry sources · snapshot ${snapshotDate} · Listing status, full specifications, comparison and data sheets are available in the app.<br>© ${new Date().getFullYear()} HeatPump DataBase (Europe)™ · <a href="mailto:support@heatpumpdb.eu">support@heatpumpdb.eu</a></footer>
</div></body></html>
`;

const ctaBlock = `
<div class="cta">
  <h2>Full specification, comparison and print-ready data sheets</h2>
  <p>${REG_OPEN
    ? 'Every new account includes a free first week with full access — official listing status, complete performance tables, 4-model comparison and quote-ready PDF data sheets. Choose your market to get started:'
    : 'Official listing status, complete performance tables, 4-model comparison and quote-ready PDF data sheets live in the app. Registration reopens shortly — the free first week will be included with every new account. Choose your market:'}</p>
  <div class="mgrid">${MARKETS.map(m => `<a class="mbtn" href="${m.url}">${m.name} — ${m.host}</a>`).join('')}</div>
</div>`;

models.forEach((m, i) => {
  const prev = models[(i - 1 + models.length) % models.length];
  const next = models[(i + 1) % models.length];
  const same = models.filter(o => o.mfr === m.mfr && o.slug !== m.slug).slice(0, 6);
  const title = `${m.mfr} ${m.model} — heat pump specifications | HeatPump DB`;
  const desc = `${m.mfr} ${m.model}: rated capacity ${m.kw} kW, SCOP ${m.scop}, refrigerant ${m.ref}, EU energy class ${m.cls}. Registry-based data — full specification and listing status in the HeatPump DB app.`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: `${m.mfr} ${m.model}`, brand: { '@type': 'Brand', name: m.mfr },
    category: 'Air-to-water heat pump',
  };
  const body = `
<h1>${m.mfr} ${m.model}</h1>
<div class="mfr">Air/water heat pump · registry-based reference data</div>
<table>
  <tr><th>Manufacturer</th><td>${m.mfr}</td></tr>
  <tr><th>Model</th><td>${m.model}</td></tr>
  <tr><th>Rated heating capacity</th><td>${m.kw} kW</td></tr>
  <tr><th>SCOP (seasonal COP)</th><td>${m.scop}</td></tr>
  <tr><th>Refrigerant</th><td>${m.ref}</td></tr>
  <tr><th>EU energy class (W35)</th><td>${m.cls}</td></tr>
</table>
<span class="snap">Snapshot ${snapshotDate} — verify against official sources before contractual use.</span>
${ctaBlock}
<div class="rel"><h3>More ${m.mfr} models</h3>${same.map(o => `<a href="/models/${o.slug}.html">${o.model}</a>`).join('')}</div>
<div class="rel"><h3>Browse</h3><a href="/models/">All indexed models</a> · <a href="/models/${prev.slug}.html">‹ ${prev.model}</a> · <a href="/models/${next.slug}.html">${next.model} ›</a></div>`;
  writeFileSync(join(OUT, 'models', `${m.slug}.html`), pageShell(title, desc, `/models/${m.slug}.html`, body, ld));
});

/* Index page — grouped by manufacturer. */
const groups = [...new Set(models.map(m => m.mfr))].map(mfr => ({
  mfr, items: models.filter(m => m.mfr === mfr),
}));
const idxBody = `
<h1>Heat pump model index</h1>
<div class="mfr">${models.length} selected models from the European catalogue · basic reference data only</div>
${ctaBlock}
${groups.map(g => `<div class="rel"><h3>${g.mfr} (${g.items.length})</h3><ul class="idx">${g.items.map(m =>
  `<li><a href="/models/${m.slug}.html">${m.model}</a> <small>· ${m.kw} kW · ${m.cls}</small></li>`).join('')}</ul></div>`).join('')}`;
writeFileSync(join(OUT, 'models', 'index.html'),
  pageShell(`Heat pump model index — ${models.length} models | HeatPump DB`,
    `Reference index of ${models.length} air/water heat pump models: rated capacity, SCOP, refrigerant and EU energy class. Full specifications in the HeatPump DB app.`,
    '/models/', idxBody, null));

/* robots: search engines welcome, AI-training crawlers opted out (consistent
   with the country sites' protected-database posture). */
const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web',
  'anthropic-ai', 'CCBot', 'Google-Extended', 'Applebot-Extended',
  'PerplexityBot', 'Bytespider', 'meta-externalagent', 'cohere-ai'];
writeFileSync(join(OUT, 'robots.txt'),
  'User-agent: *\nAllow: /\n\n'
  + AI_CRAWLERS.map(ua => `User-agent: ${ua}\nDisallow: /\n`).join('\n')
  + '\nSitemap: https://www.heatpumpdb.eu/sitemap.xml\n');

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + `  <url><loc>https://www.heatpumpdb.eu/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>\n`
  + `  <url><loc>https://www.heatpumpdb.eu/models/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>\n`
  + models.map(m => `  <url><loc>https://www.heatpumpdb.eu/models/${m.slug}.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>`).join('\n')
  + `\n</urlset>\n`);

writeFileSync(join(OUT, 'index.html'), HTML);
/* Generic app icon (no flag — pan-market hub identity). Lives with every other
   market's icons at public/icons/eu-<size>.png (owner convention call,
   2026-08-01); masters in brand-assets/ (…appicon-navy*). Composed from
   brandSvg arc geometry + BRAND_COLORS — never hand-drawn. */
for (const [src, dst] of [['eu-48.png', 'appicon-48.png'], ['eu-192.png', 'appicon-192.png'],
  ['eu-180.png', 'appicon-180.png'], ['eu-512.png', 'appicon-512.png']]) {
  copyFileSync(join(ROOT, 'public/icons', src), join(OUT, dst));
}
console.log(`hub-landing/ 생성 완료 — index ${(HTML.length / 1024).toFixed(0)}kB · 모델 페이지 ${models.length}개 (${[...new Set(models.map(m => m.mfr))].length}개 제조사, 스냅샷 ${snapshotDate})`);
