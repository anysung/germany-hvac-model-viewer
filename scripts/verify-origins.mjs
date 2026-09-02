#!/usr/bin/env node
/**
 * verify-origins.mjs — the whole customer journey, as one machine-checked
 * matrix (owner order after the 2026-09-01 incident: "this must never happen
 * again").
 *
 * THE FAILURE CLASS THIS CATCHES
 * France's first SSO signup sat pending for five hours while the function
 * logs showed nothing but 204s: the custom domain was missing from ONE of the
 * four per-origin allowlists, the browser blocked every real call, and no
 * error was logged anywhere — a silent, per-origin failure. Config like that
 * drifts; only a matrix probe notices.
 *
 * WHAT IS VERIFIED, per market origin (custom apex + www + web.app):
 *   1. the site answers (HTTP 200)
 *   2. the deployed bundle carries its runtime contracts: the billing
 *      function URL (without it the build silently runs the LEGACY approval
 *      flow), the Paddle token + price ids, the reCAPTCHA site key
 *   3. the billing function grants CORS to the origin on the endpoints the
 *      journey depends on (finalizeSignup, sendVerificationEmail,
 *      sessionHeartbeat)
 *   4. the datasets bucket CORS list contains the origin (operator gcloud;
 *      skipped without credentials)
 *   5. Firebase Auth authorized domains contain the host (skipped without
 *      credentials)
 *   6. the reCAPTCHA key's domain list contains the host (skipped without
 *      credentials)
 *
 * Exit 1 on any failure — in the monthly window it runs non-fatal but PRINTS
 * LOUDLY; standalone it is the pre-flight for any domain/market work.
 *
 * Usage: node scripts/verify-origins.mjs [--skip-gcloud]
 */
import { execFileSync } from 'node:child_process';

const BILLING = 'https://accountbilling-73w4asprla-ew.a.run.app';
const BILLING_ENDPOINTS = ['finalizeSignup', 'sendVerificationEmail', 'sessionHeartbeat'];
const PROJECT = 'gen-lang-client-0324244302';
const SKIP_GCLOUD = process.argv.includes('--skip-gcloud');

/** Every origin a signed-in customer can be standing on. */
const MARKETS = [
  { cc: 'DE', origins: ['https://heatpumpdb.de', 'https://www.heatpumpdb.de', 'https://gen-lang-client-0324244302.web.app'] },
  { cc: 'GB', origins: ['https://heatpumpdb.uk', 'https://www.heatpumpdb.uk', 'https://heatpumpdb-uk.web.app'] },
  { cc: 'FR', origins: ['https://heatpumpdb.fr', 'https://www.heatpumpdb.fr', 'https://heatpumpdb-fr.web.app'] },
  { cc: 'PL', origins: ['https://heatpumpdb.pl', 'https://www.heatpumpdb.pl', 'https://heatpumpdb-pl.web.app'] },
  { cc: 'IT', origins: ['https://heatpumpdb.it', 'https://www.heatpumpdb.it', 'https://heatpumpdb-it.web.app'] },
];
/** The site each market actually serves the app from (bundle probe target). */
const PRIMARY = { DE: 'https://www.heatpumpdb.de', GB: 'https://www.heatpumpdb.uk', FR: 'https://www.heatpumpdb.fr', PL: 'https://www.heatpumpdb.pl', IT: 'https://www.heatpumpdb.it' };

let failures = 0;
const bad = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const get = (url, timeoutMs = 20000) =>
  fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'HeatPumpDB-origin-verify/1.0' } });

/* ── 1+2: site answers, bundle carries its contracts ────────────────────── */
console.log('\n── Site + deployed bundle contracts');
for (const { cc } of MARKETS) {
  const site = PRIMARY[cc];
  try {
    const res = await get(`${site}/`);
    if (!res.ok) { bad(`[${cc}] ${site} → HTTP ${res.status}`); continue; }
    const html = await res.text();
    const m = /src="(\/assets\/index-[^"]+\.js)"/.exec(html);
    if (!m) { bad(`[${cc}] no index bundle reference on ${site}`); continue; }
    const js = await (await get(site + m[1], 40000)).text();
    const checks = [
      ['billing function URL', js.includes('cloudfunctions.net/accountBilling') || js.includes('accountbilling-')],
      ['Paddle client token', /(?:live|test)_[a-z0-9]{15,}/.test(js)],
      ['Paddle price ids', /pri_[a-z0-9]{15,}/.test(js)],
      ['reCAPTCHA site key', js.includes('6LfzFE8t')],
    ];
    const missing = checks.filter(([, present]) => !present).map(([name]) => name);
    if (missing.length) bad(`[${cc}] bundle on ${site} MISSING: ${missing.join(', ')} — a build without the billing URL silently runs the legacy flow`);
    else ok(`[${cc}] ${site} — 200, bundle carries billing/Paddle/reCAPTCHA`);
  } catch (e) { bad(`[${cc}] ${site} unreachable: ${e.message}`); }
}

/* ── 3: billing CORS × every origin × journey endpoints ─────────────────── */
console.log('\n── Billing function CORS (the 2026-09-01 gap)');
for (const { cc, origins } of MARKETS) {
  for (const origin of origins) {
    for (const ep of BILLING_ENDPOINTS) {
      try {
        const res = await fetch(`${BILLING}/${ep}`, {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
          signal: AbortSignal.timeout(15000),
        });
        const allow = res.headers.get('access-control-allow-origin');
        if (allow !== origin) bad(`[${cc}] ${origin} → /${ep}: preflight grants "${allow ?? 'nothing'}" — the browser will block every call from this origin`);
      } catch (e) { bad(`[${cc}] ${origin} → /${ep}: ${e.message}`); }
    }
  }
  ok(`[${cc}] ${origins.length} origins × ${BILLING_ENDPOINTS.length} endpoints preflighted`);
}

/* ── 4–6: allowlists that need operator credentials ─────────────────────── */
if (!SKIP_GCLOUD) {
  console.log('\n── Credentialed allowlists (bucket CORS, Auth domains, reCAPTCHA)');
  const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
  try {
    const cors = sh('gcloud', ['storage', 'buckets', 'describe', 'gs://heatpumpdb-datasets', '--format=json(cors_config)']);
    const listed = JSON.parse(cors).cors_config?.[0]?.origin ?? [];
    for (const { cc, origins } of MARKETS) {
      const missing = origins.filter((o) => !listed.includes(o));
      if (missing.length) bad(`[${cc}] datasets bucket CORS missing: ${missing.join(', ')} — the catalogue will not load from there`);
    }
    ok('datasets bucket CORS covers every origin');
  } catch (e) { console.warn(`  ~ bucket CORS check skipped: ${e.message.split('\n')[0]}`); }

  try {
    const token = sh('gcloud', ['auth', 'print-access-token']).trim();
    const res = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`, {
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT }, signal: AbortSignal.timeout(20000),
    });
    const domains = (await res.json()).authorizedDomains ?? [];
    for (const { cc, origins } of MARKETS) {
      const missing = origins.map((o) => new URL(o).host).filter((h) => !domains.includes(h));
      if (missing.length) bad(`[${cc}] Auth authorized domains missing: ${missing.join(', ')} — social sign-in fails there (auth/unauthorized-domain)`);
    }
    ok('Firebase Auth authorized domains cover every host');
  } catch (e) { console.warn(`  ~ Auth domain check skipped: ${e.message.split('\n')[0]}`); }

  try {
    const keys = sh('gcloud', ['recaptcha', 'keys', 'list', `--project=${PROJECT}`, '--format=value(name)']).trim().split('\n');
    const desc = sh('gcloud', ['recaptcha', 'keys', 'describe', keys[0], `--project=${PROJECT}`, '--format=value(webSettings.allowedDomains)']);
    const listed = desc.trim().split(';').map((s) => s.trim());
    for (const { cc, origins } of MARKETS) {
      const missing = origins.map((o) => new URL(o).host).filter((h) => !listed.includes(h));
      if (missing.length) bad(`[${cc}] reCAPTCHA key domains missing: ${missing.join(', ')} (App Check is MONITORING-only, so this degrades telemetry, not access)`);
    }
    ok('reCAPTCHA key domains cover every host');
  } catch (e) { console.warn(`  ~ reCAPTCHA check skipped: ${e.message.split('\n')[0]}`); }
}

console.log(failures ? `\n✗ ${failures} origin-contract failure(s) — a customer somewhere is silently blocked\n` : '\n✓ every origin contract holds\n');
process.exit(failures ? 1 : 0);
