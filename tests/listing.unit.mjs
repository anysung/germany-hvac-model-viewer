/**
 * Listing-state tests — the REAL resolver (src/hpiq/listing.ts), per market.
 *
 * Run: node tests/listing.unit.mjs
 *
 * This is the rule the whole UK change rests on:
 *
 *   confirmed             → listed          ("PEL Listed" + the PEL id)
 *   verification_required → verification    ("PEL verification required")
 *   review_required       → verification    ← it was confirmed and stopped matching.
 *                                             It must NOT keep showing as listed, and it
 *                                             must NOT be demoted to "not listed" either.
 *   anything unknown      → verification    (fail safe: never claim a listing)
 *
 * "Not listed" is reachable ONLY in Germany, whose catalogue IS the registry, so a
 * product missing from the snapshot really has been delisted.
 *
 * The module is bundled with the same esbuild Vite ships, once per market, so the
 * build-time country constant resolves exactly as it does in the real app.
 */
import { build } from 'esbuild';

let failed = 0;
const is = (name, actual, expected) => {
  const ok = Object.is(actual, expected);
  if (!ok) failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `  — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};

/** Bundle listing.ts as the given country's build would. */
async function resolverFor(country) {
  const out = await build({
    entryPoints: ['src/hpiq/listing.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
    // Define the whole env object, exactly as Vite substitutes it at build time.
    define: {
      'import.meta.env': JSON.stringify({
        VITE_COUNTRY_CODE: country, MODE: 'production', DEV: false, PROD: true,
      }),
    },
  });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

for (const country of ['GB', 'DE', 'FR', 'PL', 'IT']) {
  const { localListingStatus, localListingId, LOCAL_LISTING_SOURCE, LOCAL_LISTING_FILTER } = await resolverFor(country);
  console.log(`\n${country} — local listing overlay`);

  if (country === 'GB') {
    is('source is the Ofgem PEL', LOCAL_LISTING_SOURCE, 'PEL');
    is('no listing search filter is offered', LOCAL_LISTING_FILTER, false);

    is('confirmed → listed',
      localListingStatus({ pel_match_status: 'confirmed', mcs_number: '037-0034-20-03' }), 'listed');
    is('confirmed → the PEL id is shown',
      localListingId({ pel_match_status: 'confirmed', mcs_number: '037-0034-20-03' }), '037-0034-20-03');

    is('verification_required → verification required',
      localListingStatus({ pel_match_status: 'verification_required' }), 'verification_required');
    is('verification_required → no id is shown',
      localListingId({ pel_match_status: 'verification_required', mcs_number: '037-0034-20-03' }), null);

    // The one that matters: a mapping that WAS confirmed and stopped matching.
    is('review_required → verification required (never still "listed")',
      localListingStatus({ pel_match_status: 'review_required', mcs_number: '037-0034-20-03' }), 'verification_required');
    is('review_required → the old PEL id is NOT presented as a current listing',
      localListingId({ pel_match_status: 'review_required', mcs_number: '037-0034-20-03' }), null);
    is('review_required is never "not listed"',
      localListingStatus({ pel_match_status: 'review_required' }) === 'not_listed', false);

    // An ambiguity-blocked candidate arrives here as verification_required with no id.
    is('an ambiguity-blocked product asserts nothing',
      localListingStatus({ pel_match_status: 'verification_required', mcs_number: null }), 'verification_required');

    is('an unknown state fails safe to verification required',
      localListingStatus({ pel_match_status: 'something_new' }), 'verification_required');
    is('a missing state fails safe to verification required', localListingStatus({}), 'verification_required');
    is('GB can NEVER say "not listed" — absence of a match is not absence from the list',
      ['confirmed', 'verification_required', 'review_required', 'nonsense', undefined]
        .some(s => localListingStatus({ pel_match_status: s }) === 'not_listed'), false);
    // The UK must not read Germany's registry status even if the field were present.
    is('a German listing status is ignored entirely',
      localListingStatus({ bafa_listing_status: 'listed_in_snapshot' }), 'verification_required');
  }

  if (country === 'DE') {
    is('source is the German registry', LOCAL_LISTING_SOURCE, 'BAFA');
    is('the listing filter IS offered', LOCAL_LISTING_FILTER, true);
    is('in the current snapshot → listed',
      localListingStatus({ bafa_listing_status: 'listed_in_snapshot' }), 'listed');
    // Germany owns its registry, so absence really is evidence.
    is('gone from the snapshot → not listed (verified absence)',
      localListingStatus({ bafa_listing_status: 'not_in_latest_snapshot' }), 'not_listed');
    is('Germany shows no PEL id', localListingId({ mcs_number: 'X' }), null);
  }

  if (country === 'FR') {
    // France gained a national list on 2026-08-19: the ADEME agrément register,
    // whose number a devis must carry from 1 September 2026.
    is('source is the ADEME agrément register', LOCAL_LISTING_SOURCE, 'AGREMENT');
    is('no listing filter — confirmed entries do not divide the catalogue usefully',
      LOCAL_LISTING_FILTER, false);

    is('confirmed → listed',
      localListingStatus({ agrement_match_status: 'confirmed', agrement_number: '18-2026-000008' }), 'listed');
    is('confirmed → the agrément number is shown (a devis has to carry it)',
      localListingId({ agrement_match_status: 'confirmed', agrement_number: '18-2026-000008' }), '18-2026-000008');

    // PEL rules: our catalogue does not originate from the register, so a failed
    // match is a fact about our matching and may never read as absence.
    is('unmatched → verification required, never "not approved"',
      localListingStatus({ agrement_match_status: null }), 'verification_required');
    is('unmatched → no number is shown',
      localListingId({ agrement_match_status: null, agrement_number: '18-2026-000008' }), null);

    // Foreign registries stay foreign.
    is('a UK PEL status is ignored entirely',
      localListingStatus({ pel_match_status: 'confirmed', mcs_number: 'X' }), 'verification_required');
    is('a German listing status is ignored entirely',
      localListingStatus({ bafa_listing_status: 'listed_in_snapshot' }), 'verification_required');
    is('and no foreign id is shown', localListingId({ mcs_number: 'X' }), null);
  }

  if (country === 'PL') {
    is('source is Lista ZUM', LOCAL_LISTING_SOURCE, 'ZUM');
    is('the ZUM listing filter IS offered', LOCAL_LISTING_FILTER, true);

    is('confirmed → listed',
      localListingStatus({ zum_match_status: 'confirmed', zum_id: 'PW-123456' }), 'listed');
    is('confirmed → the ZUM id is shown',
      localListingId({ zum_match_status: 'confirmed', zum_id: 'PW-123456' }), 'PW-123456');

    is('verification_required → verification required',
      localListingStatus({ zum_match_status: 'verification_required' }), 'verification_required');
    is('verification_required → no id is shown',
      localListingId({ zum_match_status: 'verification_required', zum_id: 'PW-123456' }), null);

    is('review_required → verification required (never still "listed")',
      localListingStatus({ zum_match_status: 'review_required', zum_id: 'PW-123456' }), 'verification_required');
    is('review_required → the old ZUM id is NOT presented as a current listing',
      localListingId({ zum_match_status: 'review_required', zum_id: 'PW-123456' }), null);

    is('an unknown state fails safe to verification required',
      localListingStatus({ zum_match_status: 'something_new' }), 'verification_required');
    is('a missing state fails safe to verification required', localListingStatus({}), 'verification_required');
    is('PL can NEVER say "not listed" — absence of a match is not absence from the list',
      ['confirmed', 'verification_required', 'review_required', 'nonsense', undefined]
        .some(s => localListingStatus({ zum_match_status: s }) === 'not_listed'), false);
    is('a German listing status is ignored entirely',
      localListingStatus({ bafa_listing_status: 'listed_in_snapshot' }), 'verification_required');
    is('a UK PEL status is ignored entirely',
      localListingStatus({ pel_match_status: 'confirmed', mcs_number: 'X' }), 'verification_required');
    is('Poland shows no PEL id', localListingId({ zum_match_status: 'confirmed', zum_id: 'PW-1', mcs_number: 'X' }), 'PW-1');
  }

  if (country === 'IT') {
    is('source is the GSE Conto Termico catalogue', LOCAL_LISTING_SOURCE, 'GSE');
    is('no listing search filter is offered (422/7106 would be a discovery trap)', LOCAL_LISTING_FILTER, false);

    is('confirmed → listed',
      localListingStatus({ gse_match_status: 'confirmed', gse_entry_key: 'IIIA-abc123def456' }), 'listed');
    is('confirmed → but NO id is ever shown (the catalogue publishes no per-row id; our entry key is not an official id)',
      localListingId({ gse_match_status: 'confirmed', gse_entry_key: 'IIIA-abc123def456' }), null);

    is('verification_required → verification required',
      localListingStatus({ gse_match_status: 'verification_required' }), 'verification_required');
    is('review_required → verification required (never still "listed")',
      localListingStatus({ gse_match_status: 'review_required', gse_entry_key: 'IIIA-abc123def456' }), 'verification_required');

    is('an unknown state fails safe to verification required',
      localListingStatus({ gse_match_status: 'something_new' }), 'verification_required');
    is('a missing state fails safe to verification required', localListingStatus({}), 'verification_required');
    is('IT can NEVER say "not listed" — absence of a match is not absence from the catalogue',
      ['confirmed', 'verification_required', 'review_required', 'nonsense', undefined]
        .some(s => localListingStatus({ gse_match_status: s }) === 'not_listed'), false);
    is('a German listing status is ignored entirely',
      localListingStatus({ bafa_listing_status: 'listed_in_snapshot' }), 'verification_required');
    is('a UK PEL status is ignored entirely',
      localListingStatus({ pel_match_status: 'confirmed', mcs_number: 'X' }), 'verification_required');
    is('a Polish ZUM status is ignored entirely',
      localListingStatus({ zum_match_status: 'confirmed', zum_id: 'PW-1' }), 'verification_required');
  }
}

console.log(failed ? `\n✗ ${failed} assertion(s) failed\n` : '\n✓ all listing-state assertions passed\n');
process.exit(failed ? 1 : 0);
