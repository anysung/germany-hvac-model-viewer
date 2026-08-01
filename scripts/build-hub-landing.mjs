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
const { logoSvgDoc, flagSvgDoc, logoInner, BRAND_COLORS } = await import(pathToFileURL(tmp).href);
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

// Animated lockup — the SAME living logo the app header renders (logoInner
// animated:true + the app's own spin/DB-color keyframes copied verbatim into
// the page CSS; --hp-db-a/b vars inline like BrandLogo.tsx does).
const cDark = BRAND_COLORS.dark;
const LOGO = `<svg class="logo" viewBox="0 0 348 64" fill="none" role="img" aria-label="HeatPump DB" style="--hp-db-a:${cDark.red};--hp-db-b:${cDark.blue}">${logoInner({ theme: 'dark', symbolOnly: false, animated: true })}</svg>`;

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
/* Language switcher flags: GB stands for English. */
const LANG_FLAGS = [['en', 'GB'], ['de', 'DE'], ['fr', 'FR'], ['pl', 'PL'], ['it', 'IT']]
  .map(([lang, cc]) => [lang, flagSvgDoc(cc, false).replace('<svg ', '<svg class="lf" aria-hidden="true" ')]);

const FEAT_ICONS = ['⚡', '⚖️', '📄', '🏷️', '💶', '📰'];

/* ── Hub i18n: EN default, DE/FR/PL/IT switchable (owner 2026-08-01).
   Client-side swap via data-i18n keys — the served HTML is English (what
   Google indexes; the hreflang cluster already routes languages to the
   country sites). Registry names in chips are proper nouns and never
   translate. */
const I18N = {
  en: {
    h1a: 'Every listed heat pump in Europe.', h1b: 'One database.',
    sub: 'Registry-based technical data for installers and professionals — searchable in seconds, comparable side-by-side, printable as quote-ready data sheets. Refreshed with every monthly update.',
    featLabel: 'Key features',
    features: ['Instant model search', 'Compare 4 side-by-side', 'Print-ready data sheets', 'EU energy label sheets', 'Funding tracked monthly', 'Market news briefings'],
    sect: 'Choose your market', models: 'models', open: 'Open',
    band: '<strong>Built for daily installer work.</strong> Official listing status on every product, the EU energy label one click away, and the month\u2019s funding changes already summarised when you open the app. Professional &amp; Team subscriptions — the free first week is included with every new account.',
    legal: 'Product data is provided for information — verify against official sources before contractual use.',
    tag: {
      DE: 'The BAFA-list database for installers and planners.',
      GB: 'The Ofgem PEL companion for MCS installers.',
      FR: 'The air/water heat-pump reference base for RGE professionals.',
      PL: 'The heat-pump database with confirmed ZUM status.',
      IT: 'The database with GSE catalogue status (Conto Termico).',
    },
  },
  de: {
    h1a: 'Jede gelistete Wärmepumpe in Europa.', h1b: 'Eine Datenbank.',
    sub: 'Registerbasierte technische Daten für Fachhandwerk und Profis — in Sekunden durchsuchbar, direkt vergleichbar, als angebotsfertige Datenblätter druckbar. Aktualisiert mit jedem Monats-Update.',
    featLabel: 'Kernfunktionen',
    features: ['Sofortige Modellsuche', '4 Modelle im Vergleich', 'Druckfertige Datenblätter', 'EU-Energielabel-Blätter', 'Förderung monatlich verfolgt', 'Markt-News-Briefings'],
    sect: 'Wählen Sie Ihren Markt', models: 'Modelle', open: 'Öffnen:',
    band: '<strong>Für die tägliche Installateursarbeit gebaut.</strong> Offizieller Listenstatus an jedem Produkt, das EU-Energielabel einen Klick entfernt, und die Förderänderungen des Monats beim Öffnen der App bereits zusammengefasst. Professional- &amp; Team-Abos — die kostenlose erste Woche ist bei jedem neuen Konto enthalten.',
    legal: 'Produktdaten dienen der Information — vor vertraglicher Nutzung an offiziellen Quellen prüfen.',
    tag: {
      DE: 'Die Datenbank zur BAFA-Liste — für Fachhandwerk und Planer.',
      GB: 'Der Ofgem-PEL-Begleiter für MCS-Installateure.',
      FR: 'Die Luft/Wasser-Referenzdatenbank für RGE-Profis.',
      PL: 'Die Wärmepumpen-Datenbank mit bestätigtem ZUM-Status.',
      IT: 'Die Datenbank mit GSE-Katalogstatus (Conto Termico).',
    },
  },
  fr: {
    h1a: 'Toutes les pompes à chaleur référencées en Europe.', h1b: 'Une seule base.',
    sub: 'Données techniques issues des registres pour installateurs et professionnels — recherche en quelques secondes, comparaison côte à côte, fiches techniques prêtes pour le devis. Actualisées à chaque mise à jour mensuelle.',
    featLabel: 'Fonctions clés',
    features: ['Recherche instantanée', 'Comparer 4 modèles', 'Fiches techniques prêtes à imprimer', 'Fiches étiquette énergie UE', 'Aides suivies chaque mois', 'Briefings marché'],
    sect: 'Choisissez votre marché', models: 'modèles', open: 'Ouvrir :',
    band: '<strong>Conçu pour le travail quotidien de l\u2019installateur.</strong> Statut officiel de référencement sur chaque produit, l\u2019étiquette énergie UE à un clic, et les changements d\u2019aides du mois déjà résumés à l\u2019ouverture. Abonnements Professional &amp; Team — la première semaine gratuite est incluse avec chaque nouveau compte.',
    legal: 'Les données produits sont fournies à titre d\u2019information — vérifiez auprès des sources officielles avant tout usage contractuel.',
    tag: {
      DE: 'La base de la liste BAFA — pour artisans et bureaux d\u2019études.',
      GB: 'Le compagnon Ofgem PEL des installateurs MCS.',
      FR: 'La base de référence des PAC air/eau pour les pros RGE.',
      PL: 'La base des pompes à chaleur avec statut ZUM confirmé.',
      IT: 'La base avec statut au catalogue GSE (Conto Termico).',
    },
  },
  pl: {
    h1a: 'Każda pompa ciepła z europejskich rejestrów.', h1b: 'Jedna baza.',
    sub: 'Dane techniczne oparte na rejestrach dla instalatorów i profesjonalistów — wyszukiwanie w sekundy, porównanie obok siebie, karty danych gotowe do oferty. Odświeżane przy każdej comiesięcznej aktualizacji.',
    featLabel: 'Kluczowe funkcje',
    features: ['Błyskawiczna wyszukiwarka', 'Porównanie 4 modeli', 'Karty danych do druku', 'Karty etykiety energetycznej UE', 'Dotacje śledzone co miesiąc', 'Briefingi rynkowe'],
    sect: 'Wybierz swój rynek', models: 'modeli', open: 'Otwórz:',
    band: '<strong>Stworzona do codziennej pracy instalatora.</strong> Oficjalny status z listy przy każdym produkcie, etykieta energetyczna UE o klik, a zmiany w dotacjach z danego miesiąca już podsumowane po otwarciu aplikacji. Subskrypcje Professional i Team — bezpłatny pierwszy tydzień w każdym nowym koncie.',
    legal: 'Dane produktów mają charakter informacyjny — przed użyciem w umowach zweryfikuj w oficjalnych źródłach.',
    tag: {
      DE: 'Baza listy BAFA — dla instalatorów i projektantów.',
      GB: 'Towarzysz listy Ofgem PEL dla instalatorów MCS.',
      FR: 'Referencyjna baza PAC powietrze/woda dla profesjonalistów RGE.',
      PL: 'Baza pomp ciepła z potwierdzonym statusem ZUM.',
      IT: 'Baza ze statusem w katalogu GSE (Conto Termico).',
    },
  },
  it: {
    h1a: 'Ogni pompa di calore censita in Europa.', h1b: 'Un unico database.',
    sub: 'Dati tecnici basati sui registri per installatori e professionisti — ricerca in pochi secondi, confronto affiancato, schede tecniche pronte per il preventivo. Aggiornati a ogni aggiornamento mensile.',
    featLabel: 'Funzioni chiave',
    features: ['Ricerca istantanea', 'Confronto di 4 modelli', 'Schede tecniche pronte da stampare', 'Schede etichetta energetica UE', 'Incentivi seguiti ogni mese', 'Briefing di mercato'],
    sect: 'Scegli il tuo mercato', models: 'modelli', open: 'Apri:',
    band: '<strong>Costruito per il lavoro quotidiano dell\u2019installatore.</strong> Stato ufficiale di catalogo su ogni prodotto, etichetta energetica UE a un clic e i cambiamenti degli incentivi del mese già riassunti all\u2019apertura. Abbonamenti Professional e Team — la prima settimana gratuita è inclusa in ogni nuovo account.',
    legal: 'I dati prodotto sono forniti a scopo informativo — verificare sulle fonti ufficiali prima dell\u2019uso contrattuale.',
    tag: {
      DE: 'Il database della lista BAFA — per installatori e progettisti.',
      GB: 'Il compagno Ofgem PEL per gli installatori MCS.',
      FR: 'La base di riferimento delle PdC aria/acqua per i professionisti RGE.',
      PL: 'Il database delle pompe di calore con stato ZUM confermato.',
      IT: 'Il database con lo stato nel catalogo GSE (Conto Termico).',
    },
  },
};

const cardHtml = (m, i) => `
      <a class="card" href="${m.url}" style="--i:${i}">
        <div class="card-top">
          ${m.flag}
          <div class="card-names">
            <span class="card-name">${m.name}</span>
            <span class="card-host">${m.host}</span>
          </div>
        </div>
        <p class="card-tag" data-i18n="tag.${m.cc}">${I18N.en.tag[m.cc]}</p>
        <div class="card-meta">
          <span class="chip">${m.chip}</span>
          <span class="models">${m.models} <em data-i18n="models">models</em></span>
        </div>
        <div class="card-foot">
          <span class="cta"><span data-i18n="open">Open</span> ${m.host} <span class="arr">→</span></span>
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
  /* Living logo — identical animation source to the app header (index.css). */
  @keyframes hp-logo-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .hp-logo-spin { transform-box: view-box; transform-origin: 32px 32px; animation: hp-logo-spin 6s linear infinite; will-change: transform; }
  @keyframes hp-logo-db { 0%, 46% { fill: var(--hp-db-b); } 50%, 96% { fill: var(--hp-db-a); } 100% { fill: var(--hp-db-b); } }
  .hp-logo-db { fill: var(--hp-db-b); animation: hp-logo-db 6s linear infinite; }
  @media (prefers-reduced-motion:reduce) { .hp-logo-spin, .hp-logo-db { animation:none; } }

  /* Key features — an explicit label + two rows of three, sized to be READ,
     not skimmed (owner call 2026-08-01: the old pill row was too quiet). */
  .feat-label { margin-top:34px; font-size:13px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
    background:linear-gradient(92deg,var(--red),var(--blue)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .chips { display:grid; grid-template-columns:repeat(3, minmax(0, 250px)); gap:12px; justify-content:center; margin-top:16px; }
  .fchip { display:flex; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.16); border-radius:14px;
    padding:14px 18px; font-size:15px; font-weight:600; color:#e8eef7; text-align:left;
    background:linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.02)); backdrop-filter:blur(6px);
    transition:border-color .3s, transform .3s; }
  .fchip:hover { border-color:rgba(41,151,255,.55); transform:translateY(-2px); }
  .fic { font-size:19px; flex:none; }
  @media (max-width:700px) { .chips { grid-template-columns:repeat(2, minmax(0, 1fr)); } .fchip { font-size:13.5px; padding:12px 14px; } }

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

  /* ── Language switcher — five CIRCULAR buttons, top-right (owner 2026-08-01).
     The circle is the BUTTON; the flag inside stays the brand waving cloth
     (never cropped to a disc — brand rule). GB flag = English. ── */
  .langbar { position:fixed; top:14px; right:16px; z-index:50; display:flex; gap:8px;
    padding:7px 9px; border-radius:999px; background:rgba(11,22,38,.72); border:1px solid var(--line);
    backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
  .langbtn { width:34px; height:34px; border-radius:50%; border:1.5px solid rgba(255,255,255,.18);
    background:rgba(255,255,255,.05); cursor:pointer; display:flex; align-items:center; justify-content:center;
    padding:0; opacity:.62; transition:opacity .25s, transform .25s, border-color .25s, box-shadow .25s; }
  .langbtn:hover { opacity:1; transform:translateY(-1.5px); border-color:rgba(255,255,255,.4); }
  .langbtn[aria-pressed="true"] { opacity:1; border-color:var(--blue);
    box-shadow:0 0 0 2px rgba(41,151,255,.35), 0 3px 10px rgba(0,0,0,.35); }
  .langbtn .lf { width:21px; height:auto; display:block; pointer-events:none; }
  @media (max-width:700px) { .langbar { top:10px; right:10px; gap:6px; padding:6px 7px; }
    .langbtn { width:30px; height:30px; } .langbtn .lf { width:18px; } }
  @media (prefers-reduced-motion:reduce) { .card, .card:hover .flag { animation:none; } .card { transition:none; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="langbar" role="group" aria-label="Language">
      ${LANG_FLAGS.map(([lang, f]) => `<button class="langbtn" data-lang="${lang}" aria-label="${lang}">${f}</button>`).join('')}
    </div>
    <header>
      ${LOGO}
      <h1><span data-i18n="h1a">${I18N.en.h1a}</span><br><span class="grad" data-i18n="h1b">${I18N.en.h1b}</span></h1>
      <p class="sub" data-i18n="sub">${I18N.en.sub}</p>
      <div class="feat-label" data-i18n="featLabel">${I18N.en.featLabel}</div>
      <div class="chips">${FEAT_ICONS.map((e, i) => `<span class="fchip"><span class="fic">${e}</span><span data-i18n="features.${i}">${I18N.en.features[i]}</span></span>`).join('')}</div>
    </header>

    <div class="sect" data-i18n="sect">${I18N.en.sect}</div>
    <div class="grid" id="grid">${MARKETS.map(cardHtml).join('')}
    </div>
  </div>

  <div class="band">
    <p data-i18n-html="band">${I18N.en.band}</p>
  </div>

  <footer>
    <div>${MARKETS.map(m => `<a href="${m.url}">${m.host}</a>`).join(' · ')}</div>
    <div><a href="mailto:support@heatpumpdb.eu">support@heatpumpdb.eu</a> · <a href="/models/">Model index</a></div>
    <div class="legal">© ${new Date().getFullYear()} HeatPump DataBase (Europe)™ · <span data-i18n="legal">${I18N.en.legal}</span></div>
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

  // ── i18n: served HTML is English (what crawlers index); the switcher swaps
  //    text client-side and remembers the choice. band uses innerHTML (trusted
  //    build-time strings only — nothing user-supplied ever enters I18N).
  const I18N = ${JSON.stringify(I18N)};
  const pick = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  function setLang(lang) {
    const d = I18N[lang] || I18N.en;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = pick(d, el.getAttribute('data-i18n'));
      if (typeof v === 'string') el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const v = pick(d, el.getAttribute('data-i18n-html'));
      if (typeof v === 'string') el.innerHTML = v;
    });
    document.documentElement.lang = lang === 'en' ? 'en' : lang;
    document.querySelectorAll('.langbtn').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    try { localStorage.setItem('hub-lang', lang); } catch {}
  }
  document.querySelectorAll('.langbtn').forEach(b =>
    b.addEventListener('click', () => setLang(b.dataset.lang)));
  let saved = 'en';
  try { saved = localStorage.getItem('hub-lang') || 'en'; } catch {}
  setLang(I18N[saved] ? saved : 'en');
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
   our own search analytics, capped at ~10% — an INTERNAL protected-database/
   anti-scraping ceiling, not a Google rule. Expansion gate (marketing
   advisory 2026-08-01, adopted): never grow the subset while Search Console
   index retention is falling or while subset\u2192registration is unmeasured.
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
  const seenSpec = new Set();   // near-duplicate guard: identical displayed specs → identical page
  const best = items
    .sort((a, b) => (b.scop ?? 0) - (a.scop ?? 0))
    .filter(x => {
      const k = x.model; if (seen.has(k)) return false; seen.add(k);
      const sp = `${(x.power_35C_kw ?? x.power_55C_kw).toFixed(1)}|${Number(x.scop).toFixed(2)}|${x.refrigerant}|${energyClass(x.efficiency_35C_percent)}`;
      if (seenSpec.has(sp)) return false; seenSpec.add(sp);
      return true;
    })
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

/* Regenerate from scratch — stale pages from a previous selection must not
   linger (their prev/next links would dangle and near-duplicates would
   survive the dedup guard). */
rmSync(join(OUT, 'models'), { recursive: true, force: true });
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
  const similar = models
    .filter(o => o.mfr !== m.mfr && Math.abs(Number(o.kw) - Number(m.kw)) <= 1.5)
    .sort((a, b) => Math.abs(Number(a.kw) - Number(m.kw)) - Math.abs(Number(b.kw) - Number(m.kw)))
    .slice(0, 3);
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
<span class="snap">Snapshot ${snapshotDate} — verify against official sources before contractual use. The EU energy class shown is derived from registry seasonal efficiency values per EU Regulation 811/2013; it is not an official label. <a href="/models/methodology.html">How this data is compiled</a>.</span>
${ctaBlock}
<div class="rel"><h3>More ${m.mfr} models</h3>${same.map(o => `<a href="/models/${o.slug}.html">${o.model}</a>`).join('')}</div>
${similar.length ? `<div class="rel"><h3>Similar capacity, other manufacturers</h3>${similar.map(o => `<a href="/models/${o.slug}.html">${o.mfr} ${o.model} (${o.kw} kW)</a>`).join('')}</div>` : ''}
<div class="rel"><h3>Browse</h3><a href="/models/">All indexed models</a> · <a href="/models/${prev.slug}.html">‹ ${prev.model}</a> · <a href="/models/${next.slug}.html">${next.model} ›</a></div>`;
  writeFileSync(join(OUT, 'models', `${m.slug}.html`), pageShell(title, desc, `/models/${m.slug}.html`, body, ld));
});

/* Methodology page (marketing advisory 2026-08-01, mandatory item 6):
   what makes the model pages citable. Generic vocabulary only — no national
   registry names on the pan-market surface. */
const methBody = `
<h1>How this data is compiled</h1>
<div class="mfr">Methodology for the public model index</div>
<div class="cta" style="margin-top:26px">
  <h2>Sources</h2>
  <p>Every record originates from official European registry and public-authority sources. Values are published as found in the source at the stated snapshot date — never estimated, interpolated or generated. Each market application additionally shows the model's national listing status from that market's own official list; listing status is intentionally not part of this public index.</p>
</div>
<div class="cta">
  <h2>Selection and refresh</h2>
  <p>The index is a small curated subset of the full catalogue: mainstream manufacturers' models with complete public core data (manufacturer, model designation, rated capacity, seasonal efficiency, refrigerant). The underlying catalogue is refreshed on a monthly update cycle; each page shows the snapshot date its values were taken from.</p>
</div>
<div class="cta">
  <h2>EU energy class</h2>
  <p>The energy class shown is derived from the registry-published seasonal space-heating efficiency (\u03b7s) according to EU Regulation 811/2013. It is a calculated reference value, not an official product label. Always verify the manufacturer's label and current registry entries before contractual use.</p>
</div>
<div class="cta">
  <h2>Independence</h2>
  <p>HeatPump DataBase (Europe) is an independent professional reference. It is not affiliated with, endorsed by, or acting for any public authority, registry operator or manufacturer. Product names and trademarks remain the property of their owners.</p>
</div>
${ctaBlock}
<div class="rel"><h3>Browse</h3><a href="/models/">All indexed models</a></div>`;
writeFileSync(join(OUT, 'models', 'methodology.html'),
  pageShell('How this data is compiled — methodology | HeatPump DB',
    'Sources, refresh cycle and derivation rules behind the HeatPump DB public model index: official European registry data, monthly snapshots, EU 811/2013 energy-class derivation.',
    '/models/methodology.html', methBody, null));

/* Index page — grouped by manufacturer. */
const groups = [...new Set(models.map(m => m.mfr))].map(mfr => ({
  mfr, items: models.filter(m => m.mfr === mfr),
}));
const idxBody = `
<h1>Heat pump model index</h1>
<div class="mfr">${models.length} selected models from the European catalogue · basic reference data only</div>
${ctaBlock}
<span class="snap"><a href="/models/methodology.html">How this data is compiled</a></span>
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
  + `  <url><loc>https://www.heatpumpdb.eu/models/methodology.html</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq></url>\n`
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
