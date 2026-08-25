#!/usr/bin/env node
/**
 * update-market-facts.mjs — keep the marketing workspace's numbers true.
 *
 * WHY THIS EXISTS
 * market-facts.md is what every piece of marketing copy quotes, and on
 * 2026-08-25 it was nineteen days stale in a way that mattered: it still said
 * France has no national list. France gained one on 2026-08-19 — the ADEME
 * agrément register, whose number a devis must carry from 1 September — so a
 * comment written from that file would have told French professionals something
 * false about their own market. Marketing runs daily; the data changes monthly;
 * the gap between those two rhythms is exactly where a stale number gets
 * published.
 *
 * WHAT IT OWNS, AND WHAT IT MUST NOT TOUCH
 * Only the region between the two AUTOGEN markers. Everything around it is
 * hand-written positioning that no generator has any business rewriting — the
 * file is a marketing document that happens to contain a table, not a report.
 *
 * SOURCE OF TRUTH: data_manifests/production.json — the manifest the dataset
 * gate APPROVED for the live upload. Not the dataset files: the
 * residential/commercial split has rules (missing capacity is unclassified,
 * never silently residential) that a naive count gets wrong, and not the live
 * bucket either, because what marketing may quote is what we accepted, not what
 * happens to be sitting there.
 *
 * Idempotent and quiet: if nothing changed it says so and rewrites nothing, so
 * a daily run costs one process and leaves no noise behind.
 *
 * Run:  node scripts/marketing/update-market-facts.mjs [--check]
 *         --check  report drift and exit 1, write nothing (for a pre-flight)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FACTS = join(homedir(), 'Claude/Projects/HeatPump DB Marketing/Claude Code/market-facts.md');
const MANIFEST = resolve(ROOT, 'data_manifests/production.json');
const CHECK = process.argv.includes('--check');

const BEGIN = '<!-- AUTOGEN:country-editions — scripts/marketing/update-market-facts.mjs. Do not edit by hand. -->';
const END = '<!-- /AUTOGEN:country-editions -->';

/** Per-market presentation. The counts come from the manifest; these do not. */
const EDITION = {
  DE: { name: 'Germany (DE)', domain: 'www.heatpumpdb.de', langs: 'DE, EN',
        listing: 'BAFA list (listed / delisted preserved)',
        funding: 'BEG EM (BAFA), KfW 458' },
  GB: { name: 'United Kingdom (GB)', domain: 'www.heatpumpdb.uk', langs: 'EN',
        listing: 'Ofgem PEL ("PEL Listed" / "verification required") + MCS ids',
        funding: 'Boiler Upgrade Scheme (BUS)' },
  FR: { name: 'France (FR)', domain: 'www.heatpumpdb.fr', langs: 'FR, EN',
        listing: 'ADEME agrément register ("Agréé" + number / "Vérification de l\'agrément requise"); NF PAC references on confident matches only',
        funding: "MaPrimeRénov', CEE — criteria-based only" },
  PL: { name: 'Poland (PL)', domain: 'www.heatpumpdb.pl', langs: 'PL, EN',
        listing: 'Lista ZUM ("Na liście ZUM" / "Weryfikacja ZUM wymagana")',
        funding: 'Czyste Powietrze, Moje Ciepło' },
  IT: { name: 'Italy (IT)', domain: 'www.heatpumpdb.it', langs: 'IT, EN',
        listing: 'GSE Conto Termico catalogue ("Nel catalogo GSE" / "Verifica richiesta")',
        funding: 'Conto Termico 3.0, detrazioni/Ecobonus' },
};
const ORDER = ['DE', 'GB', 'FR', 'PL', 'IT'];

const n = (v) => Number(v ?? 0).toLocaleString('en-GB');

function render(manifest) {
  const markets = manifest.markets ?? {};
  const rows = ORDER.filter((cc) => markets[cc]).map((cc) => {
    const m = markets[cc];
    const e = EDITION[cc];
    // A confirmed count is worth quoting; a market with none is not made to
    // look as if it has one.
    const confirmed = m.local_confirmed > 0 ? ` — ${n(m.local_confirmed)} confirmed` : '';
    return `| ${e.name} | ${e.domain} | ${e.langs} | ${n(m.products)} (${n(m.residential)} / ${n(m.commercial)}) `
      + `| ${n(m.manufacturers)} | ${e.listing}${confirmed} | ${e.funding} |`;
  });

  const unclassified = ORDER.filter((cc) => (markets[cc]?.unclassified ?? 0) > 0)
    .map((cc) => `${cc} ${n(markets[cc].unclassified)}`);

  return [
    BEGIN,
    '',
    `> Numbers regenerated **${new Date().toISOString().slice(0, 10)}** from`,
    '> `data_manifests/production.json` — the manifest the dataset gate approved for',
    '> the live upload. They change with the monthly data update (1st/2nd); this',
    '> block is refreshed daily so a number quoted on any given day is the number we',
    '> actually published.',
    '',
    '| Market | Domain | Languages | Models (res / com) | Manufacturers | Local listing overlay | Funding programmes referenced |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '- Every market shares the same canonical European technical baseline. FR, PL',
    '  and IT additionally publish market-specific records built from their own',
    '  registries, which is why their counts are higher.',
    '- Residential/commercial split (the product\'s own rule, identical everywhere):',
    '  rated capacity ≤ 23 kW residential, above it commercial. A model with no',
    '  rated capacity is **unclassified**, never silently residential'
      + (unclassified.length ? ` — currently ${unclassified.join(', ')}.` : ' — currently none.'),
    '- A listing is only ever **confirmed** or **verification required**. Never write',
    '  that a product is NOT on a list: a failed match is a fact about our matching,',
    '  not about the registry. Only Germany owns its registry and may say',
    '  "no longer listed".',
    '- **France has had a national list since 2026-08-19.** Copy written before that',
    '  date says it has none — that is false and must not be repeated. The agrément',
    '  number must appear on the devis, the facture and the attestation sur',
    '  l\'honneur from **1 September 2026**.',
    '',
    END,
  ].join('\n');
}

// ── Run ─────────────────────────────────────────────────────────────────────
if (!existsSync(MANIFEST)) {
  console.error(`No approved manifest at ${MANIFEST} — run the dataset gate first.`);
  process.exit(1);
}
if (!existsSync(FACTS)) {
  // The marketing workspace is a separate shared folder; on a machine that does
  // not have it, this is not a failure worth waking anyone for.
  console.log('market-facts.md not present (marketing workspace not on this machine) — nothing to do.');
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const facts = readFileSync(FACTS, 'utf8');
const block = render(manifest);

const i = facts.indexOf(BEGIN);
const j = facts.indexOf(END);
if (i === -1 || j === -1) {
  console.error('AUTOGEN markers not found in market-facts.md.');
  console.error('Add them around the country-editions section once; everything outside stays hand-written.');
  process.exit(1);
}

const current = facts.slice(i, j + END.length);
// The regenerated date always differs, so compare everything except that line —
// otherwise a daily run would report a change every single day.
const strip = (s) => s.split('\n').filter((l) => !l.startsWith('> Numbers regenerated')).join('\n');
if (strip(current) === strip(block)) {
  console.log('market-facts.md is current — no change.');
  process.exit(0);
}

if (CHECK) {
  console.error('market-facts.md is OUT OF DATE — run without --check to refresh it.');
  process.exit(1);
}

writeFileSync(FACTS, facts.slice(0, i) + block + facts.slice(j + END.length));
console.log('market-facts.md refreshed:');
for (const cc of ORDER) {
  const m = manifest.markets?.[cc];
  if (m) console.log(`  ${cc}  ${n(m.products)} models · ${n(m.manufacturers)} manufacturers · ${n(m.local_confirmed)} confirmed listings`);
}
