#!/usr/bin/env node
/**
 * build-europe-report.mjs — the monthly European special report as an ebook.
 *
 * WHAT THIS PRODUCES
 * A single self-contained HTML file (works on any computer, no install) with a
 * 5-language switcher (EN/DE/FR/PL/IT), hover tooltips on every chart bar,
 * source links on every chapter, per-market colour palettes and brand marks on
 * every figure — so a screenshot of any table or chart carries the brand.
 * Two editions:
 *   FULL     — downloadable only from our sites.
 *   PREVIEW  — for LinkedIn/ads: cover + executive summary + the first chapter
 *              stay readable; every later chapter is blurred with a CTA overlay
 *              pointing at heatpumpdb.eu and the five market sites. The digits
 *              under the blur are SCRAMBLED, because a CSS blur alone can be
 *              removed in devtools — the gate must hold even against that.
 * Plus A4 PDFs of both (LinkedIn document posts need PDF).
 *
 * ONE-SOURCE RULES
 *   Palettes:  scripts/lib/trends-card-blocks.mjs THEMES (the card colours).
 *   Icons:     public/icons/*.png (official app icons, base64-embedded).
 *   Lockup:    the marketing bridge SVG export — never redrawn.
 *   Numbers:   the research dossier series (02_MARKET_INTELLIGENCE/…/series.json
 *              is the record; the values here are transcribed from it and every
 *              figure keeps its publisher).
 *
 * Run:  node scripts/marketing/build-europe-report.mjs
 * Out:  <marketing>/02_MARKET_INTELLIGENCE/EUROPE_HEATING_MARKET_2026-08/report/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { THEMES } from '../lib/trends-card-blocks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MKT = '/Users/christophersung/Claude/Projects/HeatPump DB Marketing';
const OUT = join(MKT, '02_MARKET_INTELLIGENCE', 'EUROPE_HEATING_MARKET_2026-08', 'report');
mkdirSync(OUT, { recursive: true });

const icon = (f) => `data:image/png;base64,${readFileSync(join(ROOT, 'public', 'icons', f)).toString('base64')}`;
const ICONS = { EU: icon('eu-192.png'), DE: icon('de-48.png'), GB: icon('uk-48.png'), FR: icon('fr-48.png'), PL: icon('pl-48.png'), IT: icon('it-48.png') };
const LOCKUP = readFileSync(join(MKT, 'Claude Code', 'brand', 'svg', 'heatpumpdb-3a-lockup-dark.svg'), 'utf8');

const SITES = [
  ['heatpumpdb.de', 'Deutschland'], ['heatpumpdb.uk', 'United Kingdom'], ['heatpumpdb.fr', 'France'],
  ['heatpumpdb.pl', 'Polska'], ['heatpumpdb.it', 'Italia'],
];

/* ── The published series (transcribed from the dossier; publisher on every row) ── */
const S = {
  DE: {
    years: [2021, 2022, 2023, 2024, 2025],
    total: [929000, 980000, 1308500, 712500, 627000],
    hp: [154000, 236000, 356000, 193000, 299000],
    share: ['16.6 %', '24.1 %', '27.2 %', '27.1 %', '47.7 %'],
    src: 'BDH · BDH/BWP',
  },
  GB: {
    years: [2021, 2022, 2023, 2024, 2025],
    total: [1933799, 1828061, 1644206, 1525973, 1561253],
    hp: [47699, 61061, 62906, 87573, 110353],
    share: ['2.5 %', '3.3 %', '3.8 %', '5.7 %', '7.1 %'],
    src: 'EHI · HPA UK',
  },
  FR: {
    years: [2021, 2022, 2023, 2024, 2025],
    total: [1018840, 908425, 716701, 639594, 613460],
    hp: [269940, 358445, 310051, 185364, 181890],
    share: ['26.5 %', '39.5 %', '43.3 %', '29.0 %', '29.6 %'],
    src: 'Uniclima / PAC&Clim’Info',
  },
  PL: {
    years: [2021, 2022, 2023, 2024, 2025],
    hpOnly: [109180, 249760, 158480, 163460, 178610],
    src: 'SPIUG (fig. 38)',
  },
  IT: { murali: { y: [2024, 2025], v: [911899, 769090] }, src: 'Assotermica' },
};
const nf = (n) => n.toLocaleString('en-GB');

/* ── Copy, five languages. Numbers stay as printed by their publishers. ────── */
const L = {
en: {
  langName: 'English', dir: 'ltr',
  edition: 'Special Report · Edition August 2026', by: 'A HeatPump DB publication',
  coverTitle: 'The European Heating Market',
  coverSub: 'Boilers and heat pumps in Germany, the United Kingdom, France, Poland and Italy — the 2021–2025 series, and what the numbers actually count.',
  coverNote: 'Every figure carries its publisher and its counting basis. Sales into the trade — not installations.',
  contents: 'Contents', preview: 'FREE PREVIEW', fullEd: 'Full edition',
  tocItems: ['Executive summary', 'Germany', 'United Kingdom', 'France', 'Poland', 'Italy', 'What nobody publishes', 'Sources & methodology'],
  execKicker: 'EXECUTIVE SUMMARY', execTitle: 'Five markets, five answers',
  execLead: 'Europe does not have one heating market. In 2025 the heat pump share of new heating-system sales ranged from 7 % in the United Kingdom to nearly 48 % in Germany — and a good part of that spread is definition, not physics. This report puts the five national series side by side, keeps every number on the basis its publisher gave it, and states what the statistics rarely say out loud: what is actually being counted.',
  atGlance: 'The five markets in 2025', hpShort: 'heat pumps', shareShort: 'share', totalShort: 'market',
  glanceNote: { DE: 'of 627,000 heat generators (BDH)', GB: 'of 1.56 m boilers + heat pumps (EHI · HPA)', FR: 'of 613,460 hydronic units (Uniclima)', PL: 'of 556,370 heating appliances (SPIUG)', IT: 'wall-hung boiler sales — first full year without fossil-boiler incentives (Assotermica)' },
  insights: [
    ['Share is not momentum.', 'In France and Germany the heat pump share rose while the whole market shrank — France by 40 % since 2021, Germany by 52 % since 2023. The denominator is doing much of the work; a share chart alone flatters the trend.'],
    ['The 2023 bubble is still unwinding.', 'Germany peaked at 1.31 m heat generators in 2023, Poland’s heat pumps at 249,760 in 2022. What followed was pull-forward correction and destocking — not a collapse in underlying demand.'],
    ['Sales are not installations.', 'No European body publishes an annual installation census for boilers. Every number in this report is sell-in to the trade — and every “installations” figure in the trade press deserves the same question.'],
  ],
  legendHp: 'of which heat pumps', legendTotal: 'market total', hover: 'Hover any bar for the exact figures and source.',
  outlook: 'Outlook', notes: 'Read the numbers right', sources: 'Sources',
  ch: {
    DE: { title: 'Nearly every second new heating system is a heat pump',
      lead: 'Germany sold 627,000 heat generators in 2025 — the lowest level in fifteen years — and 299,000 of them were heat pumps: a 47.7 % share, up from 16.6 % in 2021. The first half of 2026 pushed the share to 55 %.',
      chart: 'Heat generators sold and heat pump share',
      outlook: [['BWP industry study 2026 — base case 2026', '332,500 heat pumps · 47 %'], ['Base case 2027', '369,500 heat pumps · 48 %'], ['H1 2026, actual', '194,500 heat pumps · +40 %']],
      notes: ['Sell-in to wholesale and trade — Germany publishes no installation count.', 'Domestic hot-water heat pumps (49,500 in 2025) are counted separately and excluded here.'] },
    GB: { title: 'Thirteen boilers for every heat pump — and a −22 % first quarter',
      lead: 'The UK sold 1,450,900 boilers and 110,353 hydronic heat pumps in 2025. The share has nearly tripled since 2021 — but Q1 2026 retrofit installations fell 22 % year on year, against a pathway that needs 158,587 in 2027.',
      chart: 'Boilers + heat pumps sold into the market',
      outlook: [['Warm Homes Plan target', '450,000 installations / year by 2030'], ['CCC milestone 2027', '158,587 retrofit installations'], ['HPA: growth required', '33 % compound, every year to 2030']],
      notes: ['Three official counts for 2025 disagree by design: 110,353 sold (HPA) · 61,246 MCS-certified installations · 53,265 DESNZ retrofit.', 'Boilers: EHI Heating Market Reports. There is no UK installation census for boilers.'] },
    FR: { title: 'A market down 40 % — the share gain is mostly the denominator',
      lead: 'France’s hydronic heating market fell from 1,018,840 units in 2021 to 613,460 in 2025. The heat pump share rose to 29.6 % — but air-to-water volumes themselves fell to 179,377. Gas and oil boilers still outsell them 2.4 to one.',
      chart: 'Hydronic generators sold and heat pump share',
      outlook: [['State production target (DGE)', '1,000,000 heat pumps built / year by end-2027'], ['AFPAC fleet target', '8.8 m residential heat pumps by 2030'], ['Uniclima forecast for 2026', 'none published — qualitative only']],
      notes: ['Air-to-air (803,661 outdoor units in 2025) is excluded; Uniclima ties its H2 surge to 27 heatwave days — largely a cooling purchase. Included, the share would read ~70 %.', 'Totals and shares are HeatPump DB calculations on Uniclima’s published components — Uniclima publishes neither.'] },
    PL: { title: 'Nearly a third of the market, two years after the crash',
      lead: 'Poland sold 178,610 heat pumps in 2025 — 32.1 % of a 556,370-unit market — the second year of recovery after the 2022 peak of 249,760 collapsed to 158,480. Four in five heat pumps sold in 2025 carried no subsidy.',
      chart: 'Heat pumps sold (incl. air-to-air and DHW)',
      outlook: [['PORT PC 2026, preliminary', 'air-to-water +10–15 % · ground +15–25 %'], ['H1 2026, actual', 'space-heating heat pumps +18 %'], ['Forecast for 2027', 'none published by any body']],
      notes: ['SPIUG’s count includes air-to-air and hot-water units; PORT PC’s heating-only basis puts 2025 at ~87,000. Both are correct — on different definitions.', 'SPIUG marks its solid-fuel boiler data as estimates.'] },
    IT: { title: 'The year the boiler subsidies ended: −15.7 %',
      lead: 'Italian wall-hung boiler sales fell from 911,899 to 769,090 in 2025 — the first full year after fossil-fuel boilers lost Ecobonus and Bonus Casa eligibility. No Italian body publishes a market total or a heat pump share; this chapter shows what is published, on its own basis.',
      chart: 'Wall-hung boiler sales, full year (constant panel)',
      outlook: [['Hydronic HP ≤ 10 kW (volumes, 2025)', '−4.4 %'], ['Hydronic HP 18–50 kW (volumes)', '+11.6 %'], ['Air-to-air monosplit (volumes)', '+16 %']],
      outlookSrc: 'Direction of 2025 — Assoclima, percentage changes at constant panel',
      notes: ['EHPA counts 423,000 heat pumps for Italy in 2025 — including reversible air-to-air. Hydronic-only trade estimates are roughly a quarter of that. Never mix the bases.', 'Conto Termico 3.0 (in force 25 Dec 2025) pays up to 65 % directly via the GSE; condensing boilers are excluded.'] },
  },
  measureTitle: 'What nobody publishes',
  measure: [
    'Not one of the five markets publishes an installation census for boilers. BDH, EHI, Uniclima, SPIUG and Assotermica all count units sold into the trade — and each draws the line around “heat pump” differently: with or without air-to-air, with or without hot-water units.',
    'That is why this report never compares shares across borders without saying so, and why every figure keeps its publisher attached. Where a number is our own arithmetic on published components — the UK total, the French share — it is labelled as our calculation, not passed off as a statistic.',
    'A single European heat pump market will exist when the statistics do. Until then, precision about what is counted is the most useful thing a database company can publish.',
  ],
  aboutTitle: 'The data behind every number',
  aboutP: 'HeatPump DB is the registry-based heat pump database for installers and professionals in five European markets — 7,000+ models with SCOP, sound power, refrigerant and official listing status, searchable in seconds, comparable side-by-side and printable as quote-ready data sheets. Refreshed with every monthly update.',
  aboutCta: 'Start free — 7-day full access', aboutAt: 'on your market’s site',
  srcTitle: 'Sources & methodology',
  srcIntro: 'All volumes are sales into the trade (sell-in). Figures marked as HeatPump DB calculations are arithmetic on the components published by the bodies below. The full research record, including every contradiction found between sources, is maintained internally and summarised per chapter.',
  ovTitle: 'You are reading the free preview',
  ovBody: 'The full edition — all five market chapters, the complete 2021–2025 series, outlooks, and the source link for every figure — is free on our European hub and on each market site.',
  ovBtn: 'Get the full report — heatpumpdb.eu', ovList: 'Or download it on your market’s site:',
  footer: '© 2026 HeatPump DataBase (Europe)™ · Sales into the trade, not installations · heatpumpdb.eu',
},
de: {
  langName: 'Deutsch', dir: 'ltr',
  edition: 'Spezialreport · Ausgabe August 2026', by: 'Eine Publikation von HeatPump DB',
  coverTitle: 'Der europäische Heizungsmarkt',
  coverSub: 'Kessel und Wärmepumpen in Deutschland, Großbritannien, Frankreich, Polen und Italien — die Reihen 2021–2025, und was die Zahlen wirklich zählen.',
  coverNote: 'Jede Zahl trägt ihre Quelle und ihre Zählbasis. Absatz an den Fachhandel — keine Installationszahlen.',
  contents: 'Inhalt', preview: 'KOSTENLOSE VORSCHAU', fullEd: 'Vollausgabe',
  tocItems: ['Zusammenfassung', 'Deutschland', 'Großbritannien', 'Frankreich', 'Polen', 'Italien', 'Was niemand veröffentlicht', 'Quellen & Methodik'],
  execKicker: 'ZUSAMMENFASSUNG', execTitle: 'Fünf Märkte, fünf Antworten',
  execLead: 'Europa hat keinen einheitlichen Heizungsmarkt. 2025 lag der Wärmepumpen-Anteil am Absatz neuer Heizsysteme zwischen 7 % in Großbritannien und fast 48 % in Deutschland — und ein guter Teil dieser Spanne ist Definition, nicht Physik. Dieser Report stellt die fünf nationalen Reihen nebeneinander, belässt jede Zahl auf der Basis ihres Herausgebers und benennt, was Statistiken selten aussprechen: was eigentlich gezählt wird.',
  atGlance: 'Die fünf Märkte 2025', hpShort: 'Wärmepumpen', shareShort: 'Anteil', totalShort: 'Markt',
  glanceNote: { DE: 'von 627.000 Wärmeerzeugern (BDH)', GB: 'von 1,56 Mio. Kesseln + Wärmepumpen (EHI · HPA)', FR: 'von 613.460 hydraulischen Geräten (Uniclima)', PL: 'von 556.370 Heizgeräten (SPIUG)', IT: 'Absatz wandhängender Kessel — erstes volles Jahr ohne Förderung fossiler Kessel (Assotermica)' },
  insights: [
    ['Anteil ist nicht Dynamik.', 'In Frankreich und Deutschland stieg der Wärmepumpen-Anteil, während der Gesamtmarkt schrumpfte — Frankreich um 40 % seit 2021, Deutschland um 52 % seit 2023. Der Nenner leistet viel von der Arbeit; ein Anteilsdiagramm allein schmeichelt dem Trend.'],
    ['Die Blase von 2023 wirkt nach.', 'Deutschland erreichte 2023 mit 1,31 Mio. Wärmeerzeugern den Höchststand, Polens Wärmepumpen 2022 mit 249.760. Danach kamen Vorzieheffekt-Korrektur und Lagerabbau — kein Einbruch der Nachfrage.'],
    ['Absatz ist nicht Installation.', 'Keine europäische Institution veröffentlicht eine jährliche Installationsstatistik für Kessel. Jede Zahl in diesem Report ist Absatz an den Fachhandel — und jede „Installationszahl" der Fachpresse verdient dieselbe Frage.'],
  ],
  legendHp: 'davon Wärmepumpen', legendTotal: 'Gesamtmarkt', hover: 'Für exakte Werte und Quelle mit dem Cursor auf einen Balken zeigen.',
  outlook: 'Ausblick', notes: 'Die Zahlen richtig lesen', sources: 'Quellen',
  ch: {
    DE: { title: 'Fast jede zweite neue Heizung ist eine Wärmepumpe',
      lead: 'Deutschland setzte 2025 627.000 Wärmeerzeuger ab — der niedrigste Stand seit fünfzehn Jahren — davon 299.000 Wärmepumpen: 47,7 % Anteil, nach 16,6 % im Jahr 2021. Das erste Halbjahr 2026 hob den Anteil auf 55 %.',
      chart: 'Absatz Wärmeerzeuger und Wärmepumpen-Anteil',
      outlook: [['BWP-Branchenstudie 2026 — Basisszenario 2026', '332.500 Wärmepumpen · 47 %'], ['Basisszenario 2027', '369.500 Wärmepumpen · 48 %'], ['1. Halbjahr 2026, Ist', '194.500 Wärmepumpen · +40 %']],
      notes: ['Absatz an Großhandel und Fachhandwerk — Deutschland veröffentlicht keine Installationszahlen.', 'Trinkwasser-Wärmepumpen (49.500 in 2025) werden separat gezählt und sind hier nicht enthalten.'] },
    GB: { title: 'Dreizehn Kessel je Wärmepumpe — und ein erstes Quartal mit −22 %',
      lead: 'Großbritannien verkaufte 2025 1.450.900 Kessel und 110.353 hydraulische Wärmepumpen. Der Anteil hat sich seit 2021 fast verdreifacht — doch die Nachrüst-Installationen fielen im 1. Quartal 2026 um 22 %, gegen einen Pfad, der 2027 158.587 verlangt.',
      chart: 'Kessel + Wärmepumpen, Absatz in den Markt',
      outlook: [['Warm-Homes-Plan-Ziel', '450.000 Installationen / Jahr bis 2030'], ['CCC-Meilenstein 2027', '158.587 Nachrüst-Installationen'], ['HPA: nötiges Wachstum', '33 % p. a. bis 2030']],
      notes: ['Drei offizielle Zählungen für 2025 weichen konstruktionsbedingt ab: 110.353 verkauft (HPA) · 61.246 MCS-zertifizierte Installationen · 53.265 DESNZ-Nachrüstungen.', 'Kessel: EHI Heating Market Reports. Eine britische Installationsstatistik für Kessel existiert nicht.'] },
    FR: { title: 'Ein Markt, 40 % kleiner — der Anteilsgewinn ist vor allem der Nenner',
      lead: 'Frankreichs hydraulischer Heizungsmarkt fiel von 1.018.840 Geräten 2021 auf 613.460 im Jahr 2025. Der Wärmepumpen-Anteil stieg auf 29,6 % — doch die Luft/Wasser-Volumina selbst fielen auf 179.377. Gas- und Ölkessel verkaufen sich weiter 2,4-mal so oft.',
      chart: 'Hydraulische Wärmeerzeuger und Wärmepumpen-Anteil',
      outlook: [['Produktionsziel des Staates (DGE)', '1.000.000 in Frankreich gebaute WP / Jahr bis Ende 2027'], ['AFPAC-Bestandsziel', '8,8 Mio. Wärmepumpen im Wohnbestand bis 2030'], ['Uniclima-Prognose 2026', 'keine veröffentlicht — nur qualitativ']],
      notes: ['Luft/Luft (803.661 Außeneinheiten 2025) ist ausgeschlossen; Uniclima führt den H2-Schub auf 27 Hitzetage zurück — überwiegend ein Kühlkauf. Eingerechnet läge der Anteil bei ~70 %.', 'Summen und Anteile sind HeatPump-DB-Berechnungen aus Uniclimas veröffentlichten Komponenten — Uniclima publiziert beides nicht.'] },
    PL: { title: 'Fast ein Drittel des Marktes, zwei Jahre nach dem Einbruch',
      lead: 'Polen verkaufte 2025 178.610 Wärmepumpen — 32,1 % eines Marktes von 556.370 Geräten — das zweite Erholungsjahr, nachdem der Höchststand von 249.760 (2022) auf 158.480 eingebrochen war. Vier von fünf 2025 verkauften Wärmepumpen kamen ohne Förderung aus.',
      chart: 'Wärmepumpen-Absatz (inkl. Luft/Luft und Warmwasser)',
      outlook: [['PORT PC 2026, vorläufig', 'Luft/Wasser +10–15 % · Erdreich +15–25 %'], ['1. Halbjahr 2026, Ist', 'Heizungs-Wärmepumpen +18 %'], ['Prognose 2027', 'von keiner Organisation veröffentlicht']],
      notes: ['SPIUG zählt Luft/Luft- und Warmwassergeräte mit; PORT PCs reine Heizungsbasis ergibt für 2025 ~87.000. Beide sind korrekt — auf verschiedenen Definitionen.', 'Die Festbrennstoff-Daten kennzeichnet SPIUG selbst als Schätzungen.'] },
    IT: { title: 'Das Jahr nach dem Förder-Aus für Kessel: −15,7 %',
      lead: 'Italiens Absatz wandhängender Kessel fiel 2025 von 911.899 auf 769.090 — das erste volle Jahr, nachdem fossile Kessel die Ecobonus- und Bonus-Casa-Förderung verloren. Keine italienische Institution veröffentlicht einen Marktgesamtwert oder einen Wärmepumpen-Anteil; dieses Kapitel zeigt das Veröffentlichte auf seiner eigenen Basis.',
      chart: 'Wandhängende Kessel, Gesamtjahr (konstantes Panel)',
      outlook: [['Hydraulische WP ≤ 10 kW (Volumen, 2025)', '−4,4 %'], ['Hydraulische WP 18–50 kW (Volumen)', '+11,6 %'], ['Luft/Luft-Monosplit (Volumen)', '+16 %']],
      outlookSrc: 'Richtung 2025 — Assoclima, Prozentveränderungen bei konstantem Panel',
      notes: ['EHPA zählt für Italien 2025 423.000 Wärmepumpen — inklusive reversibler Luft/Luft. Rein hydraulische Schätzungen liegen bei etwa einem Viertel davon. Die Basen nie mischen.', 'Conto Termico 3.0 (in Kraft seit 25.12.2025) zahlt bis zu 65 % direkt über den GSE; Brennwertkessel sind ausgeschlossen.'] },
  },
  measureTitle: 'Was niemand veröffentlicht',
  measure: [
    'Keiner der fünf Märkte veröffentlicht eine Installationsstatistik für Kessel. BDH, EHI, Uniclima, SPIUG und Assotermica zählen Absatz an den Fachhandel — und jeder zieht die Grenze um „Wärmepumpe" anders: mit oder ohne Luft/Luft, mit oder ohne Warmwassergeräte.',
    'Darum vergleicht dieser Report Anteile nie über Grenzen hinweg, ohne es zu sagen — und jede Zahl behält ihre Quelle. Wo eine Zahl unsere eigene Rechnung aus veröffentlichten Komponenten ist — die britische Summe, der französische Anteil —, ist sie als unsere Berechnung gekennzeichnet.',
    'Einen einheitlichen europäischen Wärmepumpenmarkt wird es geben, wenn es die Statistik gibt. Bis dahin ist Präzision darüber, was gezählt wird, das Nützlichste, was ein Datenbankanbieter veröffentlichen kann.',
  ],
  aboutTitle: 'Die Daten hinter jeder Zahl',
  aboutP: 'HeatPump DB ist die registerbasierte Wärmepumpen-Datenbank für Fachhandwerk und Profis in fünf europäischen Märkten — über 7.000 Modelle mit SCOP, Schallleistung, Kältemittel und offiziellem Listungsstatus, in Sekunden durchsuchbar, direkt vergleichbar, als angebotsfertige Datenblätter druckbar. Aktualisiert mit jedem Monats-Update.',
  aboutCta: 'Kostenlos starten — 7 Tage voller Zugang', aboutAt: 'auf der Website Ihres Marktes',
  srcTitle: 'Quellen & Methodik',
  srcIntro: 'Alle Volumina sind Absatz an den Fachhandel (Sell-in). Als HeatPump-DB-Berechnung gekennzeichnete Werte sind Arithmetik aus den veröffentlichten Komponenten der unten genannten Institutionen. Das vollständige Rechercheprotokoll, einschließlich aller gefundenen Widersprüche zwischen Quellen, wird intern geführt und je Kapitel zusammengefasst.',
  ovTitle: 'Sie lesen die kostenlose Vorschau',
  ovBody: 'Die Vollausgabe — alle fünf Länderkapitel, die kompletten Reihen 2021–2025, Ausblicke und die Quellenangabe zu jeder Zahl — ist kostenlos auf unserem Europa-Hub und auf jeder Länderseite erhältlich.',
  ovBtn: 'Zum vollständigen Report — heatpumpdb.eu', ovList: 'Oder auf der Website Ihres Marktes herunterladen:',
  footer: '© 2026 HeatPump DataBase (Europe)™ · Absatz an den Fachhandel, keine Installationszahlen · heatpumpdb.eu',
},
fr: {
  langName: 'Français', dir: 'ltr',
  edition: 'Rapport spécial · Édition août 2026', by: 'Une publication HeatPump DB',
  coverTitle: 'Le marché européen du chauffage',
  coverSub: 'Chaudières et pompes à chaleur en Allemagne, au Royaume-Uni, en France, en Pologne et en Italie — les séries 2021–2025, et ce que les chiffres comptent réellement.',
  coverNote: 'Chaque chiffre porte sa source et sa base de comptage. Ventes au réseau professionnel — pas des installations.',
  contents: 'Sommaire', preview: 'APERÇU GRATUIT', fullEd: 'Édition complète',
  tocItems: ['Synthèse', 'Allemagne', 'Royaume-Uni', 'France', 'Pologne', 'Italie', 'Ce que personne ne publie', 'Sources & méthodologie'],
  execKicker: 'SYNTHÈSE', execTitle: 'Cinq marchés, cinq réponses',
  execLead: 'L’Europe n’a pas un marché du chauffage, mais cinq. En 2025, la part des pompes à chaleur dans les ventes de systèmes neufs allait de 7 % au Royaume-Uni à près de 48 % en Allemagne — et une bonne part de cet écart relève de la définition, pas de la physique. Ce rapport met les cinq séries nationales côte à côte, conserve chaque chiffre sur la base de son éditeur, et dit ce que les statistiques taisent : ce qui est réellement compté.',
  atGlance: 'Les cinq marchés en 2025', hpShort: 'pompes à chaleur', shareShort: 'part', totalShort: 'marché',
  glanceNote: { DE: 'sur 627 000 générateurs (BDH)', GB: 'sur 1,56 M chaudières + PAC (EHI · HPA)', FR: 'sur 613 460 générateurs hydrauliques (Uniclima)', PL: 'sur 556 370 appareils de chauffage (SPIUG)', IT: 'ventes de chaudières murales — premier exercice plein sans aides aux chaudières fossiles (Assotermica)' },
  insights: [
    ['La part n’est pas la dynamique.', 'En France comme en Allemagne, la part des PAC a monté pendant que le marché total se contractait — de 40 % depuis 2021 en France, de 52 % depuis 2023 en Allemagne. Le dénominateur fait une bonne partie du travail.'],
    ['La bulle de 2023 se dégonfle encore.', 'L’Allemagne a culminé à 1,31 M de générateurs en 2023, les PAC polonaises à 249 760 en 2022. Ce qui a suivi relève de la correction d’anticipation et du déstockage — pas d’un effondrement de la demande.'],
    ['Les ventes ne sont pas des installations.', 'Aucun organisme européen ne publie de recensement annuel des installations de chaudières. Chaque chiffre de ce rapport est une vente au réseau — et chaque « nombre d’installations » de la presse mérite la même question.'],
  ],
  legendHp: 'dont pompes à chaleur', legendTotal: 'marché total', hover: 'Survolez une barre pour les valeurs exactes et la source.',
  outlook: 'Perspectives', notes: 'Bien lire les chiffres', sources: 'Sources',
  ch: {
    DE: { title: 'Près d’un système de chauffage neuf sur deux est une PAC',
      lead: 'L’Allemagne a vendu 627 000 générateurs de chaleur en 2025 — le plus bas niveau en quinze ans — dont 299 000 pompes à chaleur : 47,7 % de part, contre 16,6 % en 2021. Le premier semestre 2026 a porté la part à 55 %.',
      chart: 'Générateurs vendus et part des PAC',
      outlook: [['Étude BWP 2026 — scénario de base 2026', '332 500 PAC · 47 %'], ['Scénario de base 2027', '369 500 PAC · 48 %'], ['S1 2026, réalisé', '194 500 PAC · +40 %']],
      notes: ['Ventes au négoce et aux installateurs — l’Allemagne ne publie aucun décompte d’installations.', 'Les chauffe-eau thermodynamiques (49 500 en 2025) sont comptés à part et exclus ici.'] },
    GB: { title: 'Treize chaudières pour une PAC — et un T1 à −22 %',
      lead: 'Le Royaume-Uni a vendu 1 450 900 chaudières et 110 353 PAC hydrauliques en 2025. La part a presque triplé depuis 2021 — mais les installations en rénovation ont reculé de 22 % au T1 2026, face à une trajectoire qui exige 158 587 unités en 2027.',
      chart: 'Chaudières + PAC vendues sur le marché',
      outlook: [['Objectif Warm Homes Plan', '450 000 installations / an d’ici 2030'], ['Jalon CCC 2027', '158 587 installations en rénovation'], ['HPA : croissance requise', '33 % par an jusqu’en 2030']],
      notes: ['Trois décomptes officiels pour 2025 divergent par construction : 110 353 vendues (HPA) · 61 246 installations certifiées MCS · 53 265 rénovations DESNZ.', 'Chaudières : EHI Heating Market Reports. Il n’existe aucun recensement britannique des installations de chaudières.'] },
    FR: { title: 'Un marché en repli de 40 % — la part gagne surtout par le dénominateur',
      lead: 'Le marché hydraulique français est passé de 1 018 840 unités en 2021 à 613 460 en 2025. La part des PAC est montée à 29,6 % — mais les volumes air/eau eux-mêmes sont tombés à 179 377. Les chaudières gaz et fioul se vendent encore 2,4 fois plus.',
      chart: 'Générateurs hydrauliques et part des PAC',
      outlook: [['Objectif industriel de l’État (DGE)', '1 000 000 de PAC produites / an d’ici fin 2027'], ['Objectif de parc AFPAC', '8,8 M de PAC résidentielles en 2030'], ['Prévision Uniclima 2026', 'aucune publiée — qualitatif seulement']],
      notes: ['L’air/air (803 661 unités extérieures en 2025) est exclu ; Uniclima attribue son rebond du S2 aux 27 jours de canicule — un achat largement lié au rafraîchissement. Inclus, la part serait d’environ 70 %.', 'Totaux et parts sont des calculs HeatPump DB sur les composantes publiées par Uniclima — qui ne publie ni l’un ni l’autre.'] },
    PL: { title: 'Près d’un tiers du marché, deux ans après la chute',
      lead: 'La Pologne a vendu 178 610 pompes à chaleur en 2025 — 32,1 % d’un marché de 556 370 appareils — deuxième année de reprise après l’effondrement du pic de 249 760 (2022) à 158 480. Quatre PAC sur cinq vendues en 2025 l’ont été sans subvention.',
      chart: 'PAC vendues (air/air et ECS incluses)',
      outlook: [['PORT PC 2026, préliminaire', 'air/eau +10–15 % · géothermie +15–25 %'], ['S1 2026, réalisé', 'PAC de chauffage +18 %'], ['Prévision 2027', 'aucune organisation n’en publie']],
      notes: ['Le décompte SPIUG inclut l’air/air et l’ECS ; la base « chauffage seul » de PORT PC donne ~87 000 pour 2025. Les deux sont justes — sur des définitions différentes.', 'SPIUG qualifie lui-même ses données combustibles solides d’estimations.'] },
    IT: { title: 'L’année de la fin des aides aux chaudières : −15,7 %',
      lead: 'Les ventes italiennes de chaudières murales sont passées de 911 899 à 769 090 en 2025 — premier exercice plein après la sortie des chaudières fossiles de l’Ecobonus et du Bonus Casa. Aucun organisme italien ne publie de total de marché ni de part des PAC ; ce chapitre montre ce qui est publié, sur sa propre base.',
      chart: 'Chaudières murales, année pleine (panel constant)',
      outlook: [['PAC hydrauliques ≤ 10 kW (volumes, 2025)', '−4,4 %'], ['PAC hydrauliques 18–50 kW (volumes)', '+11,6 %'], ['Monosplit air/air (volumes)', '+16 %']],
      outlookSrc: 'Direction 2025 — Assoclima, variations en % à panel constant',
      notes: ['L’EHPA compte 423 000 PAC pour l’Italie en 2025 — air/air réversible inclus. Les estimations purement hydrauliques en représentent environ le quart. Ne jamais mélanger les bases.', 'Le Conto Termico 3.0 (en vigueur depuis le 25/12/2025) verse jusqu’à 65 % directement via le GSE ; les chaudières à condensation en sont exclues.'] },
  },
  measureTitle: 'Ce que personne ne publie',
  measure: [
    'Aucun des cinq marchés ne publie de recensement des installations de chaudières. BDH, EHI, Uniclima, SPIUG et Assotermica comptent des ventes au réseau — et chacun trace la frontière de la « pompe à chaleur » différemment : avec ou sans air/air, avec ou sans ECS.',
    'C’est pourquoi ce rapport ne compare jamais les parts entre pays sans le dire, et pourquoi chaque chiffre garde sa source. Quand un nombre est notre propre calcul sur des composantes publiées — le total britannique, la part française —, il est étiqueté comme tel.',
    'Un marché européen unique de la pompe à chaleur existera quand la statistique existera. D’ici là, la précision sur ce qui est compté est ce qu’une entreprise de données peut publier de plus utile.',
  ],
  aboutTitle: 'Les données derrière chaque chiffre',
  aboutP: 'HeatPump DB est la base de données de pompes à chaleur issue des registres, pour les installateurs et les professionnels de cinq marchés européens — plus de 7 000 modèles avec SCOP, puissance acoustique, fluide et statut officiel, consultables en quelques secondes, comparables côte à côte et imprimables en fiches techniques prêtes pour le devis. Actualisée à chaque mise à jour mensuelle.',
  aboutCta: 'Commencer gratuitement — 7 jours d’accès complet', aboutAt: 'sur le site de votre marché',
  srcTitle: 'Sources & méthodologie',
  srcIntro: 'Tous les volumes sont des ventes au réseau (sell-in). Les valeurs marquées « calcul HeatPump DB » sont l’arithmétique des composantes publiées par les organismes ci-dessous. Le dossier de recherche complet, avec chaque contradiction relevée entre les sources, est tenu en interne et résumé par chapitre.',
  ovTitle: 'Vous lisez l’aperçu gratuit',
  ovBody: 'L’édition complète — les cinq chapitres pays, les séries 2021–2025 intégrales, les perspectives et la source de chaque chiffre — est gratuite sur notre hub européen et sur chaque site de marché.',
  ovBtn: 'Obtenir le rapport complet — heatpumpdb.eu', ovList: 'Ou téléchargez-le sur le site de votre marché :',
  footer: '© 2026 HeatPump DataBase (Europe)™ · Ventes au réseau, pas des installations · heatpumpdb.eu',
},
pl: {
  langName: 'Polski', dir: 'ltr',
  edition: 'Raport specjalny · Wydanie sierpień 2026', by: 'Publikacja HeatPump DB',
  coverTitle: 'Europejski rynek grzewczy',
  coverSub: 'Kotły i pompy ciepła w Niemczech, Wielkiej Brytanii, Francji, Polsce i we Włoszech — serie 2021–2025 i to, co liczby naprawdę liczą.',
  coverNote: 'Każda liczba ma swoje źródło i podstawę liczenia. Sprzedaż do kanału dystrybucji — nie instalacje.',
  contents: 'Spis treści', preview: 'BEZPŁATNY PODGLĄD', fullEd: 'Pełne wydanie',
  tocItems: ['Streszczenie', 'Niemcy', 'Wielka Brytania', 'Francja', 'Polska', 'Włochy', 'Czego nikt nie publikuje', 'Źródła i metodologia'],
  execKicker: 'STRESZCZENIE', execTitle: 'Pięć rynków, pięć odpowiedzi',
  execLead: 'Europa nie ma jednego rynku grzewczego. W 2025 r. udział pomp ciepła w sprzedaży nowych systemów wahał się od 7 % w Wielkiej Brytanii do prawie 48 % w Niemczech — a spora część tej rozpiętości to kwestia definicji, nie fizyki. Raport zestawia pięć krajowych serii obok siebie, zostawia każdą liczbę na podstawie jej wydawcy i mówi wprost to, czego statystyki zwykle nie mówią: co właściwie jest liczone.',
  atGlance: 'Pięć rynków w 2025', hpShort: 'pompy ciepła', shareShort: 'udział', totalShort: 'rynek',
  glanceNote: { DE: 'z 627 000 wytwornic ciepła (BDH)', GB: 'z 1,56 mln kotłów + pomp ciepła (EHI · HPA)', FR: 'z 613 460 urządzeń hydraulicznych (Uniclima)', PL: 'z 556 370 urządzeń grzewczych (SPIUG)', IT: 'sprzedaż kotłów wiszących — pierwszy pełny rok bez dotacji do kotłów na paliwa kopalne (Assotermica)' },
  insights: [
    ['Udział to nie dynamika.', 'We Francji i w Niemczech udział pomp ciepła rósł, gdy cały rynek się kurczył — Francja o 40 % od 2021 r., Niemcy o 52 % od 2023 r. Dużą część pracy wykonuje mianownik.'],
    ['Bańka 2023 roku wciąż się wygasza.', 'Niemcy osiągnęły szczyt 1,31 mln urządzeń w 2023 r., polskie pompy ciepła — 249 760 w 2022 r. To, co nastąpiło, to korekta przyspieszonych zakupów i wyprzedaż magazynów — nie załamanie popytu.'],
    ['Sprzedaż to nie instalacje.', 'Żadna europejska instytucja nie publikuje rocznego spisu instalacji kotłów. Każda liczba w tym raporcie to sprzedaż do kanału — a każda „liczba instalacji" w prasie branżowej zasługuje na to samo pytanie.'],
  ],
  legendHp: 'w tym pompy ciepła', legendTotal: 'rynek ogółem', hover: 'Najedź kursorem na słupek, aby zobaczyć dokładne wartości i źródło.',
  outlook: 'Perspektywy', notes: 'Jak czytać te liczby', sources: 'Źródła',
  ch: {
    DE: { title: 'Niemal co druga nowa instalacja grzewcza to pompa ciepła',
      lead: 'Niemcy sprzedały w 2025 r. 627 000 wytwornic ciepła — najmniej od piętnastu lat — z czego 299 000 to pompy ciepła: 47,7 % udziału wobec 16,6 % w 2021 r. Pierwsze półrocze 2026 r. podniosło udział do 55 %.',
      chart: 'Sprzedaż wytwornic ciepła i udział pomp ciepła',
      outlook: [['Studium branżowe BWP 2026 — scenariusz bazowy 2026', '332 500 pomp ciepła · 47 %'], ['Scenariusz bazowy 2027', '369 500 pomp ciepła · 48 %'], ['I półrocze 2026, wykonanie', '194 500 pomp ciepła · +40 %']],
      notes: ['Sprzedaż do hurtu i instalatorów — Niemcy nie publikują liczby instalacji.', 'Pompy ciepła do c.w.u. (49 500 w 2025 r.) liczone są osobno i nie są tu ujęte.'] },
    GB: { title: 'Trzynaście kotłów na jedną pompę ciepła — i −22 % w pierwszym kwartale',
      lead: 'Wielka Brytania sprzedała w 2025 r. 1 450 900 kotłów i 110 353 hydrauliczne pompy ciepła. Udział niemal się potroił od 2021 r. — ale instalacje modernizacyjne spadły w I kw. 2026 r. o 22 %, wobec ścieżki wymagającej 158 587 sztuk w 2027 r.',
      chart: 'Kotły + pompy ciepła sprzedane na rynek',
      outlook: [['Cel Warm Homes Plan', '450 000 instalacji / rok do 2030 r.'], ['Kamień milowy CCC 2027', '158 587 instalacji modernizacyjnych'], ['HPA: wymagany wzrost', '33 % rocznie do 2030 r.']],
      notes: ['Trzy oficjalne rachuby za 2025 r. różnią się z założenia: 110 353 sprzedane (HPA) · 61 246 instalacji z certyfikatem MCS · 53 265 modernizacji DESNZ.', 'Kotły: EHI Heating Market Reports. Brytyjski spis instalacji kotłów nie istnieje.'] },
    FR: { title: 'Rynek mniejszy o 40 % — udział rośnie głównie przez mianownik',
      lead: 'Francuski rynek hydrauliczny skurczył się z 1 018 840 urządzeń w 2021 r. do 613 460 w 2025 r. Udział pomp ciepła wzrósł do 29,6 % — ale wolumeny powietrze/woda same spadły do 179 377. Kotły gazowe i olejowe wciąż sprzedają się 2,4 razy częściej.',
      chart: 'Wytwornice hydrauliczne i udział pomp ciepła',
      outlook: [['Cel produkcyjny państwa (DGE)', '1 000 000 pomp ciepła produkowanych rocznie do końca 2027 r.'], ['Cel AFPAC dot. parku urządzeń', '8,8 mln pomp ciepła w domach do 2030 r.'], ['Prognoza Uniclima na 2026', 'brak — tylko jakościowa']],
      notes: ['Powietrze/powietrze (803 661 jednostek zewnętrznych w 2025 r.) wyłączono; Uniclima wiąże skok w II półroczu z 27 dniami upałów — to w dużej mierze zakup chłodzenia. Z nim udział wyniósłby ~70 %.', 'Sumy i udziały to obliczenia HeatPump DB na opublikowanych składnikach Uniclima — Uniclima nie publikuje żadnego z nich.'] },
    PL: { title: 'Prawie jedna trzecia rynku, dwa lata po załamaniu',
      lead: 'Polska sprzedała w 2025 r. 178 610 pomp ciepła — 32,1 % rynku liczącego 556 370 urządzeń — drugi rok odbudowy po tym, jak szczyt 249 760 (2022) załamał się do 158 480. Cztery z pięciu pomp sprzedanych w 2025 r. kupiono bez dotacji.',
      chart: 'Sprzedaż pomp ciepła (z powietrze/powietrze i c.w.u.)',
      outlook: [['PORT PC 2026, wstępnie', 'powietrze/woda +10–15 % · gruntowe +15–25 %'], ['I półrocze 2026, wykonanie', 'pompy do ogrzewania +18 %'], ['Prognoza na 2027', 'nie publikuje żadna organizacja']],
      notes: ['SPIUG liczy urządzenia powietrze/powietrze i c.w.u.; węższa, „grzewcza" podstawa PORT PC daje za 2025 r. ~87 000. Obie są poprawne — na różnych definicjach.', 'Dane o kotłach na paliwa stałe SPIUG sam oznacza jako szacunki.'] },
    IT: { title: 'Rok po końcu dotacji do kotłów: −15,7 %',
      lead: 'Włoska sprzedaż kotłów wiszących spadła z 911 899 do 769 090 w 2025 r. — to pierwszy pełny rok po usunięciu kotłów kopalnych z Ecobonusu i Bonus Casa. Żadna włoska instytucja nie publikuje sumy rynku ani udziału pomp ciepła; ten rozdział pokazuje to, co opublikowano, na własnej podstawie.',
      chart: 'Kotły wiszące, pełny rok (stały panel)',
      outlook: [['PC hydrauliczne ≤ 10 kW (wolumen, 2025)', '−4,4 %'], ['PC hydrauliczne 18–50 kW (wolumen)', '+11,6 %'], ['Monosplit powietrze/powietrze (wolumen)', '+16 %']],
      outlookSrc: 'Kierunek 2025 — Assoclima, zmiany % przy stałym panelu',
      notes: ['EHPA liczy dla Włoch 423 000 pomp ciepła w 2025 r. — z rewersyjnymi powietrze/powietrze. Szacunki czysto hydrauliczne to około jedna czwarta tego. Nigdy nie mieszać podstaw.', 'Conto Termico 3.0 (od 25.12.2025) wypłaca do 65 % bezpośrednio przez GSE; kotły kondensacyjne są wyłączone.'] },
  },
  measureTitle: 'Czego nikt nie publikuje',
  measure: [
    'Żaden z pięciu rynków nie publikuje spisu instalacji kotłów. BDH, EHI, Uniclima, SPIUG i Assotermica liczą sprzedaż do kanału — i każdy inaczej wyznacza granicę „pompy ciepła": z powietrze/powietrze lub bez, z c.w.u. lub bez.',
    'Dlatego ten raport nigdy nie porównuje udziałów między krajami bez zastrzeżenia — a każda liczba zachowuje swojego wydawcę. Gdy liczba jest naszą arytmetyką na opublikowanych składnikach — brytyjska suma, francuski udział — jest oznaczona jako nasze obliczenie.',
    'Jednolity europejski rynek pomp ciepła powstanie wtedy, gdy powstanie jednolita statystyka. Do tego czasu precyzja co do tego, co się liczy, jest najużyteczniejszym, co firma danych może publikować.',
  ],
  aboutTitle: 'Dane za każdą liczbą',
  aboutP: 'HeatPump DB to oparta na rejestrach baza pomp ciepła dla instalatorów i profesjonalistów z pięciu rynków europejskich — ponad 7 000 modeli ze SCOP, mocą akustyczną, czynnikiem i oficjalnym statusem wpisu, przeszukiwalnych w sekundy, porównywalnych obok siebie i drukowalnych jako karty danych gotowe do oferty. Odświeżana przy każdej comiesięcznej aktualizacji.',
  aboutCta: 'Zacznij bezpłatnie — 7 dni pełnego dostępu', aboutAt: 'na stronie Twojego rynku',
  srcTitle: 'Źródła i metodologia',
  srcIntro: 'Wszystkie wolumeny to sprzedaż do kanału (sell-in). Wartości oznaczone jako obliczenia HeatPump DB to arytmetyka na składnikach opublikowanych przez poniższe instytucje. Pełny zapis badania, wraz z każdą znalezioną sprzecznością między źródłami, prowadzony jest wewnętrznie i streszczany przy rozdziałach.',
  ovTitle: 'Czytasz bezpłatny podgląd',
  ovBody: 'Pełne wydanie — wszystkie pięć rozdziałów krajowych, kompletne serie 2021–2025, perspektywy i źródło każdej liczby — jest bezpłatne na naszym hubie europejskim i na każdej stronie rynkowej.',
  ovBtn: 'Pobierz pełny raport — heatpumpdb.eu', ovList: 'Albo pobierz na stronie swojego rynku:',
  footer: '© 2026 HeatPump DataBase (Europe)™ · Sprzedaż do kanału, nie instalacje · heatpumpdb.eu',
},
it: {
  langName: 'Italiano', dir: 'ltr',
  edition: 'Rapporto speciale · Edizione agosto 2026', by: 'Una pubblicazione HeatPump DB',
  coverTitle: 'Il mercato europeo del riscaldamento',
  coverSub: 'Caldaie e pompe di calore in Germania, Regno Unito, Francia, Polonia e Italia — le serie 2021–2025, e che cosa contano davvero i numeri.',
  coverNote: 'Ogni cifra porta la sua fonte e la sua base di conteggio. Vendite al canale professionale — non installazioni.',
  contents: 'Indice', preview: 'ANTEPRIMA GRATUITA', fullEd: 'Edizione integrale',
  tocItems: ['Sintesi', 'Germania', 'Regno Unito', 'Francia', 'Polonia', 'Italia', 'Ciò che nessuno pubblica', 'Fonti e metodologia'],
  execKicker: 'SINTESI', execTitle: 'Cinque mercati, cinque risposte',
  execLead: 'L’Europa non ha un unico mercato del riscaldamento. Nel 2025 la quota delle pompe di calore sulle vendite di nuovi sistemi andava dal 7 % del Regno Unito a quasi il 48 % della Germania — e buona parte di quel divario è definizione, non fisica. Questo rapporto mette le cinque serie nazionali una accanto all’altra, lascia ogni numero sulla base del suo editore, e dice ciò che le statistiche raramente esplicitano: che cosa viene contato davvero.',
  atGlance: 'I cinque mercati nel 2025', hpShort: 'pompe di calore', shareShort: 'quota', totalShort: 'mercato',
  glanceNote: { DE: 'su 627.000 generatori (BDH)', GB: 'su 1,56 mln caldaie + PdC (EHI · HPA)', FR: 'su 613.460 generatori idronici (Uniclima)', PL: 'su 556.370 apparecchi (SPIUG)', IT: 'vendite di caldaie murali — primo anno pieno senza incentivi alle caldaie fossili (Assotermica)' },
  insights: [
    ['La quota non è slancio.', 'In Francia e in Germania la quota delle pompe di calore è salita mentre l’intero mercato si contraeva — la Francia del 40 % dal 2021, la Germania del 52 % dal 2023. Gran parte del lavoro lo fa il denominatore.'],
    ['La bolla del 2023 si sta ancora sgonfiando.', 'La Germania ha toccato 1,31 mln di generatori nel 2023, le pompe di calore polacche 249.760 nel 2022. Ciò che è seguito è correzione di acquisti anticipati e smaltimento scorte — non un crollo della domanda.'],
    ['Le vendite non sono installazioni.', 'Nessun organismo europeo pubblica un censimento annuale delle installazioni di caldaie. Ogni numero di questo rapporto è vendita al canale — e ogni « numero di installazioni » della stampa di settore merita la stessa domanda.'],
  ],
  legendHp: 'di cui pompe di calore', legendTotal: 'mercato totale', hover: 'Passa il cursore su una barra per i valori esatti e la fonte.',
  outlook: 'Prospettive', notes: 'Leggere bene i numeri', sources: 'Fonti',
  ch: {
    DE: { title: 'Quasi un impianto nuovo su due è una pompa di calore',
      lead: 'La Germania ha venduto 627.000 generatori di calore nel 2025 — il livello più basso in quindici anni — di cui 299.000 pompe di calore: quota del 47,7 %, dal 16,6 % del 2021. Il primo semestre 2026 ha portato la quota al 55 %.',
      chart: 'Generatori venduti e quota delle pompe di calore',
      outlook: [['Studio BWP 2026 — scenario base 2026', '332.500 PdC · 47 %'], ['Scenario base 2027', '369.500 PdC · 48 %'], ['I semestre 2026, consuntivo', '194.500 PdC · +40 %']],
      notes: ['Vendite a grossisti e installatori — la Germania non pubblica un conteggio delle installazioni.', 'Gli scaldacqua a pompa di calore (49.500 nel 2025) sono contati a parte ed esclusi qui.'] },
    GB: { title: 'Tredici caldaie per ogni pompa di calore — e un primo trimestre a −22 %',
      lead: 'Il Regno Unito ha venduto 1.450.900 caldaie e 110.353 pompe di calore idroniche nel 2025. La quota è quasi triplicata dal 2021 — ma le installazioni in retrofit sono calate del 22 % nel I trimestre 2026, contro un percorso che richiede 158.587 unità nel 2027.',
      chart: 'Caldaie + pompe di calore vendute sul mercato',
      outlook: [['Obiettivo Warm Homes Plan', '450.000 installazioni / anno entro il 2030'], ['Tappa CCC 2027', '158.587 installazioni in retrofit'], ['HPA: crescita richiesta', '33 % composto, ogni anno fino al 2030']],
      notes: ['Tre conteggi ufficiali per il 2025 divergono per costruzione: 110.353 vendute (HPA) · 61.246 installazioni certificate MCS · 53.265 retrofit DESNZ.', 'Caldaie: EHI Heating Market Reports. Un censimento britannico delle installazioni di caldaie non esiste.'] },
    FR: { title: 'Un mercato giù del 40 % — la quota sale soprattutto per il denominatore',
      lead: 'Il mercato idronico francese è sceso da 1.018.840 unità nel 2021 a 613.460 nel 2025. La quota delle pompe di calore è salita al 29,6 % — ma i volumi aria/acqua sono scesi a 179.377. Le caldaie a gas e gasolio vendono ancora 2,4 volte tanto.',
      chart: 'Generatori idronici e quota delle pompe di calore',
      outlook: [['Obiettivo industriale dello Stato (DGE)', '1.000.000 di PdC prodotte / anno entro fine 2027'], ['Obiettivo parco AFPAC', '8,8 mln di PdC residenziali entro il 2030'], ['Previsione Uniclima 2026', 'nessuna — solo qualitativa']],
      notes: ['L’aria/aria (803.661 unità esterne nel 2025) è esclusa; Uniclima lega il balzo del II semestre ai 27 giorni di canicola — in gran parte un acquisto di raffrescamento. Inclusa, la quota sarebbe ~70 %.', 'Totali e quote sono calcoli HeatPump DB sui componenti pubblicati da Uniclima — che non pubblica né gli uni né le altre.'] },
    PL: { title: 'Quasi un terzo del mercato, due anni dopo il crollo',
      lead: 'La Polonia ha venduto 178.610 pompe di calore nel 2025 — il 32,1 % di un mercato di 556.370 apparecchi — secondo anno di ripresa dopo che il picco di 249.760 (2022) era crollato a 158.480. Quattro pompe su cinque vendute nel 2025 non avevano alcun sussidio.',
      chart: 'Pompe di calore vendute (incluse aria/aria e ACS)',
      outlook: [['PORT PC 2026, preliminare', 'aria/acqua +10–15 % · geotermiche +15–25 %'], ['I semestre 2026, consuntivo', 'PdC per riscaldamento +18 %'], ['Previsione 2027', 'nessun organismo la pubblica']],
      notes: ['Il conteggio SPIUG include aria/aria e ACS; la base « solo riscaldamento » di PORT PC dà ~87.000 per il 2025. Entrambi corretti — su definizioni diverse.', 'I dati sulle caldaie a combustibile solido sono indicati dallo stesso SPIUG come stime.'] },
    IT: { title: 'L’anno della fine degli incentivi alle caldaie: −15,7 %',
      lead: 'Le vendite italiane di caldaie murali sono scese da 911.899 a 769.090 nel 2025 — il primo anno pieno dopo l’esclusione delle caldaie fossili da Ecobonus e Bonus Casa. Nessun organismo italiano pubblica un totale di mercato né una quota delle pompe di calore; questo capitolo mostra ciò che è pubblicato, sulla sua propria base.',
      chart: 'Caldaie murali, anno pieno (panel costante)',
      outlook: [['PdC idroniche ≤ 10 kW (volumi, 2025)', '−4,4 %'], ['PdC idroniche 18–50 kW (volumi)', '+11,6 %'], ['Monosplit aria/aria (volumi)', '+16 %']],
      outlookSrc: 'Direzione 2025 — Assoclima, variazioni % a panel costante',
      notes: ['L’EHPA conta 423.000 pompe di calore per l’Italia nel 2025 — incluse le aria/aria reversibili. Le stime solo idroniche sono circa un quarto. Mai mescolare le basi.', 'Il Conto Termico 3.0 (in vigore dal 25.12.2025) eroga fino al 65 % direttamente tramite il GSE; le caldaie a condensazione sono escluse.'] },
  },
  measureTitle: 'Ciò che nessuno pubblica',
  measure: [
    'Nessuno dei cinque mercati pubblica un censimento delle installazioni di caldaie. BDH, EHI, Uniclima, SPIUG e Assotermica contano vendite al canale — e ognuno traccia il confine della « pompa di calore » in modo diverso: con o senza aria/aria, con o senza ACS.',
    'Per questo il rapporto non confronta mai le quote tra paesi senza dirlo, e ogni cifra mantiene il suo editore. Dove un numero è la nostra aritmetica su componenti pubblicati — il totale britannico, la quota francese — è etichettato come nostro calcolo.',
    'Un mercato europeo unico della pompa di calore esisterà quando esisterà la statistica. Fino ad allora, la precisione su ciò che si conta è la cosa più utile che un’azienda di dati possa pubblicare.',
  ],
  aboutTitle: 'I dati dietro ogni numero',
  aboutP: 'HeatPump DB è il database delle pompe di calore basato sui registri per installatori e professionisti di cinque mercati europei — oltre 7.000 modelli con SCOP, potenza sonora, refrigerante e stato ufficiale di registrazione, ricercabili in secondi, confrontabili affiancati e stampabili come schede tecniche pronte per il preventivo. Aggiornato a ogni aggiornamento mensile.',
  aboutCta: 'Inizia gratis — 7 giorni di accesso completo', aboutAt: 'sul sito del tuo mercato',
  srcTitle: 'Fonti e metodologia',
  srcIntro: 'Tutti i volumi sono vendite al canale (sell-in). I valori indicati come calcoli HeatPump DB sono aritmetica sui componenti pubblicati dagli organismi sotto elencati. Il dossier di ricerca completo, con ogni contraddizione rilevata tra le fonti, è mantenuto internamente e riassunto per capitolo.',
  ovTitle: 'Stai leggendo l’anteprima gratuita',
  ovBody: 'L’edizione integrale — i cinque capitoli paese, le serie 2021–2025 complete, le prospettive e la fonte di ogni cifra — è gratuita sul nostro hub europeo e su ogni sito di mercato.',
  ovBtn: 'Scarica il rapporto completo — heatpumpdb.eu', ovList: 'Oppure scaricalo sul sito del tuo mercato:',
  footer: '© 2026 HeatPump DataBase (Europe)™ · Vendite al canale, non installazioni · heatpumpdb.eu',
},
};

/* ── Source links per chapter (shown as linked footnotes in every language) ── */
const SRC_LINKS = {
  DE: [
    ['BDH Absatzstatistik 2025 (31.01.2026)', 'https://www.bdh-industrie.de/fileadmin/user_upload/Downloads/PresseMeldungen/Absatzzahlen_Heizungen_Deutschland_2025.pdf'],
    ['BDH/BWP Wärmepumpen 2018–2025 (01/2026)', 'https://www.bdh-industrie.de/fileadmin/Infografik_Marktentwicklung_WP_2018-2025_012026.zip'],
    ['BWP Branchenstudie 2026 (30.03.2026)', 'https://www.waermepumpe.de/fileadmin/user_upload/2026-03-30_BWP-Branchenstudie_2026_final.pdf'],
    ['BDH H1 2026 (11.08.2026)', 'https://www.bdh-industrie.de/fileadmin/user_upload/Downloads/PresseMeldungen/Absatzzahlen_Waermemarkt_2026-06.pdf'],
  ],
  GB: [
    ['EHI Heating Market Report 2025 (18.06.2026)', 'https://ehi.eu/wp-content/uploads/2026/06/EHI_Annual-Report-2025_18.06.26_Digital.pdf'],
    ['HPA UK statistics (26.03.2026)', 'https://hpauk.org.uk/resources/statistics/'],
    ['DESNZ heat pump deployment statistics (11.06.2026)', 'https://www.gov.uk/government/statistics/heat-pump-deployment-statistics-march-2026'],
    ['DESNZ Warm Homes Plan (21.01.2026)', 'https://www.gov.uk/government/publications/warm-homes-plan/warm-homes-plan-html'],
    ['CCC Progress Report 2026 (24.06.2026)', 'https://www.theccc.org.uk/'],
  ],
  FR: [
    ['Uniclima — Bilan 2025 (05.02.2026)', 'https://www.uniclima.fr/userfiles/2026/DP_Uniclima_Bilan_2025_VF.pdf'],
    ['Draft PPE3 (Nov 2024, SDES data)', 'https://concertation-strategie-energie-climat.gouv.fr/'],
    ['DGE — 1 M heat pumps plan (15.04.2024)', 'https://www.entreprises.gouv.fr/espace-presse/plan-daction-pour-produire-1-million-de-pompes-chaleur-en-france'],
    ['AFPAC action plan (02/2026)', 'https://www.afpac.org/plan-action-afpac-deploiement-pompes-a-chaleur/'],
  ],
  PL: [
    ['SPIUG — Report 2025 (07.07.2026)', 'https://spiug.pl/app/uploads/2026/08/Report_Market_of_heating_appliances_in_Poland_2025.pdf'],
    ['PORT PC — 2025 result & 2026 forecast (12.03.2026)', 'https://portpc.pl/w-2025-roku-polacy-kupili-niemal-tyle-samo-pomp-ciepla-co-w-2024-%E2%88%92-wiekszosc-bez-dotacji/'],
    ['PORT PC — H1 2026 (06.08.2026)', 'https://informacjeprasowe.pl/sprzedaz-pomp-ciepla-do-ogrzewania-budynkow-wzrosla-o-18-proc-w-i-polroczu-2026-r/'],
  ],
  IT: [
    ['Assotermica — market release (24.03.2026)', 'https://www.anima.it/associazioni/elenco/assotermica/media/comunicati-stampa/caldaie-mercato-in-forte-contrazione-nel-2025-segnali-di-allarme-per-il-comparto.kl'],
    ['Assoclima — market survey (25.03.2026)', 'https://www.anima.it/media/comunicati-stampa/mercato-climatizzazione-2025-nella-rilevazione-assoclima-prevale-segno-positivo.kl'],
    ['EHPA Market Report 2025', 'https://www.ehpa.org/wp-content/uploads/2025/07/EHPA-Market-Report-2025-executive-summary.pdf'],
    ['GSE — Conto Termico', 'https://www.gse.it/servizi-per-te/efficienza-energetica/conto-termico'],
  ],
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Brand watermark set inside every figure — a screenshot carries the brand. */
const wm = () => `<span class="wm"><span class="wmark">${LOCKUP}</span><span>heatpumpdb.eu</span></span>`;

/** Country series chart: total bar with the HP portion filled, tooltip on hover. */
function chart(cc, t) {
  const T = THEMES[cc];
  const d = S[cc];
  if (cc === 'PL') {
    const max = Math.max(...d.hpOnly);
    return `<div class="fig" style="--a:${T.a}">
      <div class="bars">${d.years.map((y, i) => {
        const h = Math.round((d.hpOnly[i] / max) * 100);
        return `<div class="bar"><span class="tip"><b>${y}</b>${t.hpShort}: ${nf(d.hpOnly[i])}<br><i>${d.src}</i></span>
          <span class="bv">${nf(d.hpOnly[i])}</span>
          <span class="col" style="height:${h}%;background:${T.a}"></span>
          <span class="bl">${y}</span></div>`;
      }).join('')}</div>${wm()}</div>`;
  }
  if (cc === 'IT') {
    const max = Math.max(...d.murali.v);
    return `<div class="fig" style="--a:${T.a}">
      <div class="bars it">${d.murali.y.map((y, i) => {
        const h = Math.round((d.murali.v[i] / max) * 100);
        return `<div class="bar"><span class="tip"><b>${y}</b>${nf(d.murali.v[i])}<br><i>${d.src}</i></span>
          <span class="bv">${nf(d.murali.v[i])}</span>
          <span class="col" style="height:${h}%;background:${i ? T.b : 'rgba(255,255,255,.28)'}"></span>
          <span class="bl">${y}</span></div>`;
      }).join('')}<div class="itdelta" style="color:${T.b}">−15.7 %</div></div>${wm()}</div>`;
  }
  const max = Math.max(...d.total);
  return `<div class="fig" style="--a:${T.a}">
    <div class="legend"><span><i style="background:${T.a}"></i>${t.legendHp}</span><span><i style="background:rgba(255,255,255,.25)"></i>${t.legendTotal}</span></div>
    <div class="bars">${d.years.map((y, i) => {
      const th = Math.round((d.total[i] / max) * 100);
      const hh = Math.round((d.hp[i] / d.total[i]) * 100);
      return `<div class="bar"><span class="tip"><b>${y}</b>${t.totalShort}: ${nf(d.total[i])}<br>${t.hpShort}: ${nf(d.hp[i])}<br>${t.shareShort}: ${d.share[i]}<br><i>${d.src}</i></span>
        <span class="bv">${nf(d.total[i])}</span>
        <span class="col"><span class="fill" style="height:${hh}%;background:${T.a}"></span></span>
        <span class="bl">${y}</span><span class="bs" style="color:${T.a}">${d.share[i]}</span></div>`;
    }).join('')}</div>${wm()}</div>`;
}

const GLANCE = {
  DE: { big: '47.7 %', sub: '299,000' }, GB: { big: '7.1 %', sub: '110,353' },
  FR: { big: '29.6 %', sub: '181,890' }, PL: { big: '32.1 %', sub: '178,610' },
  IT: { big: '−15.7 %', sub: '769,090' },
};

/** One country chapter. */
function chapter(cc, t, name) {
  const T = THEMES[cc]; const c = t.ch[cc];
  return `<section class="page chapter" data-cc="${cc}" style="--a:${T.a};--b:${T.b};--base:${T.base};--mid:${T.mid}">
    <div class="chband"><img src="${ICONS[cc]}" alt="" class="cicon"><span class="cname">${esc(name)}</span><span class="cline"></span></div>
    <h2>${esc(c.title)}</h2>
    <p class="lead">${esc(c.lead)}</p>
    <div class="figtitle">${esc(c.chart)} <span class="hoverhint">· ${esc(t.hover)}</span></div>
    ${chart(cc, t)}
    <div class="two">
      <div class="box"><h4>${esc(cc === 'IT' && c.outlookSrc ? c.outlookSrc : t.outlook)}</h4>
        ${c.outlook.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b style="color:var(--a)">${esc(v)}</b></div>`).join('')}</div>
      <div class="box"><h4>${esc(t.notes)}</h4>
        ${c.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}</div>
    </div>
    <div class="srcline">${esc(t.sources)}: ${SRC_LINKS[cc].map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join(' · ')}</div>
  </section>`;
}

/** The whole document body for one language. */
function doc(lang, t) {
  const NAMES = { en: ['Germany','United Kingdom','France','Poland','Italy'], de: ['Deutschland','Großbritannien','Frankreich','Polen','Italien'], fr: ['Allemagne','Royaume-Uni','France','Pologne','Italie'], pl: ['Niemcy','Wielka Brytania','Francja','Polska','Włochy'], it: ['Germania','Regno Unito','Francia','Polonia','Italia'] }[lang];
  const CCS = ['DE','GB','FR','PL','IT'];
  return `<div class="doc" data-doc="${lang}">
  <section class="page cover">
    <img class="euicon" src="${ICONS.EU}" alt="">
    <div class="lockup">${LOCKUP}</div>
    <div class="edition">${esc(t.edition)}</div>
    <h1>${esc(t.coverTitle)}</h1>
    <p class="csub">${esc(t.coverSub)}</p>
    <div class="flags">${CCS.map((c) => `<img src="${ICONS[c]}" alt="">`).join('')}</div>
    <p class="cnote">${esc(t.coverNote)}</p>
    <div class="cfoot">${esc(t.by)} · heatpumpdb.eu</div>
  </section>

  <section class="page">
    <div class="kicker">${esc(t.execKicker)}</div>
    <h2 class="bigh">${esc(t.execTitle)}</h2>
    <p class="lead">${esc(t.execLead)}</p>
    <div class="figtitle">${esc(t.atGlance)}</div>
    <div class="glance">${CCS.map((c, i) => {
      const T = THEMES[c]; const g = GLANCE[c];
      return `<div class="gcard" style="--a:${T.a};background:linear-gradient(150deg,${T.mid},${T.base})">
        <img src="${ICONS[c]}" alt=""><div class="gname">${esc(NAMES[i])}</div>
        <div class="gbig" style="color:${T.a}">${g.big}</div>
        <div class="gsub">${c === 'IT' ? '' : esc(t.hpShort) + ': '}${g.sub}</div>
        <div class="gnote">${esc(t.glanceNote[c])}</div>${wm()}</div>`;
    }).join('')}</div>
    <div class="insights">${t.insights.map(([h, p]) => `<div class="ins"><h4>${esc(h)}</h4><p>${esc(p)}</p></div>`).join('')}</div>
  </section>

  ${CCS.map((c, i) => chapter(c, t, NAMES[i])).join('')}

  <section class="page">
    <div class="kicker">HEATPUMP DB</div>
    <h2 class="bigh">${esc(t.measureTitle)}</h2>
    ${t.measure.map((p) => `<p class="essay">${esc(p)}</p>`).join('')}
    <div class="aboutbox">
      <div class="lockup small">${LOCKUP}</div>
      <h3>${esc(t.aboutTitle)}</h3>
      <p>${esc(t.aboutP)}</p>
      <a class="cta" href="https://www.heatpumpdb.eu" target="_blank" rel="noopener">${esc(t.aboutCta)}</a>
      <div class="sites">${SITES.map(([h]) => `<a href="https://www.${h}" target="_blank" rel="noopener">${h}</a>`).join('')}</div>
    </div>
  </section>

  <section class="page">
    <div class="kicker">APPENDIX</div>
    <h2 class="bigh">${esc(t.srcTitle)}</h2>
    <p class="lead">${esc(t.srcIntro)}</p>
    ${['DE','GB','FR','PL','IT'].map((c, i) => `<div class="srcblock"><h4><img src="${ICONS[c]}" alt="">${esc(NAMES[i])}</h4>
      ${SRC_LINKS[c].map(([n, u]) => `<div class="srcrow"><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a><span class="u">${esc(u.replace(/^https?:\/\//, '').slice(0, 64))}${u.replace(/^https?:\/\//, '').length > 64 ? '…' : ''}</span></div>`).join('')}</div>`).join('')}
    <div class="footerline">${esc(t.footer)}</div>
  </section>
</div>`;
}

/* ── Preview gating: scramble digits (a blur alone can be un-blurred) ─────── */
function scrambleDigits(html) {
  let i = 0;
  return html
    // keep tags intact — only touch text between tags
    .replace(/>([^<]+)</g, (m, txt) => '>' + txt.replace(/[0-9]/g, () => String((i += 7) % 10)) + '<');
}

function lockSections(docHtml, t) {
  // keep cover + exec summary + first chapter (DE); lock the rest
  const parts = docHtml.split('<section class="page');
  const head = parts.slice(0, 4).join('<section class="page');   // doc-open, cover, exec, DE
  const rest = parts.slice(4).map((p) => '<section class="page' + p);
  const overlay = `<div class="lockov"><div class="lockcard">
      <div class="lockup small">${LOCKUP}</div>
      <h3>${esc(t.ovTitle)}</h3><p>${esc(t.ovBody)}</p>
      <a class="cta" href="https://www.heatpumpdb.eu" target="_blank" rel="noopener">${esc(t.ovBtn)}</a>
      <div class="ovlist">${esc(t.ovList)}</div>
      <div class="sites">${SITES.map(([h]) => `<a href="https://www.${h}" target="_blank" rel="noopener">${h}</a>`).join('')}</div>
    </div></div>`;
  const locked = rest.map((sec) => {
    const inner = scrambleDigits(sec).replace(/href="[^"]*"/g, 'href="https://www.heatpumpdb.eu"');
    return `<div class="lockwrap">${inner.replace('<section class="page', '<section class="page locked')}${overlay}</div>`;
  }).join('');
  return head + locked;
}

/* ── Page shell ───────────────────────────────────────────────────────────── */
function shell({ preview }) {
  const langs = Object.keys(L);
  const docs = langs.map((lg) => {
    const d = doc(lg, L[lg]);
    return preview ? lockSections(d, L[lg]) : d;
  }).join('');
  const badge = preview ? `<div class="pvbadge" data-badge></div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The European Heating Market — HeatPump DB Special Report (Aug 2026)${preview ? ' · Preview' : ''}</title>
<meta name="description" content="Boilers and heat pumps in DE, UK, FR, PL, IT — the 2021–2025 series with sources. A HeatPump DB special report.">
<style>
  :root { --ink:#eef3fa; --mut:#9fb0c6; --line:rgba(255,255,255,.1); --bg:#060b13; --card:#0b1626; --blue:#2997ff; --red:#ff6b52; }
  * { box-sizing:border-box; margin:0; }
  html { scroll-behavior:smooth; }
  body { background:var(--bg); color:var(--ink); font:16px/1.65 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; -webkit-font-smoothing:antialiased; }
  a { color:var(--blue); text-decoration:none; } a:hover { text-decoration:underline; }
  .doc { display:none; } .doc.on { display:block; }
  .page { max-width:880px; margin:0 auto; padding:56px 40px 64px; border-bottom:1px solid var(--line); position:relative; }
  /* language bar */
  .langbar { position:fixed; top:14px; right:16px; z-index:90; display:flex; gap:6px; padding:6px 8px; border-radius:999px; background:rgba(11,22,38,.85); border:1px solid var(--line); backdrop-filter:blur(10px); }
  .langbar button { border:1px solid transparent; background:none; color:var(--mut); font:600 12px Inter,sans-serif; padding:5px 10px; border-radius:999px; cursor:pointer; }
  .langbar button.on { color:#fff; border-color:var(--blue); background:rgba(41,151,255,.15); }
  /* cover */
  .cover { text-align:center; padding-top:84px; min-height:92vh; }
  .euicon { width:84px; border-radius:20px; box-shadow:0 10px 40px rgba(0,0,0,.5); }
  .lockup { margin-top:22px; } .lockup svg { height:34px; width:auto; } .lockup.small svg { height:26px; }
  .edition { margin-top:26px; font-size:12px; font-weight:700; letter-spacing:.22em; color:var(--mut); }
  .cover h1 { margin-top:10px; font-size:clamp(34px,5.4vw,54px); font-weight:800; letter-spacing:-.02em; line-height:1.1; }
  .csub { max-width:620px; margin:16px auto 0; color:var(--mut); font-size:16.5px; }
  .flags { margin-top:26px; display:flex; justify-content:center; gap:12px; } .flags img { width:38px; border-radius:9px; }
  .cnote { margin-top:26px; font-size:12.5px; color:#77879d; }
  .cfoot { margin-top:44px; font-size:12.5px; color:var(--mut); }
  /* headings */
  .kicker { font-size:11.5px; font-weight:800; letter-spacing:.24em; color:var(--mut); }
  .bigh { margin-top:8px; font-size:clamp(26px,3.6vw,36px); font-weight:800; letter-spacing:-.02em; }
  .lead { margin-top:14px; color:#c7d2e2; font-size:16.5px; }
  h2 { font-size:clamp(23px,3vw,30px); font-weight:800; letter-spacing:-.015em; margin-top:10px; }
  /* glance cards */
  .figtitle { margin:28px 0 12px; font-size:13px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--mut); }
  .hoverhint { font-weight:500; letter-spacing:0; text-transform:none; color:#77879d; }
  .glance { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  .gcard { border:1px solid var(--line); border-radius:16px; padding:14px 13px 40px; position:relative; overflow:hidden; }
  .gcard img { width:26px; border-radius:6px; }
  .gname { margin-top:8px; font-size:12px; font-weight:700; color:#dfe8f4; }
  .gbig { margin-top:6px; font-size:25px; font-weight:800; letter-spacing:-.02em; }
  .gsub { font-size:11.5px; color:#c7d2e2; } .gnote { margin-top:6px; font-size:10px; line-height:1.45; color:var(--mut); }
  .insights { margin-top:26px; display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .ins { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .ins h4 { font-size:14.5px; margin-bottom:6px; } .ins p { font-size:12.5px; color:var(--mut); line-height:1.6; }
  /* chapter */
  .chband { display:flex; align-items:center; gap:12px; }
  .cicon { width:34px; border-radius:8px; }
  .cname { font-size:13px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--a); }
  .cline { flex:1; height:1px; background:linear-gradient(90deg,var(--a),transparent); opacity:.5; }
  .chapter h2 { margin-top:16px; }
  /* figure */
  .fig { margin-top:6px; background:linear-gradient(160deg,var(--mid,#0e1a2c),var(--base,#0b1422)); border:1px solid var(--line); border-radius:16px; padding:22px 22px 40px; position:relative; }
  .legend { display:flex; gap:18px; font-size:12.5px; color:var(--mut); margin-bottom:8px; }
  .legend i { display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:6px; }
  .bars { display:flex; gap:16px; align-items:flex-end; height:230px; padding-top:26px; }
  .bars.it { max-width:420px; }
  .bar { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:6px; position:relative; }
  .bv { font-size:12.5px; font-weight:700; color:#dfe8f4; white-space:nowrap; }
  .col { width:100%; max-width:76px; height:calc(var(--h,100%)); background:rgba(255,255,255,.22); border-radius:8px 8px 3px 3px; display:flex; flex-direction:column; justify-content:flex-end; overflow:hidden; }
  .bar > .col { flex:0 0 auto; }
  .fill { width:100%; box-shadow:0 -1px 0 rgba(255,255,255,.5); min-height:3px; }
  .bl { font-size:12px; color:var(--mut); } .bs { font-size:12.5px; font-weight:800; }
  .tip { position:absolute; bottom:calc(100% + 2px); left:50%; transform:translateX(-50%); background:#0d1726; border:1px solid var(--a); border-radius:10px; padding:9px 12px; font-size:11.5px; line-height:1.55; color:#dfe8f4; white-space:nowrap; opacity:0; pointer-events:none; transition:opacity .15s; z-index:5; }
  .tip b { display:block; color:var(--a); margin-bottom:2px; } .tip i { color:var(--mut); font-style:normal; }
  .bar:hover .tip { opacity:1; }
  .itdelta { align-self:center; font-size:26px; font-weight:800; padding:0 18px; }
  /* two-col boxes */
  .two { margin-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .box { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .box h4 { font-size:13px; letter-spacing:.06em; text-transform:uppercase; color:var(--mut); margin-bottom:10px; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-top:1px solid var(--line); font-size:13px; }
  .row span { color:#c7d2e2; } .row b { text-align:right; white-space:nowrap; }
  .note { font-size:12.5px; color:var(--mut); line-height:1.6; margin-bottom:8px; }
  .srcline { margin-top:14px; font-size:11.5px; color:#77879d; line-height:1.8; }
  .srcline a { color:#8fb2d9; }
  /* watermark */
  .wm { position:absolute; right:14px; bottom:10px; display:flex; align-items:center; gap:7px; font-size:10px; color:rgba(255,255,255,.45); }
  .wm .wmark svg { height:13px; width:auto; opacity:.8; }
  /* essay + about */
  .essay { margin-top:16px; font-size:16px; color:#c7d2e2; max-width:700px; }
  .aboutbox { margin-top:34px; background:linear-gradient(150deg,#0e1a2c,#0b1422); border:1px solid rgba(41,151,255,.25); border-radius:18px; padding:28px; text-align:center; }
  .aboutbox h3 { margin-top:12px; font-size:21px; } .aboutbox p { margin:10px auto 0; max-width:560px; color:var(--mut); font-size:14px; }
  .cta { display:inline-block; margin-top:18px; background:linear-gradient(92deg,var(--red),var(--blue)); color:#fff; font-weight:700; padding:12px 26px; border-radius:999px; }
  .cta:hover { text-decoration:none; opacity:.92; }
  .sites { margin-top:16px; display:flex; justify-content:center; flex-wrap:wrap; gap:8px 16px; font-size:12.5px; }
  /* appendix */
  .srcblock { margin-top:20px; }
  .srcblock h4 { display:flex; align-items:center; gap:9px; font-size:14px; } .srcblock h4 img { width:22px; border-radius:5px; }
  .srcrow { padding:6px 0 6px 31px; font-size:13px; border-bottom:1px solid var(--line); }
  .srcrow .u { display:block; font-size:10.5px; color:#5d6c82; }
  .footerline { margin-top:38px; font-size:11.5px; color:var(--mut); text-align:center; }
  /* preview lock */
  .pvbadge { position:fixed; top:14px; left:16px; z-index:90; font-size:10.5px; font-weight:800; letter-spacing:.16em; color:#ffd479; border:1px solid rgba(255,212,121,.4); background:rgba(80,60,10,.35); padding:6px 12px; border-radius:999px; backdrop-filter:blur(8px); }
  .lockwrap { position:relative; }
  .locked { filter:blur(9px) saturate(.7); pointer-events:none; user-select:none; }
  .lockov { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:30px; background:linear-gradient(180deg,rgba(6,11,19,.25),rgba(6,11,19,.65)); }
  .lockcard { max-width:520px; background:rgba(11,22,38,.96); border:1px solid rgba(41,151,255,.35); border-radius:20px; padding:30px 32px; text-align:center; box-shadow:0 24px 80px rgba(0,0,0,.6); }
  .lockcard h3 { margin-top:12px; font-size:20px; } .lockcard p { margin-top:10px; color:var(--mut); font-size:13.5px; }
  .ovlist { margin-top:16px; font-size:12px; color:var(--mut); }
  @media (max-width:760px) { .glance { grid-template-columns:repeat(2,1fr); } .insights { grid-template-columns:1fr; } .two { grid-template-columns:1fr; } .page { padding:40px 20px 52px; } }
  @media print {
    body { background:#060b13 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .langbar { display:none; } .page { border-bottom:none; page-break-after:always; max-width:none; }
    .tip { display:none; } .cover { min-height:auto; }
  }
</style>
</head>
<body>
${badge}
<div class="langbar" role="group" aria-label="Language">
  ${langs.map((lg) => `<button data-lang="${lg}"${lg === 'en' ? ' class="on"' : ''}>${lg.toUpperCase()}</button>`).join('')}
</div>
${docs}
<script>
  const docs = document.querySelectorAll('.doc');
  const btns = document.querySelectorAll('.langbar button');
  const badges = { en:'FREE PREVIEW', de:'KOSTENLOSE VORSCHAU', fr:'APERÇU GRATUIT', pl:'BEZPŁATNY PODGLĄD', it:'ANTEPRIMA GRATUITA' };
  function setLang(lg) {
    docs.forEach(d => d.classList.toggle('on', d.dataset.doc === lg));
    btns.forEach(b => b.classList.toggle('on', b.dataset.lang === lg));
    document.documentElement.lang = lg;
    const bd = document.querySelector('[data-badge]'); if (bd) bd.textContent = badges[lg];
    try { localStorage.setItem('hpdb-report-lang', lg); } catch(e) {}
  }
  btns.forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  let init = 'en';
  try { init = localStorage.getItem('hpdb-report-lang') || (navigator.language || 'en').slice(0,2); } catch(e) {}
  setLang(['en','de','fr','pl','it'].includes(init) ? init : 'en');
</script>
</body>
</html>`;
}

/* ── Build ────────────────────────────────────────────────────────────────── */
const BASE = 'HeatPumpDB_European_Heating_Market_Report_2026-08';
const fullPath = join(OUT, `${BASE}_FULL.html`);
const prevPath = join(OUT, `${BASE}_PREVIEW.html`);
writeFileSync(fullPath, shell({ preview: false }));
writeFileSync(prevPath, shell({ preview: true }));
console.log(`FULL    ${(readFileSync(fullPath).length / 1024).toFixed(0)} kB`);
console.log(`PREVIEW ${(readFileSync(prevPath).length / 1024).toFixed(0)} kB`);

/* PDFs (A4) — LinkedIn document posts need PDF; EN is the active language. */
const browser = await chromium.launch();
for (const [src, dst] of [[fullPath, join(OUT, `${BASE}_FULL.pdf`)], [prevPath, join(OUT, `${BASE}_PREVIEW.pdf`)]]) {
  const page = await browser.newPage();
  await page.goto('file://' + src, { waitUntil: 'networkidle' });
  await page.pdf({ path: dst, format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await page.close();
  console.log(`PDF     ${dst.split('/').pop()} (${(readFileSync(dst).length / 1048576).toFixed(1)} MB)`);
}
await browser.close();
console.log('→ ' + OUT);
