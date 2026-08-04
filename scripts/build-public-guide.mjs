#!/usr/bin/env node
/**
 * build-public-guide.mjs — the PUBLIC, crawlable funding guide (one page per
 * market), emitted into each market's dist folder after `vite build`.
 *
 * WHY THIS EXISTS (SEO assessment, 2026-08-04)
 * The country sites are SPAs behind a sign-in wall: the served HTML carries a
 * title and nothing else, so Google has ~0 indexable text and the sitemap
 * lists exactly one URL. That is why "heat pump database" ranks (it matches
 * the <title>) while "heat pump poland" cannot — there is no country content
 * to rank. Meanwhile competitors rank for the same intent with 12–75 models
 * simply because their pages are public HTML; we hold 7,190 and publish none.
 *
 * WHAT IT PUBLISHES — and what it deliberately does NOT
 * Only the funding guidance we author ourselves: the journey steps and the
 * homeowner/installer Q&A already written in src/hpiq/i18n.ts. It publishes
 * NO product data, so the protected-database posture and the ~10% catalogue
 * exposure ceiling are untouched. The in-app guide stays the richer surface
 * (live programme list, per-market policy items); this is the public excerpt
 * that earns the click.
 *
 * HOW IT IS SAFE
 * Pure build-time file generation, no runtime code and no app changes: if this
 * script never ran, the sites behave exactly as before. Firebase Hosting
 * serves real files before the SPA `**` rewrite, so /guide/ resolves to this
 * page while every SPA route keeps working. `guide` is in-app view state, not
 * a URL route, so there is no collision.
 *
 * Run:  node scripts/build-public-guide.mjs <MARKET> <outDir>
 *       (wired into every `npm run build:<market>`)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MARKET = (process.argv[2] || 'DE').toUpperCase();
const OUT_DIR = process.argv[3] || join(ROOT, 'dist');

/* ── Market presentation ──────────────────────────────────────────────────
 * `search` carries BOTH spellings of the English term ("heat pump" and
 * "heatpump") plus the local one, because searchers use all three and a page
 * only ranks for words it actually contains. They appear inside real
 * sentences — never as a keyword list. */
const MARKETS = {
  DE: {
    lang: 'de', hreflang: 'de-DE', host: 'https://www.heatpumpdb.de',
    country: 'Deutschland', countryEn: 'Germany',
    local: 'Wärmepumpe', localPlural: 'Wärmepumpen',
    programme: 'BEG / KfW 458',
    title: 'Wärmepumpen-Förderung in Deutschland 2026 — BEG, KfW 458, BAFA-Liste',
    desc: 'Wie die Wärmepumpen-Förderung in Deutschland Schritt für Schritt läuft: BEG-Einzelmaßnahmen, KfW-458-Antrag, BAFA-Liste und die Nachweise. Praxisleitfaden für Fachhandwerk und Eigentümer — heat pump funding Germany.',
    intro: 'Dieser Leitfaden erklärt die Wärmepumpen-Förderung in Deutschland (heat pump funding in Germany) von der ersten Beratung bis zur Auszahlung — für Fachhandwerk und für Eigentümer. Die Angaben sind redaktionell aufbereitet; verbindlich sind immer die offiziellen Quellen.',
    ctaTitle: 'Alle förderfähigen Wärmepumpen vergleichen',
    ctaBody: 'Die vollständige Datenbank mit BAFA-Listenstatus, SCOP, Schallleistung, Kältemittel und druckfertigen Datenblättern steht nach der kostenlosen Registrierung bereit — 7 Tage voller Zugang, keine Kreditkarte erforderlich.',
    ctaBtn: 'Kostenlos registrieren',
    backLabel: 'Zur Wärmepumpen-Datenbank',
    sourceNote: 'Redaktioneller Leitfaden, keine Rechts- oder Förderberatung. Maßgeblich sind BAFA, KfW und die geltenden Förderrichtlinien.',
  },
  GB: {
    lang: 'en', hreflang: 'en-GB', host: 'https://www.heatpumpdb.uk',
    country: 'the United Kingdom', countryEn: 'UK',
    local: 'heat pump', localPlural: 'heat pumps',
    programme: 'Boiler Upgrade Scheme (BUS)',
    title: 'Heat Pump Grants in the UK 2026 — Boiler Upgrade Scheme, MCS, PEL',
    desc: 'How heat pump funding works in the UK step by step: Boiler Upgrade Scheme (BUS) grants, MCS certification, the Ofgem product eligibility list and the paperwork. A practical heatpump guide for installers and homeowners.',
    intro: 'This guide explains how heat pump funding works in the United Kingdom — from the first survey to the grant payment — for installers and for homeowners. It is editorial guidance; the official sources always prevail.',
    ctaTitle: 'Compare every listed heat pump',
    ctaBody: 'The full database — PEL listing status, SCOP, sound power, refrigerant and quote-ready data sheets — opens after a free sign-up: 7 days of full access, no credit card required.',
    ctaBtn: 'Join free',
    backLabel: 'To the heat pump database',
    sourceNote: 'Editorial guidance, not legal or grant advice. Ofgem, MCS and the current scheme rules prevail.',
  },
  FR: {
    lang: 'fr', hreflang: 'fr-FR', host: 'https://www.heatpumpdb.fr',
    country: 'France', countryEn: 'France',
    local: 'pompe à chaleur', localPlural: 'pompes à chaleur',
    programme: "MaPrimeRénov' / CEE",
    title: "Aides pompe à chaleur en France 2026 — MaPrimeRénov', CEE, RGE",
    desc: "Comment fonctionnent les aides pour une pompe à chaleur en France, étape par étape : MaPrimeRénov', CEE, artisan RGE et les justificatifs. Guide pratique installateurs et particuliers — heat pump funding France.",
    intro: "Ce guide explique les aides à l'installation d'une pompe à chaleur en France (heat pump funding in France), du premier rendez-vous au versement — pour les installateurs comme pour les particuliers. Contenu éditorial : les sources officielles font foi.",
    ctaTitle: 'Comparer toutes les pompes à chaleur référencées',
    ctaBody: "La base complète — SCOP, puissance acoustique, fluide frigorigène et fiches techniques prêtes pour le devis — s'ouvre après une inscription gratuite : 7 jours d'accès complet, sans carte bancaire.",
    ctaBtn: 'Inscription gratuite',
    backLabel: 'Vers la base de données',
    sourceNote: "Guide éditorial, ni conseil juridique ni décision d'aide. Les sources officielles prévalent.",
  },
  PL: {
    lang: 'pl', hreflang: 'pl-PL', host: 'https://www.heatpumpdb.pl',
    country: 'Polsce', countryEn: 'Poland',
    local: 'pompa ciepła', localPlural: 'pompy ciepła',
    programme: 'Czyste Powietrze / lista ZUM',
    title: 'Dofinansowanie do pompy ciepła w Polsce 2026 — Czyste Powietrze, lista ZUM',
    desc: 'Jak krok po kroku działa dofinansowanie do pompy ciepła w Polsce: Czyste Powietrze, lista ZUM, wymagane dokumenty i rozliczenie. Praktyczny przewodnik dla instalatorów i właścicieli — heat pump funding Poland.',
    intro: 'Ten przewodnik wyjaśnia, jak działa dofinansowanie do pompy ciepła w Polsce (heat pump funding in Poland) — od pierwszej rozmowy po wypłatę — dla instalatorów i dla właścicieli domów. To materiał redakcyjny; rozstrzygające są źródła oficjalne.',
    ctaTitle: 'Porównaj wszystkie pompy ciepła z bazy',
    ctaBody: 'Pełna baza — status na liście ZUM, SCOP, moc akustyczna, czynnik chłodniczy i karty danych gotowe do oferty — otwiera się po bezpłatnej rejestracji: 7 dni pełnego dostępu, bez karty płatniczej.',
    ctaBtn: 'Dołącz za darmo',
    backLabel: 'Do bazy pomp ciepła',
    sourceNote: 'Przewodnik redakcyjny, nie porada prawna ani dotycząca dotacji. Rozstrzygające są źródła oficjalne.',
  },
  IT: {
    lang: 'it', hreflang: 'it-IT', host: 'https://www.heatpumpdb.it',
    country: 'Italia', countryEn: 'Italy',
    local: 'pompa di calore', localPlural: 'pompe di calore',
    programme: 'Conto Termico / GSE',
    title: 'Incentivi pompa di calore in Italia 2026 — Conto Termico, catalogo GSE',
    desc: 'Come funzionano gli incentivi per la pompa di calore in Italia passo dopo passo: Conto Termico, catalogo GSE, documenti e rendicontazione. Guida pratica per installatori e proprietari — heat pump funding Italy.',
    intro: 'Questa guida spiega come funzionano gli incentivi per una pompa di calore in Italia (heat pump funding in Italy), dal primo sopralluogo all’erogazione — per installatori e per proprietari. È materiale redazionale: prevalgono sempre le fonti ufficiali.',
    ctaTitle: 'Confronta tutte le pompe di calore in catalogo',
    ctaBody: 'Il database completo — stato nel catalogo GSE, SCOP, potenza sonora, refrigerante e schede tecniche pronte per il preventivo — si apre dopo la registrazione gratuita: 7 giorni di accesso completo, senza carta di credito.',
    ctaBtn: 'Registrati gratis',
    backLabel: 'Al database delle pompe di calore',
    sourceNote: 'Guida redazionale, non consulenza legale né sugli incentivi. Prevalgono le fonti ufficiali.',
  },
};

const M = MARKETS[MARKET];
if (!M) { console.error(`build-public-guide: unknown market ${MARKET}`); process.exit(0); }

/* ── Load the guide copy from the app dictionary (single source of truth) ── */
// tr() picks the dictionary from ACTIVE_COUNTRY, which is resolved from
// VITE_COUNTRY_CODE at BUILD time — so the market must be defined here or
// every edition would emit the German copy.
const tmp = join(ROOT, 'node_modules', `.public-guide-i18n-${MARKET}.mjs`);
await build({
  entryPoints: [join(ROOT, 'src/hpiq/i18n.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'silent',
  define: {
    'import.meta.env': JSON.stringify({ DEV: false, PROD: true, VITE_COUNTRY_CODE: MARKET }),
  },
  external: ['firebase', 'firebase/*'],
}).catch(err => { console.error('build-public-guide: i18n bundle failed', err.message); process.exit(0); });

const i18n = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
const LANG = { DE: 'de', GB: 'en', FR: 'fr', PL: 'pl', IT: 'it' }[MARKET];
const T = typeof i18n.tr === 'function' ? i18n.tr(LANG) : null;
if (!T || !T.guide) { console.error('build-public-guide: guide copy not found — skipping'); process.exit(0); }
if (!String(T.locale || '').startsWith(LANG)) {
  console.error(`build-public-guide: ${MARKET} resolved to ${T.locale} — market dictionary missing, skipping`);
  process.exit(0);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const G = T.guide;
const steps = (arr) => (Array.isArray(arr) ? arr : []);
const faqs = (arr) => (Array.isArray(arr) ? arr : []);

const stepsPro = steps(G.stepsPro);
const stepsHome = steps(G.stepsHome);
const faqsHome = faqs(G.faqsHome);
const faqsPro = faqs(G.faqsPro);

/* ── FAQPage structured data: the Q&A is genuine on-page content, so the
 *    markup describes what a visitor actually reads (Google's requirement). */
const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [...faqsHome, ...faqsPro].map(([q, a]) => ({
    '@type': 'Question',
    name: String(q),
    acceptedAnswer: { '@type': 'Answer', text: String(a) },
  })),
};
const articleLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: M.title,
  inLanguage: M.hreflang,
  description: M.desc,
  author: { '@type': 'Organization', name: 'HeatPump DataBase (Europe)' },
  publisher: { '@type': 'Organization', name: 'HeatPump DataBase (Europe)' },
  dateModified: new Date().toISOString().slice(0, 10),
  mainEntityOfPage: `${M.host}/guide/`,
};

const stepList = (title, arr) => !arr.length ? '' : `
  <section class="block">
    <h2>${esc(title)}</h2>
    <ol class="steps">
      ${arr.map(([n, h, p]) => `<li><span class="n">${esc(n)}</span><div><strong>${esc(h)}</strong><p>${esc(p)}</p></div></li>`).join('\n      ')}
    </ol>
  </section>`;

const faqList = (title, arr) => !arr.length ? '' : `
  <section class="block">
    <h2>${esc(title)}</h2>
    ${arr.map(([q, a]) => `<div class="qa"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n    ')}
  </section>`;

const hreflangs = Object.entries(MARKETS)
  .map(([, x]) => `<link rel="alternate" hreflang="${x.hreflang}" href="${x.host}/guide/" />`)
  .join('\n  ');

const HTML = `<!doctype html>
<html lang="${M.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(M.title)} | HeatPump DB</title>
<meta name="description" content="${esc(M.desc)}">
<link rel="canonical" href="${M.host}/guide/">
${hreflangs}
<link rel="alternate" hreflang="x-default" href="https://www.heatpumpdb.de/guide/" />
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(M.title)}">
<meta property="og:description" content="${esc(M.desc)}">
<meta property="og:url" content="${M.host}/guide/">
<script type="application/ld+json">${JSON.stringify(articleLd)}</script>
${faqLd.mainEntity.length ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ''}
<style>
  :root { --ink:#1d1d1f; --mut:#6b6b70; --line:#e6e6e9; --blue:#0066cc; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif; color:var(--ink); background:#fff; -webkit-font-smoothing:antialiased; line-height:1.6; }
  .wrap { max-width:820px; margin:0 auto; padding:28px 20px 64px; }
  a { color:var(--blue); text-decoration:none; }
  .crumb { font-size:13px; color:var(--mut); display:inline-block; margin-bottom:22px; }
  h1 { font-size:clamp(25px,4.6vw,36px); line-height:1.22; letter-spacing:-.02em; }
  .lede { margin-top:14px; font-size:16px; color:#3a3a3e; }
  .block { margin-top:38px; }
  h2 { font-size:21px; letter-spacing:-.01em; margin-bottom:14px; }
  h3 { font-size:15.5px; margin-bottom:5px; }
  .qa { padding:14px 0; border-bottom:1px solid var(--line); }
  .qa p { font-size:14.5px; color:#3a3a3e; }
  .steps { list-style:none; display:flex; flex-direction:column; gap:12px; }
  .steps li { display:flex; gap:13px; align-items:flex-start; }
  .steps .n { flex:none; width:26px; height:26px; border-radius:50%; background:#eef4ff; color:#0055aa; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; }
  .steps p { font-size:14.5px; color:#3a3a3e; }
  .cta { margin-top:40px; border:1px solid var(--line); border-radius:16px; padding:22px; background:#f7f9fc; }
  .cta h2 { margin-bottom:8px; }
  .cta p { font-size:14.5px; color:#3a3a3e; }
  .btn { display:inline-block; margin-top:14px; background:var(--blue); color:#fff; border-radius:999px; padding:11px 22px; font-size:14.5px; font-weight:600; }
  footer { margin-top:40px; padding-top:18px; border-top:1px solid var(--line); font-size:12px; color:var(--mut); line-height:1.7; }
  footer a { color:var(--mut); margin-right:12px; }
</style>
</head>
<body>
<div class="wrap">
  <a class="crumb" href="/">← ${esc(M.backLabel)}</a>
  <h1>${esc(M.title)}</h1>
  <p class="lede">${esc(M.intro)}</p>
${stepList(G.journeyHome, stepsHome)}
${stepList(G.journeyPro, stepsPro)}
${faqList(G.tabHome || 'FAQ', faqsHome)}
${faqList(G.tabPro || 'FAQ', faqsPro)}

  <div class="cta">
    <h2>${esc(M.ctaTitle)}</h2>
    <p>${esc(M.ctaBody)}</p>
    <a class="btn" href="/">${esc(M.ctaBtn)} ›</a>
  </div>

  <footer>
    <p>${esc(M.sourceNote)}</p>
    <p style="margin-top:8px">
      <a href="/">${esc(M.backLabel)}</a>
      <a href="/pricing">Plans</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/imprint">Legal Notice</a>
    </p>
    <p style="margin-top:8px">© ${new Date().getFullYear()} HeatPump DataBase (Europe)™</p>
  </footer>
</div>
</body>
</html>
`;

mkdirSync(join(OUT_DIR, 'guide'), { recursive: true });
writeFileSync(join(OUT_DIR, 'guide', 'index.html'), HTML);

/* ── Sitemap: the public surface, not just the homepage. Written here (after
 *    vite's own sitemap) so both stay in one place per market. ── */
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: `${M.host}/`, freq: 'weekly' },
  { loc: `${M.host}/guide/`, freq: 'monthly' },
  { loc: `${M.host}/pricing`, freq: 'monthly' },
  { loc: `${M.host}/privacy`, freq: 'yearly' },
  { loc: `${M.host}/terms`, freq: 'yearly' },
  { loc: `${M.host}/refund-policy`, freq: 'yearly' },
  { loc: `${M.host}/imprint`, freq: 'yearly' },
];
writeFileSync(join(OUT_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq></url>`).join('\n')
  + `\n</urlset>\n`);

const words = HTML.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
console.log(`public guide (${MARKET}): /guide/ ~${words} words · sitemap ${urls.length} URLs`);
