#!/usr/bin/env node
/**
 * build-market-trends.mjs — the public "Market & Trends" FEED, one per market
 * (owner spec, 2026-08-11): the owner ships 2-3 infographic cards per market
 * per month; each card gets its own page (/market-trends/<slug>.html) with a
 * market-language write-up, and the index lists them newest-first. Card pages
 * carry og:image so a LinkedIn share shows the infographic itself — the pages
 * ARE the social-marketing landing targets (?ref=li on shared links).
 *
 * Content store: data_sources/market_trends/<CC>.json + images/ (committed —
 * the review point, same philosophy as the news snapshot).
 *
 * THE FIRST INFOGRAPHIC IS OURS TO PROVE. External sales statistics would need
 * sourcing we cannot verify page-by-page; the catalogue is our own data and
 * every number on the graphic is computed from the shipped dataset files at
 * build time — so it refreshes with the monthly data cycle and can never
 * contradict the product. (Content rule: we publish numbers we can prove.)
 *
 * Refrigerant matching uses CONTAINS, never equality — values like
 * "R290(estimated)" must count as R290 (CLAUDE.md rule).
 *
 * Run:  node scripts/build-market-trends.mjs <MARKET> <outDir>
 * Wired into every build:<market> BEFORE build-public-news.mjs (which owns
 * the sitemap and lists /market-trends/).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKET = (process.argv[2] || 'DE').toUpperCase();
const OUT_DIR = process.argv[3] || join(ROOT, 'dist');

const DATA = {
  DE: ['products.json', 'products-commercial.json'],
  GB: ['products-gb.json', 'products-commercial-gb.json'],
  FR: ['products-fr.json', 'products-commercial-fr.json'],
  PL: ['products-pl.json', 'products-commercial-pl.json'],
  IT: ['products-it.json', 'products-commercial-it.json'],
};

const HOSTS = {
  DE: 'https://www.heatpumpdb.de', GB: 'https://www.heatpumpdb.uk',
  FR: 'https://www.heatpumpdb.fr', PL: 'https://www.heatpumpdb.pl',
  IT: 'https://www.heatpumpdb.it',
};
const HREFLANG = { DE: 'de-DE', GB: 'en-GB', FR: 'fr-FR', PL: 'pl-PL', IT: 'it-IT' };

/* Copy per market — menu name, H1 and <title> exactly as specified by the
   owner (2026-08-11); the rest localized to match. */
const M = {
  DE: {
    lang: 'de',
    title: 'Wärmepumpen-Markt Deutschland – Zahlen, Trends & Statistiken | HeatPump Database',
    h1: 'Wärmepumpen-Markt Deutschland: Zahlen & Trends',
    sub: 'Kennzahlen, politische Entwicklungen und visuelle Einblicke zur Wärmepumpen-Transformation in Deutschland.',
    desc: 'Wärmepumpen-Markt Deutschland in Zahlen: Kältemittel-Mix (R290), SCOP-Effizienz, Schallleistung und Katalog-Statistiken — monatlich aktualisiert aus der HeatPump-DB-Datenbank.',
    infographicTitle: 'Der Katalog in Zahlen',
    infographicSub: (n, m) => `${n.toLocaleString('de-DE')} registrierte Wärmepumpen von ${m} Herstellern — Stand`,
    stats: { models: 'Modelle im Katalog', mfrs: 'Hersteller', res: 'Wohngebäude', com: 'Gewerbe',
      refrig: 'Kältemittel-Mix', natural: 'natürliches Kältemittel (R290)',
      scop: 'SCOP-Effizienz', scopHigh: 'Modelle mit SCOP ≥ 4,5', scopMed: 'Median-SCOP',
      quiet: 'Leise Geräte', quietDef: 'Schallleistung außen ≤ 50 dB(A)',
      mono: 'Monoblock', split: 'Split' },
    coming: 'Weitere Einblicke in Vorbereitung',
    roadmap: ['Heizungsmarkt im Wandel — Wärmepumpe vs. Gas & Öl', 'Wärmepumpen-Absatz — Marktentwicklung',
      'Förderung & Regulierung — zentrale Entwicklungen', 'Gebäudemarkt — Neubau vs. Sanierung',
      'Technologie-Trends — R290, Effizienz, Elektrifizierung'],
    source: 'Quelle: HeatPump DB Katalogdaten (BAFA-Liste), Snapshot',
    cta: { h: 'Die Daten hinter den Zahlen', p: 'Jedes Modell mit SCOP, Schallleistung, Kältemittel und BAFA-Status — kostenlos registrieren, 7 Tage voller Zugang.', b: 'Kostenlos registrieren' },
    back: 'Zur Wärmepumpen-Datenbank', guide: 'Förder-Leitfaden', news: 'Nachrichten',
  },
  GB: {
    lang: 'en',
    title: 'UK Heat Pump Market – Data, Statistics & Trends | HeatPump Database',
    h1: 'UK Heat Pump Market: Data & Trends',
    sub: "Key market data, policy developments and visual insights on the UK's transition toward heat pumps.",
    desc: 'The UK heat pump market in numbers: refrigerant mix (R290), SCOP efficiency, sound power and catalogue statistics — updated monthly from the HeatPump DB database.',
    infographicTitle: 'The catalogue in numbers',
    infographicSub: (n, m) => `${n.toLocaleString('en-GB')} registered heat pumps from ${m} manufacturers — as of`,
    stats: { models: 'Models in the catalogue', mfrs: 'Manufacturers', res: 'Residential', com: 'Commercial',
      refrig: 'Refrigerant mix', natural: 'natural refrigerant (R290)',
      scop: 'SCOP efficiency', scopHigh: 'Models with SCOP ≥ 4.5', scopMed: 'Median SCOP',
      quiet: 'Quiet units', quietDef: 'Outdoor sound power ≤ 50 dB(A)',
      mono: 'Monobloc', split: 'Split' },
    coming: 'More insights in preparation',
    roadmap: ['Heating market transition — heat pumps vs. gas & oil', 'Heat pump sales — market development',
      'Funding & regulation — key developments', 'Building market — new build vs. renovation',
      'Technology trends — R290, efficiency, electrification'],
    source: 'Source: HeatPump DB catalogue data (European reference), snapshot',
    cta: { h: 'The data behind the numbers', p: 'Every model with SCOP, sound power, refrigerant and PEL status — join free, 7 days of full access.', b: 'Join free' },
    back: 'To the heat pump database', guide: 'Funding guide', news: 'News',
  },
  FR: {
    lang: 'fr',
    title: 'Marché des pompes à chaleur France – chiffres & tendances | HeatPump Database',
    h1: 'Marché des pompes à chaleur en France : chiffres & tendances',
    sub: 'Données clés du marché, évolutions réglementaires et repères visuels sur la transition française vers la pompe à chaleur.',
    desc: 'Le marché français de la pompe à chaleur en chiffres : mix de fluides (R290), efficacité SCOP, puissance acoustique et statistiques du catalogue — mise à jour mensuelle.',
    infographicTitle: 'Le catalogue en chiffres',
    infographicSub: (n, m) => `${n.toLocaleString('fr-FR')} pompes à chaleur référencées de ${m} fabricants — au`,
    stats: { models: 'Modèles au catalogue', mfrs: 'Fabricants', res: 'Résidentiel', com: 'Tertiaire',
      refrig: 'Mix de fluides frigorigènes', natural: 'fluide naturel (R290)',
      scop: 'Efficacité SCOP', scopHigh: 'Modèles avec SCOP ≥ 4,5', scopMed: 'SCOP médian',
      quiet: 'Unités silencieuses', quietDef: 'Puissance acoustique ext. ≤ 50 dB(A)',
      mono: 'Monobloc', split: 'Split' },
    coming: 'Prochains éclairages en préparation',
    roadmap: ['Transition du chauffage — PAC vs gaz & fioul', 'Ventes de pompes à chaleur — évolution du marché',
      'Aides & réglementation — évolutions clés', 'Marché du bâtiment — neuf vs rénovation',
      'Tendances technologiques — R290, efficacité, électrification'],
    source: 'Source : données du catalogue HeatPump DB (référence européenne), snapshot',
    cta: { h: 'Les données derrière les chiffres', p: 'Chaque modèle avec SCOP, puissance acoustique et fluide — inscription gratuite, 7 jours d’accès complet.', b: 'Inscription gratuite' },
    back: 'Vers la base de données', guide: 'Guide des aides', news: 'Actualités',
  },
  PL: {
    lang: 'pl',
    title: 'Rynek pomp ciepła w Polsce – dane, statystyki i trendy | HeatPump Database',
    h1: 'Rynek pomp ciepła w Polsce: dane i trendy',
    sub: 'Kluczowe dane rynkowe, zmiany w polityce i wizualne analizy transformacji Polski w kierunku pomp ciepła.',
    desc: 'Polski rynek pomp ciepła w liczbach: mix czynników (R290), efektywność SCOP, moc akustyczna i statystyki katalogu — aktualizacja co miesiąc.',
    infographicTitle: 'Katalog w liczbach',
    infographicSub: (n, m) => `${n.toLocaleString('pl-PL')} zarejestrowanych pomp ciepła od ${m} producentów — stan na`,
    stats: { models: 'Modele w katalogu', mfrs: 'Producenci', res: 'Mieszkaniowe', com: 'Komercyjne',
      refrig: 'Mix czynników chłodniczych', natural: 'czynnik naturalny (R290)',
      scop: 'Efektywność SCOP', scopHigh: 'Modele ze SCOP ≥ 4,5', scopMed: 'Mediana SCOP',
      quiet: 'Ciche urządzenia', quietDef: 'Moc akustyczna zewn. ≤ 50 dB(A)',
      mono: 'Monoblok', split: 'Split' },
    coming: 'Kolejne analizy w przygotowaniu',
    roadmap: ['Transformacja rynku ogrzewania — pompy ciepła vs gaz i olej', 'Sprzedaż pomp ciepła — rozwój rynku',
      'Dofinansowanie i regulacje — kluczowe zmiany', 'Rynek budowlany — nowe budynki vs modernizacja',
      'Trendy technologiczne — R290, efektywność, elektryfikacja'],
    source: 'Źródło: dane katalogu HeatPump DB (referencja europejska), snapshot',
    cta: { h: 'Dane stojące za liczbami', p: 'Każdy model ze SCOP, mocą akustyczną, czynnikiem i statusem ZUM — dołącz za darmo, 7 dni pełnego dostępu.', b: 'Dołącz za darmo' },
    back: 'Do bazy pomp ciepła', guide: 'Przewodnik po dofinansowaniu', news: 'Aktualności',
  },
  IT: {
    lang: 'it',
    title: 'Mercato pompe di calore Italia – dati, statistiche e trend | HeatPump Database',
    h1: 'Mercato delle pompe di calore in Italia: dati e tendenze',
    sub: 'Dati chiave di mercato, sviluppi normativi e analisi visive sulla transizione italiana verso le pompe di calore.',
    desc: 'Il mercato italiano delle pompe di calore in numeri: mix refrigeranti (R290), efficienza SCOP, potenza sonora e statistiche del catalogo — aggiornamento mensile.',
    infographicTitle: 'Il catalogo in numeri',
    infographicSub: (n, m) => `${n.toLocaleString('it-IT')} pompe di calore registrate di ${m} produttori — al`,
    stats: { models: 'Modelli a catalogo', mfrs: 'Produttori', res: 'Residenziale', com: 'Commerciale',
      refrig: 'Mix refrigeranti', natural: 'refrigerante naturale (R290)',
      scop: 'Efficienza SCOP', scopHigh: 'Modelli con SCOP ≥ 4,5', scopMed: 'SCOP mediano',
      quiet: 'Unità silenziose', quietDef: 'Potenza sonora esterna ≤ 50 dB(A)',
      mono: 'Monoblocco', split: 'Split' },
    coming: 'Altre analisi in preparazione',
    roadmap: ['Transizione del riscaldamento — pompe di calore vs gas e gasolio', 'Vendite di pompe di calore — sviluppo del mercato',
      'Incentivi e regolazione — sviluppi chiave', 'Mercato edilizio — nuove costruzioni vs ristrutturazione',
      'Tendenze tecnologiche — R290, efficienza, elettrificazione'],
    source: 'Fonte: dati catalogo HeatPump DB (riferimento europeo), snapshot',
    cta: { h: 'I dati dietro i numeri', p: 'Ogni modello con SCOP, potenza sonora, refrigerante e stato GSE — registrati gratis, 7 giorni di accesso completo.', b: 'Registrati gratis' },
    back: 'Al database delle pompe di calore', guide: 'Guida agli incentivi', news: 'Notizie',
  },
}[MARKET];

if (!M) { console.error(`build-market-trends: unknown market ${MARKET}`); process.exit(0); }

/* ── Compute the stats from the shipped datasets ─────────────────────────── */
const load = (f) => {
  const p = join(ROOT, 'public', 'data', f);
  if (!existsSync(p)) return [];
  const d = JSON.parse(readFileSync(p, 'utf8'));
  return Array.isArray(d) ? d : (d.products ?? d.items ?? []);
};
const [resFile, comFile] = DATA[MARKET];
const res = load(resFile), com = load(comFile);
const all = [...res, ...com];
if (!all.length) { console.error(`build-market-trends (${MARKET}): datasets missing — page not written`); process.exit(0); }

const has = (p, r) => String(p.refrigerant ?? '').toUpperCase().includes(r);   // contains, never equals
const nR290 = all.filter((p) => has(p, 'R290')).length;
const nR32 = all.filter((p) => !has(p, 'R290') && has(p, 'R32')).length;
const nR410 = all.filter((p) => has(p, 'R410')).length;
const nOther = all.length - nR290 - nR32 - nR410;

const scops = all.map((p) => Number(p.scop)).filter((v) => v > 1 && v < 9).sort((a, b) => a - b);
const scopMed = scops.length ? scops[Math.floor(scops.length / 2)] : 0;
const scopHigh = scops.filter((v) => v >= 4.5).length;

const noises = all.map((p) => Number(p.noise_outdoor_dB)).filter((v) => v > 20 && v < 90);
const quiet = noises.filter((v) => v <= 50).length;

const mono = all.filter((p) => String(p.installation_type ?? '').toLowerCase().startsWith('mono')).length;
const split = all.filter((p) => String(p.installation_type ?? '').toLowerCase().includes('split')).length;

const mfrs = new Set(all.map((p) => p.manufacturer_short || p.manufacturer_normalized || p.manufacturer).filter(Boolean)).size;
const snapshot = String(all[0]?.source_snapshot_generated_at ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);

const pct = (n) => Math.round((n / all.length) * 100);
const nf = (n) => n.toLocaleString(HREFLANG[MARKET].replace('-', '-'));

/* ── The infographic (inline SVG — crisp, no JS, brand palette) ──────────── */
const BLUE = '#0066cc', RED = '#e0452c', INK = '#1d1d1f', BLUE_D = '#2997ff', RED_D = '#ff6b52';
function bar(x, y, w, label, value, share, color) {
  const bw = Math.max(6, Math.round(w * share / 100));
  return `
  <text x="${x}" y="${y - 8}" fill="#c9c9ce" font-size="13">${label}</text>
  <rect x="${x}" y="${y}" width="${w}" height="14" rx="7" fill="rgba(255,255,255,.08)"/>
  <rect x="${x}" y="${y}" width="${bw}" height="14" rx="7" fill="${color}"/>
  <text x="${x + w + 12}" y="${y + 12}" fill="#fff" font-size="14" font-weight="700">${share}%</text>
  <text x="${x + w + 58}" y="${y + 12}" fill="#8a8a8f" font-size="12">${value}</text>`;
}
const S = M.stats;
const svg = `<svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${M.infographicTitle}" style="width:100%;height:auto;display:block;border-radius:18px">
  <rect width="900" height="560" rx="18" fill="${INK}"/>
  <text x="40" y="56" fill="#fff" font-size="27" font-weight="800" letter-spacing="-0.5">${M.infographicTitle}</text>
  <text x="40" y="82" fill="#9a9aa0" font-size="14">${M.infographicSub(all.length, mfrs)} ${snapshot}</text>

  <!-- headline stats -->
  <g font-family="inherit">
    <text x="40"  y="150" fill="${BLUE_D}" font-size="40" font-weight="800">${nf(all.length)}</text>
    <text x="40"  y="172" fill="#c9c9ce" font-size="13">${S.models}</text>
    <text x="260" y="150" fill="#fff" font-size="40" font-weight="800">${mfrs}</text>
    <text x="260" y="172" fill="#c9c9ce" font-size="13">${S.mfrs}</text>
    <text x="450" y="150" fill="#fff" font-size="40" font-weight="800">${nf(res.length)}</text>
    <text x="450" y="172" fill="#c9c9ce" font-size="13">${S.res}</text>
    <text x="660" y="150" fill="#fff" font-size="40" font-weight="800">${nf(com.length)}</text>
    <text x="660" y="172" fill="#c9c9ce" font-size="13">${S.com}</text>
  </g>
  <line x1="40" y1="200" x2="860" y2="200" stroke="rgba(255,255,255,.12)"/>

  <!-- refrigerant mix -->
  <text x="40" y="238" fill="#fff" font-size="17" font-weight="700">${S.refrig}</text>
  ${bar(40, 262, 320, 'R290', nf(nR290), pct(nR290), RED_D)}
  ${bar(40, 306, 320, 'R32', nf(nR32), pct(nR32), BLUE_D)}
  ${bar(40, 350, 320, 'R410A', nf(nR410), pct(nR410), '#8a8a8f')}
  ${bar(40, 394, 320, '—', nf(nOther), pct(nOther), '#5a5a5f')}
  <text x="40" y="438" fill="${RED_D}" font-size="13" font-weight="600">▲ ${pct(nR290)}% ${S.natural}</text>

  <!-- efficiency + noise -->
  <text x="520" y="238" fill="#fff" font-size="17" font-weight="700">${S.scop}</text>
  <text x="520" y="290" fill="${BLUE_D}" font-size="36" font-weight="800">${scopMed.toFixed(2)}</text>
  <text x="520" y="312" fill="#c9c9ce" font-size="13">${S.scopMed}</text>
  <text x="700" y="290" fill="#fff" font-size="36" font-weight="800">${pct(scopHigh)}%</text>
  <text x="700" y="312" fill="#c9c9ce" font-size="13">${S.scopHigh}</text>

  <text x="520" y="368" fill="#fff" font-size="17" font-weight="700">${S.quiet}</text>
  <text x="520" y="420" fill="#fff" font-size="36" font-weight="800">${Math.round((quiet / noises.length) * 100)}%</text>
  <text x="520" y="442" fill="#c9c9ce" font-size="13">${S.quietDef}</text>

  <text x="700" y="368" fill="#fff" font-size="17" font-weight="700">${S.mono} / ${S.split}</text>
  <text x="700" y="420" fill="#fff" font-size="36" font-weight="800">${pct(mono)}<tspan fill="#8a8a8f" font-size="20">%</tspan> <tspan fill="#8a8a8f" font-size="24">/</tspan> ${pct(split)}<tspan fill="#8a8a8f" font-size="20">%</tspan></text>

  <text x="40" y="524" fill="#6f6f75" font-size="12">${M.source} ${snapshot} · heatpumpdb${MARKET === 'GB' ? '.uk' : '.' + MARKET.toLowerCase()}</text>
</svg>`;

/* ── Page shell (matches the guide/news public-page look) ────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const host = HOSTS[MARKET];
const alternates = Object.entries(HOSTS)
  .map(([cc, h]) => `<link rel="alternate" hreflang="${HREFLANG[cc]}" href="${h}/market-trends/">`)
  .join('\n');
const ld = {
  '@context': 'https://schema.org', '@type': 'WebPage',
  name: M.h1, description: M.desc, inLanguage: HREFLANG[MARKET],
  url: `${host}/market-trends/`, dateModified: snapshot,
  publisher: { '@type': 'Organization', name: 'HeatPump DataBase (Europe)',
    sameAs: ['https://www.linkedin.com/company/heatpumpdb/', 'https://www.youtube.com/@heatpumpdb'] },
};

const html = `<!doctype html>
<html lang="${M.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(M.title)}</title>
<meta name="description" content="${esc(M.desc)}">
<link rel="canonical" href="${host}/market-trends/">
${alternates}
<link rel="alternate" hreflang="x-default" href="${HOSTS.DE}/market-trends/">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/${MARKET === 'GB' ? 'uk' : MARKET.toLowerCase()}-32.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  *{box-sizing:border-box} body{margin:0;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#1d1d1f;background:#fff}
  .wrap{max-width:940px;margin:0 auto;padding:34px 20px 60px}
  .crumb{font-size:13.5px;color:#0066cc;text-decoration:none}
  h1{font-size:31px;letter-spacing:-.6px;line-height:1.2;margin:14px 0 8px}
  .lede{color:#555;font-size:16.5px;margin:0 0 26px;max-width:700px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin-bottom:8px}
  .cardlink{border:1px solid #e0e0e0;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;background:#fff;display:flex;flex-direction:column;transition:box-shadow .15s}
  .cardlink:hover{box-shadow:0 8px 28px rgba(0,0,0,.1)}
  .cardlink img{width:100%;height:auto;display:block}
  .ct{padding:14px 16px;display:flex;flex-direction:column;gap:4px}
  .cd{font-size:12px;color:#7a7a7a} .cn{font-size:15.5px;font-weight:600;line-height:1.3}
  .ce{font-size:13px;color:#555}
  .live{margin-top:34px} .liveh{font-size:19px;margin:0 0 12px}
  .roadmap{margin-top:34px;border:1px solid #e0e0e0;border-radius:18px;padding:22px 26px}
  .roadmap h2{font-size:17px;margin:0 0 10px}
  .roadmap li{margin:7px 0;color:#444;font-size:14.5px}
  .cta{margin-top:34px;background:#f5f5f7;border-radius:18px;padding:26px 30px}
  .cta h2{margin:0 0 6px;font-size:19px}
  .cta p{margin:0 0 14px;color:#555;font-size:14.5px;max-width:640px}
  .btn{display:inline-block;background:#0066cc;color:#fff;border-radius:999px;padding:11px 26px;font-size:14.5px;text-decoration:none;font-weight:600}
  footer{margin-top:40px;border-top:1px solid #f0f0f0;padding-top:16px;font-size:13px;color:#7a7a7a;display:flex;gap:18px;flex-wrap:wrap}
  footer a{color:#0066cc;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <a class="crumb" href="/">← ${esc(M.back)}</a>
  <h1>${esc(M.h1)}</h1>
  <p class="lede">${esc(M.sub)}</p>

  __GRID__

  <div class="live"><h2 class="liveh">${esc(M.infographicTitle)}</h2>__LIVECARD__</div>

  <div class="cta">
    <h2>${esc(M.cta.h)}</h2>
    <p>${esc(M.cta.p)}</p>
    <a class="btn" href="/?ref=trends">${esc(M.cta.b)} ›</a>
  </div>

  <footer>
    <a href="/guide/">${esc(M.guide)}</a>
    <a href="/news/">${esc(M.news)}</a>
    <span>© 2026 HeatPump DataBase (Europe)™</span>
  </footer>
</div>
</body>
</html>
`;

/* ── The card feed (owner-shipped infographics + market-language articles) ── */
const feedFile = join(ROOT, 'data_sources', 'market_trends', `${MARKET}.json`);
const feed = existsSync(feedFile) ? JSON.parse(readFileSync(feedFile, 'utf8')) : [];
feed.sort((a, b) => String(b.date).localeCompare(String(a.date)));

mkdirSync(join(OUT_DIR, 'market-trends', 'img'), { recursive: true });
const { copyFileSync } = await import('node:fs');
for (const c of feed) {
  for (const f of [c.image, c.image.replace(/\.webp$/, '.jpg')]) {
    const src = join(ROOT, 'data_sources', 'market_trends', 'images', f);
    if (existsSync(src)) copyFileSync(src, join(OUT_DIR, 'market-trends', 'img', f));
  }
}
/** og:image must be JPEG: LinkedIn's link scraper does not render WebP
 *  previews, and the share preview is the whole point of these pages. */
const ogImg = (c) => {
  const jpg = c.image.replace(/\.webp$/, '.jpg');
  return existsSync(join(ROOT, 'data_sources', 'market_trends', 'images', jpg)) ? jpg : c.image;
};

const FMT = new Intl.DateTimeFormat(HREFLANG[MARKET], { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDate = (d) => { try { return FMT.format(new Date(d + 'T00:00:00Z')); } catch { return d; } };

/**
 * English twin of every card page (owner 2026-08-11).
 * The infographic itself is NOT translated — it ships in the market language,
 * by design. The article text does get an English version, because the
 * LinkedIn audience these pages are written for reads English: a share link
 * that drops an English reader onto a German page loses the reader, and that
 * share is the entire purpose of the card page.
 * GB is skipped — its market language already IS English.
 */
const EN_UI = {
  back: 'Market & Trends',
  cta: {
    h: 'The data behind the numbers',
    p: 'Every model with SCOP, sound power, refrigerant and local listing status — join free, 7 days of full access.',
    b: 'Join free',
  },
};
const HAS_EN = MARKET !== 'GB';

/* English heading for the in-app EN view. The PUBLIC index page stays in the
   market language — that page is the market's SEO surface, and a German
   search result with an English heading serves nobody. */
const EN_HEAD = {
  DE: { h1: 'German Heat Pump Market: Data & Trends',
        sub: "Key figures, policy developments and visual insights on Germany's heat pump transition." },
  GB: { h1: M.h1, sub: M.sub },
  FR: { h1: 'French Heat Pump Market: Data & Trends',
        sub: "Key market data, policy developments and visual insights on France's heat pump transition." },
  PL: { h1: 'Polish Heat Pump Market: Data & Trends',
        sub: "Key market data, policy developments and visual insights on Poland's heat pump transition." },
  IT: { h1: 'Italian Heat Pump Market: Data & Trends',
        sub: "Key market data, policy developments and visual insights on Italy's heat pump transition." },
}[MARKET];

/* Page pill beside the in-app title — the News page sets this pattern. */
const PILL = {
  DE: { local: 'Infografik-Karten · monatlich aktualisiert', en: 'Infographic cards · updated monthly' },
  GB: { local: 'Infographic cards · updated monthly', en: 'Infographic cards · updated monthly' },
  FR: { local: 'Cartes infographiques · mise à jour mensuelle', en: 'Infographic cards · updated monthly' },
  PL: { local: 'Karty infograficzne · aktualizacja miesięczna', en: 'Infographic cards · updated monthly' },
  IT: { local: 'Schede infografiche · aggiornamento mensile', en: 'Infographic cards · updated monthly' },
}[MARKET];
const EN_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateEn = (d) => { try { return EN_FMT.format(new Date(d + 'T00:00:00Z')); } catch { return d; } };

/** The English fields, falling back to the market-language ones so a card that
 *  has not been translated yet still renders (never an empty page). */
const enOf = (c) => ({
  title: c.titleEn ?? c.title,
  excerpt: c.excerptEn ?? c.excerpt ?? '',
  body: c.bodyEn ?? c.body ?? [],
  sourceNote: c.sourceNoteEn ?? c.sourceNote ?? '',
});

/* Card detail pages — the social landing targets. og:image is the card PNG
   itself, absolute URL, so a LinkedIn share previews the infographic. */
function renderCard(c, english) {
  const v = english ? enOf(c) : { title: c.title, excerpt: c.excerpt ?? '', body: c.body ?? [], sourceNote: c.sourceNote ?? '' };
  const file = english ? `${c.slug}.en.html` : `${c.slug}.html`;
  const selfUrl = `${host}/market-trends/${file}`;
  const lang = english ? 'en' : M.lang;
  const ui = english ? EN_UI : { back: M.h1, cta: M.cta };
  const date = english ? fmtDateEn(c.date) : fmtDate(c.date);

  const cardLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: v.title, datePublished: c.date, inLanguage: english ? 'en' : HREFLANG[MARKET],
    image: `${host}/market-trends/img/${ogImg(c)}`,
    mainEntityOfPage: selfUrl,
    publisher: { '@type': 'Organization', name: 'HeatPump DataBase (Europe)' },
  };

  // Reciprocal hreflang on both variants: same infographic, two article
  // languages — declared, so neither reads as duplicated content.
  const alternates = HAS_EN ? `
<link rel="alternate" hreflang="${HREFLANG[MARKET]}" href="${host}/market-trends/${c.slug}.html">
<link rel="alternate" hreflang="en" href="${host}/market-trends/${c.slug}.en.html">` : '';

  const toggle = HAS_EN ? `
  <div class="langs">
    <a class="${english ? '' : 'on'}" href="/market-trends/${c.slug}.html">${M.lang.toUpperCase()}</a>
    <a class="${english ? 'on' : ''}" href="/market-trends/${c.slug}.en.html">EN</a>
  </div>` : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.title)} | HeatPump Database</title>
<meta name="description" content="${esc(v.excerpt || v.title)}">
<link rel="canonical" href="${selfUrl}">${alternates}
<meta property="og:title" content="${esc(v.title)}">
<meta property="og:description" content="${esc(v.excerpt)}">
<meta property="og:image" content="${host}/market-trends/img/${ogImg(c)}">
<meta property="og:type" content="article">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/${MARKET === 'GB' ? 'uk' : MARKET.toLowerCase()}-32.png">
<script type="application/ld+json">${JSON.stringify(cardLd)}</script>
<style>
  *{box-sizing:border-box} body{margin:0;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#1d1d1f;background:#fff}
  .wrap{max-width:820px;margin:0 auto;padding:34px 20px 60px}
  .top{display:flex;align-items:center;gap:14px}
  .crumb{font-size:13.5px;color:#0066cc;text-decoration:none}
  .langs{margin-left:auto;display:flex;border:1px solid #d8d8dd;border-radius:999px;overflow:hidden;font-size:12px}
  .langs a{padding:5px 12px;color:#6e6e73;text-decoration:none}
  .langs a.on{background:#1d1d1f;color:#fff;font-weight:600}
  h1{font-size:28px;letter-spacing:-.5px;line-height:1.25;margin:14px 0 6px}
  .meta{color:#7a7a7a;font-size:13.5px;margin:0 0 20px}
  .card-img{width:100%;height:auto;border-radius:18px;display:block;margin-bottom:26px}
  .body p{margin:0 0 15px;font-size:16px;color:#2a2a2c}
  .src{margin-top:18px;font-size:12.5px;color:#7a7a7a;border-top:1px solid #f0f0f0;padding-top:12px}
  .cta{margin-top:30px;background:#f5f5f7;border-radius:18px;padding:24px 28px}
  .cta h2{margin:0 0 6px;font-size:18px} .cta p{margin:0 0 13px;color:#555;font-size:14px}
  .btn{display:inline-block;background:#0066cc;color:#fff;border-radius:999px;padding:10px 24px;font-size:14px;text-decoration:none;font-weight:600}
</style>
</head>
<body><div class="wrap">
  <div class="top"><a class="crumb" href="/market-trends/">← ${esc(ui.back)}</a>${toggle}</div>
  <h1>${esc(v.title)}</h1>
  <p class="meta">${esc(date)} · HeatPump DB</p>
  <img class="card-img" src="/market-trends/img/${c.image}" alt="${esc(v.title)}">
  <div class="body">${v.body.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
  ${v.sourceNote ? `<p class="src">${esc(v.sourceNote)}</p>` : ''}
  <div class="cta"><h2>${esc(ui.cta.h)}</h2><p>${esc(ui.cta.p)}</p>
    <a class="btn" href="/?ref=trends">${esc(ui.cta.b)} ›</a></div>
</div></body></html>
`;
}

for (const c of feed) {
  writeFileSync(join(OUT_DIR, 'market-trends', `${c.slug}.html`), renderCard(c, false));
  if (HAS_EN) writeFileSync(join(OUT_DIR, 'market-trends', `${c.slug}.en.html`), renderCard(c, true));
}

/* Index: the card grid (newest first), then the standing live-data infographic. */
const grid = feed.length ? `
  <div class="grid">
    ${feed.map((c) => `
    <a class="cardlink" href="/market-trends/${c.slug}.html">
      <img src="/market-trends/img/${c.image}" alt="${esc(c.title)}" loading="lazy">
      <div class="ct"><span class="cd">${esc(fmtDate(c.date))}</span>
        <span class="cn">${esc(c.title)}</span>
        ${c.excerpt ? `<span class="ce">${esc(c.excerpt)}</span>` : ''}</div>
    </a>`).join('')}
  </div>` : `
  <div class="roadmap"><h2>${esc(M.coming)}</h2>
    <ul>${M.roadmap.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;

const indexHtml = html
  .replace('__GRID__', grid)
  .replace('__LIVECARD__', svg);
mkdirSync(join(OUT_DIR, 'market-trends'), { recursive: true });
writeFileSync(join(OUT_DIR, 'market-trends', 'index.html'), indexHtml);

/* feed.json — the in-app Trends page (global nav, next to News) renders the
   same feed natively, so members read cards without leaving the app. */
writeFileSync(join(OUT_DIR, 'market-trends', 'feed.json'), JSON.stringify({
  h1: M.h1, sub: M.sub, coming: M.coming, roadmap: M.roadmap,
  h1En: EN_HEAD.h1, subEn: EN_HEAD.sub,
  pill: PILL.local, pillEn: PILL.en,
  items: feed.map((c) => ({
    slug: c.slug, date: c.date, title: c.title, excerpt: c.excerpt ?? '',
    image: `/market-trends/img/${c.image}`, body: c.body ?? [],
    sourceNote: c.sourceNote ?? '',
    // The English article travels with the card: the app's EN toggle switches
    // the text, never the infographic (which stays in the market language).
    en: enOf(c),
  })),
}) + '\n');
console.log(`market-trends (${MARKET}): ${nf(all.length)} models · R290 ${pct(nR290)}% · SCOP med ${scopMed.toFixed(2)} · quiet ${Math.round((quiet / noises.length) * 100)}%`);
