/**
 * Verification mail — the invariants that make a branded confirmation safe.
 *
 * Run: node tests/verification-mail.unit.mjs
 *
 * We send the signup confirmation ourselves (billing function, our letterhead)
 * instead of letting Firebase send its default, whose subject carries the raw
 * project id. That buys branding and costs two risks, and this file is what
 * stops either one from coming back:
 *
 *   1. AN OPEN REDIRECT. A verification link is the one URL a reader clicks
 *      without looking at it. The return address must come from the caller's
 *      already-allowlisted Origin, NEVER from the request body.
 *   2. A SIGNUP THAT CANNOT COMPLETE. If our SMTP is down, an unbranded mail
 *      is enormously better than no mail, so every caller must still fall back
 *      to Firebase's own send.
 *
 * Plus the copy contract: five languages, each with a button, a copy-and-paste
 * fallback, and the link in the plain-text part.
 */
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : `  — ${detail}`}`);
};

const fn = readFileSync(new URL('../google_cloud_function_billing/index.js', import.meta.url), 'utf8');
const authSvc = readFileSync(new URL('../src/services/authService.ts', import.meta.url), 'utf8');
const billingSvc = readFileSync(new URL('../src/services/billingFnService.ts', import.meta.url), 'utf8');

/** The endpoint body, from its declaration to the next top-level one. */
const endpoint = (() => {
  const i = fn.indexOf('async function sendVerificationEmail(req, res) {');
  ok('the endpoint exists', i > 0);
  const j = fn.indexOf('\n}\n', i);
  return fn.slice(i, j);
})();

console.log('\nReturn address — the open-redirect guard');
ok('the return URL is built from req.headers.origin',
  /const origin = String\(req\.headers\.origin/.test(endpoint));
ok('and only when that origin is already allowlisted',
  /ALLOWED_ORIGINS\.includes\(origin\)/.test(endpoint));
ok('an unknown origin falls back to the member\'s own market site',
  /MARKET_SITE\[country\]/.test(endpoint));
ok('the endpoint never reads a url/continueUrl/returnUrl from the body',
  !/\b(?:body|req\.body)[^\n]*\b(url|continueUrl|returnUrl|redirect)/i.test(endpoint),
  'a client-supplied return address would be an open redirect');
ok('the client does not send one either',
  !/sendVerificationEmail['"],\s*\{[^}]*url/.test(billingSvc));
ok('only the language crosses the wire',
  /call\('sendVerificationEmail', \{ lang \}\)/.test(billingSvc));

console.log('\nDelivery — a failure must never block a signup');
ok('the client has a single delivery helper', authSvc.includes('const deliverVerificationEmail = async'));
const deliver = authSvc.slice(
  authSvc.indexOf('const deliverVerificationEmail = async'),
  authSvc.indexOf('\n};', authSvc.indexOf('const deliverVerificationEmail = async')));
ok('it tries our branded mail first', deliver.includes('sendVerificationEmailFn(lang)'));
ok('and falls back to Firebase on any failure', deliver.includes('sendEmailVerification(fbUser, verificationReturn())'));
ok('except on 429, where a mail has just gone out', /endsWith\('-429'\)/.test(deliver));
ok('registration uses the helper, not the raw Firebase call',
  /await deliverVerificationEmail\(userCredential\.user, lang\)/.test(authSvc));
ok('so does the resend button',
  /await deliverVerificationEmail\(fbUser, lang\)/.test(authSvc));
ok('nothing else in authService sends verification directly',
  (authSvc.match(/sendEmailVerification\(/g) || []).length === 1,
  'every send must go through deliverVerificationEmail');

console.log('\nSend gate — a resend button must not become a campaign');
ok('the endpoint refuses a second send within the gap', /VERIFY_MIN_GAP_MS/.test(endpoint));
ok('and caps the day', /VERIFY_DAY_MAX/.test(endpoint));
ok('a failed send hands the slot back', (endpoint.match(/releaseSlot\(\)/g) || []).length >= 3,
  'otherwise an SMTP blip costs the member the full gap');
ok('an already-verified address is a no-op, not a send',
  /authUser\.emailVerified\) return res\.status\(200\)/.test(endpoint));

console.log('\nCopy — five markets, one contract');
const copyBlock = fn.slice(fn.indexOf('const VERIFY_COPY = {'), fn.indexOf('const VERIFY_MIN_GAP_MS'));
for (const lang of ['en', 'de', 'fr', 'pl', 'it']) {
  const i = copyBlock.indexOf(`\n  ${lang}: {`);
  const body = copyBlock.slice(i, copyBlock.indexOf('\n  },', i));
  ok(`${lang}: has a subject, a button label and a body`,
    /subject:/.test(body) && /cta:/.test(body) && /body: \(link\)/.test(body));
  ok(`${lang}: places the button with the {{CTA}} marker`, body.includes('{{CTA}}'),
    'without it the button lands under the "you did not request this" line');
  ok(`${lang}: the raw link is in the text too`, body.includes('${link}'),
    'a client that strips the button still has to offer copy-and-paste');
  ok(`${lang}: the subject names us, never the Firebase project`,
    /subject: '[^']*HeatPump DB'/.test(body) && !/gen-lang-client/.test(body));
}

console.log('\nLetterhead');
ok('the marker never reaches the reader — the plain part strips it',
  /plainBody\(text\) \+ TEXT_SIGNATURE/.test(fn));
ok('the button href is escaped like every other attribute', /href="\$\{esc\(url\)\}"/.test(fn));
ok('brand images travel as CID attachments, not remote URLs',
  fn.includes("cid: 'hpdb-logo'") && fn.includes('src="cid:hpdb-logo"'));
ok('a URL-only paragraph is set small — it is the fallback, not the message',
  /const small = \/\^https\?/.test(fn));

console.log(failed ? `\n✗ ${failed} failed\n` : '\n✓ all verification-mail assertions passed\n');
process.exit(failed ? 1 : 0);
