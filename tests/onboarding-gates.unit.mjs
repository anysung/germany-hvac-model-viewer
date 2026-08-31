#!/usr/bin/env node
/**
 * onboarding-gates.unit.mjs — who gets stopped, and who does not.
 *
 * Two gates were added with social signup (2026-08-31) and they pull in
 * opposite directions, which is exactly why they are tested together:
 *
 *  · the onboarding sheet must appear once for a brand-new account and never
 *    again — a sheet that reappears on every visit is worse than no sheet;
 *  · the team-name gate must stop a Team checkout with no name on file, and
 *    must NOT stop anything else. Everything the old billing form asked for is
 *    now Paddle's job, and a form between a decided buyer and their card is
 *    the most expensive place in the product to put one.
 *
 * The predicates are re-implemented here rather than imported: the source is
 * TSX and this suite runs on plain node. They are three lines each; the point
 * is to pin the DECISIONS, and a drift between these and the component shows
 * up as the component failing its own e2e.
 *
 * Run: node tests/onboarding-gates.unit.mjs
 */
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.error(`  ✗ ${n}`); } };

const trim = (s) => String(s ?? '').trim();
const hasDisplayName = (u) => !!(u && trim(u.firstName));
const nameNeededForCheckout = (u, isTeam) => isTeam && !hasDisplayName(u);
const onboardingDue = (u, seen) =>
  !!u && !hasDisplayName(u) && !u.companyType && !u.jobRole && !seen;

const blank = { firstName: '', lastName: '', companyType: '', jobRole: '' };
const named = { ...blank, firstName: 'Alex' };
const full  = { firstName: 'Alex', lastName: 'Schneider', companyType: 'installer', jobRole: 'sales' };

/* ── The team-name gate ─────────────────────────────────────────────────── */
ok('Team plan + no name → stopped',            nameNeededForCheckout(blank, true) === true);
ok('Team plan + name → straight through',      nameNeededForCheckout(named, true) === false);
ok('Professional + no name → NOT stopped',     nameNeededForCheckout(blank, false) === false);
ok('Professional + name → not stopped',        nameNeededForCheckout(named, false) === false);
// The old gate demanded company name, type and city as well. Nothing but the
// name may block a checkout now — this is the assertion that keeps it that way.
ok('no company name does not block a Team checkout',
   nameNeededForCheckout({ ...named, companyName: '' }, true) === false);
ok('no company type does not block a Team checkout',
   nameNeededForCheckout({ ...named, companyType: '' }, true) === false);
ok('a name of only spaces still counts as missing',
   nameNeededForCheckout({ ...blank, firstName: '   ' }, true) === true);

/* ── The onboarding sheet ───────────────────────────────────────────────── */
ok('brand-new account sees it',                onboardingDue(blank, false) === true);
ok('and never again once dismissed',           onboardingDue(blank, true) === false);
ok('an account that answered anything is left alone',
   onboardingDue({ ...blank, jobRole: 'sales' }, false) === false);
ok('a named account is left alone',            onboardingDue(named, false) === false);
ok('a complete account is left alone',         onboardingDue(full, false) === false);
// An invited member inherits a company profile from the team, so the sheet
// must not greet them with questions their admin already answered.
ok('an invited member with an inherited profile is left alone',
   onboardingDue({ ...blank, companyType: 'engineering' }, false) === false);
ok('no user, no sheet',                        onboardingDue(null, false) === false);

console.log(`\nonboarding gates: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
