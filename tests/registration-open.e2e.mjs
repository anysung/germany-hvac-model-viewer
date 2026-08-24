/**
 * Registration OPEN — UI tests (Playwright, against the dev server).
 *
 * Successor to registration-pause.e2e.mjs (retired 2026-08-06 when the pause
 * ended — launch day). Registration is now permanently open, so the contract
 * this file defends is the inverse of its predecessor's, plus everything the
 * pause test guarded that is still true. Per country edition:
 *
 *   1. the Sign Up entry is visible on the landing page;
 *   2. choosing it renders the REGISTRATION FORM — not the maintenance notice
 *      (if the notice ever reappears in production, the flag regressed);
 *   3. the form carries the company-email advice (the email is immutable by
 *      design — saying so up front is what prevents the support tickets);
 *   4. the login screen still offers Google/Apple labelled as LOGIN-ONLY —
 *      social must never read as a signup route (owner policy 2026-08-04);
 *   5. an existing approved member can still sign in and reach the app.
 *
 * Usage: node tests/registration-open.e2e.mjs <DE|GB|FR|PL|IT> <port>
 *   (the caller starts the dev server — see tests/run-registration-e2e.sh)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const COUNTRY = (process.argv[2] || 'DE').toUpperCase();
const PORT = process.argv[3] || '5199';
const BASE = `http://localhost:${PORT}/`;
const SCRATCH = process.env.HPDB_TEST_SECRETS || '.';

const EXISTING_USER = 'e2e-verify@heatpumpdb.de';
const EXISTING_PASS = readFileSync(`${SCRATCH}/e2e-pw.txt`, 'utf8').trim();
const APPCHECK_DEBUG = readFileSync(`${SCRATCH}/appcheck-debug-token.txt`, 'utf8').trim();

const SIGNUP_BTN = /Sign Up|Registrieren|Créer un compte|Zarejestruj się|Registrati/i;
const LOGIN_BTN = /Log In|Anmelden|Se connecter|Zaloguj się|Accedi/i;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.addInitScript(t => { window.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, APPCHECK_DEBUG);

console.log(`\nRegistration open — ${COUNTRY} edition (${BASE})\n`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

// ── 1. Sign Up entry on the landing page ─────────────────────────────────
check(
  'Sign Up entry is visible on the landing page',
  await page.getByRole('button', { name: SIGNUP_BTN }).first().isVisible(),
);

// ── 2+3. It opens the FORM (not the pause notice), with the email advice ──
await page.getByRole('button', { name: SIGNUP_BTN }).first().click();
await page.waitForTimeout(900);

check(
  'the registration form renders',
  await page.locator('[data-testid="signup-form"]').isVisible(),
);
check(
  'the maintenance notice is NOT shown (flag would have regressed)',
  (await page.locator('[data-testid="registration-paused"]').count()) === 0,
);
check(
  'the form asks for an email and a password',
  (await page.locator('[data-testid="su-email"]').count()) === 1 &&
  (await page.locator('[data-testid="su-password"]').count()) === 1,
);
/* The form was cut to two fields on 2026-08-24 and the fields that left must
   STAY gone: each one is a step between a visitor and a product they have not
   seen, and they creep back one "just this one" at a time. Name and company are
   asked at the point of subscribing instead (BillingProfileForm). */
check(
  'it asks for nothing else — name and company are collected at checkout',
  (await page.locator('[data-testid="su-first"]').count()) === 0 &&
  (await page.locator('[data-testid="su-last"]').count()) === 0 &&
  (await page.locator('[data-testid="su-company-name"]').count()) === 0 &&
  (await page.locator('[data-testid="su-company-type"]').count()) === 0 &&
  (await page.locator('[data-testid="su-email-confirm"]').count()) === 0,
);
/* Naming a price before anyone has seen a data sheet raises "what will this
   cost me" at the moment we are asking for trust (owner decision 2026-08-24). */
check(
  'the submit button does not mention a plan or a price',
  !/plan|tarif|formule|piano|abbonamento|preis|price|prezzo|cena|forfait/i.test(
    (await page.locator('[data-testid="su-submit"]').innerText()).trim()),
);
check(
  'the company-email advice is shown under the email field',
  await page.locator('[data-testid="su-email-advice"]').isVisible(),
);

// ── 4. Social is offered as a LOGIN method only ──────────────────────────
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: LOGIN_BTN }).first().click();
await page.waitForTimeout(800);
{
  const google = page.getByRole('button', { name: /Google/i }).first();
  check('login screen offers Google sign-in', await google.isVisible());
  const body = await page.locator('body').innerText();
  check(
    'social buttons are labelled as login-only (not a signup route)',
    /Connect Google|vorher auf der Konto-Seite|Associez Google|połącz Google|Collega Google/i.test(body),
    body.slice(0, 200),
  );
}

// ── 5. Existing approved member can still sign in ────────────────────────
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: LOGIN_BTN }).first().click();
await page.waitForTimeout(800);
await page.locator('input[type="email"]').fill(EXISTING_USER);
await page.locator('input[type="password"]').fill(EXISTING_PASS);
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(12000);

const signedIn =
  (await page.locator('[class*="hp-gnav"]').count()) > 0 ||
  (await page.getByText(/Products|Produkte|Produits/i).first().isVisible().catch(() => false));
check('existing approved user can still log in normally', signedIn);

await browser.close();
console.log(`\n${COUNTRY}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
