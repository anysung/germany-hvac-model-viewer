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
    const planCode = custom.planCode || (user.subscription && user.subscription.planCode) || 'professional';
    const billingTerm = custom.billingTerm || (user.subscription && user.subscription.billingTerm) || null;
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

    const patch = {
      subscription,
      billingChannel: 'paddle',
      paddleCustomerId: sub.customer_id || '',
      paddleSubscriptionId: sub.id,
      // Extend-only: canceled/past_due keep whatever window is already paid.
      ...extendWindowPatch(user.accessUntilTs, periodEnd ? Date.parse(periodEnd) : null),
    };
    tx.update(userRef, patch);

    // Team sync: the admin's org mirrors status + window; members derive
    // access from the org at rules level (no per-member fan-out to miss).
    if (orgSnap && orgSnap.exists && (planCode === 'team_3' || planCode === 'team_5')) {
      tx.update(orgSnap.ref, {
        planCode,
        seatLimit: PLAN_SEATS[planCode],
        subscriptionStatus: status,
        currentPeriodEndsAt: periodEnd || orgSnap.data().currentPeriodEndsAt || null,
        ...extendWindowPatch(orgSnap.data().accessUntilTs, periodEnd ? Date.parse(periodEnd) : null),
      });
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
    return sendErr(res, 404, 'not-found');
  } catch (e) {
    console.error(`accountBilling ${path} error`, e);
    return sendErr(res, 500, 'internal');
  }
});
