/**
 * subscriptionService — organizations (Team 3/5 seats), free-access grants
 * (admin promotions) and renewal-time change requests.
 *
 * Ownership of writes (mirrors firestore.rules):
 *   - user.subscription entitlement: billing webhook / admin / free-grant
 *     redemption only — never plain client code.
 *   - organizations: created by admin (or webhook later). The org OWNER may
 *     manage seats (members / invitedEmails / keepMemberUids / name) but can
 *     never touch planCode / seatLimit / status. An INVITED user may join
 *     (add self to members, remove own email from invitedEmails).
 *   - freeAccessGrants: admin-only writes; the matching user may redeem
 *     (rules validate the grant window server-side).
 *   - subscriptionChangeRequests: the subscriber schedules/cancels their own;
 *     applied at renewal by ops/webhook — never mid-term.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField,
  query, where, arrayUnion, arrayRemove, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  User, Organization, FreeAccessGrant, SubscriptionChangeRequest, UserSubscription, UserGrant, Promotion,
} from '../types';
import {
  SubPlanCode, BillingTerm, SUB_PLANS, TERM_MONTHS, isTeamPlan,
} from '../config/subscriptionPlans';

const ORGS = 'organizations';
const GRANTS = 'freeAccessGrants';
const PROMOS = 'promotions';
const CHANGES = 'subscriptionChangeRequests';

const nowIso = () => new Date().toISOString();
export const emailKey = (email: string) => email.trim().toLowerCase();

// ── Organizations (Team 3 / Team 5) ─────────────────────────────────────────

export async function getOrg(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, ORGS, orgId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Organization) : null;
}

export async function getMyOrg(user: User): Promise<Organization | null> {
  if (!user.orgId) return null;
  const org = await getOrg(user.orgId);
  // Stale pointer (removed member): treat as no team.
  if (org && !org.members.some(m => m.uid === user.id)) return null;
  return org;
}

/** Seats currently occupied or reserved by an open invitation. */
export const seatsUsed = (org: Organization): number =>
  org.members.length + (org.invitedEmails?.length ?? 0);

/** The uids occupying seats — `memberUids` when present, else derived (legacy orgs). */
export const orgMemberUids = (org: Organization): string[] =>
  org.memberUids ?? org.members.map(m => m.uid);

/**
 * The ONLY way to write org membership.
 *
 * `memberUids` is what the security rules read (they cannot look inside the
 * member maps), so the two must never diverge. Deriving the uid list from the
 * member list right here makes that structural rather than a convention: there
 * is no code path that can update one without the other, and both land in a
 * single document write, which Firestore applies atomically.
 */
type OrgMember = Organization['members'][number];
const membersPatch = (members: OrgMember[]) => ({
  members,
  memberUids: members.map(m => m.uid),
});

/** Team owner: invite a member into a free seat (replacement is allowed anytime). */
export async function inviteMember(org: Organization, email: string): Promise<void> {
  const key = emailKey(email);
  if (org.members.some(m => emailKey(m.email) === key)) throw new Error('already-member');
  if ((org.invitedEmails ?? []).includes(key)) throw new Error('already-invited');
  if (seatsUsed(org) >= org.seatLimit) throw new Error('no-seats');
  await updateDoc(doc(db, ORGS, org.id), {
    invitedEmails: arrayUnion(key),
    invitedAt: { ...(org.invitedAt ?? {}), [key]: nowIso() },
  });
}

/** Re-issue an open invitation (refreshes its date; the link itself is unchanged). */
export async function resendInvite(org: Organization, email: string): Promise<void> {
  const key = emailKey(email);
  if (!(org.invitedEmails ?? []).includes(key)) throw new Error('not-invited');
  await updateDoc(doc(db, ORGS, org.id), { invitedAt: { ...(org.invitedAt ?? {}), [key]: nowIso() } });
}

export async function cancelInvite(org: Organization, email: string): Promise<void> {
  const key = emailKey(email);
  const rest = { ...(org.invitedAt ?? {}) };
  delete rest[key];
  await updateDoc(doc(db, ORGS, org.id), { invitedEmails: arrayRemove(key), invitedAt: rest });
}

/** Team owner: free a seat. Never touches the Paddle subscription. */
export async function removeMember(org: Organization, uid: string): Promise<void> {
  if (uid === org.ownerUid) throw new Error('cannot-remove-owner');
  if (!org.members.some(m => m.uid === uid)) return;
  await updateDoc(doc(db, ORGS, org.id), {
    ...membersPatch(org.members.filter(m => m.uid !== uid)),
    keepMemberUids: arrayRemove(uid),
  });
  // The removed person keeps their personal account — only the team link goes.
  await updateDoc(doc(db, 'users', uid), { orgId: deleteField(), orgRole: deleteField() }).catch(() => {});
}

/**
 * Team member: leave the team. Frees the seat, keeps the personal account, and
 * never touches the team subscription. The owner cannot use this (they would
 * strand the team — ownership transfer goes through Support).
 */
export async function leaveTeam(org: Organization, user: User): Promise<void> {
  if (user.id === org.ownerUid) throw new Error('owner-cannot-leave');
  if (org.members.some(m => m.uid === user.id)) {
    await updateDoc(doc(db, ORGS, org.id), {
      ...membersPatch(org.members.filter(m => m.uid !== user.id)),
      keepMemberUids: arrayRemove(user.id),
    });
  }
  await updateDoc(doc(db, 'users', user.id), { orgId: deleteField(), orgRole: deleteField() });
}

/** Team owner: the company profile the whole team inherits. */
export async function updateOrgCompany(
  org: Organization,
  company: Pick<Organization, 'companyName' | 'companyType' | 'companyTypeOther' | 'companyCity' | 'companyWebsite'>,
): Promise<void> {
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(company)) if (v !== undefined) patch[k] = v;
  // `name` is the legacy display field — keep it in step so admin views agree.
  if (company.companyName !== undefined) patch.name = company.companyName;
  await updateDoc(doc(db, ORGS, org.id), patch);
}

/** Choose which members keep seats on a scheduled downgrade. */
export async function setKeepMembers(org: Organization, keepUids: string[]): Promise<void> {
  await updateDoc(doc(db, ORGS, org.id), { keepMemberUids: keepUids });
}

/**
 * Claim a seat in a SPECIFIC organization. The invitation link names the org, so
 * we join that one — never "whichever org happens to list this email first",
 * which could otherwise put the profile pointer and the membership in different
 * organizations when someone is invited to two teams.
 *
 * Every check here is mirrored server-side by firestore.rules: the caller's email
 * must be in the org's invitedEmails, the added seat must be the caller's own,
 * and the seat limit must still hold. Passing a foreign orgId or a foreign email
 * therefore fails at the database, not just here.
 */
export async function joinOrg(orgId: string, user: User): Promise<Organization | null> {
  const key = emailKey(user.email);
  const org = await getOrg(orgId);
  if (!org) return null;                                        // unknown organization
  if (!(org.invitedEmails ?? []).includes(key)) return null;    // not invited / invitation withdrawn or already used
  if (org.members.some(m => m.uid === user.id)) return org;     // already joined — invitation cannot be reused
  if (org.members.length >= org.seatLimit) return null;         // seat refilled meanwhile

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const members = [...org.members, { uid: user.id, email: key, ...(name ? { name } : {}) }];
  const invitedAt = { ...(org.invitedAt ?? {}) };
  delete invitedAt[key];

  await updateDoc(doc(db, ORGS, org.id), {
    ...membersPatch(members),
    invitedEmails: (org.invitedEmails ?? []).filter(e => e !== key),
    invitedAt,
  });
  await updateDoc(doc(db, 'users', user.id), { orgId: org.id, orgRole: 'member' });
  return { ...org, ...membersPatch(members) };
}

/**
 * Invited user with no invitation link to hand (they simply signed in): find the
 * org that invited this email and join it. Same guarantees as joinOrg — this only
 * resolves the org id.
 */
export async function joinOrgIfInvited(user: User): Promise<Organization | null> {
  const key = emailKey(user.email);
  const q = query(collection(db, ORGS), where('invitedEmails', 'array-contains', key));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return joinOrg(snap.docs[0].id, user);
}

// ── Admin subscription writes: REMOVED (owner decision 2026-08-03) ──────────
// The paid `subscription` slot has exactly one writer — the Paddle webhook.
// Admin tooling manages the GRANT layer (createGrant / revokeGrant below) and
// applies approved upgrades through the billing function, which goes through
// the Paddle API so the webhook remains the only writer.

// ── Free-access grants (admin promotions) ───────────────────────────────────

/* ── Promotions (discount campaign registry) ─────────────────────────────────
 * Bookkeeping only: Paddle owns the discounts themselves (immutable once used,
 * created by a human in the dashboard). Nothing on the payment path reads these
 * records, so a wrong entry can misinform but can never break a checkout.
 * See types.ts Promotion for the full rationale. */

export async function listPromotions(): Promise<Promotion[]> {
  const snap = await getDocs(collection(db, PROMOS));
  return snap.docs.map(d => d.data() as Promotion)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** Admin: register a campaign. The code is the doc id, so re-saving the same
 *  code updates it rather than creating a duplicate. */
export async function savePromotion(p: Omit<Promotion, 'createdAt' | 'createdBy'> & {
  createdAt?: string; createdBy?: string;
}): Promise<void> {
  const code = p.code.trim().toUpperCase();
  if (!code) throw new Error('promotion code required');
  await setDoc(doc(db, PROMOS, code), {
    ...p,
    code,
    createdAt: p.createdAt ?? nowIso(),
    createdBy: p.createdBy ?? 'Admin',
  }, { merge: true });
}

/** Retire a campaign. Kept (never deleted) so past promotions stay reportable. */
export async function archivePromotion(code: string): Promise<void> {
  await updateDoc(doc(db, PROMOS, code.trim().toUpperCase()), { archivedAt: nowIso() });
}

export async function listGrants(): Promise<FreeAccessGrant[]> {
  const snap = await getDocs(collection(db, GRANTS));
  return snap.docs.map(d => d.data() as FreeAccessGrant)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * Admin: register a free-use email. If the account already exists it is
 * approved + entitled immediately; otherwise the grant auto-activates the
 * account at registration/login (authService.redeemFreeGrant).
 */
export async function createGrant(
  email: string,
  plan: SubPlanCode,
  startsAt: string,
  endsAt: string,
  note: string,
  grantedBy: string,
  existingUser: User | null,
  /** Market the promotion belongs to; omit/'' for "any market". Reporting label
   *  only — redemption is unaffected (see FreeAccessGrant.country). */
  country?: string,
): Promise<void> {
  const key = emailKey(email);
  // endsAtTs mirrors endsAt as a Timestamp: rules cannot parse ISO strings, so
  // self-redemption copies THIS value into accessUntilTs (rules check equality).
  const endsAtTs = Timestamp.fromDate(new Date(endsAt));
  const grant: FreeAccessGrant = {
    email: key, planCode: plan, startsAt, endsAt, endsAtTs,
    note: note || '', grantedBy, createdAt: nowIso(),
    // Firestore rejects undefined — only include the key when actually set.
    ...(country ? { country } : {}),
    ...(existingUser ? { redeemedByUid: existingUser.id, redeemedAt: nowIso() } : {}),
  };
  await setDoc(doc(db, GRANTS, key), grant);

  if (existingUser) {
    // 2026-08-03 two-layer program: marketing grants live in user.grant —
    // the `subscription` slot belongs exclusively to the Paddle webhook.
    const g: UserGrant = {
      source: 'free_grant', planCode: plan,
      startsAt, endsAt, grantedBy, ...(note ? { note } : {}),
    };
    await updateDoc(doc(db, 'users', existingUser.id), {
      status: 'active', isActive: true,
      grant: g,
      accessUntilTs: endsAtTs,
    });
    // Team-plan grant: seats need an organization. Reuse an org the user
    // already owns; otherwise create one (entitlement-layer org — Paddle
    // never sees it, and a later paid checkout simply adopts it via orgId).
    if (isTeamPlan(plan) && (plan === 'team_3' || plan === 'team_5')) {
      const existingOrg = existingUser.orgId ? await getOrg(existingUser.orgId) : null;
      if (existingOrg && existingOrg.ownerUid === existingUser.id) {
        await updateDoc(doc(db, ORGS, existingOrg.id), {
          planCode: plan, seatLimit: SUB_PLANS[plan].seatLimit,
          subscriptionStatus: 'active', currentPeriodEndsAt: endsAt, accessUntilTs: endsAtTs,
        });
      } else if (!existingUser.orgId) {
        const ref = doc(collection(db, ORGS));
        await setDoc(ref, {
          name: existingUser.companyName || '',
          ownerUid: existingUser.id, ownerEmail: emailKey(existingUser.email),
          planCode: plan, seatLimit: SUB_PLANS[plan].seatLimit,
          subscriptionStatus: 'active', trialEndsAt: null,
          currentPeriodEndsAt: endsAt, accessUntilTs: endsAtTs,
          members: [{ uid: existingUser.id, email: emailKey(existingUser.email), name: [existingUser.firstName, existingUser.lastName].filter(Boolean).join(' ') }],
          memberUids: [existingUser.id],
          invitedEmails: [], invitedAt: {},
          companyName: existingUser.companyName || '',
          companyType: existingUser.companyType || '',
          createdAt: nowIso(),
        });
        await updateDoc(doc(db, 'users', existingUser.id), { orgId: ref.id, orgRole: 'team_admin' });
      }
    }
  }
}

export async function revokeGrant(email: string): Promise<void> {
  const key = emailKey(email);
  const snap = await getDoc(doc(db, GRANTS, key));
  if (!snap.exists()) return;
  const grant = snap.data() as FreeAccessGrant;
  await updateDoc(doc(db, GRANTS, key), { revokedAt: nowIso(), endsAt: nowIso(), endsAtTs: Timestamp.now() });
  if (grant.redeemedByUid) {
    // Explicit admin revocation closes the GRANT layer only. A paid Paddle
    // subscription (webhook-owned) keeps its own window untouched.
    const uSnap = await getDoc(doc(db, 'users', grant.redeemedByUid));
    const u = uSnap.exists() ? (uSnap.data() as User) : null;
    const paidEnd = u?.subscription?.currentPeriodEndsAt ? new Date(u.subscription.currentPeriodEndsAt).getTime() : null;
    const floor = paidEnd && paidEnd > Date.now() ? Timestamp.fromMillis(paidEnd) : Timestamp.now();
    await updateDoc(doc(db, 'users', grant.redeemedByUid), {
      grant: deleteField(), accessUntilTs: floor,
    });
  }
}

/** Valid (started, not ended, not revoked) grant for an email, or null. */
export async function getValidGrant(email: string): Promise<FreeAccessGrant | null> {
  try {
    const snap = await getDoc(doc(db, GRANTS, emailKey(email)));
    if (!snap.exists()) return null;
    const g = snap.data() as FreeAccessGrant;
    const now = Date.now();
    if (g.revokedAt) return null;
    if (new Date(g.startsAt).getTime() > now) return null;
    if (new Date(g.endsAt).getTime() < now) return null;
    return g;
  } catch { return null; }
}

// ── Renewal-time change requests ────────────────────────────────────────────

export async function getMyChangeRequest(uid: string): Promise<SubscriptionChangeRequest | null> {
  const snap = await getDoc(doc(db, CHANGES, uid));
  if (!snap.exists()) return null;
  const req = { id: snap.id, ...snap.data() } as SubscriptionChangeRequest;
  return req.status === 'scheduled' ? req : null;
}

export async function scheduleChange(
  user: User,
  requestedPlan: SubPlanCode,
  requestedTerm: BillingTerm,
  keepMemberUids?: string[],
): Promise<void> {
  const req: Omit<SubscriptionChangeRequest, 'id'> = {
    userId: user.id,
    userEmail: emailKey(user.email),
    currentPlanCode: user.subscription?.planCode ?? '',
    currentBillingTerm: user.subscription?.billingTerm,
    requestedPlanCode: requestedPlan,
    requestedBillingTerm: requestedTerm,
    ...(keepMemberUids ? { keepMemberUids } : {}),
    effectiveAt: user.subscription?.currentPeriodEndsAt ?? null,
    status: 'scheduled',
    createdAt: nowIso(),
  };
  await setDoc(doc(db, CHANGES, user.id), req);
}

export async function cancelChange(uid: string): Promise<void> {
  await deleteDoc(doc(db, CHANGES, uid));
}

export async function listChangeRequests(): Promise<SubscriptionChangeRequest[]> {
  const snap = await getDocs(collection(db, CHANGES));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SubscriptionChangeRequest))
    .filter(r => r.status === 'scheduled')
    .sort((a, b) => (a.effectiveAt ?? '').localeCompare(b.effectiveAt ?? ''));
}
