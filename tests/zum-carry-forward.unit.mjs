/**
 * Lista ZUM carry-forward — the rule that decides which detail pages we ask
 * the registry for again.
 *
 * Run: node tests/zum-carry-forward.unit.mjs
 *
 * WHY THIS EXISTS
 * Until 2026-09 every monthly run re-downloaded all ~10,200 public detail pages
 * of Lista ZUM at 1.5 s apart: over five hours of requests to an IOŚ-PIB server
 * to learn that 99.5% of them had not changed, and the single reason the
 * monthly maintenance window could not finish. The fix is to stop asking twice
 * — NOT to ask faster, which would raise the load we place on a public registry
 * without reducing it.
 *
 * That fix is only acceptable while three things stay true, and this file is
 * what keeps them true:
 *
 *   1. LISTING STATE IS NEVER CARRIED. The grid is re-fetched in full, and the
 *      removed/suspended tab (EX) is always re-fetched from source. A carried
 *      page may supply specifications; it may never supply status.
 *   2. THE WHOLE REGISTER IS RE-VERIFIED WITHIN SIX MONTHS. A rolling sixth,
 *      chosen by a stable hash, is fetched even when nothing looks changed —
 *      the grid cannot show a correction made inside a detail page.
 *   3. PROVENANCE IS TRANSITIVE. A page carried twice still names the month it
 *      was actually fetched. PL publishes registry-native records whose only
 *      evidence is this snapshot, so dating July evidence as October would be
 *      us overstating our own sources.
 */
import { carryDecision, idHash, rollingSlice, identityById } from '../scripts/pl/fetch-zum.mjs';

let failed = 0;
const is = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};
const ok = (name, cond) => is(name, !!cond, true);

/** A settled entry: same row as last month, page on disk, not in this slice. */
const settled = (over = {}) => {
  const id = over.id ?? 'PW-019320';
  const base = {
    category: 'PW', id,
    prevIdentity: 'PW-019320|Pompa|WH-ADC0912K9E83|Panasonic',
    nowIdentity: 'PW-019320|Pompa|WH-ADC0912K9E83|Panasonic',
    hasPrevFile: true,
    slice: (idHash(id) + 1) % 6,        // deliberately NOT this entry's slice
  };
  return { ...base, ...over };
};

console.log('\nThe rule');
is('an unchanged entry is carried forward', carryDecision(settled()), 'carry');
is('a changed row goes back to the source',
  carryDecision(settled({ nowIdentity: 'PW-019320|Pompa|WH-DIFFERENT|Panasonic' })), 'fetch');
is('an entry that did not exist last month is fetched',
  carryDecision(settled({ prevIdentity: undefined })), 'fetch');
is('an entry with no page on disk is fetched',
  carryDecision(settled({ hasPrevFile: false })), 'fetch');

console.log('\nStatus is never carried');
is('the removed/suspended tab is always fetched, unchanged or not',
  carryDecision(settled({ category: 'EX' })), 'fetch');
is('...even when it falls outside the rolling slice',
  carryDecision(settled({ category: 'EX', slice: 99 })), 'fetch');
ok('EX is decided before the identity check, so a missing prev row cannot flip it',
  carryDecision(settled({ category: 'EX', prevIdentity: undefined })) === 'fetch');

console.log('\nThe rolling sixth');
{
  const ids = Array.from({ length: 3000 }, (_, i) => `PW-${String(100000 + i)}`);
  const buckets = new Array(6).fill(0);
  for (const id of ids) buckets[idHash(id) % 6]++;
  const min = Math.min(...buckets), max = Math.max(...buckets);
  ok(`the hash spreads ids evenly across six slices (${buckets.join('/')})`, min > 3000 / 6 * 0.8 && max < 3000 / 6 * 1.2);

  // Every id is re-verified exactly once in six consecutive months.
  const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
  const slices = months.map(rollingSlice);
  is('six consecutive months cover all six slices exactly once',
    [...new Set(slices)].length, 6);
  const covered = ids.filter(id =>
    slices.some(sl => carryDecision(settled({ id, slice: sl })) === 'reverify'));
  is('so every entry is re-verified from source within six months', covered.length, ids.length);

  const oneMonth = ids.filter(id => carryDecision(settled({ id, slice: slices[0] })) === 'reverify');
  ok(`and only about a sixth of them in any one month (${oneMonth.length}/3000)`,
    oneMonth.length > 400 && oneMonth.length < 600);
}
ok('the slice is stable — the same month always picks the same sixth',
  rollingSlice('2026-10') === rollingSlice('2026-10'));
ok('and consecutive months differ', rollingSlice('2026-10') !== rollingSlice('2026-11'));

console.log('\nIdentity ignores which tab an entry was scanned under');
{
  // The same entry is listed under PW and PWX. Which tab our crawl reached
  // first is an artefact of the crawl — treating it as a change made 2,538
  // untouched entries look modified in the July/September comparison.
  const rows = [
    { category: 'PWX', cells: ['PW-117014', 'Rotenso Windmi', 'WIM80X1 R14', 'Rotenso'] },
    { category: 'PW', cells: ['PW-117014', 'Rotenso Windmi', 'WIM80X1 R14', 'Rotenso'] },
  ];
  const a = identityById(rows);
  const b = identityById([rows[1], rows[0]]);      // crawled in the other order
  is('the identity is the same whichever tab came first',
    a.get('PW-117014'), b.get('PW-117014'));
  is('and one entry yields one identity', a.size, 1);
  ok('a real cell change does show up',
    identityById([{ category: 'PW', cells: ['PW-117014', 'Rotenso Windmi', 'WIM80X1 R15', 'Rotenso'] }])
      .get('PW-117014') !== a.get('PW-117014'));
}

console.log('\nPager and footer rows carry no identity');
is('a row with no id is not indexed', identityById([{ category: 'PW', cells: ['', '', ''] }]).size, 0);

console.log(failed ? `\n✗ ${failed} failed\n` : '\n✓ all carry-forward assertions passed\n');
process.exit(failed ? 1 : 0);
