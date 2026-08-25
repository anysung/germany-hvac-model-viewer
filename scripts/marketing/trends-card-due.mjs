#!/usr/bin/env node
/**
 * trends-card-due.mjs — which markets are due a Market & Trends card this week.
 *
 * WHAT THIS IS NOT
 * It does not write cards. Writing one needs a source read, a judgement about
 * whether the finding is publishable, and market-language copy — none of which
 * a cron job should be inventing at 09:00 on a Monday. What it does is answer
 * the question a weekly routine keeps forgetting to ask: *which markets have
 * gone quiet?*
 *
 * THE RULE (owner, 2026-08-25)
 *   - Cards are made where the market monitoring actually turned something up.
 *     No market is obliged to produce one every week; an invented card is worse
 *     than no card, because the whole channel rests on publishing only numbers
 *     we can prove.
 *   - But no market may go longer than FOURTEEN DAYS without one. A feed that
 *     stops is a feed people stop opening, and a market edition whose last card
 *     is a month old looks abandoned to the professionals we are trying to
 *     reach.
 *
 * So a market is DUE when its newest card is 14 days old or older, and it is
 * WORTH A LOOK from day 7 — early enough that a card can be prepared before the
 * deadline rather than scrambled on the day.
 *
 * Where the last date comes from: data_sources/market_trends/<CC>.json, the
 * committed content store — the same file the site builds from, so this can
 * never disagree with what is actually published.
 *
 * Run:  node scripts/marketing/trends-card-due.mjs [--json]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE = join(ROOT, 'data_sources/market_trends');
const JSON_OUT = process.argv.includes('--json');

const MARKETS = { DE: 'Germany', GB: 'United Kingdom', FR: 'France', PL: 'Poland', IT: 'Italy' };
const DUE_DAYS = 14;      // the owner's floor: no market goes longer than this
const WARN_DAYS = 7;      // start looking, so a due date is never a surprise

const DAY = 86400000;
const today = new Date();
const startOfDay = (d) => Date.parse(`${d}T00:00:00Z`);

const rows = Object.entries(MARKETS).map(([cc, name]) => {
  const p = join(STORE, `${cc}.json`);
  if (!existsSync(p)) return { cc, name, last: null, age: Infinity, state: 'due' };
  const cards = JSON.parse(readFileSync(p, 'utf8'));
  // Newest first by contract, but sort anyway — a hand-edited store may not be.
  const last = cards.map((c) => c.date).filter(Boolean).sort().pop() ?? null;
  if (!last) return { cc, name, last: null, age: Infinity, state: 'due' };
  const age = Math.floor((today.getTime() - startOfDay(last)) / DAY);
  const state = age >= DUE_DAYS ? 'due' : age >= WARN_DAYS ? 'soon' : 'ok';
  return { cc, name, last, age, state, dueIn: DUE_DAYS - age };
});

if (JSON_OUT) {
  console.log(JSON.stringify({ checkedAt: today.toISOString(), dueDays: DUE_DAYS, markets: rows }, null, 1));
  process.exit(0);
}

const due = rows.filter((r) => r.state === 'due');
const soon = rows.filter((r) => r.state === 'soon');

console.log(`\nMarket & Trends — card cadence (floor: one per market every ${DUE_DAYS} days)\n`);
for (const r of rows.sort((a, b) => b.age - a.age)) {
  const mark = r.state === 'due' ? '● DUE ' : r.state === 'soon' ? '◐ soon' : '○ ok  ';
  const when = r.last ? `last ${r.last} · ${r.age}d ago` : 'no card ever published';
  const note = r.state === 'due' ? 'overdue — publish this week'
    : r.state === 'soon' ? `due in ${r.dueIn}d` : '';
  console.log(`  ${mark} ${r.cc}  ${String(r.name).padEnd(15)} ${when.padEnd(30)} ${note}`);
}

console.log('');
if (due.length) {
  console.log(`${due.length} market(s) past the ${DUE_DAYS}-day floor: ${due.map((r) => r.cc).join(', ')}`);
  console.log('Next: read the latest monitoring digest for a publishable finding. If the week');
  console.log('produced none, the card is built from our own catalogue — those numbers are');
  console.log('always provable, which is exactly why the floor can be held without inventing.');
} else if (soon.length) {
  console.log(`Nothing overdue. Approaching: ${soon.map((r) => `${r.cc} (${r.dueIn}d)`).join(', ')}`);
} else {
  console.log('All markets within cadence.');
}
console.log('');
process.exit(due.length ? 1 : 0);   // non-zero so a scheduler can act on it
