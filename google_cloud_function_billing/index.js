/**
 * HeatPump DB — account & billing Cloud Function (separate from the news
 * function in google_cloud_function/; deployed with its own deploy.sh).
 *
 * One HTTP entry (`accountBilling`) routing on path:
 *   POST /finalizeSignup   (ID token)  — email-verification + consents + trial
 *   POST /createTeamOrg    (ID token)  — trialing organization before payment
 *   POST /deleteAccount    (ID token)  — GDPR deletion (registry retention 1y)
 *   POST /paddleWebhook    (signature) — Paddle Billing events → entitlements
 *   GET  /health
 *
 * SYSTEM PRINCIPLE (owner decision 2026-07-27): never wrongly block a paying
 * user. Automatic access termination happens ONLY through (a) natural expiry
 * of accessUntilTs with no renewal, or (b) a clearly confirmed final
 * `subscription.canceled` — and even then access runs to the paid period end.
 * Refunds (requested / pending / approved / partial), past_due, chargebacks
 * and chargeback reversals, webhook ordering errors, missing events and API
 * failures NEVER remove access here: they are recorded for the admin console
 * and audit only. When allow-information and deny-information conflict, allow
 * wins and the case is flagged for admin review.
 *
 * ONE FREE TRIAL PER EMAIL across the whole service: emailRegistry/{email}
 * (trim+lowercase, no hashing — owner decision) records first registration and
 * trial use; it survives account deletion with retentionUntil = deletion + 1
 * year (Firestore TTL policy removes it after that; see deploy.sh).
 */
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;
// firebase-admin bundles @google-cloud/storage — no extra dependency needed.
const gcs = admin.storage();
const DATASET_BUCKET = 'heatpumpdb-datasets';

const OWNER_EMAIL = 'sungyongsoo1976@gmail.com';
const TRIAL_DAYS = 7;
const RETENTION_DAYS = 365;
const TEAM_PLANS = { team_3: 3, team_5: 5 };
const PLAN_SEATS = { professional: 1, team_3: 3, team_5: 5 };

// ---------------------------------------------------------------------------
// Paddle catalogue + server-side API (2026-08-03 program)
//
// The webhook derives plan/term from the PRICE ID on the subscription items —
// custom_data is only a fallback. custom_data is written once at checkout and
// never updated by Paddle when items change, so deriving the plan from it
// would freeze a subscription on its original plan after an upgrade.
// ---------------------------------------------------------------------------
const PADDLE_ENV = (process.env.PADDLE_ENV || 'live').toLowerCase();
const PADDLE_API_BASE = PADDLE_ENV === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';

const PRICE_CATALOGUE = {
  live: {
    pri_01kxxw08bvfz6fe8ke0x4zgnt7: ['professional', 'monthly'],
    pri_01kxxw3yy10aw2qdy7y64xa0yn: ['professional', 'six_months'],
    pri_01kxxw5qbvmfx75rc7f42p5d50: ['professional', 'annual'],
    pri_01kxxw8xtvk8dvpa60c0dzxyvn: ['team_3', 'monthly'],
    pri_01kxxwbgmpnj9jvcp218evxqfc: ['team_3', 'six_months'],
    pri_01kxxwde1bwd4x7tgn6sypkb4g: ['team_3', 'annual'],
    pri_01kxxwfm97ve7nfgnggtshfs49: ['team_5', 'monthly'],
    pri_01kxxwhr4xyeq9gwd567j2x7me: ['team_5', 'six_months'],
    pri_01kxxwkhfjj3wsy5k7jekt2acn: ['team_5', 'annual'],
  },
  sandbox: {
    pri_01kxchdg26azdq1przy3hnezff: ['professional', 'monthly'],
    pri_01kxchdgawhejbptxtdgm6j5wq: ['professional', 'six_months'],
    pri_01kxchdgj2w4gpdmdfbqkhtsqn: ['professional', 'annual'],
    pri_01kxchdh34vrxtxth8bkpzmh8n: ['team_3', 'monthly'],
    pri_01kxchdh7r99cm3fwk1bz1gz0k: ['team_3', 'six_months'],
    pri_01kxchdhcm7efjmkh7s1673j82: ['team_3', 'annual'],
    pri_01kxchdhrmrtqmhataynyqdcdm: ['team_5', 'monthly'],
    pri_01kxchdj04dzbf9j5s92tkwvvz: ['team_5', 'six_months'],
    pri_01kxchdj4rtpj7ndzj30sawddw: ['team_5', 'annual'],
  },
};
/** price_id → [planCode, billingTerm], searching both environments (webhooks
 *  from either environment must resolve; ids are globally unique). */
function planFromPriceId(priceId) {
  return PRICE_CATALOGUE.live[priceId] || PRICE_CATALOGUE.sandbox[priceId] || null;
}
function priceIdFor(planCode, billingTerm) {
  const cat = PRICE_CATALOGUE[PADDLE_ENV] || PRICE_CATALOGUE.live;
  for (const [id, [p, t]] of Object.entries(cat)) if (p === planCode && t === billingTerm) return id;
  return null;
}
/** Derive [planCode, billingTerm] from subscription items; null when unknown. */
function planFromItems(sub) {
  for (const item of (sub && sub.items) || []) {
    const id = item && item.price && item.price.id;
    const hit = id && planFromPriceId(id);
    if (hit) return hit;
  }
  return null;
}

/** Server-side Paddle API call. Throws on non-2xx with the response body. */
async function paddleApi(method, apiPath, body) {
  const key = process.env.PADDLE_API_KEY;
  if (!key) { const e = new Error('paddle-api-key-missing'); e.code = 'paddle-api-key-missing'; throw e; }
  const res = await fetch(`${PADDLE_API_BASE}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`paddle-api ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    e.code = 'paddle-api-error'; e.status = res.status; e.body = json;
    throw e;
  }
  return json.data ?? json;
}

/** Admin gate for ops endpoints: signed-in caller whose profile role is
 *  admin/owner. (verifyOwner stays the stricter gate for panic actions.) */
async function verifyAdmin(req) {
  const caller = await verifyCaller(req);
  if (!caller) return null;
  const snap = await db.collection('users').doc(caller.uid).get();
  const role = snap.exists ? snap.data().role : null;
  if (role === 'admin' || role === 'owner') return caller;
  return null;
}

// Browser origins allowed to call the account endpoints. Extend via the
// ALLOWED_ORIGINS env var (comma-separated) when a market domain is added —
// this list is part of the market-expansion checklist, like the reCAPTCHA and
// Storage-CORS allowlists.
const DEFAULT_ORIGINS = [
  'https://heatpumpdb.de', 'https://www.heatpumpdb.de',
  'https://heatpumpdb.pl', 'https://www.heatpumpdb.pl',
  'https://gen-lang-client-0324244302.web.app', 'https://gen-lang-client-0324244302.firebaseapp.com',
  'https://heatpumpdb-uk.web.app', 'https://heatpumpdb-fr.web.app',
  'https://heatpumpdb-pl.web.app', 'https://heatpumpdb-it.web.app',
  'https://heatpumpdb-hub.web.app',
  'http://localhost:5173', 'http://localhost:4173',
];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean).concat(DEFAULT_ORIGINS);

const emailKey = (email) => String(email || '').trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const addDays = (ms, days) => Timestamp.fromMillis(ms + days * 86400000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

/** Verify the Firebase ID token from Authorization: Bearer …; null on failure. */
async function verifyCaller(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  try { return await admin.auth().verifyIdToken(m[1]); }
  catch { return null; }
}

/** Firestore Timestamp | ISO string | epoch ms → millis (null if unreadable). */
function tsMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

/**
 * accessUntilTs may only ever be EXTENDED by billing events (fail-open: a
 * late/duplicate/short event must never shrink a window a payment opened).
 * Returns the field patch, or {} when the current window is already ≥ next.
 */
function extendWindowPatch(currentVal, nextMillis) {
  if (nextMillis == null) return {};
  const cur = tsMillis(currentVal);
  if (cur != null && cur >= nextMillis) return {};
  return { accessUntilTs: Timestamp.fromMillis(nextMillis) };
}

const sendErr = (res, code, error) => res.status(code).json({ ok: false, error });

// ---------------------------------------------------------------------------
// /finalizeSignup — the ONE place a self-service account becomes active.
//
// Body: { termsVersion, privacyVersion, dataUseVersion }
// The FINAL email-verification decision is the Firebase Auth SERVER record
// (admin.auth().getUser().emailVerified) — a single lookup, not the caller's
// token claim (owner decision 2026-07-27). Social providers (google.com /
// apple.com) are provider-verified and skip the mail check.
// ---------------------------------------------------------------------------
async function finalizeSignup(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const uid = caller.uid;

  const authUser = await admin.auth().getUser(uid);   // server record — the one criterion
  const email = emailKey(authUser.email);
  if (!email) return sendErr(res, 400, 'no-email');

  const providers = (authUser.providerData || []).map(p => p.providerId);
  const social = providers.includes('google.com') || providers.includes('apple.com');
  if (!social && !authUser.emailVerified) {
    return res.status(200).json({ ok: false, error: 'email-not-verified' });
  }

  const body = req.body || {};
  const consent = {
    termsVersion: String(body.termsVersion || ''),
    privacyVersion: String(body.privacyVersion || ''),
    dataUseVersion: String(body.dataUseVersion || ''),
  };
  if (!consent.dataUseVersion || !consent.termsVersion) {
    return sendErr(res, 400, 'consent-required');
  }

  const userRef = db.collection('users').doc(uid);
  const regRef = db.collection('emailRegistry').doc(email);

  const result = await db.runTransaction(async (tx) => {
    const [userSnap, regSnap] = await Promise.all([tx.get(userRef), tx.get(regRef)]);
    if (!userSnap.exists) return { error: 'no-profile' };
    const user = userSnap.data();

    if (['suspended', 'rejected', 'disabled', 'deleted', 'deletion_requested'].includes(user.status)) {
      return { error: 'account-closed' };
    }

    const reg = regSnap.exists ? regSnap.data() : null;
    const now = Date.now();
    const nowTs = Timestamp.fromMillis(now);

    // Registry: every activation records the email history; an entry that was
    // scheduled for TTL deletion (account deleted, then re-registered within
    // a year) is revived with retention cleared while the account lives.
    const regPatch = {
      email,
      lastSeenAt: nowTs,
      retentionUntil: FieldValue.delete(),
      deletedAt: FieldValue.delete(),
      ...(reg ? {} : { firstRegisteredAt: nowTs }),
    };

    // Server-stamped consent (time = server clock, versions = what was shown).
    const consentPatch = {
      termsAcceptedAt: nowIso(),
      termsVersion: consent.termsVersion,
      privacyVersion: consent.privacyVersion,
      dataUseConsentAt: nowIso(),
      dataUseConsentVersion: consent.dataUseVersion,
    };

    // Already active (idempotent re-call, invited member, free-grant account):
    // record registry + consent, never touch entitlements or grant a trial.
    if (user.status === 'active') {
      tx.set(regRef, regPatch, { merge: true });
      tx.update(userRef, consentPatch);
      return { ok: true, activated: false, trial: false, alreadyActive: true };
    }

    // status 'pending' — the activation decision.
    const isMember = !!user.orgId && user.orgRole === 'member';
    const trialUsedBefore = !!(reg && reg.trialUsedAt);
    const grantTrial = !isMember && !trialUsedBefore;

    const patch = {
      ...consentPatch,
      status: 'active',
      isActive: true,
    };
    if (grantTrial) {
      // First activation anywhere in the service → the one free trial.
      const ends = addDays(now, TRIAL_DAYS);
      patch.trialStartedAt = nowTs;
      patch.trialEndsAt = ends;
      patch.accessUntilTs = ends;
      regPatch.trialUsedAt = nowTs;
    } else if (!isMember) {
      // Known email (or team-history email signing up solo): active but the
      // window is already closed → the app routes straight to checkout.
      patch.accessUntilTs = nowTs;
    }
    // Team members carry no personal window — access follows the org's.

    tx.set(regRef, regPatch, { merge: true });
    tx.update(userRef, patch);
    return { ok: true, activated: true, trial: grantTrial, trialDays: TRIAL_DAYS };
  });

  if (result.error) return res.status(200).json({ ok: false, error: result.error });
  return res.status(200).json(result);
}

// ---------------------------------------------------------------------------
// /createTeamOrg — a trialing organization BEFORE payment (owner decision:
// members can be invited during the admin's trial; every team condition —
// trial end included — anchors to the team admin alone).
// Body: { planCode: 'team_3' | 'team_5' }
// ---------------------------------------------------------------------------
async function createTeamOrg(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const uid = caller.uid;
  const planCode = String((req.body || {}).planCode || '');
  if (!(planCode in TEAM_PLANS)) return sendErr(res, 400, 'bad-plan');

  const userRef = db.collection('users').doc(uid);
  const orgRef = db.collection('organizations').doc();

  const result = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return { error: 'no-profile' };
    const user = userSnap.data();
    if (user.status !== 'active') return { error: 'not-active' };
    if (user.orgId) return { error: 'already-in-team' };

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const org = {
      name: user.companyName || '',
      ownerUid: uid,
      ownerEmail: emailKey(user.email),
      planCode,
      seatLimit: TEAM_PLANS[planCode],
      subscriptionStatus: 'trialing',
      // The team window IS the admin's window — one date for everyone.
      ...(user.trialEndsAt ? { trialEndsAt: user.trialEndsAt } : {}),
      ...(user.accessUntilTs ? { accessUntilTs: user.accessUntilTs } : {}),
      currentPeriodEndsAt: null,
      members: [{ uid, email: emailKey(user.email), ...(name ? { name } : {}) }],
      memberUids: [uid],
      invitedEmails: [],
      invitedAt: {},
      companyName: user.companyName || '',
      companyType: user.companyType || '',
      ...(user.companyTypeOther ? { companyTypeOther: user.companyTypeOther } : {}),
      ...(user.companyCity ? { companyCity: user.companyCity } : {}),
      ...(user.companyWebsite ? { companyWebsite: user.companyWebsite } : {}),
      createdAt: nowIso(),
    };
    tx.set(orgRef, org);
    tx.update(userRef, { orgId: orgRef.id, orgRole: 'team_admin' });
    return { ok: true, orgId: orgRef.id };
  });

  if (result.error) return res.status(200).json({ ok: false, error: result.error });
  return res.status(200).json(result);
}

// ---------------------------------------------------------------------------
// /deleteAccount — self-service GDPR deletion.
//
// Safety model (owner-reviewed): ALL Firestore mutations run in ONE atomic
// transaction; the Firebase Auth deletion is the only step after it, so the
// failure surface is a single seam. Every step is idempotent (seat release is
// a uid filter, registry is an upsert, anonymization re-applies cleanly) —
// re-invoking after a partial failure completes the remainder. Incomplete
// deletions stay visible in the admin deletion queue as a manual backstop.
// ---------------------------------------------------------------------------
async function deleteAccount(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const uid = caller.uid;

  const userRef = db.collection('users').doc(uid);
  const changeRef = db.collection('subscriptionChangeRequests').doc(uid);

  // A deleted account must not keep billing: cancel any Paddle subscription
  // IMMEDIATELY first (the UI has already taken the double confirmation).
  // Best effort — a Paddle outage must not trap the user in an undeletable
  // account (owner: user convenience first), so on failure the deletion
  // proceeds and the orphaned subscription is parked for the admin to cancel
  // in the Paddle dashboard.
  try {
    const preSnap = await userRef.get();
    const pre = preSnap.exists ? preSnap.data() : null;
    const subId = pre && pre.paddleSubscriptionId;
    const subActive = pre && pre.subscription && ['active', 'trialing', 'past_due'].includes(pre.subscription.status);
    if (subId && subActive) {
      await paddleApi('POST', `/subscriptions/${subId}/cancel`, { effective_from: 'immediately' });
    }
  } catch (e) {
    console.error(`deleteAccount ${uid}: paddle cancel failed`, e);
    await db.collection('paddleAdjustments').doc(`orphan-cancel-${uid}`).set({
      kind: 'orphaned-subscription', uid,
      note: 'Account deleted but the Paddle cancel call failed — cancel this subscription manually in the Paddle dashboard.',
      error: String(e && e.message || e).slice(0, 300),
      needsAdminReview: true, createdAt: nowIso(),
    }, { merge: true }).catch(() => {});
  }

  const result = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return { ok: true, alreadyGone: true }; // retry after earlier success
    const user = userSnap.data();
    const email = emailKey(user.email || caller.email);

    // The platform owner account is never deletable through this endpoint.
    if (email === OWNER_EMAIL || ['owner', 'admin'].includes(user.role)) {
      return { error: 'owner-account' };
    }

    let orgSnap = null;
    if (user.orgId) orgSnap = await tx.get(db.collection('organizations').doc(user.orgId));

    // Team owner with other members cannot walk away (ownership transfer via
    // Support). A sole-member owner's org is closed with the account.
    if (orgSnap && orgSnap.exists) {
      const org = orgSnap.data();
      const isOwner = org.ownerUid === uid;
      if (isOwner && (org.members || []).length > 1) return { error: 'team-has-members' };
      if (isOwner) {
        tx.delete(orgSnap.ref);
      } else {
        // Member: free the seat (uid filter — idempotent by construction).
        const members = (org.members || []).filter(m => m.uid !== uid);
        tx.update(orgSnap.ref, {
          members,
          memberUids: members.map(m => m.uid),
          keepMemberUids: FieldValue.arrayRemove(uid),
        });
      }
    }

    // Registry: minimal email history survives (repeat-trial prevention),
    // retained for 1 year from deletion, then removed by the TTL policy.
    if (email) {
      tx.set(db.collection('emailRegistry').doc(email), {
        email,
        deletedAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
        retentionUntil: addDays(Date.now(), RETENTION_DAYS),
        ...(user.paddleCustomerId ? { paddleCustomerId: user.paddleCustomerId } : {}),
      }, { merge: true });
    }

    // Profile: keep a PII-free skeleton for the audit trail; every personal
    // field is removed (not blanked) in the same atomic write.
    tx.set(userRef, {
      id: uid,
      status: 'deleted',
      isActive: false,
      deletedAt: nowIso(),
      country: user.country || '',
      registeredAt: user.registeredAt || '',
    }, { merge: false });

    tx.delete(changeRef);
    return { ok: true };
  });

  if (result.error) return res.status(200).json({ ok: false, error: result.error });

  // Outside the transaction (idempotent, non-critical): strip PII from the
  // user's support tickets.
  try {
    const tickets = await db.collection('supportTickets').where('userId', '==', uid).get();
    await Promise.all(tickets.docs.map(d =>
      d.ref.update({ userEmail: '', userName: 'Deleted account' }).catch(() => {})));
  } catch (e) { console.error('ticket anonymization failed (non-critical)', e); }

  // Always last: remove the Auth account. If this single step fails, a retry
  // re-runs the (now no-op) transaction and repeats just this deletion.
  try { await admin.auth().deleteUser(uid); }
  catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('auth deletion failed — retry deleteAccount', e);
      return res.status(200).json({ ok: false, error: 'auth-delete-failed-retry' });
    }
  }
  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
// Concurrent sessions (docs/CONCURRENT_SESSIONS.md, 2026-07-28)
//
// Enforcement is SERVER-side: session docs are client-read-only (rules deny
// all client writes); every mutation happens here with server time. The
// limit's adversary is the account owner's own client, so the client is
// never trusted with lastSeenAt, grace state or revocation.
// ---------------------------------------------------------------------------

const SESSION_DEFAULTS = { enabled: true, activeLimit: 2, activeWindowMin: 10, graceMin: 30 };
let _sessCfgCache = { at: 0, val: SESSION_DEFAULTS };

/** opsConfig/sessions with a 60 s in-memory cache — the no-redeploy kill switch. */
async function sessionConfig() {
  if (Date.now() - _sessCfgCache.at < 60_000) return _sessCfgCache.val;
  try {
    const snap = await db.collection('opsConfig').doc('sessions').get();
    _sessCfgCache = { at: Date.now(), val: { ...SESSION_DEFAULTS, ...(snap.exists ? snap.data() : {}) } };
  } catch {
    _sessCfgCache = { at: Date.now(), val: SESSION_DEFAULTS };   // fail-open: defaults
  }
  return _sessCfgCache.val;
}

const ADMIN_ROLES = ['owner', 'admin', 'support', 'ops'];
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * /sessionHeartbeat { sessionId, deviceName?, browser?, os? }
 * One transaction: upsert session (server lastSeenAt) → active count →
 * grace set/clear → post-expiry LRU eviction (never the caller).
 */
async function sessionHeartbeat(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const { sessionId, deviceName, browser, os } = req.body || {};
  if (!SESSION_ID_RE.test(String(sessionId || ''))) return sendErr(res, 400, 'bad-session-id');

  const cfg = await sessionConfig();
  const userRef = db.collection('users').doc(caller.uid);
  const sessRef = userRef.collection('sessions').doc(sessionId);

  const out = await db.runTransaction(async (tx) => {
    // All reads first (Firestore transaction contract).
    const [userSnap, allSess] = await Promise.all([
      tx.get(userRef),
      tx.get(userRef.collection('sessions')),
    ]);
    const user = userSnap.exists ? userSnap.data() : {};
    const now = Date.now();
    const nowTs = Timestamp.fromMillis(now);

    // Exemption: owner token, or any admin-role profile — unlimited sessions.
    const exempt =
      caller.owner === true ||
      (caller.email === OWNER_EMAIL && caller.email_verified === true) ||
      ADMIN_ROLES.includes(user.role);

    // Upsert the caller's session with SERVER time only.
    const self = allSess.docs.find(d => d.id === sessionId);
    tx.set(sessRef, {
      lastSeenAt: nowTs,
      ...(self && self.data().createdAt ? {} : { createdAt: nowTs }),
      ...(deviceName ? { deviceName: String(deviceName).slice(0, 60) } : {}),
      ...(browser ? { browser: String(browser).slice(0, 40) } : {}),
      ...(os ? { os: String(os).slice(0, 40) } : {}),
    }, { merge: true });

    // Housekeeping: drop long-dead session docs (30 days), a few per beat.
    allSess.docs
      .filter(d => d.id !== sessionId && tsMillis(d.data().lastSeenAt) != null && now - tsMillis(d.data().lastSeenAt) > 30 * 86400_000)
      .slice(0, 5)
      .forEach(d => tx.delete(d.ref));

    // Active = not revoked AND server lastSeenAt within the window (the
    // caller counts as "now" — its write above lands in this transaction).
    const windowMs = cfg.activeWindowMin * 60_000;
    const active = allSess.docs
      .filter(d => !d.data().revokedAt)
      .map(d => ({
        id: d.id,
        ref: d.ref,
        lastSeen: d.id === sessionId ? now : (tsMillis(d.data().lastSeenAt) ?? 0),
        created: tsMillis(d.data().createdAt) ?? 0,
      }))
      .filter(s => now - s.lastSeen <= windowMs);
    if (!active.some(s => s.id === sessionId)) {
      active.push({ id: sessionId, ref: sessRef, lastSeen: now, created: now });
    }

    const graceMs = user.sessionGraceUntil ? tsMillis(user.sessionGraceUntil) : null;
    const clearGrace = () => {
      if (user.sessionGraceUntil || user.sessionOverLimitSince) {
        tx.set(userRef, { sessionGraceUntil: FieldValue.delete(), sessionOverLimitSince: FieldValue.delete() }, { merge: true });
      }
    };

    if (!cfg.enabled || exempt) {
      clearGrace();
      return { activeCount: active.length, limit: null, graceUntil: null, revokedSelf: !!(self && self.data().revokedAt) };
    }

    if (active.length <= cfg.activeLimit) {
      // Back within limit — the grace (if any) cancels silently.
      clearGrace();
      return { activeCount: active.length, limit: cfg.activeLimit, graceUntil: null, revokedSelf: false };
    }

    if (!graceMs) {
      // Over limit, no grace yet → start the 30-minute window, count the event.
      const until = now + cfg.graceMin * 60_000;
      tx.set(userRef, {
        sessionGraceUntil: Timestamp.fromMillis(until),
        sessionOverLimitSince: nowTs,
        overLimitEvents: FieldValue.increment(1),
      }, { merge: true });
      return { activeCount: active.length, limit: cfg.activeLimit, graceUntil: until, revokedSelf: false };
    }

    if (now < graceMs) {
      // Grace still running — nothing to do but report it.
      return { activeCount: active.length, limit: cfg.activeLimit, graceUntil: graceMs, revokedSelf: false };
    }

    // Grace expired and still over limit → evict the least-recently-active
    // session that is NOT the caller (ties broken by oldest createdAt).
    const victims = active
      .filter(s => s.id !== sessionId)
      .sort((a, b) => (a.lastSeen - b.lastSeen) || (a.created - b.created));
    const victim = victims[0];
    if (victim) {
      tx.update(victim.ref, { revokedAt: nowTs, revokeReason: 'auto-limit' });
      tx.set(userRef, {
        sessionGraceUntil: FieldValue.delete(),
        sessionOverLimitSince: FieldValue.delete(),
        autoRevokedCount: FieldValue.increment(1),
        lastAutoRevokeAt: nowIso(),
      }, { merge: true });
    }
    return { activeCount: active.length - (victim ? 1 : 0), limit: cfg.activeLimit, graceUntil: null, revokedSelf: false, evicted: victim ? victim.id : null };
  });

  return res.status(200).json({ ok: true, ...out });
}

/** /revokeSession { sessionId } — sign out ONE of the caller's own sessions. */
async function revokeSession(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const { sessionId } = req.body || {};
  if (!SESSION_ID_RE.test(String(sessionId || ''))) return sendErr(res, 400, 'bad-session-id');
  await db.collection('users').doc(caller.uid).collection('sessions').doc(sessionId)
    .set({ revokedAt: Timestamp.now(), revokeReason: 'manual' }, { merge: true });
  return res.status(200).json({ ok: true });
}

/** /revokeOtherSessions { keepSessionId } — everything but the current device.
 *  Deliberately does NOT touch refresh tokens (the caller must survive). */
async function revokeOtherSessions(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const { keepSessionId } = req.body || {};
  if (!SESSION_ID_RE.test(String(keepSessionId || ''))) return sendErr(res, 400, 'bad-session-id');
  const sess = await db.collection('users').doc(caller.uid).collection('sessions').get();
  const batch = db.batch();
  let n = 0;
  for (const d of sess.docs) {
    if (d.id === keepSessionId || d.data().revokedAt) continue;
    batch.set(d.ref, { revokedAt: Timestamp.now(), revokeReason: 'manual' }, { merge: true });
    n++;
  }
  if (n) await batch.commit();
  return res.status(200).json({ ok: true, revoked: n });
}

/** /signOutEverywhere — all session docs + refresh-token revocation (hard
 *  cutoff for every device INCLUDING the caller, which signs out locally). */
async function signOutEverywhere(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const sess = await db.collection('users').doc(caller.uid).collection('sessions').get();
  const batch = db.batch();
  for (const d of sess.docs) {
    if (!d.data().revokedAt) batch.set(d.ref, { revokedAt: Timestamp.now(), revokeReason: 'sign-out-everywhere' }, { merge: true });
  }
  await batch.commit();
  await admin.auth().revokeRefreshTokens(caller.uid);
  return res.status(200).json({ ok: true });
}

/**
 * /adminClearSessions { uid } — support action: clear EVERY device session for
 * another account.
 *
 * With a 2-device limit the predictable support ticket is "I changed laptop and
 * cannot sign in". The user's own /signOutEverywhere cannot help them: it needs
 * them to be signed in, which is exactly what they cannot do. This is the
 * admin-side equivalent, and the only endpoint that acts on someone else.
 *
 * Deliberately narrow: it revokes session documents ONLY. It does NOT revoke
 * refresh tokens, touch entitlements, or change account status — clearing a
 * device list must never become a way to lock someone out, and the fail-open
 * billing principle means access windows are never altered here. Owner-gated
 * (the only admin today) and audited like the panic path.
 */
async function adminClearSessions(req, res) {
  const owner = await verifyOwner(req);
  if (!owner) return sendErr(res, 403, 'owner-only');
  const uid = String((req.body || {}).uid || '');
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return sendErr(res, 400, 'bad-uid');

  const sess = await db.collection('users').doc(uid).collection('sessions').get();
  const batch = db.batch();
  let n = 0;
  for (const d of sess.docs) {
    if (d.data().revokedAt) continue;
    batch.set(d.ref, { revokedAt: Timestamp.now(), revokeReason: 'admin-support' }, { merge: true });
    n++;
  }
  if (n) await batch.commit();

  await db.collection('opsAuditLog').add({
    action: 'adminClearSessions', targetUid: uid, revoked: n,
    by: owner.email || owner.uid, at: new Date().toISOString(),
  });
  return res.status(200).json({ ok: true, revoked: n });
}

// ---------------------------------------------------------------------------
// Dataset ops: /rollbackStatus + /panicRollback
// (docs/DATASET_ROLLBACK_AND_PANIC.md — owner-only manual override)
//
// The restore unit is ALWAYS a complete snapshot SET (snapshots/<runId>/…),
// never per-object generations — sequential uploads mean per-object restores
// could mix update epochs. Copying preserves contentType/contentEncoding, so
// restored objects serve exactly as they did.
// ---------------------------------------------------------------------------

const { DATASETS, expectedObjectPaths, checkDataset, simulateMarket } = require('./datasetChecks');
// Canary ids — deploy.sh copies scripts/canary/canary-records.json here. If
// the copy is somehow absent the checks run in degraded mode (canary skipped)
// and every response/audit carries degraded:true so the operator knows.
let CANARIES = null;
try { CANARIES = require('./canary-records.json'); } catch { /* degraded */ }

/** Owner check: custom claim first, verified owner email as recovery path. */
async function verifyOwner(req) {
  const caller = await verifyCaller(req);
  if (!caller) return null;
  if (caller.owner === true) return caller;
  if (caller.email === OWNER_EMAIL && caller.email_verified === true) return caller;
  return null;
}

async function listLiveObjects() {
  const [files] = await gcs.bucket(DATASET_BUCKET).getFiles({ prefix: 'datasets/' });
  return files.map(f => ({
    path: f.name,
    md5: f.metadata.md5Hash || '',
    size: Number(f.metadata.size || 0),
    updated: f.metadata.updated || '',
    contentEncoding: f.metadata.contentEncoding || '',
  }));
}

async function listSnapshots() {
  // Snapshot ids are the top-level "directories" under snapshots/. The
  // emergency UI gets only the NEWEST few — a panic moment is no time to
  // scroll history (older sets remain reachable via the manual runbook).
  const [, , resp] = await gcs.bucket(DATASET_BUCKET).getFiles({ prefix: 'snapshots/', delimiter: '/', autoPaginate: false });
  return ((resp && resp.prefixes) || [])
    .map(p => p.replace(/^snapshots\//, '').replace(/\/$/, ''))
    .sort().reverse().slice(0, 5);
}

/**
 * Full-set validation of a path→dataset map (10 objects): the SAME checks the
 * post-publish self-check runs (datasetChecks.js), including the per-market
 * functional simulation. Returns [{path, items}]; throws on first failure.
 */
function validateFullSet(byPath, degraded) {
  const verified = [];
  const perMarket = {};
  for (const [cc, files] of Object.entries(DATASETS)) {
    perMarket[cc] = {};
    for (const [segment, file] of Object.entries(files)) {
      const path = `datasets/${cc}/${file}`;
      const data = byPath.get(path);
      const canaryId = degraded ? null : CANARIES?.[cc]?.[segment]?.bafa_id;
      const { items } = checkDataset(data, { cc, segment, canaryId });
      perMarket[cc][segment] = items;
      verified.push({ path, items: items.length });
    }
    simulateMarket(cc, perMarket[cc].residential, perMarket[cc].commercial);
  }
  return verified;
}

/**
 * How each snapshot was cleared before it was taken (upload-datasets.mjs writes
 * PREFLIGHT.json). Returned as a SEPARATE map so `snapshots` keeps its string[]
 * shape — this is the emergency path, and a change here must not be able to
 * break the restore UI. Entirely best-effort: an unreadable or absent stamp
 * simply leaves the restore point unlabelled.
 */
async function readPreflightStamps(ids) {
  const meta = {};
  await Promise.all(ids.map(async id => {
    try {
      const [buf] = await gcs.bucket(DATASET_BUCKET).file(`snapshots/${id}/PREFLIGHT.json`).download();
      meta[id] = JSON.parse(buf.toString('utf8')).preflight ?? null;
    } catch { /* pre-dates the stamp, or unreadable — leave unlabelled */ }
  }));
  return meta;
}

async function rollbackStatus(req, res) {
  const owner = await verifyOwner(req);
  if (!owner) return sendErr(res, 403, 'owner-only');
  const [live, snapshots, lockSnap] = await Promise.all([
    listLiveObjects(),
    listSnapshots(),
    db.collection('opsAuditLog').doc('_panicLock').get(),
  ]);
  return res.status(200).json({
    ok: true,
    live,
    snapshots,
    snapshotMeta: await readPreflightStamps(snapshots),
    degraded: !CANARIES,
    lock: lockSnap.exists ? lockSnap.data() : null,
  });
}

async function panicRollback(req, res) {
  const owner = await verifyOwner(req);
  if (!owner) return sendErr(res, 403, 'owner-only');
  const { snapshotId, confirm } = req.body || {};
  if (confirm !== 'ROLLBACK') return sendErr(res, 400, 'confirmation-required');
  if (!/^[A-Za-z0-9_-]+$/.test(String(snapshotId || ''))) return sendErr(res, 400, 'bad-snapshot-id');

  // Single-flight lock: 15 min TTL + a job id, so only THIS job can release
  // it and an expired-but-still-running first job is visible in the audit
  // trail rather than silently overlapped (2026-07-28 review, finding #5).
  const jobId = crypto.randomUUID();
  const lockRef = db.collection('opsAuditLog').doc('_panicLock');
  const acquired = await db.runTransaction(async tx => {
    const snap = await tx.get(lockRef);
    const now = Date.now();
    const cur = snap.exists ? snap.data() : null;
    if (cur && cur.expiresAtMs > now) return false;
    tx.set(lockRef, { jobId, by: owner.uid, snapshotId, startedAt: nowIso(), expiresAtMs: now + 15 * 60_000 });
    return true;
  });
  if (!acquired) return sendErr(res, 409, 'rollback-in-progress');
  const releaseLock = async () => {
    // Release only OUR lock — never a successor's.
    await db.runTransaction(async tx => {
      const snap = await tx.get(lockRef);
      if (snap.exists && snap.data().jobId === jobId) tx.delete(lockRef);
    }).catch(() => {});
  };

  const degraded = !CANARIES;
  const audit = {
    action: 'panic-rollback', jobId, snapshotId, degraded,
    by: owner.uid, byEmail: owner.email || '', startedAt: nowIso(),
  };
  const fail = async (httpCode, error) => {
    Object.assign(audit, { ok: false, error, finishedAt: nowIso() });
    await db.collection('opsAuditLog').add(audit).catch(() => {});
    await releaseLock();
    return sendErr(res, httpCode, error);
  };

  try {
    const bucket = gcs.bucket(DATASET_BUCKET);
    const prefix = `snapshots/${snapshotId}/`;

    // ── Phase 1: prove the snapshot is a COMPLETE, VALID set BEFORE touching
    // live (2026-07-28 review, finding #1). The expected set is exactly the
    // 10 canonical object paths — a missing file, an extra file, or a file
    // that fails ANY of the shared checks aborts with nothing restored.
    const expected = expectedObjectPaths();
    const [files] = await bucket.getFiles({ prefix: `${prefix}datasets/` });
    const found = new Map(files.map(f => [f.name.slice(prefix.length), f]));
    const missing = expected.filter(p => !found.has(p));
    const extra = [...found.keys()].filter(p => !expected.includes(p));
    if (missing.length) return await fail(400, `snapshot-incomplete: missing ${missing.join(', ')}`);
    if (extra.length) return await fail(400, `snapshot-unexpected-objects: ${extra.join(', ')}`);

    const byPath = new Map();
    for (const p of expected) {
      const [buf] = await found.get(p).download();   // download() gunzips per contentEncoding
      byPath.set(p, JSON.parse(buf.toString('utf8')));
    }
    try {
      validateFullSet(byPath, degraded);
    } catch (e) {
      return await fail(400, `snapshot-validation-failed: ${e.message}`);
    }

    // ── Phase 2: restore the whole set (only reached with a proven snapshot).
    for (const p of expected) {
      await found.get(p).copy(bucket.file(p));
    }

    // ── Phase 3: post-restore verification of the LIVE objects — the same
    // full check set again, on what is actually being served now.
    const liveByPath = new Map();
    for (const p of expected) {
      const [buf] = await bucket.file(p).download();
      liveByPath.set(p, JSON.parse(buf.toString('utf8')));
    }
    let verified;
    try {
      verified = validateFullSet(liveByPath, degraded);
    } catch (e) {
      return await fail(500, `post-restore-verification-failed: ${e.message}`);
    }

    Object.assign(audit, { ok: true, finishedAt: nowIso(), restored: verified });
    await db.collection('opsAuditLog').add(audit);
    await releaseLock();
    return res.status(200).json({ ok: true, degraded, restored: verified });
  } catch (e) {
    return await fail(500, String(e && e.message || e));
  }
}

// ---------------------------------------------------------------------------
// Paddle webhook
// ---------------------------------------------------------------------------

/**
 * Paddle's webhook source IPs, fetched from https://api.paddle.com/ips (the
 * source of truth — never hard-coded) and cached for 12 h. Used as a cheap
 * first filter in front of signature verification.
 *
 * FAIL-OPEN (deliberate): if the list cannot be fetched we allow the request
 * through to the SIGNATURE check, which is the real security boundary. A
 * transient DNS/network blip must never make us reject genuine paid events —
 * the same principle the whole billing path follows.
 */
let _ipCache = { at: 0, cidrs: null };
async function paddleIpAllowlist() {
  if (_ipCache.cidrs && Date.now() - _ipCache.at < 12 * 3600_000) return _ipCache.cidrs;
  try {
    const res = await fetch('https://api.paddle.com/ips');
    const body = await res.json();
    const cidrs = (body && body.data && body.data.ipv4_cidrs) || [];
    if (cidrs.length) _ipCache = { at: Date.now(), cidrs };
  } catch (e) {
    console.error('paddle ip list fetch failed — falling back to signature-only', e.message);
  }
  return _ipCache.cidrs;
}

/** Caller IP as seen behind Cloud Run's proxy (first X-Forwarded-For hop). */
function callerIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  return (xff.split(',')[0] || req.ip || '').trim();
}

/** Paddle publishes /32 CIDRs, so an exact-address match is sufficient. */
function ipAllowed(ip, cidrs) {
  if (!cidrs || !cidrs.length) return true;          // fail-open (see above)
  if (!ip) return true;                              // unknown source → let the signature decide
  return cidrs.some(c => c === ip || c === `${ip}/32` || c.split('/')[0] === ip);
}

/** Verify the Paddle-Signature header (ts=…;h1=…) against the raw body. */
function verifyPaddleSignature(req) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const header = req.headers['paddle-signature'] || '';
  const parts = Object.fromEntries(header.split(';').map(p => p.split('=')));
  if (!parts.ts || !parts.h1) return false;
  const digest = crypto.createHmac('sha256', secret)
    .update(`${parts.ts}:${req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body)}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.h1));
  } catch { return false; }
}

const PADDLE_STATUS_MAP = {
  active: 'active', past_due: 'past_due', canceled: 'canceled',
  paused: 'canceled', trialing: 'active',
};

/** Resolve the Firebase uid for a subscription event: custom_data first,
 *  stored subscription id second. Unmatched events are parked for the admin. */
async function resolveUid(sub) {
  const custom = sub.custom_data || {};
  if (custom.userId) return custom.userId;
  const bySub = await db.collection('users')
    .where('paddleSubscriptionId', '==', sub.id).limit(1).get();
  if (!bySub.empty) return bySub.docs[0].id;
  return null;
}

/**
 * Apply a subscription event to the user (and their org). GRANT-side facts
 * (new period end, active status) apply immediately; DENY-side facts only
 * ever record status — the access window is never shortened here.
 */
async function applySubscriptionEvent(sub, eventType, occurredAt) {
  const uid = await resolveUid(sub);
  if (!uid) {
    await db.collection('paddleAdjustments').doc(`unmatched-${sub.id}-${Date.now()}`).set({
      kind: 'unmatched-subscription-event', eventType, subscriptionId: sub.id,
      customerId: sub.customer_id || '', occurredAt, needsAdminReview: true, createdAt: nowIso(),
    });
    return;
  }

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const user = snap.data();

    // Ordering guard: never let an older event overwrite a newer state.
    const last = user.subscription && user.subscription.lastPaddleEventAt;
    if (last && occurredAt && occurredAt <= last) return;

    // All reads before any writes (Firestore transaction contract).
    const custom0 = sub.custom_data || {};
    const orgIdPre = custom0.orgId || user.orgId;
    let orgSnap = null;
    if (orgIdPre) orgSnap = await tx.get(db.collection('organizations').doc(orgIdPre));

    const custom = custom0;
    // Plan/term come from the PRICE on the subscription (custom_data is a
    // checkout-time snapshot that Paddle never updates on item changes).
    const derived = planFromItems(sub);
    const planCode = (derived && derived[0]) || custom.planCode || (user.subscription && user.subscription.planCode) || 'professional';
    const billingTerm = (derived && derived[1]) || custom.billingTerm || (user.subscription && user.subscription.billingTerm) || null;
    const status = PADDLE_STATUS_MAP[sub.status] || 'active';
    const periodEnd = sub.current_billing_period && sub.current_billing_period.ends_at
      ? sub.current_billing_period.ends_at : null;
    const periodStart = sub.current_billing_period && sub.current_billing_period.starts_at
      ? sub.current_billing_period.starts_at : null;

    const subscription = {
      provider: 'paddle',
      planCode,
      ...(billingTerm ? { billingTerm } : {}),
      status,
      seatLimit: PLAN_SEATS[planCode] || 1,
      paidPeriodStartsAt: periodStart,
      currentPeriodEndsAt: periodEnd || (user.subscription && user.subscription.currentPeriodEndsAt) || null,
      cancelAtPeriodEnd: !!(sub.scheduled_change && sub.scheduled_change.action === 'cancel'),
      paddleCustomerId: sub.customer_id || '',
      paddleSubscriptionId: sub.id,
      lastPaddleEventAt: occurredAt || nowIso(),
    };

    // Access window. GRANT-side facts extend; the ONE deny-side fact that may
    // close the window is a CONFIRMED FINAL CANCELLATION (subscription.canceled)
    // — the explicit exception the fail-open principle allows. past_due,
    // refunds and ordering gaps still never shorten anything. A separate
    // marketing grant (user.grant, outside Paddle) keeps its own window.
    const isFinalCancel = eventType === 'subscription.canceled';
    const grantEndMs = user.grant && user.grant.endsAt ? Date.parse(user.grant.endsAt) : null;
    let windowPatch;
    if (isFinalCancel) {
      const floor = Math.max(Date.now(), grantEndMs && grantEndMs > Date.now() ? grantEndMs : 0);
      windowPatch = { accessUntilTs: Timestamp.fromMillis(floor) };
    } else {
      windowPatch = extendWindowPatch(user.accessUntilTs, periodEnd ? Date.parse(periodEnd) : null);
    }

    const patch = {
      subscription,
      billingChannel: 'paddle',
      paddleCustomerId: sub.customer_id || '',
      paddleSubscriptionId: sub.id,
      ...windowPatch,
    };
    // Team sync — MUST run before tx.update(userRef, patch): a new org adds
    // orgId/orgRole to `patch`, and the SDK serializes the object at call
    // time, so mutating it after the update would silently drop those fields.
    // The admin's org mirrors status + window; members derive access from the
    // org at rules level (no per-member fan-out to miss).
    if (planCode === 'team_3' || planCode === 'team_5') {
      if (orgSnap && orgSnap.exists) {
        tx.update(orgSnap.ref, {
          planCode,
          seatLimit: PLAN_SEATS[planCode],
          subscriptionStatus: status,
          currentPeriodEndsAt: periodEnd || orgSnap.data().currentPeriodEndsAt || null,
          ...(isFinalCancel
            ? { accessUntilTs: Timestamp.fromMillis(Date.now()) }
            : extendWindowPatch(orgSnap.data().accessUntilTs, periodEnd ? Date.parse(periodEnd) : null)),
        });
      } else if (!isFinalCancel && ['active', 'trialing'].includes(status) && !user.orgId) {
        // Direct team-plan CHECKOUT (no pre-created team-trial org): the org
        // must exist or the buyer gets a Team badge with no seat management —
        // found 2026-08-04 when the E2E upgrade produced exactly that. Created
        // here, in the same transaction as the subscription facts, so a team
        // purchase is always self-sufficient regardless of the path taken.
        const orgRef = db.collection('organizations').doc();
        const email = emailKey(user.email || '');
        const memberName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        tx.set(orgRef, {
          name: user.companyName || '',
          ownerUid: uid,
          ownerEmail: email,
          planCode,
          seatLimit: PLAN_SEATS[planCode],
          subscriptionStatus: status,
          trialEndsAt: null,
          currentPeriodEndsAt: periodEnd || null,
          ...(periodEnd ? { accessUntilTs: Timestamp.fromMillis(Date.parse(periodEnd)) } : {}),
          members: [{ uid, email, ...(memberName ? { name: memberName } : {}) }],
          memberUids: [uid],
          invitedEmails: [],
          invitedAt: {},
          companyName: user.companyName || '',
          companyType: user.companyType || '',
          createdAt: nowIso(),
        });
        patch.orgId = orgRef.id;
        patch.orgRole = 'team_admin';
      }
    }

    tx.update(userRef, patch);


    // Free-grant overlap: a paying subscription arrived while a marketing
    // grant window is still open. Auto-conversion is the designed outcome
    // (subscription now leads); park a bookkeeping note for the admin.
    if (eventType === 'subscription.activated' && grantEndMs && grantEndMs > Date.now()) {
      tx.set(db.collection('paddleAdjustments').doc(`grant-overlap-${uid}`), {
        kind: 'grant-overlap', uid, subscriptionId: sub.id,
        grantEndsAt: user.grant.endsAt, planCode,
        note: 'Paying subscription started during an active free grant — auto-converted; review for bookkeeping only.',
        needsAdminReview: true, createdAt: nowIso(),
      }, { merge: true });
    }
  });
}

/** transaction.completed — a successful charge (first or renewal): extend. */
async function applyTransactionCompleted(txn, occurredAt) {
  if (!txn.subscription_id) return;
  const periodEnd = txn.billing_period && txn.billing_period.ends_at ? txn.billing_period.ends_at : null;
  if (!periodEnd) return;
  const custom = txn.custom_data || {};
  let uid = custom.userId;
  if (!uid) {
    const q = await db.collection('users').where('paddleSubscriptionId', '==', txn.subscription_id).limit(1).get();
    if (q.empty) return;
    uid = q.docs[0].id;
  }
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const user = snap.data();
    // All reads before any writes (Firestore transaction contract).
    const orgId = custom.orgId || user.orgId;
    let orgSnap = null;
    if (orgId) orgSnap = await tx.get(db.collection('organizations').doc(orgId));

    const patch = {
      ...extendWindowPatch(user.accessUntilTs, Date.parse(periodEnd)),
      ...(user.subscription ? { 'subscription.currentPeriodEndsAt': periodEnd, 'subscription.status': 'active' } : {}),
    };
    if (Object.keys(patch).length) tx.update(userRef, patch);
    if (orgSnap && orgSnap.exists && orgSnap.data().ownerUid === uid) {
      tx.update(orgSnap.ref, {
        subscriptionStatus: 'active',
        currentPeriodEndsAt: periodEnd,
        ...extendWindowPatch(orgSnap.data().accessUntilTs, Date.parse(periodEnd)),
      });
    }
  });
}

/** Adjustments (refunds / chargebacks / credits): AUDIT ONLY, never access. */
async function recordAdjustment(adj, eventType, occurredAt) {
  await db.collection('paddleAdjustments').doc(adj.id).set({
    id: adj.id,
    action: adj.action || '',
    status: adj.status || '',
    type: adj.type || '',
    transactionId: adj.transaction_id || '',
    subscriptionId: adj.subscription_id || '',
    customerId: adj.customer_id || '',
    reason: adj.reason || '',
    eventType,
    occurredAt: occurredAt || nowIso(),
    updatedAt: nowIso(),
    // Chargebacks and full approved refunds are surfaced to the admin console
    // as review items — by design they change NOTHING automatically.
    needsAdminReview: ['chargeback', 'chargeback_warning', 'refund'].some(a => (adj.action || '').startsWith(a)),
  }, { merge: true });
}

async function paddleWebhook(req, res) {
  // Network-level filter first (cheap), signature second (authoritative).
  const ip = callerIp(req);
  if (!ipAllowed(ip, await paddleIpAllowlist())) {
    console.warn('webhook rejected: source IP not in Paddle allowlist', ip);
    return res.status(403).send('forbidden');
  }
  if (!verifyPaddleSignature(req)) return res.status(401).send('bad signature');

  const event = req.body || {};
  const eventId = event.event_id;
  const eventType = event.event_type || '';
  const occurredAt = event.occurred_at || '';
  const data = event.data || {};
  if (!eventId) return res.status(400).send('no event id');

  // Idempotency: each Paddle event applies exactly once.
  const evtRef = db.collection('paddleWebhookEvents').doc(eventId);
  const fresh = await db.runTransaction(async (tx) => {
    const snap = await tx.get(evtRef);
    if (snap.exists) return false;
    tx.set(evtRef, { eventType, occurredAt, receivedAt: nowIso() });
    return true;
  });
  if (!fresh) return res.status(200).send('duplicate');

  try {
    if (eventType.startsWith('subscription.')) {
      await applySubscriptionEvent(data, eventType, occurredAt);
    } else if (eventType === 'transaction.completed') {
      await applyTransactionCompleted(data, occurredAt);
    } else if (eventType.startsWith('adjustment.')) {
      await recordAdjustment(data, eventType, occurredAt);
    }
    // Everything else: acknowledged and ignored.
    return res.status(200).send('ok');
  } catch (e) {
    // Processing failure must NOT translate into user lockout — log, flag for
    // admin, and return 200 so Paddle does not hammer retries against a bug.
    // (The event doc above keeps the id; reconciliation can replay from Paddle.)
    console.error(`webhook ${eventType} ${eventId} failed`, e);
    await evtRef.set({ processingError: String(e && e.message || e), needsAdminReview: true }, { merge: true }).catch(() => {});
    return res.status(200).send('recorded-with-error');
  }
}

// ---------------------------------------------------------------------------
// Subscription self-service + admin ops via the Paddle API (2026-08-03)
// ---------------------------------------------------------------------------

const PLAN_RANK = { professional: 1, team_3: 2, team_5: 3 };
const TERM_RANK = { monthly: 1, six_months: 2, annual: 3 };
const CHANGE_COOLDOWN_DAYS = 30;

/**
 * /cancelSubscription — the user's own IMMEDIATE cancellation. The client has
 * shown the two-step warning (remaining paid time is forfeited, no refund).
 * Paddle is the source of truth: we call its cancel API and let the
 * subscription.canceled webhook write the final state; a local best-effort
 * mark makes the UI honest right away (idempotent with the webhook).
 */
async function cancelSubscription(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const userRef = db.collection('users').doc(caller.uid);
  const snap = await userRef.get();
  if (!snap.exists) return sendErr(res, 404, 'no-profile');
  const user = snap.data();
  const subId = user.paddleSubscriptionId;
  if (!subId || !user.subscription) return sendErr(res, 400, 'no-subscription');
  if (user.subscription.status === 'canceled') return res.status(200).json({ ok: true, alreadyCanceled: true });

  await paddleApi('POST', `/subscriptions/${subId}/cancel`, { effective_from: 'immediately' });

  const grantEndMs = user.grant && user.grant.endsAt ? Date.parse(user.grant.endsAt) : null;
  const floor = Math.max(Date.now(), grantEndMs && grantEndMs > Date.now() ? grantEndMs : 0);
  await userRef.update({
    'subscription.status': 'canceled',
    accessUntilTs: Timestamp.fromMillis(floor),
  }).catch(() => {});
  if (user.orgId && user.orgRole === 'team_admin') {
    await db.collection('organizations').doc(user.orgId).update({
      subscriptionStatus: 'canceled', accessUntilTs: Timestamp.fromMillis(Date.now()),
    }).catch(() => {});
  }
  return res.status(200).json({ ok: true });
}

/**
 * /billingPortal — mint a Paddle customer-portal session for the signed-in
 * subscriber and return its authenticated URL. Portal links carry temporary
 * tokens and must never be stored (Paddle docs), so this happens on every
 * click. The portal is where customers manage payment methods, download
 * invoices and stop the next renewal (period-end cancellation).
 * Requires the API key permission "Customer portal session (Write)".
 */
async function billingPortal(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return sendErr(res, 401, 'unauthenticated');
  const snap = await db.collection('users').doc(caller.uid).get();
  if (!snap.exists) return sendErr(res, 404, 'no-profile');
  const user = snap.data();
  const ctm = user.paddleCustomerId;
  if (!ctm) return sendErr(res, 400, 'no-paddle-customer');
  const body = user.paddleSubscriptionId ? { subscription_ids: [user.paddleSubscriptionId] } : {};
  const session = await paddleApi('POST', `/customers/${ctm}/portal-sessions`, body);
  const url = session && session.urls && session.urls.general && session.urls.general.overview;
  if (!url) return sendErr(res, 502, 'portal-url-missing');
  return res.status(200).json({ ok: true, url });
}

/**
 * /applyPlanChange — admin approves a scheduled change request. UPGRADE-ONLY
 * (owner rule 2026-08-03): plan and term may each only move up, never down —
 * mid-term shrinking creates credits/proration the operation cannot settle
 * cleanly across five VAT regimes. Applied via the Paddle API with
 * do_not_bill: the upgrade is effective immediately, nothing is charged for
 * the remainder of the current period, and the next renewal bills the new
 * price. custom_data is refreshed so it can never contradict the items.
 * One change per 30 days per subscriber.
 */
async function applyPlanChange(req, res) {
  const adminCaller = await verifyAdmin(req);
  if (!adminCaller) return sendErr(res, 403, 'admin-only');
  const requestId = req.body && req.body.requestId;
  if (!requestId) return sendErr(res, 400, 'missing-requestId');

  const reqRef = db.collection('subscriptionChangeRequests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) return sendErr(res, 404, 'request-not-found');
  const change = reqSnap.data();
  if (change.status !== 'scheduled') return sendErr(res, 409, 'request-not-scheduled');

  const userRef = db.collection('users').doc(change.userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return sendErr(res, 404, 'user-not-found');
  const user = userSnap.data();
  const sub = user.subscription;
  const subId = user.paddleSubscriptionId;
  if (!sub || !subId || !['active', 'trialing'].includes(sub.status)) return sendErr(res, 409, 'no-active-subscription');

  const curPlan = sub.planCode, curTerm = sub.billingTerm || 'monthly';
  const newPlan = change.requestedPlanCode, newTerm = change.requestedBillingTerm || curTerm;
  const planUp = (PLAN_RANK[newPlan] || 0) - (PLAN_RANK[curPlan] || 0);
  const termUp = (TERM_RANK[newTerm] || 0) - (TERM_RANK[curTerm] || 0);
  if (planUp < 0 || termUp < 0) return sendErr(res, 422, 'downgrade-not-allowed');
  if (planUp === 0 && termUp === 0) return sendErr(res, 422, 'no-change');

  const last = user.lastPlanChangeAt ? Date.parse(user.lastPlanChangeAt) : null;
  if (last && Date.now() - last < CHANGE_COOLDOWN_DAYS * 86400000) return sendErr(res, 429, 'change-cooldown');

  const priceId = priceIdFor(newPlan, newTerm);
  if (!priceId) return sendErr(res, 422, 'unknown-price');

  await paddleApi('PATCH', `/subscriptions/${subId}`, {
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: 'do_not_bill',
    custom_data: {
      userId: change.userId, planCode: newPlan, billingTerm: newTerm,
      country: user.country || '', orgId: user.orgId || '',
    },
  });

  await reqRef.update({ status: 'applied', appliedAt: nowIso(), appliedBy: adminCaller.uid });
  await userRef.update({ lastPlanChangeAt: nowIso() }).catch(() => {});
  // The subscription.updated webhook writes the new plan/seat state; the org
  // seat limit follows through the same path.
  return res.status(200).json({ ok: true, appliedPriceId: priceId });
}

/**
 * /createDiscount — admin creates a REAL Paddle discount; the client keeps a
 * bookkeeping copy in `promotions`. Paddle owns validity/redemption; nothing
 * on our side computes prices.
 */
async function createDiscount(req, res) {
  const adminCaller = await verifyAdmin(req);
  if (!adminCaller) return sendErr(res, 403, 'admin-only');
  const b = req.body || {};
  if (!b.description || !b.type || !b.amount) return sendErr(res, 400, 'missing-fields');
  if (!['percentage', 'flat'].includes(b.type)) return sendErr(res, 400, 'bad-type');

  const restrict = Array.isArray(b.restrictToPlans) && b.restrictToPlans.length
    ? b.restrictToPlans
        .map((k) => { const [pl, tm] = String(k).split('/'); return priceIdFor(pl, tm); })
        .filter(Boolean)
    : null;

  const payload = {
    description: String(b.description).slice(0, 500),
    type: b.type,
    amount: String(b.amount),
    ...(b.type === 'flat' ? { currency_code: 'EUR' } : {}),
    ...(b.code ? { code: String(b.code).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32).toUpperCase() } : {}),
    enabled_for_checkout: b.enabledForCheckout !== false,
    ...(b.recur ? { recur: true, maximum_recurring_intervals: b.maxRecurringIntervals ? Number(b.maxRecurringIntervals) : null } : {}),
    ...(b.expiresAt ? { expires_at: new Date(b.expiresAt).toISOString() } : {}),
    ...(b.usageLimit ? { usage_limit: Number(b.usageLimit) } : {}),
    ...(restrict ? { restrict_to: restrict } : {}),
  };
  const created = await paddleApi('POST', '/discounts', payload);
  return res.status(200).json({ ok: true, discount: { id: created.id, code: created.code || null, status: created.status } });
}

/** /archiveDiscount — retire a Paddle discount so it can no longer be used. */
async function archiveDiscount(req, res) {
  const adminCaller = await verifyAdmin(req);
  if (!adminCaller) return sendErr(res, 403, 'admin-only');
  const id = req.body && req.body.discountId;
  if (!id) return sendErr(res, 400, 'missing-discountId');
  await paddleApi('PATCH', `/discounts/${id}`, { status: 'archived' });
  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------
// Member email — support@heatpumpdb.eu (Zoho SMTP)
//
// WHY THIS IS SERVER-SIDE AND ADMIN-ONLY
// The service publishes support@heatpumpdb.eu in its legal pages, so that is
// the address a member must be able to reply to. Sending as that address needs
// the mailbox credential, which can never reach a browser: anything that can
// send as the company can impersonate it. The client sends { uid, subject,
// body } and the server decides who it is allowed to reach.
//
// WHY ZOHO AND NOT AN ESP
// heatpumpdb.eu already runs its mail on Zoho (MX zoho.eu) with SPF
// (include:zohomail.eu) and DKIM (zoho._domainkey) published. Sending through
// the mailbox that owns the domain means both pass with no new vendor, no new
// DNS, and replies land in the inbox a human already reads. An ESP would need
// its own domain authentication and would put replies somewhere else.
//
// EVERY SEND IS RECORDED. A notice about someone's account — a suspension
// above all — is the kind of message that gets disputed later, so the message
// as sent, who sent it and when are written to `memberEmails` before the
// caller gets a response. A failed send is recorded too: silence about a
// notice we believe we sent is worse than a visible failure.
// ---------------------------------------------------------------------------

const SUPPORT_FROM = process.env.SUPPORT_FROM || 'support@heatpumpdb.eu';
// smtpPRO, not smtp: Zoho serves organisation accounts on the pro hosts, and
// the account's own POP/IMAP page is the authority for which one applies.
const SMTP_HOST = process.env.SMTP_HOST || 'smtppro.zoho.eu';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || SUPPORT_FROM;
const SMTP_PASS = process.env.SMTP_PASS || '';

let mailer = null;
function transport() {
  if (mailer) return mailer;
  if (!SMTP_PASS) return null;                       // not configured — refuse loudly, never pretend
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return mailer;
}

/* ── Letterhead ───────────────────────────────────────────────────────────────
   An account notice is read as either genuine or as phishing, and a wall of
   unstyled text from an address the reader has never written to lands on the
   wrong side of that. The letterhead exists to answer "is this really them" in
   the first second — nothing more, so it stays a logo, a signature and a line
   saying who the message was sent to.

   BOTH IMAGES ARE THE EXISTING BRAND ASSETS, RESIZED — never redrawn. The
   lockup is brand-assets/png/heatpumpdb-3a-lockup-light-4x.png and the mark is
   the EU app icon public/icons/eu-192.png (the unbadged HP DB mark, which is
   what the EU edition uses). deploy.sh copies them in.

   They travel as CID attachments rather than URLs: a remote image is blocked by
   default in most clients until the reader clicks "load images", which is
   exactly the moment a suspension notice looks fake. It also means the mail
   renders with no request back to us — nothing to log, nothing to track.

   Every style is inline and the layout is tables, because Outlook still drops a
   <style> block and does not do flex. Sent as text AND html: the plain part is
   the message of record, and it is what a screen reader and a text-only client
   get. */

const MAIL_ASSETS = [
  { cid: 'hpdb-logo', file: 'logo.png' },
  { cid: 'hpdb-mark', file: 'mark.png' },
];
function mailAttachments() {
  const path = require('node:path');
  const fs = require('node:fs');
  const out = [];
  for (const a of MAIL_ASSETS) {
    const p = path.join(__dirname, 'mail-assets', a.file);
    // A missing asset must not stop a suspension notice going out; the mail
    // simply renders without that image.
    if (fs.existsSync(p)) out.push({ filename: a.file, path: p, cid: a.cid });
  }
  return out;
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text → paragraphs. Blank line starts one; a single newline breaks. */
function bodyHtml(text) {
  return String(text).trim().split(/\n\s*\n/).map((para) =>
    `<p style="margin:0 0 15px;">${esc(para).replace(/\n/g, '<br>')}</p>`).join('');
}

const TEXT_SIGNATURE = `

--
HeatPump DataBase Europe
${SUPPORT_FROM}
Germany · France · United Kingdom · Poland · Italy`;

/** Images as data: URIs — for the PREVIEW only, where a cid: reference has no
 *  message to resolve against. Real sends keep cid: (see the note above). */
function inlineAssets(html) {
  const path = require('node:path');
  const fs = require('node:fs');
  let out = html;
  for (const a of MAIL_ASSETS) {
    const p = path.join(__dirname, 'mail-assets', a.file);
    if (!fs.existsSync(p)) continue;
    out = out.replace(`cid:${a.cid}`, `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`);
  }
  return out;
}

function letterhead(bodyText, to) {
  const INK = '#1d1d1f', MUTED = '#6e6e73', FAINT = '#9a9aa0', LINE = '#ececf0';
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>HeatPump DB</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f6;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:14px;">
  <tr><td style="padding:26px 32px 18px;border-bottom:1px solid ${LINE};">
    <img src="cid:hpdb-logo" width="180" height="33" alt="HeatPump DB"
         style="display:block;border:0;outline:none;text-decoration:none;height:auto;">
  </td></tr>
  <tr><td style="padding:26px 32px 8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">
    ${bodyHtml(bodyText)}
  </td></tr>
  <tr><td style="padding:10px 32px 0;"><div style="border-top:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:18px 32px 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="48" valign="top" style="width:48px;">
        <img src="cid:hpdb-mark" width="44" height="44" alt=""
             style="display:block;border:0;border-radius:10px;">
      </td>
      <td valign="top" style="padding-left:14px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <!-- Two lines at 22px each = 44px, the height of the mark beside them.
             Line-height is in PIXELS, not a ratio: a ratio is resolved against
             each client's own default font size, and the alignment would drift
             by a few pixels in every one of them. -->
        <div style="font-size:15px;line-height:22px;font-weight:600;color:${INK};">HeatPump DataBase Europe</div>
        <div style="font-size:14px;line-height:22px;color:${MUTED};">
          <a href="mailto:${SUPPORT_FROM}" style="color:#0066cc;text-decoration:none;">${SUPPORT_FROM}</a>
        </div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:16px 32px 26px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:${FAINT};">
    Germany · France · United Kingdom · Poland · Italy<br>
    This message was sent to ${esc(to)} about that HeatPump DB account. Replies reach our support team.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Message kinds an admin may send. Free text is still the admin's, but the
 *  kind is what the member record and the audit log are searchable by. */
const MEMBER_EMAIL_KINDS = ['suspension', 'verification_request', 'reactivation', 'support_reply', 'notice'];

async function sendMemberEmail(req, res) {
  const admin = await verifyAdmin(req);
  if (!admin) return sendErr(res, 403, 'admin-only');

  const { uid, subject, body, kind } = req.body || {};
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(String(uid || ''))) return sendErr(res, 400, 'bad-uid');
  const subj = String(subject || '').trim();
  const text = String(body || '').trim();
  if (subj.length < 3 || subj.length > 200) return sendErr(res, 400, 'bad-subject');
  if (text.length < 10 || text.length > 20000) return sendErr(res, 400, 'bad-body');
  const k = MEMBER_EMAIL_KINDS.includes(kind) ? kind : 'notice';

  // The recipient is resolved from the account, never taken from the request:
  // an admin console may address a MEMBER, not an arbitrary address.
  const snap = await db.collection('users').doc(String(uid)).get();
  if (!snap.exists) return sendErr(res, 404, 'no-such-user');
  const to = String(snap.data().email || '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return sendErr(res, 400, 'user-has-no-email');

  const record = {
    uid: String(uid), to, subject: subj, body: text, kind: k,
    sentByUid: admin.uid, sentByEmail: admin.email || null,
    at: nowIso(),
  };

  const tx = transport();
  if (!tx) {
    await db.collection('memberEmails').add({ ...record, ok: false, error: 'smtp-not-configured' });
    return sendErr(res, 503, 'smtp-not-configured');
  }

  try {
    const info = await tx.sendMail({
      from: `HeatPump DB Support <${SUPPORT_FROM}>`,
      to, replyTo: SUPPORT_FROM, subject: subj,
      text: text + TEXT_SIGNATURE,
      html: letterhead(text, to),
      attachments: mailAttachments(),
    });
    await db.collection('memberEmails').add({ ...record, ok: true, messageId: info.messageId || null });
    await db.collection('opsAuditLog').add({
      action: 'sendMemberEmail', targetUid: String(uid), kind: k, subject: subj,
      by: admin.email || admin.uid, at: record.at,
    });
    return res.status(200).json({ ok: true, to, messageId: info.messageId || null });
  } catch (e) {
    console.error('sendMemberEmail failed', e);
    await db.collection('memberEmails').add({ ...record, ok: false, error: String(e && e.message || e).slice(0, 500) });
    return sendErr(res, 502, 'send-failed');
  }
}

/** Exactly what a send would produce, without sending it. The composer shows
 *  this rather than reimplementing the letterhead: a preview that drifts from
 *  the real thing is worse than no preview. */
async function previewMemberEmail(req, res) {
  const admin = await verifyAdmin(req);
  if (!admin) return sendErr(res, 403, 'admin-only');
  const { uid, body } = req.body || {};
  const text = String(body || '').trim();
  if (!text) return sendErr(res, 400, 'bad-body');

  let to = 'member@example.com';
  if (/^[A-Za-z0-9_-]{6,128}$/.test(String(uid || ''))) {
    const snap = await db.collection('users').doc(String(uid)).get();
    if (snap.exists && snap.data().email) to = String(snap.data().email);
  }
  return res.status(200).json({ ok: true, html: inlineAssets(letterhead(text, to)) });
}

/** The messages already sent to one member — shown on the admin member page. */
async function listMemberEmails(req, res) {
  const admin = await verifyAdmin(req);
  if (!admin) return sendErr(res, 403, 'admin-only');
  const uid = String((req.body || {}).uid || '');
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return sendErr(res, 400, 'bad-uid');
  const snap = await db.collection('memberEmails').where('uid', '==', uid).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 50);
  return res.status(200).json({ ok: true, items });
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------
functions.http('accountBilling', async (req, res) => {
  if (applyCors(req, res)) return;
  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  try {
    if (path.endsWith('/health') || (path === '/' && req.method === 'GET')) {
      return res.status(200).json({ ok: true, service: 'accountBilling' });
    }
    if (req.method !== 'POST') return sendErr(res, 405, 'method-not-allowed');
    if (path.endsWith('/finalizeSignup')) return await finalizeSignup(req, res);
    if (path.endsWith('/createTeamOrg')) return await createTeamOrg(req, res);
    if (path.endsWith('/deleteAccount')) return await deleteAccount(req, res);
    if (path.endsWith('/paddleWebhook')) return await paddleWebhook(req, res);
    if (path.endsWith('/rollbackStatus')) return await rollbackStatus(req, res);
    if (path.endsWith('/panicRollback')) return await panicRollback(req, res);
    if (path.endsWith('/sessionHeartbeat')) return await sessionHeartbeat(req, res);
    if (path.endsWith('/revokeSession')) return await revokeSession(req, res);
    if (path.endsWith('/revokeOtherSessions')) return await revokeOtherSessions(req, res);
    if (path.endsWith('/signOutEverywhere')) return await signOutEverywhere(req, res);
    if (path.endsWith('/adminClearSessions')) return await adminClearSessions(req, res);
    if (path.endsWith('/sendMemberEmail')) return await sendMemberEmail(req, res);
    if (path.endsWith('/listMemberEmails')) return await listMemberEmails(req, res);
    if (path.endsWith('/previewMemberEmail')) return await previewMemberEmail(req, res);
    if (path.endsWith('/cancelSubscription')) return await cancelSubscription(req, res);
    if (path.endsWith('/billingPortal')) return await billingPortal(req, res);
    if (path.endsWith('/applyPlanChange')) return await applyPlanChange(req, res);
    if (path.endsWith('/createDiscount')) return await createDiscount(req, res);
    if (path.endsWith('/archiveDiscount')) return await archiveDiscount(req, res);
    return sendErr(res, 404, 'not-found');
  } catch (e) {
    console.error(`accountBilling ${path} error`, e);
    return sendErr(res, 500, 'internal');
  }
});
