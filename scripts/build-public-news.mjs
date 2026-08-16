#!/usr/bin/env node
/**
 * build-public-news.mjs — the PUBLIC news archive (index + one page per
 * article), emitted into a market's dist folder after `vite build`.
 *
 * WHY (SEO programme, owner decision 2026-08-04)
 * The funding guide gave each country ONE indexable page. News gives it a
 * dozen that GROW every month, which is the signal Google uses to decide how
 * often to come back. The articles are our own editorial work, already
 * generated monthly and already translated into the market language — they
 * were simply invisible, sitting behind the sign-in wall.
 *
 * FULL ARTICLES ARE PUBLISHED (owner call): the pieces synthesise public
 * sources and carry no proprietary information, so holding them back protects
 * nothing while costing every visit they could earn. What stays behind the
 * account is the product itself — catalogue search, listing status, data
 * sheets, comparison, EU labels.
 *
 * INPUT is the committed snapshot (data_sources/news_public/<cc>.json), never
 * Firestore: the build must not be able to fail on a network or credential
 * problem, and the snapshot doubles as the review point for what goes public.
 * Refresh it with scripts/export-news-public.mjs after the monthly cycle.
 *
 * Run:  node scripts/build-public-news.mjs <MARKET> <outDir>
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestEdition, copyOf } from './lib/special-report-store.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKET = (process.argv[2] || 'DE').toUpperCase();
const OUT_DIR = process.argv[3] || join(ROOT, 'dist');

/* Copy per market. `cta*` is category-aware: an installer-facing piece and a
   homeowner-facing piece deserve different next steps (the paying customer is
   the installer, so that variant leads with quote-ready output). */
const M = {
  DE: {
    lang: 'de', hreflang: 'de-DE', host: 'https://www.heatpumpdb.de',
    archiveTitle: 'Wärmepumpen-Markt & Förderung — Nachrichten für Deutschland',
    archiveDesc: 'Redaktionelle Nachrichten zum deutschen Wärmepumpenmarkt: BEG-Förderung, KfW 458, BAFA-Liste, Technik und Marktzahlen. Monatlich aktualisiert — heat pump news Germany.',
    archiveH1: 'Nachrichten', archiveLede: 'Monatliche Berichte zu Förderung, Markt und Technik der Wärmepumpe in Deutschland.',
    back: 'Zur Wärmepumpen-Datenbank', guide: 'Leitfaden zur Förderung', all: 'Alle Nachrichten',
    sourcesLabel: 'Quellen', published: 'Veröffentlicht',
    ctaPro: { h: 'Datenblätter für Ihr Angebot', p: 'BAFA-Listenstatus, SCOP, Schallleistung und druckfertige Datenblätter zu 7.190 Wärmepumpen — nach kostenloser Registrierung, 7 Tage voller Zugang, keine Kreditkarte.', b: 'Kostenlos registrieren' },
    ctaHome: { h: 'Passende Wärmepumpe finden', p: 'Modelle vergleichen, Effizienz und EU-Energielabel prüfen — kostenlos registrieren, 7 Tage voller Zugang, keine Kreditkarte erforderlich.', b: 'Kostenlos registrieren' },
    disclaimer: 'Redaktioneller Beitrag von HeatPump DataBase (Europe), zusammengestellt aus den genannten öffentlichen Quellen. Keine Rechts- oder Förderberatung — maßgeblich sind die offiziellen Stellen.',
  },
  GB: {
    lang: 'en', hreflang: 'en-GB', host: 'https://www.heatpumpdb.uk',
    archiveTitle: 'UK Heat Pump Market & Grants — News and Analysis',
    archiveDesc: 'Editorial coverage of the UK heat pump market: Boiler Upgrade Scheme grants, MCS, Ofgem product eligibility, technology and market figures. Updated monthly — heatpump news UK.',
    archiveH1: 'News', archiveLede: 'Monthly reporting on heat pump funding, market and technology in the United Kingdom.',
    back: 'To the heat pump database', guide: 'Funding guide', all: 'All news',
    sourcesLabel: 'Sources', published: 'Published',
    ctaPro: { h: 'Data sheets for your quotes', p: 'PEL listing status, SCOP, sound power and quote-ready data sheets for 7,190 heat pumps — after a free sign-up: 7 days of full access, no credit card required.', b: 'Join free' },
    ctaHome: { h: 'Find the right heat pump', p: 'Compare models, check efficiency and the EU energy label — join free for 7 days of full access, no credit card required.', b: 'Join free' },
    disclaimer: 'Editorial article by HeatPump DataBase (Europe), synthesised from the public sources listed. Not legal or grant advice — the official bodies prevail.',
  },
  FR: {
    lang: 'fr', hreflang: 'fr-FR', host: 'https://www.heatpumpdb.fr',
    archiveTitle: 'Marché et aides pompe à chaleur en France — Actualités',
    archiveDesc: "Actualités éditoriales du marché français de la pompe à chaleur : MaPrimeRénov', CEE, RGE, technologie et chiffres du marché. Mise à jour mensuelle — heat pump news France.",
    archiveH1: 'Actualités', archiveLede: 'Analyses mensuelles sur les aides, le marché et la technologie de la pompe à chaleur en France.',
    back: 'Vers la base de données', guide: 'Guide des aides', all: 'Toutes les actualités',
    sourcesLabel: 'Sources', published: 'Publié le',
    ctaPro: { h: 'Des fiches techniques pour vos devis', p: "SCOP, puissance acoustique et fiches prêtes pour le devis sur 7 190 pompes à chaleur — après une inscription gratuite : 7 jours d'accès complet, sans carte bancaire.", b: 'Inscription gratuite' },
    ctaHome: { h: 'Trouver la bonne pompe à chaleur', p: "Comparer les modèles, vérifier l'efficacité et l'étiquette énergie UE — inscription gratuite, 7 jours d'accès complet, sans carte bancaire.", b: 'Inscription gratuite' },
    disclaimer: "Article éditorial de HeatPump DataBase (Europe), synthétisé à partir des sources publiques citées. Ni conseil juridique ni décision d'aide — les sources officielles prévalent.",
  },
  PL: {
    lang: 'pl', hreflang: 'pl-PL', host: 'https://www.heatpumpdb.pl',
    archiveTitle: 'Rynek i dofinansowanie pomp ciepła w Polsce — Aktualności',
    archiveDesc: 'Redakcyjne aktualności z polskiego rynku pomp ciepła: Czyste Powietrze, lista ZUM, technologia i dane rynkowe. Aktualizowane co miesiąc — heat pump news Poland.',
    archiveH1: 'Aktualności', archiveLede: 'Comiesięczne analizy dotyczące dofinansowania, rynku i technologii pomp ciepła w Polsce.',
    back: 'Do bazy pomp ciepła', guide: 'Przewodnik po dofinansowaniu', all: 'Wszystkie aktualności',
    sourcesLabel: 'Źródła', published: 'Opublikowano',
    ctaPro: { h: 'Karty danych do Twoich ofert', p: 'Status na liście ZUM, SCOP, moc akustyczna i karty danych gotowe do oferty dla 7 190 pomp ciepła — po bezpłatnej rejestracji: 7 dni pełnego dostępu, bez karty płatniczej.', b: 'Dołącz za darmo' },
    ctaHome: { h: 'Znajdź właściwą pompę ciepła', p: 'Porównaj modele, sprawdź efektywność i etykietę energetyczną UE — dołącz za darmo, 7 dni pełnego dostępu, bez karty płatniczej.', b: 'Dołącz za darmo' },
    disclaimer: 'Materiał redakcyjny HeatPump DataBase (Europe), opracowany na podstawie wymienionych źródeł publicznych. Nie stanowi porady prawnej ani dotyczącej dotacji — rozstrzygające są źródła oficjalne.',
  },
  IT: {
    lang: 'it', hreflang: 'it-IT', host: 'https://www.heatpumpdb.it',
    archiveTitle: 'Mercato e incentivi pompe di calore in Italia — Notizie',
    archiveDesc: 'Notizie redazionali sul mercato italiano delle pompe di calore: Conto Termico, catalogo GSE, tecnologia e dati di mercato. Aggiornate ogni mese — heat pump news Italy.',
    archiveH1: 'Notizie', archiveLede: 'Analisi mensili su incentivi, mercato e tecnologia delle pompe di calore in Italia.',
    back: 'Al database delle pompe di calore', guide: 'Guida agli incentivi', all: 'Tutte le notizie',
    sourcesLabel: 'Fonti', published: 'Pubblicato il',
    ctaPro: { h: 'Schede tecniche per i tuoi preventivi', p: 'Stato nel catalogo GSE, SCOP, potenza sonora e schede pronte per il preventivo su 7.190 pompe di calore — dopo la registrazione gratuita: 7 giorni di accesso completo, senza carta di credito.', b: 'Registrati gratis' },
    ctaHome: { h: 'Trova la pompa di calore giusta', p: 'Confronta i modelli, verifica efficienza ed etichetta energetica UE — registrati gratis, 7 giorni di accesso completo, senza carta di credito.', b: 'Registrati gratis' },
    disclaimer: 'Articolo redazionale di HeatPump DataBase (Europe), sintetizzato dalle fonti pubbliche citate. Non è consulenza legale né sugli incentivi — prevalgono le fonti ufficiali.',
  },
}[MARKET];

if (!M) { console.error(`build-public-news: unknown market ${MARKET}`); process.exit(0); }

const SNAP = join(ROOT, 'data_sources', 'news_public', `${MARKET}.json`);
if (!existsSync(SNAP)) {
  console.log(`public news (${MARKET}): no snapshot — skipped (run scripts/export-news-public.mjs)`);
  process.exit(0);
}
const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const items = Array.isArray(snap.items) ? snap.items : [];
if (!items.length) { console.log(`public news (${MARKET}): snapshot empty — skipped`); process.exit(0); }

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (id) => String(id).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

/* Special Report link in the public footer, labelled from the report's own
   content store — news and the monthly report are siblings, and a reader who
   lands on one should be able to reach the other. */
const SR_NEWEST = newestEdition(ROOT);
const SR_LINK = SR_NEWEST
  ? `\n      <a href="/special-report/">${esc(copyOf(SR_NEWEST, M.lang).seriesTitle)}</a>`
  : '';
const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(M.hreflang, { day: 'numeric', month: 'long', year: 'numeric' })
    : String(iso).slice(0, 10);
};
/** Installer-facing categories get the quote-oriented call to action. */
const ctaFor = (cat) => (['INSTALLER INSIGHT', 'TECHNOLOGY'].includes(String(cat).toUpperCase()) ? M.ctaPro : M.ctaHome);

const CSS = `
  :root { --ink:#1d1d1f; --mut:#6b6b70; --line:#e6e6e9; --blue:#0066cc; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif; color:var(--ink); background:#fff; line-height:1.65; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:760px; margin:0 auto; padding:26px 20px 64px; }
  a { color:var(--blue); text-decoration:none; }
  .crumb { font-size:13px; color:var(--mut); display:inline-block; margin-bottom:20px; }
  .eyebrow { font-size:11.5px; letter-spacing:.13em; text-transform:uppercase; color:var(--mut); }
  h1 { font-size:clamp(24px,4.4vw,34px); line-height:1.22; letter-spacing:-.02em; margin-top:8px; }
  .meta { margin-top:10px; font-size:13px; color:var(--mut); }
  .lede { margin-top:16px; font-size:16.5px; color:#3a3a3e; }
  .body { margin-top:22px; }
  .body p { margin-bottom:15px; font-size:15.5px; color:#26262a; }
  .card { display:block; padding:16px 0; border-bottom:1px solid var(--line); }
  .card h2 { font-size:18px; letter-spacing:-.01em; margin:5px 0 4px; color:var(--ink); }
  .card p { font-size:14.5px; color:#4a4a50; }
  .cta { margin-top:36px; border:1px solid var(--line); border-radius:16px; padding:22px; background:#f7f9fc; }
  .cta h2 { font-size:19px; margin-bottom:8px; }
  .cta p { font-size:14.5px; color:#3a3a3e; }
  .btn { display:inline-block; margin-top:14px; background:var(--blue); color:#fff; border-radius:999px; padding:11px 22px; font-size:14.5px; font-weight:600; }
  .srcs { margin-top:30px; padding-top:16px; border-top:1px solid var(--line); }
  .srcs h3 { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); margin-bottom:8px; }
  .srcs li { font-size:13.5px; margin-bottom:5px; list-style:none; word-break:break-word; }
  footer { margin-top:34px; padding-top:16px; border-top:1px solid var(--line); font-size:12px; color:var(--mut); line-height:1.7; }
  footer a { color:var(--mut); margin-right:12px; }
`;

const hreflangFor = (path) => Object.entries({
  DE: 'https://www.heatpumpdb.de', GB: 'https://www.heatpumpdb.uk', FR: 'https://www.heatpumpdb.fr',
  PL: 'https://www.heatpumpdb.pl', IT: 'https://www.heatpumpdb.it',
}).map(([cc, host]) => {
  const hl = { DE: 'de-DE', GB: 'en-GB', FR: 'fr-FR', PL: 'pl-PL', IT: 'it-IT' }[cc];
  // Only the archive index exists in every market; article slugs are per-market.
  return path === '/news/' ? `<link rel="alternate" hreflang="${hl}" href="${host}/news/" />` : '';
}).filter(Boolean).join('\n  ');

const shell = ({ title, desc, canonical, ld, body }) => `<!doctype html>
<html lang="${M.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | HeatPump DB</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${M.host}${canonical}">
${hreflangFor(canonical)}
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${M.host}${canonical}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
  <footer>
    <p>${esc(M.disclaimer)}</p>
    <p style="margin-top:8px">
      <a href="/">${esc(M.back)}</a>
      <a href="/news/">${esc(M.all)}</a>
      <a href="/guide/">${esc(M.guide)}</a>${SR_LINK}
      <a href="/pricing">Plans</a>
      <a href="/privacy">Privacy</a>
      <a href="/imprint">Legal Notice</a>
    </p>
    <p style="margin-top:8px">© ${new Date().getFullYear()} HeatPump DataBase (Europe)™</p>
  </footer>
</div>
<script>
  // Attribution pass-through: a visitor arriving from a channel link
  // (?ref=li on a LinkedIn comment) must hand that channel on to the app CTA,
  // or every conversion would be credited to "news" regardless of source.
  (function () {
    var ref = new URLSearchParams(location.search).get('ref');
    if (!ref) return;
    document.querySelectorAll('a[href^="/?ref="], a[href="/"]').forEach(function (a) {
      a.href = '/?ref=' + encodeURIComponent(ref.toLowerCase().slice(0, 24));
    });
  })();
</script>
</body>
</html>
`;

mkdirSync(join(OUT_DIR, 'news'), { recursive: true });

/* ── Article pages ── */
for (const a of items) {
  const paras = String(a.body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const cta = ctaFor(a.category);
  const ld = [{
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description: a.summary,
    inLanguage: M.hreflang,
    datePublished: a.date,
    dateModified: a.date,
    author: { '@type': 'Organization', name: a.author },
    publisher: {
      '@type': 'Organization',
      name: 'HeatPump DataBase (Europe)',
      sameAs: [
        'https://www.linkedin.com/company/heatpumpdb/',
        'https://www.youtube.com/@heatpumpdb',
      ],
    },
    mainEntityOfPage: `${M.host}/news/${slug(a.id)}.html`,
    ...(a.imageUrl ? { image: `${M.host}${a.imageUrl}` } : {}),
  }, {
    // Breadcrumbs give the result a "Home › News › headline" trail instead of a
    // bare URL, and tell Google the archive is the parent of every article.
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'HeatPump DB', item: `${M.host}/` },
      { '@type': 'ListItem', position: 2, name: M.all, item: `${M.host}/news/` },
      { '@type': 'ListItem', position: 3, name: a.title },
    ],
  }];
  const body = `
  <a class="crumb" href="/news/">← ${esc(M.all)}</a>
  <span class="eyebrow">${esc(a.category)}</span>
  <h1>${esc(a.title)}</h1>
  <p class="meta">${esc(M.published)} ${esc(fmtDate(a.date))} · ${esc(a.author)}</p>
  <p class="lede">${esc(a.summary)}</p>
  <div class="body">
    ${paras.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </div>
  ${a.sources.length ? `<div class="srcs">
    <h3>${esc(M.sourcesLabel)}</h3>
    <ul>
      ${a.sources.map((s) => `<li><a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.title || s.url)}</a></li>`).join('\n      ')}
    </ul>
  </div>` : ''}
  <div class="cta">
    <h2>${esc(cta.h)}</h2>
    <p>${esc(cta.p)}</p>
    <a class="btn" href="/?ref=news">${esc(cta.b)} ›</a>
  </div>`;
  writeFileSync(join(OUT_DIR, 'news', `${slug(a.id)}.html`), shell({
    title: a.title, desc: a.summary || a.title,
    canonical: `/news/${slug(a.id)}.html`, ld, body,
  }));
}

/* ── Archive index ── */
const indexLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: M.archiveTitle,
  inLanguage: M.hreflang,
  description: M.archiveDesc,
  url: `${M.host}/news/`,
};
const indexBody = `
  <a class="crumb" href="/">← ${esc(M.back)}</a>
  <h1>${esc(M.archiveH1)}</h1>
  <p class="lede">${esc(M.archiveLede)}</p>
  <div style="margin-top:26px">
    ${items.map((a) => `<a class="card" href="/news/${slug(a.id)}.html">
      <span class="eyebrow">${esc(a.category)} · ${esc(fmtDate(a.date))}</span>
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.summary)}</p>
    </a>`).join('\n    ')}
  </div>
  <div class="cta">
    <h2>${esc(M.ctaPro.h)}</h2>
    <p>${esc(M.ctaPro.p)}</p>
    <a class="btn" href="/?ref=news">${esc(M.ctaPro.b)} ›</a>
  </div>`;
writeFileSync(join(OUT_DIR, 'news', 'index.html'), shell({
  title: M.archiveTitle, desc: M.archiveDesc, canonical: '/news/', ld: indexLd, body: indexBody,
}));

/* ── Sitemap: rewritten with the guide + every article (build-public-guide
 *    runs first and writes the base set; this replaces it with the full one). ── */
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: `${M.host}/`, freq: 'weekly' },
  { loc: `${M.host}/guide/`, freq: 'monthly' },
  { loc: `${M.host}/market-trends/`, freq: 'weekly' },
  // Market & Trends card pages — the trends builder owns the pages; the
  // sitemap lives here, so list them from the same committed store.
  ...(existsSync(join(ROOT, 'data_sources', 'market_trends', `${MARKET}.json`))
    ? JSON.parse(readFileSync(join(ROOT, 'data_sources', 'market_trends', `${MARKET}.json`), 'utf8'))
        .flatMap((c) => [
          { loc: `${M.host}/market-trends/${c.slug}.html`, lastmod: c.date, freq: 'yearly' },
          // English twin of the article (the infographic itself is never
          // translated). GB has none — its market language is already English.
          ...(MARKET === 'GB' ? []
            : [{ loc: `${M.host}/market-trends/${c.slug}.en.html`, lastmod: c.date, freq: 'yearly' }]),
        ])
    : []),
  // Special Report — build-special-report.mjs owns the pages; the sitemap
  // lives here, so list the editions from the same committed store.
  { loc: `${M.host}/special-report/`, freq: 'monthly' },
  ...(existsSync(join(ROOT, 'data_sources', 'special_report'))
    ? readdirSync(join(ROOT, 'data_sources', 'special_report'))
        .filter((d) => /^\d{4}-\d{2}$/.test(d)
          && existsSync(join(ROOT, 'data_sources', 'special_report', d, 'article.json')))
        .sort().reverse()
        .flatMap((id) => {
          const meta = JSON.parse(readFileSync(join(ROOT, 'data_sources', 'special_report', id, 'article.json'), 'utf8'));
          return [
            { loc: `${M.host}/special-report/${id}/`, lastmod: meta.published, freq: 'yearly' },
            // English twin of the article; GB's market language is already English.
            ...(MARKET === 'GB' ? []
              : [{ loc: `${M.host}/special-report/${id}/en.html`, lastmod: meta.published, freq: 'yearly' }]),
          ];
        })
    : []),
  { loc: `${M.host}/news/`, freq: 'weekly' },
  ...items.map((a) => ({ loc: `${M.host}/news/${slug(a.id)}.html`, freq: 'yearly', lastmod: String(a.date).slice(0, 10) })),
  { loc: `${M.host}/pricing`, freq: 'monthly' },
  { loc: `${M.host}/privacy`, freq: 'yearly' },
  { loc: `${M.host}/terms`, freq: 'yearly' },
  { loc: `${M.host}/refund-policy`, freq: 'yearly' },
  { loc: `${M.host}/imprint`, freq: 'yearly' },
];
writeFileSync(join(OUT_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod || today}</lastmod><changefreq>${u.freq}</changefreq></url>`).join('\n')
  + `\n</urlset>\n`);

const chars = items.reduce((n, a) => n + a.body.length, 0);
console.log(`public news (${MARKET}): ${items.length} articles (${chars.toLocaleString()} chars) · sitemap ${urls.length} URLs`);
