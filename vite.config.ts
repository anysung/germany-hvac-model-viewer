import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Build-time catalogue stats for the auth landing (model counts per segment +
 * manufacturer count). Read from the built datasets so no runtime download is
 * needed on the login page. Falls back to zeros if the pipeline has not run.
 */
function marketStats(country: string): { res: number; com: number; mfr: number } {
  const files: Record<string, [string, string]> = {
    DE: ['public/data/products.json', 'public/data/products-commercial.json'],
    GB: ['public/data/products-gb.json', 'public/data/products-commercial-gb.json'],
    FR: ['public/data/products-fr.json', 'public/data/products-commercial-fr.json'],
    PL: ['public/data/products-pl.json', 'public/data/products-commercial-pl.json'],
    IT: ['public/data/products-it.json', 'public/data/products-commercial-it.json'],
  };
  const [resPath, comPath] = files[country] ?? files.DE;
  try {
    if (!existsSync(resPath) || !existsSync(comPath)) return { res: 0, com: 0, mfr: 0 };
    const a = JSON.parse(readFileSync(resPath, 'utf8')).items ?? [];
    const b = JSON.parse(readFileSync(comPath, 'utf8')).items ?? [];
    // Manufacturer count deduped by curated short name — raw registry names
    // carry per-market legal-entity variants of the same maker.
    const mfr = new Set([...a, ...b].map((p: any) => p.manufacturer_short ?? p.manufacturer_normalized ?? p.manufacturer)).size;
    return { res: a.length, com: b.length, mfr };
  } catch {
    return { res: 0, com: 0, mfr: 0 };
  }
}

// Per-market <head> metadata, injected at build time (one deployment = one
// country). Titles are the canonical brand naming — "HeatPump DB <Market>",
// no underscores — so search engines stop generating their own variants
// (Google was rewriting titles from hostnames: "HeatPump DB_UK" etc.).
// Descriptions carry the market keywords (BAFA-Liste / Ofgem BUS PEL / MCS /
// comparateur pompe à chaleur) that match how each market actually searches.
const MARKET_HTML: Record<string, { lang: string; hreflang: string; title: string; desc: string; canonical: string; iconCode: string; appName: string; themeColor: string }> = {
  DE: {
    lang: 'de',
    hreflang: 'de-DE',
    iconCode: 'de',
    appName: 'HeatPump DB Germany',
    themeColor: '#0a1712',
    title: 'HeatPump DB Germany — Heat Pump Database',
    desc: 'Wärmepumpen-Datenbank & Vergleich für den deutschen Markt: BAFA-Liste förderfähiger Wärmepumpen (BEG), SCOP, COP, Schallleistung, Kältemittel (R290) und EU-Energielabel — Datenblätter für Fachhandwerk und Eigentümer.',
    canonical: 'https://www.heatpumpdb.de/',
  },
  GB: {
    lang: 'en',
    hreflang: 'en-GB',
    iconCode: 'uk',
    appName: 'HeatPump DB UK',
    themeColor: '#081322',
    title: 'HeatPump DB UK — Heat Pump Database',
    desc: 'UK heat pump database & comparison: Ofgem Boiler Upgrade Scheme (BUS) product eligibility list, MCS-certified air source heat pumps, SCOP, sound power and refrigerant data — data sheets for installers and homeowners.',
    canonical: 'https://www.heatpumpdb.uk/',
  },
  FR: {
    lang: 'fr',
    hreflang: 'fr-FR',
    iconCode: 'fr',
    appName: 'HeatPump DB France',
    themeColor: '#0b1128',
    title: 'HeatPump DB France — Base de données de pompes à chaleur',
    desc: "Base de données et comparateur de pompes à chaleur air/eau pour le marché français : SCOP, COP, puissance acoustique, fluides frigorigènes (R290) et étiquette énergie UE — fiches techniques pour installateurs et particuliers.",
    canonical: 'https://www.heatpumpdb.fr/',
  },
  PL: {
    lang: 'pl',
    hreflang: 'pl-PL',
    iconCode: 'pl',
    appName: 'HeatPump DB Poland',
    themeColor: '#1c0a11',
    title: 'HeatPump Database Polska | Wyszukiwarka pomp ciepła',
    desc: 'Wyszukuj i porównuj pompy ciepła dostępne na rynku europejskim. Sprawdzaj dane techniczne, etykiety energetyczne i twórz arkusze danych.',
    canonical: 'https://www.heatpumpdb.pl/',
  },
  IT: {
    lang: 'it',
    hreflang: 'it-IT',
    iconCode: 'it',
    appName: 'HeatPump DB Italia',
    themeColor: '#0a1a0f',
    title: 'HeatPump Database Italia | Database pompe di calore',
    desc: 'Cerca e confronta le pompe di calore disponibili sul mercato europeo. Dati tecnici, etichette energetiche, stato nel catalogo GSE (Conto Termico) e schede tecniche per installatori e progettisti.',
    canonical: 'https://www.heatpumpdb.it/',
  },
};

/** hreflang cluster — the market editions are alternates of each other. */
function hreflangLinks(): string {
  const links = Object.values(MARKET_HTML)
    .map(x => `    <link rel="alternate" hreflang="${x.hreflang}" href="${x.canonical}" />`)
    .join('\n');
  return `${links}\n    <link rel="alternate" hreflang="x-default" href="${MARKET_HTML.DE.canonical}" />`;
}

/** Structured data: tells Google what the entity "HeatPump DB" is. */
function jsonLd(m: (typeof MARKET_HTML)[string]): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'HeatPump DB',
    alternateName: m.title.split(/ — | \| /)[0],
    url: m.canonical,
    description: m.desc,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: m.lang,
    offers: { '@type': 'Offer', category: 'subscription' },
    publisher: {
      '@type': 'Organization',
      name: 'HeatPump DB',
      url: m.canonical,
      // Verified channels of the same organisation. `sameAs` is how a search
      // engine learns that the site, the LinkedIn page and the YouTube channel
      // are one entity rather than three similarly-named ones.
      sameAs: [
        'https://www.linkedin.com/company/heatpumpdb/',
        'https://www.youtube.com/@heatpumpdb',
      ],
    },
  };
  return `    <script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Cast process to any to avoid TypeScript error: Property 'cwd' does not exist on type 'Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  const country = (process as any).env.VITE_COUNTRY_CODE || env.VITE_COUNTRY_CODE || 'DE';
  const appMode = (process as any).env.VITE_APP_MODE || env.VITE_APP_MODE || 'app';
  const isAdminBuild = appMode === 'admin';
  const m = MARKET_HTML[country] ?? MARKET_HTML.DE;
  let outDir = 'dist';

  // Build fingerprint for the in-app update check (src/updateCheck.ts): the
  // bundle carries __BUILD_ID__, the deploy carries /version.json with the same
  // value, and a resumed home-screen app compares the two. Any per-build unique
  // value works — wall-clock is the simplest honest one.
  const buildId = Date.now().toString(36);

  return {
    plugins: [
      react(),
      {
        name: 'market-html',
        configResolved(config: any) { outDir = config.build.outDir; },
        transformIndexHtml(html: string) {
          if (isAdminBuild) {
            // Operations console: never indexed, no market SEO head.
            return html.replace(
              /<title>.*?<\/title>/,
              '<title>HeatPump DB — Operations Console</title>\n'
              + '    <meta name="robots" content="noindex, nofollow" />\n'
              + `    <link rel="icon" type="image/png" sizes="32x32" href="/icons/de-32.png" />`,
            );
          }
          return html
            // translate="no": the browser must not machine-translate this app.
            // Chrome was rendering the Italian edition into English and turning
            // "Conto Termico" — the legal name of the GSE programme — into
            // "Thermal Account", a scheme that does not exist. On a compliance
            // data product a mistranslated programme name, listing status or
            // disclaimer is a liability, and every edition already ships its own
            // curated English through the IT|EN toggle. (Owner report, Jul 2026:
            // "the Italian site shows English" — the bundle was Italian all along.)
            .replace(/<html lang="[^"]*">/, `<html lang="${m.lang}" translate="no" class="notranslate">`)
            .replace(
              /<title>.*?<\/title>/,
              `<title>${m.title}</title>\n`
              + `    <meta name="google" content="notranslate" />\n`
              + `    <meta name="description" content="${m.desc}" />\n`
              + `    <link rel="canonical" href="${m.canonical}" />\n`
              + hreflangLinks() + '\n'
              + `    <meta property="og:site_name" content="HeatPump DB" />\n`
              + `    <meta property="og:title" content="${m.title}" />\n`
              + `    <meta property="og:description" content="${m.desc}" />\n`
              + `    <meta property="og:url" content="${m.canonical}" />\n`
              + `    <meta property="og:type" content="website" />\n`
              // PWA: installable per market with its own icon set (public/icons/)
              + `    <link rel="manifest" href="/manifest.webmanifest" />\n`
              + `    <meta name="theme-color" content="${m.themeColor}" />\n`
              + `    <meta name="mobile-web-app-capable" content="yes" />\n`
              + `    <meta name="apple-mobile-web-app-title" content="HeatPump DB" />\n`
              // Favicons: root /favicon.ico + 48px PNG (Google Search prefers
              // ≥48×48) — per-market copies written in closeBundle so the SPA
              // rewrite never answers these URLs with index.html.
              + `    <link rel="icon" href="/favicon.ico" sizes="any" />\n`
              + `    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />\n`
              + `    <link rel="icon" type="image/png" sizes="32x32" href="/icons/${m.iconCode}-32.png" />\n`
              + `    <link rel="apple-touch-icon" sizes="180x180" href="/icons/${m.iconCode}-180.png" />\n`
              + jsonLd(m),
            );
        },
        closeBundle() {
          // Update beacon — every deploy (market sites AND the admin console)
          // publishes its build id; served no-cache via firebase.json headers.
          writeFileSync(resolve(outDir, 'version.json'), JSON.stringify({ build: buildId }));
          if (isAdminBuild) {
            // Admin console: block all crawling; no sitemap/manifest.
            writeFileSync(resolve(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
            return;
          }
          // Root favicons — per-market copies of the official market icon
          // (public/icons/<cc>.ico|<cc>-48.png). Real files at the well-known
          // URLs, otherwise the `**` rewrite serves index.html to crawlers.
          copyFileSync(resolve(outDir, `icons/${m.iconCode}.ico`), resolve(outDir, 'favicon.ico'));
          copyFileSync(resolve(outDir, `icons/${m.iconCode}-48.png`), resolve(outDir, 'favicon-48x48.png'));
          // Per-market sitemap + robots (the shared public/ dir cannot carry
          // market-specific Sitemap URLs).
          const today = new Date().toISOString().slice(0, 10);
          writeFileSync(resolve(outDir, 'sitemap.xml'),
            `<?xml version="1.0" encoding="UTF-8"?>\n`
            + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
            + `  <url><loc>${m.canonical}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>\n`
            + `</urlset>\n`);
          // robots: normal indexing stays open, but the dataset path is
          // disallowed (defense in depth — hosting no longer serves it) and
          // AI-training crawlers are opted out (the catalogue is a protected
          // database; see the in-app legal notice).
          const AI_CRAWLERS = [
            'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web',
            'anthropic-ai', 'CCBot', 'Google-Extended', 'Applebot-Extended',
            'PerplexityBot', 'Bytespider', 'meta-externalagent', 'cohere-ai',
          ];
          writeFileSync(resolve(outDir, 'robots.txt'),
            `User-agent: *\nAllow: /\nDisallow: /data/\n\n`
            + AI_CRAWLERS.map(ua => `User-agent: ${ua}\nDisallow: /\n`).join('\n')
            + `\nSitemap: ${m.canonical}sitemap.xml\n`);
          // PWA manifest — per-market identity so each installed edition
          // carries its own name, icon and theme color.
          writeFileSync(resolve(outDir, 'manifest.webmanifest'), JSON.stringify({
            id: '/',
            name: m.appName,
            short_name: 'HeatPump DB',
            description: m.desc,
            lang: m.lang,
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: m.themeColor,
            theme_color: m.themeColor,
            icons: [
              { src: `/icons/${m.iconCode}-192.png`, sizes: '192x192', type: 'image/png' },
              { src: `/icons/${m.iconCode}-512.png`, sizes: '512x512', type: 'image/png' },
            ],
          }, null, 2));
        },
      },
    ],
    base: '/',
    server: {
      host: true
    },
    define: {
      // Polyfill process.env.API_KEY so it works in the browser
      // CRITICAL FIX: Added || "" to prevent build failure if API_KEY is undefined in Cloud Build env
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ""),
      '__BUILD_ID__': JSON.stringify(buildId),
      '__MARKET_STATS__': JSON.stringify(marketStats(country)),
      '__ALL_MARKET_STATS__': JSON.stringify({ DE: marketStats('DE'), GB: marketStats('GB'), FR: marketStats('FR'), PL: marketStats('PL'), IT: marketStats('IT') }),
    }
  }
})
