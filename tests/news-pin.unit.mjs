#!/usr/bin/env node
/**
 * news-pin.unit.mjs — the Special Report pin window.
 *
 * WHAT THIS PROTECTS
 * The owner's rule (2026-08-25) is that the news feed always leads with the
 * current month's Special Report AND the previous month's, and nothing older.
 * That is a two-part claim — the window is two months, and it expires on its
 * own — and neither part is visible when it breaks: a wrong window shows the
 * wrong report at the top of five market feeds, silently, until someone
 * notices weeks later that August is still leading in November.
 *
 * The month arithmetic is the part that actually bites (year rollover,
 * February, a 31-day month followed by a 30-day one), so it is walked rather
 * than spot-checked.
 *
 * Run: node tests/news-pin.unit.mjs
 */
import { pinnedThrough, isPinnedOn } from '../scripts/lib/special-report-store.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; return; }
  fail++; console.error(`FAIL ${name}\n  got  ${got}\n  want ${want}`);
};
const ok = (name, cond) => eq(name, cond, true);

/* ── the window is the edition's month plus the next, to its last day ──── */
eq('August pins through the end of September', pinnedThrough('2026-08'), '2026-09-30');
eq('a 31-day follower keeps its 31st',         pinnedThrough('2026-09'), '2026-10-31');
eq('December rolls into the next year',        pinnedThrough('2026-12'), '2027-01-31');
eq('January lands on a 28-day February',       pinnedThrough('2027-01'), '2027-02-28');
eq('a leap February keeps its 29th',           pinnedThrough('2028-01'), '2028-02-29');

/* Every month of a year: the expiry must always be the last day of the NEXT
   month — never the same month, never the 1st of the one after. */
for (let m = 1; m <= 12; m++) {
  const id = `2026-${String(m).padStart(2, '0')}`;
  const until = pinnedThrough(id);
  const [uy, um, ud] = until.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  eq(`${id} expires in the following month`, um, nextMonth);
  eq(`${id} expires in the right year`, uy, m === 12 ? 2027 : 2026);
  // The day after is the 1st: proof we landed on the last day, whatever it is.
  eq(`${id} expires on the last day`,
    new Date(Date.UTC(uy, um - 1, ud + 1)).toISOString().slice(8, 10), '01');
}

/* ── exactly two editions lead the feed, on any day ─────────────────────── */
const leading = (today, ids) =>
  ids.filter((id) => id <= today.slice(0, 7) && isPinnedOn(true, pinnedThrough(id), today));
const EDS = ['2026-08', '2026-09', '2026-10', '2026-11'];

eq('launch month: only the first edition exists',
  leading('2026-08-25', EDS).join(','), '2026-08');
eq('last day of the window: August still leads alongside September',
  leading('2026-09-30', EDS).join(','), '2026-08,2026-09');
eq('next morning: August is gone, September and October lead',
  leading('2026-10-01', EDS).join(','), '2026-09,2026-10');
eq('a month later: the pair has moved on',
  leading('2026-11-05', EDS).join(','), '2026-10,2026-11');
for (const day of ['2026-10-01', '2026-10-15', '2026-11-05', '2026-11-30']) {
  eq(`never more than two pinned (${day})`, leading(day, EDS).length <= 2, true);
}

/* ── the guard rails on the rule itself ─────────────────────────────────── */
ok('an unpinned article is never pinned, whatever its date',
  !isPinnedOn(false, '2099-12-31', '2026-08-25'));
ok('a missing expiry means an indefinite pin (editions written before the window)',
  isPinnedOn(true, undefined, '2030-01-01'));
ok('the last day is inclusive — the reader still sees it that day',
  isPinnedOn(true, '2026-09-30', '2026-09-30'));
ok('the day after is not',
  !isPinnedOn(true, '2026-09-30', '2026-10-01'));
ok('pinned must be a real true, not a truthy value from a partial document',
  !isPinnedOn('yes', '2026-09-30', '2026-08-25'));

console.log(`\nnews pin window: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
