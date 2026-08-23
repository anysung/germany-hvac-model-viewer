/**
 * ADEME agrément matching — output invariants of the canonical→register overlay
 * AND of the France build that consumes it.
 *
 * The PEL suite exercises the shared matching library; this suite guards the
 * contracts that, if broken, would publish a French listing we never
 * established — or fail to publish one we did:
 *   - every overlay state is one of the three allowed states
 *   - confirmed ⇔ carries the agrément number, method and confidence
 *   - one agrément number confirms at most one canonical product
 *   - every confirmation used a whitelisted confirming method
 *   - an eprel_bridge confirmation carries its evidence: the registration, an
 *     EXACT register-side link, and at least one shared product code
 *   - every confirmed mapping is persisted in the committed history
 *
 * And against the built datasets, the two failures France actually shipped:
 *   - the overlay must REACH the build (canonical products carrying a number)
 *   - one agrément number must not appear on two published products (the native
 *     layer must not republish an entry the overlay already confirmed)
 *
 * Skips cleanly when a snapshot or a build is absent (fresh checkout).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const is = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}  — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
};

const dir = join(root, 'data_sources/ademe_agrement/matching');
const snap = existsSync(dir) ? readdirSync(dir).filter(d => /^\d{4}-\d{2}$/.test(d)).sort().pop() : null;
if (!snap) {
  console.log('(no ADEME matching snapshot — agrément assertions skipped)');
  process.exit(0);
}

console.log(`\nADEME agrément overlay invariants — snapshot ${snap}\n`);
const { entries } = JSON.parse(readFileSync(join(dir, snap, 'canonical-agrement-overlay.json'), 'utf8'));

const STATES = ['confirmed', 'review_required', 'verification_required'];
is('every overlay state is an allowed state', entries.every(e => STATES.includes(e.status)), true);

const confirmed = entries.filter(e => e.status === 'confirmed');
is('confirmed entries exist (matching ran against real data)', confirmed.length > 0, true);
is('confirmed → number + method + confidence present',
  confirmed.every(e => e.agrement_number && e.match_method && e.match_confidence), true);
is('confirmed → last_confirmed_at present', confirmed.every(e => !!e.last_confirmed_at), true);

const numbers = confirmed.map(e => e.agrement_number);
is('one agrément number confirms at most one canonical product', new Set(numbers).size, numbers.length);
const ids = confirmed.map(e => e.canonical_id);
is('one canonical product carries at most one agrément', new Set(ids).size, ids.length);

const CONFIRMING = ['manufacturer_official', 'exact_model', 'component_identity', 'eprel_bridge'];
is('every confirmation used a whitelisted confirming method',
  confirmed.every(e => CONFIRMING.includes(e.match_method)), true);

/* The bridge chains two links we derived ourselves, so it may only confirm with
   its evidence attached: an exact register-side link, and a product code the two
   identities actually share. The registration number alone is not evidence. */
const EXACT_REGISTER_LINK = ['eprel_commercial_ref', 'eprel_exact_model'];
const bridged = confirmed.filter(e => e.match_method === 'eprel_bridge');
is('every eprel_bridge confirmation carries its evidence',
  bridged.every(e => e.bridge_evidence?.eprel
    && EXACT_REGISTER_LINK.includes(e.bridge_evidence.register_link)
    && (e.bridge_evidence.shared_codes ?? []).length > 0), true);
is('no non-bridge confirmation carries bridge evidence',
  confirmed.filter(e => e.match_method !== 'eprel_bridge').every(e => e.bridge_evidence == null), true);

is('nothing short of confirmed keeps a match confidence above low',
  entries.filter(e => e.status !== 'confirmed' && !e.previous_status)
    .every(e => e.match_confidence === 'low' || e.ambiguity_blocked), true);

const hist = JSON.parse(readFileSync(join(root, 'data_sources/ademe_agrement/agrement-match-history.json'), 'utf8'));
is('every confirmed mapping is persisted in the committed history',
  confirmed.every(e => hist.matches[e.canonical_id]?.agrement_number === e.agrement_number), true);

// ── Against the built France datasets ────────────────────────────────────────
const fr = ['public/data/products-fr.json', 'public/data/products-commercial-fr.json']
  .map(p => join(root, p));
if (!fr.every(p => existsSync(p))) {
  console.log('\n(no FR build on disk — dataset assertions skipped)');
} else {
  const items = fr.flatMap(p => JSON.parse(readFileSync(p, 'utf8')).items);
  const isNative = (i) => String(i.source_id ?? '').startsWith('FR-');

  const carried = items.filter(i => i.agrement_number);
  is('every published agrément number belongs to a confirmed listing',
    carried.every(i => i.agrement_match_status === 'confirmed'), true);
  is('one agrément number appears on at most one published product',
    new Set(carried.map(i => i.agrement_number)).size, carried.length);

  /* The overlay was written and read by nobody for a day: every German-derived
     record shipped with a null agrément while the native layer kept the totals
     looking healthy. A count, not a shape, is what catches that. */
  is('the listing overlay reaches the build (canonical products carry numbers)',
    carried.filter(i => !isNative(i)).length > 0, true);
  is('canonical confirmations in the build match the overlay',
    carried.filter(i => !isNative(i)).length, confirmed.length);

  is('no German-derived record claims a usage or commercial ref it has no source for',
    items.filter(i => !isNative(i)).every(i => i.agrement_usage == null && i.agrement_commercial_ref == null), true);
}

console.log(failed ? `\n✗ ${failed} assertion(s) failed\n` : `\n✓ all ADEME agrément assertions passed (${passed})\n`);
process.exit(failed ? 1 : 0);
