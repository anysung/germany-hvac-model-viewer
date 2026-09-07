#!/usr/bin/env node
/**
 * trial-length.unit.mjs — the trial's length is declared twice, and the two
 * declarations must agree.
 *
 * WHY THIS EXISTS
 * The free period is granted by the SERVER (google_cloud_function_billing:
 * TRIAL_DAYS, the number that actually lands in trialEndsAt) and described by
 * the CLIENT (src/config/subscriptionPlans.ts: TRIAL_DAYS, which drives the
 * countdown and the copy). They live in different deploy units — a build ships
 * without the function, or the other way round — so they can drift silently,
 * and the failure is invisible: the app would simply promise a different number
 * of days than the account is given.
 *
 * Changing the length (7 -> 15 on 2026-09-07) touched ~25 sites across five
 * languages. This test deliberately does NOT police that copy: the dictionaries
 * are full of unrelated durations (30-day retention, the 2-day reminder, the
 * 14-day refund right), and a grep broad enough to catch a stale trial figure
 * flags all of them. It guards the one pair whose disagreement no reader could
 * catch — the number promised versus the number granted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pick = (file, label) => {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = /(?:export\s+)?const TRIAL_DAYS\s*=\s*(\d+)/.exec(src);
  if (!m) throw new Error(`${label}: TRIAL_DAYS not found in ${file}`);
  return Number(m[1]);
};

const client = pick('src/config/subscriptionPlans.ts', 'client');
const server = pick('google_cloud_function_billing/index.js', 'server');

let bad = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) bad++; };

check(client === server, `client TRIAL_DAYS (${client}) === server TRIAL_DAYS (${server})`);
check(Number.isInteger(client) && client > 0 && client <= 90,
  `TRIAL_DAYS is a sane length (${client})`);

console.log(bad ? `\n✗ ${bad} check(s) failed\n` : '\n✓ trial length is consistent\n');
process.exit(bad ? 1 : 0);
