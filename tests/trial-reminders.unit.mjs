/**
 * Trial reminder rules — who gets mailed, and who must never be.
 *
 * The asymmetry is the point. A missed reminder costs a sale; a reminder sent to
 * a suspended account sends a cheerful note about someone's trial to a person we
 * closed an hour earlier, and that cannot be taken back. So the suspended,
 * disabled and deletion-requested cases are asserted individually rather than
 * as one "inactive" case.
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { trialStageFor, skipReminder, DAY } =
  require(resolve(root, 'google_cloud_function_billing/trialReminderRules.js'));

let passed = 0, failed = 0;
const is = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}  — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
};

const NOW = Date.parse('2026-08-24T12:00:00Z');
const endsIn = (ms) => ({ trialEndsAt: new Date(NOW + ms).toISOString() });
const active = { status: 'active', email: 'a@b.com' };

console.log('\nTrial reminder — stage selection\n');
is('no trial window → never mailed', trialStageFor({}, NOW), null);
is('3 days left → too early to say anything', trialStageFor(endsIn(3 * DAY), NOW), null);
is('exactly 2 days left → two_days_left', trialStageFor(endsIn(2 * DAY - 1000), NOW), 'two_days_left');
is('36 hours left → two_days_left', trialStageFor(endsIn(1.5 * DAY), NOW), 'two_days_left');
is('12 hours left → last_day', trialStageFor(endsIn(0.5 * DAY), NOW), 'last_day');
is('1 minute left → last_day', trialStageFor(endsIn(60000), NOW), 'last_day');
is('just expired → expired', trialStageFor(endsIn(-1000), NOW), 'expired');
is('expired 6 days ago → expired', trialStageFor(endsIn(-6 * DAY), NOW), 'expired');
is('expired 8 days ago → left alone', trialStageFor(endsIn(-8 * DAY), NOW), null);

console.log('\nTrial reminder — who must not be mailed\n');
is('an active trialling account is mailable', skipReminder({ ...active }), null);
is('SUSPENDED is never mailed', skipReminder({ ...active, status: 'suspended' }), 'not-active');
is('DISABLED is never mailed', skipReminder({ ...active, status: 'disabled' }), 'not-active');
is('REJECTED is never mailed', skipReminder({ ...active, status: 'rejected' }), 'not-active');
is('PENDING is never mailed', skipReminder({ ...active, status: 'pending' }), 'not-active');
is('deletion_requested is never mailed', skipReminder({ ...active, status: 'deletion_requested' }), 'not-active');
is('a legacy account with isActive only is mailable',
  skipReminder({ email: 'a@b.com', isActive: true }), null);
is('a legacy account with isActive false is not', skipReminder({ email: 'a@b.com', isActive: false }), 'not-active');
is('no email address → nothing to send to', skipReminder({ status: 'active' }), 'no-email');
is('a team MEMBER is not asked to buy', skipReminder({ ...active, orgRole: 'member' }), 'team-member');
is('a team OWNER is asked', skipReminder({ ...active, orgRole: 'owner' }), null);
is('a live free-access grant is not upsold', skipReminder({ ...active, grant: { plan: 'professional' } }), 'has-grant');
is('a REVOKED grant does not protect from the reminder',
  skipReminder({ ...active, grant: { plan: 'professional', revokedAt: '2026-08-01' } }), null);
for (const st of ['active', 'trialing', 'past_due', 'paused']) {
  is(`a subscription in '${st}' is never upsold`, skipReminder({ ...active, subscription: { status: st } }), 'subscribed');
}
is('a CANCELED subscription may be reminded again',
  skipReminder({ ...active, subscription: { status: 'canceled' } }), null);
is('a Paddle customer is not upsold', skipReminder({ ...active, billingChannel: 'paddle' }), 'paddle-customer');

console.log(failed ? `\n✗ ${failed} assertion(s) failed\n` : `\n✓ all trial-reminder assertions passed (${passed})\n`);
process.exit(failed ? 1 : 0);
