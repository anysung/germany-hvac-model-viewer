/**
 * signup-paths.contract.mjs — every door that creates an account obeys the
 * same three rules.
 *
 * There are now TWO doors: email/password, and Google/Apple (owner, 2026-08-31,
 * reversing the 2026-08-04 login-only rule — the funnel it protected produced
 * one registration). Opening the second door re-created exactly the hazard the
 * old rule was written against: before 2026-08-04 the REGISTRATION_OPEN flag
 * gated the signup VIEW while the social buttons quietly created and activated
 * accounts behind it, so the pause was three clicks from being bypassed.
 *
 * So the guarantee is no longer "one door". It is: whatever door you come
 * through, the kill switch closes it, consent is taken BEFORE the account
 * exists, and no account is created without an email to key it on. A browser
 * test cannot drive a real OAuth popup, so this is asserted against the source.
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

console.log('\nEvery door that creates an account obeys the same rules\n');

/* ── The social path creates accounts, under the same three rules ────────── */
const socialFn = auth.slice(auth.indexOf('const finishProviderSignIn'));
const unknownBranch = socialFn.slice(
  socialFn.indexOf('if (!userDoc.exists())'),
  socialFn.indexOf('let userData'),
);
check('social sign-in has a "no profile" branch',
  unknownBranch.length > 0 && unknownBranch.includes('!userDoc.exists()'));

// 1. The kill switch. Checked in the SERVICE, not only the view: a flag that
//    only hides a form leaves the second door wide open.
check('the social path refuses to create while registration is closed',
  /if \(!REGISTRATION_OPEN\)[\s\S]{0,240}throw new Error\('registration-closed'\)/.test(unknownBranch));
check('that refusal signs the session back out (no orphan session)',
  /registration-closed[\s\S]{0,80}/.test(unknownBranch)
  && /await signOut\(auth\);\n      throw new Error\('registration-closed'\)/.test(unknownBranch));
check('REGISTRATION_OPEN is imported by the auth service, not just the view',
  /import \{ REGISTRATION_OPEN \} from '\.\.\/config\/registration'/.test(auth));

// 2. Consent before existence. An account must not be written and then asked.
const consentIdx = unknownBranch.indexOf('confirmTerms');
const writeIdx = unknownBranch.indexOf('setDoc(userDocRef, created)');
check('consent is requested before the profile is written',
  consentIdx > -1 && writeIdx > -1 && consentIdx < writeIdx);
check('declining consent aborts and signs out',
  /catch \{ await signOut\(auth\); throw new Error\('terms-declined'\)/.test(unknownBranch));
check('the created profile carries the consent stamp',
  /\.\.\.consentFields\(\)/.test(unknownBranch));

// 3. No email, no account. The address is the account key.
check('a provider that withholds the email cannot create an account',
  /if \(!email\)[\s\S]{0,200}throw new Error\('no-email-from-provider'\)/.test(unknownBranch));

// Apple hands over the display name once, on first authorisation only.
check('the display name is captured at first authorisation',
  /fbUser\.displayName/.test(unknownBranch));
// The account is created pending and activated by the server, exactly like email.
check('the social account is created pending, not active',
  /status: 'pending'/.test(unknownBranch) && /isActive: false/.test(unknownBranch));
check('activation goes through the server finalize, not the client',
  /tryFinalizeSignup/.test(unknownBranch));
check('the arrival channel is recorded from the link, not asked',
  /signupRef: pendingSignupRef\(\)/.test(unknownBranch));

/* ── Both social entry points share that path ────────────────────────────── */
check('the popup flow ends in finishProviderSignIn',
  /return finishProviderSignIn\(cred\.user/.test(auth));
check('the Safari redirect flow ends in the same place',
  /completeRedirectSignIn[\s\S]{0,600}finishProviderSignIn\(cred\.user/.test(auth));
check('both callers surface a closed registration',
  (app.match(/'registration-closed'/g) ?? []).length >= 2);
check('both callers surface a missing provider email',
  (app.match(/'no-email-from-provider'/g) ?? []).length >= 2);

/* ── Registration pause now covers every route ───────────────────────────── */
check('REGISTRATION_OPEN gates the signup view',
  /currentView === 'SIGNUP' && !REGISTRATION_OPEN/.test(app));
check('the email door still exists',
  /registerUser|createUserWithEmailAndPassword/.test(auth));

/* ── The signup screen offers both doors ─────────────────────────────────── */
check('the signup view offers the providers',
  /data-testid="signup-providers"/.test(app));
check('the login screen no longer claims social is login-only',
  !/socialLoginOnly/.test(app));
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
