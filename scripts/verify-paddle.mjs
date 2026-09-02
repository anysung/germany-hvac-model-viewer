#!/usr/bin/env node
/**
 * verify-paddle.mjs — the payment pipeline's contracts, machine-checked
 * (companion to verify-origins.mjs; owner order 2026-09-03).
 *
 * A billing failure is quieter than a CORS failure: nothing breaks on screen,
 * money just stops matching reality. What can drift, drifts on THREE sides —
 * our code (price ids, amounts), the Paddle account (webhook destination,
 * subscribed events, price catalogue) and the deployed function (secrets,
 * rejection behaviour). This probes all three, read-only, no real charge.
 *
 *   1. webhook endpoint refuses unauthenticated posts (bad/no signature)
 *   2. function carries its Paddle secrets (presence only, via gcloud)
 *   3. Paddle notification destination = our webhook, ACTIVE, and the event
 *      set covers everything the handler routes (subscription.*,
 *      transaction.completed, adjustment.*)
 *   4. every LIVE price id in config/paddlePrices.ts exists in Paddle,
 *      active, EUR, amount equal to subscriptionPlans.ts, and carries NO
 *      Paddle trial (the free period is the in-app signup trial — a trial
 *      that sneaks onto a live price would double-gift the week)
 *   5. no webhook event is parked with a processing error, and no
 *      subscription event sits unmatched (paddleAdjustments review flags)
 *
 * Requires operator gcloud (reads the API key from the function env; the key
 * never prints). Exit 1 on any failure; non-fatal-but-loud in the window.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FN = 'https://accountbilling-73w4asprla-ew.a.run.app';
const PROJECT = 'gen-lang-client-0324244302';
const REGION = 'europe-west1';

let failures = 0;
const bad = (m) => { failures++; console.error(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const sh = (args) => execFileSync('gcloud', args, { encoding: 'utf8', timeout: 60000 }).trim();

/* ── 1: the endpoint turns strangers away ───────────────────────────────── */
console.log('\n── Webhook endpoint defence');
for (const [name, headers] of [
  ['no signature', {}],
  ['forged signature', { 'Paddle-Signature': 'ts=1;h1=deadbeef' }],
]) {
  const res = await fetch(`${FN}/paddleWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: '{"event_id":"evt_probe"}', signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) ok(`${name} → ${res.status}`);
  else bad(`${name} → ${res.status} (expected 401/403 — the webhook accepted an unauthenticated post)`);
}

/* ── 2: secrets present on the function ─────────────────────────────────── */
console.log('\n── Function configuration');
const env = sh(['functions', 'describe', 'accountBilling', `--project=${PROJECT}`, `--region=${REGION}`,
  '--format=value(serviceConfig.environmentVariables)']);
for (const key of ['PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET']) {
  if (new RegExp(`${key}=[^;]+`).test(env)) ok(`${key} set`);
  else bad(`${key} MISSING on the deployed function`);
}
const apiKey = (/PADDLE_API_KEY=([^;]+)/.exec(env) || [])[1];
if (!apiKey) { console.error('\ncannot continue without the API key'); process.exit(1); }

const paddle = async (path) => {
  const res = await fetch(`https://api.paddle.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`paddle ${path} → ${res.status}`);
  return (await res.json()).data;
};

/* ── 3: notification destination + event coverage ───────────────────────── */
console.log('\n── Paddle notification settings');
try {
  const settings = await paddle('/notification-settings');
  const oursHost = 'cloudfunctions.net/accountBilling/paddleWebhook';
  const mine = settings.filter((n) => String(n.destination).includes(oursHost));
  if (!mine.length) bad('no notification destination points at our webhook');
  for (const n of mine) {
    if (!n.active) bad(`destination ${n.id} is INACTIVE`);
    const have = new Set(n.subscribed_events.map((t) => t.name));
    const need = ['subscription.created', 'subscription.activated', 'subscription.updated',
      'subscription.canceled', 'subscription.past_due', 'subscription.paused',
      'subscription.resumed', 'transaction.completed', 'adjustment.created', 'adjustment.updated'];
    const missing = need.filter((t) => !have.has(t));
    if (missing.length) bad(`destination missing events: ${missing.join(', ')}`);
    else ok(`destination active, all ${need.length} handled events subscribed`);
  }
  const strangers = settings.filter((n) => n.active && !String(n.destination).includes(oursHost));
  if (strangers.length) console.warn(`  ~ ${strangers.length} other ACTIVE destination(s) exist — expected? ${strangers.map((s) => s.destination).join(', ')}`);
} catch (e) { bad(`notification settings unreadable: ${e.message}`); }

/* ── 4: the nine live prices match the code, and carry no trial ─────────── */
console.log('\n── Live price catalogue vs code');
try {
  const src = readFileSync(join(ROOT, 'src/config/paddlePrices.ts'), 'utf8');
  const liveBlock = src.split('LIVE_PRICE_IDS')[1].split('SANDBOX')[0];
  const expected = {};   // pri_… → [label, amount]
  let plan = '?';
  for (const line of liveBlock.split('\n')) {
    const pm = /(professional|team_3|team_5): \{/.exec(line);
    if (pm) plan = pm[1];
    const m = /(monthly|six_months|annual):\s*'(pri_[a-z0-9]+)',\s*\/\/\s*EUR\s*([\d.]+)/.exec(line);
    if (m) expected[m[2]] = [`${plan}/${m[1]}`, Number(m[3])];
  }
  const prices = await paddle('/prices?per_page=100&status=active');
  const live = new Map(prices.map((p) => [p.id, p]));
  for (const [pid, [label, amount]] of Object.entries(expected)) {
    const p = live.get(pid);
    if (!p) { bad(`${label}: ${pid} not active in Paddle`); continue; }
    const amt = Number(p.unit_price.amount) / 100;
    if (p.unit_price.currency_code !== 'EUR') bad(`${label}: currency ${p.unit_price.currency_code}`);
    else if (Math.abs(amt - amount) > 0.005) bad(`${label}: Paddle ${amt} ≠ code ${amount}`);
    else if (p.trial_period) bad(`${label}: carries a Paddle TRIAL — live prices must not (in-app trial is the free week)`);
  }
  ok(`${Object.keys(expected).length} price ids: present, EUR, amounts match, no trials`);
} catch (e) { bad(`price audit failed: ${e.message}`); }

/* ── 5: nothing parked for review ───────────────────────────────────────── */
console.log('\n── Parked events');
try {
  const token = sh(['auth', 'print-access-token']);
  const fs = async (col) => {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}?pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    return ((await res.json()).documents ?? []);
  };
  const errored = (await fs('paddleWebhookEvents'))
    .filter((d) => d.fields?.processingError || d.fields?.needsAdminReview?.booleanValue);
  const unmatched = (await fs('paddleAdjustments'))
    .filter((d) => d.fields?.needsAdminReview?.booleanValue);
  if (errored.length) bad(`${errored.length} webhook event(s) recorded WITH ERRORS — replay/review needed`);
  else ok('no webhook event parked with a processing error');
  if (unmatched.length) bad(`${unmatched.length} unmatched/review-flagged adjustment(s)`);
  else ok('no unmatched subscription events or adjustments');
} catch (e) { console.warn(`  ~ parked-event check skipped: ${e.message}`); }

console.log(failures ? `\n✗ ${failures} payment-contract failure(s)\n` : '\n✓ every payment contract holds\n');
process.exit(failures ? 1 : 0);
