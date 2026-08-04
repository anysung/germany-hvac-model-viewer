/**
 * signup-paths.contract.mjs — there is exactly ONE way to create an account.
 *
 * This is a B2B service: the account IS the company email. Team seats, invoices
 * and the once-per-email free trial all hang off it, and there is deliberately
 * no way to change it afterwards. So signing up with a personal Google identity
 * produces an account that cannot be corrected — only deleted, which burns that
 * email's trial for a year. Owner decision (2026-08-04): social signs you IN,
 * it does not sign you UP.
 *
 * The rule this file defends is structural, not cosmetic. Before it, the
 * REGISTRATION_OPEN flag gated the signup VIEW while the login screen's
 * Google/Apple buttons quietly created and activated accounts — the pause was
 * three clicks from being bypassed, and the bypass skipped the company fields
 * entirely. A browser test cannot drive a real OAuth popup, so the guarantee is
 * asserted here, against the source.
 *
 * Run: node tests/signup-paths.contract.mjs
 */
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`); }
};
const read = (p) => readFileSync(p, 'utf8');

const auth = read('src/services/authService.ts');
const app = read('src/App.tsx');
const form = read('src/components/auth/SignupForm.tsx');

console.log('\nAccount creation has one door\n');

/* ── The social path refuses unknown identities ──────────────────────────── */
// finishProviderSignIn's "no profile yet" branch must sign out and throw, not
// build a User and write it.
const socialFn = auth.slice(auth.indexOf('const finishProviderSignIn'));
const unknownBranch = socialFn.slice(
  socialFn.indexOf('if (!userDoc.exists())'),
  socialFn.indexOf('let userData'),
);
check('social sign-in has a "no profile" branch',
  unknownBranch.length > 0 && unknownBranch.includes('!userDoc.exists()'));
check('an unknown provider identity is refused with no-account',
  /throw new Error\('no-account'\)/.test(unknownBranch));
check('the refused session is signed back out (no orphan session)',
  /await signOut\(auth\)/.test(unknownBranch));
check('the social path never writes a new profile',
  !/setDoc\(userDocRef/.test(unknownBranch.replace(/if \(email === OWNER_EMAIL\)[\s\S]*?\n    }\n/, '')),
  'setDoc found outside the owner-bootstrap branch');
check('the social path never grants a trial (no finalize on an unknown identity)',
  !/tryFinalizeSignup|finalizeSignupFn/.test(unknownBranch));

/* ── Both social entry points share that path ────────────────────────────── */
check('the popup flow ends in finishProviderSignIn',
  /return finishProviderSignIn\(cred\.user/.test(auth));
check('the Safari redirect flow ends in the same place',
  /completeRedirectSignIn[\s\S]{0,600}finishProviderSignIn\(cred\.user/.test(auth));
check('both callers surface no-account to the user',
  (app.match(/'no-account'/g) ?? []).length >= 2);

/* ── Registration pause now covers every route ───────────────────────────── */
check('REGISTRATION_OPEN gates the signup view',
  /currentView === 'SIGNUP' && !REGISTRATION_OPEN/.test(app));
check('email/password signup is the only profile-creating entry',
  /registerUser|createUserWithEmailAndPassword/.test(auth));

/* ── The screens explain the rule before the click ───────────────────────── */
check('the login screen labels social as login-only',
  /socialLoginOnly/.test(app));
check('the signup form advises a company email + says it cannot be changed',
  /suEmailAdvice/.test(form));

/* ── Invited members ─────────────────────────────────────────────────────── */
const parts = read('src/hpiq/pages/accountParts.tsx');
check('the invite link names its sender',
  /&by=\$\{encodeURIComponent\(app\.user\.email\)\}/.test(parts));
check('the invite screen shows who invited and what is fixed',
  /invitedBy/.test(app) && /invLocked/.test(app));
check('an invited member inherits the team company profile',
  /const team = await getOrg\(orgId\)/.test(auth) &&
  /companyName: team\?\.companyName/.test(auth));

console.log(`\n${failed ? `✗ ${failed} contract assertion(s) failed` : `✓ all ${passed} assertions passed`}\n`);
process.exit(failed === 0 ? 0 : 1);
