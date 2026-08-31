/**
 * Security rules for the revised profile + team flows (Firestore emulator).
 *
 * These are the tests that matter for §30: a client that bypasses the UI must
 * still be unable to grant itself team ownership, extra seats, membership or a
 * subscription.
 *
 * Run: npm run test:rules
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteField, collection, query, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const PROJECT_ID = 'heatpumpdb-rules-test';
const OWNER = { uid: 'owner-uid', email: 'owner@team.example' };
const MEMBER = { uid: 'member-uid', email: 'member@team.example' };
const INVITED = { uid: 'invited-uid', email: 'invited@team.example' };
const STRANGER = { uid: 'stranger-uid', email: 'stranger@example.com' };
const ORG = 'org-1';

let passed = 0, failed = 0;
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.error(`  FAIL  ${name}\n        ${e.message}`); }
};

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

const profile = (uid, email, extra = {}) => ({
  id: uid, email, firstName: 'A', lastName: 'B',
  companyName: 'Co', companyType: 'installer',
  isActive: true, status: 'active', role: 'user',
  registeredAt: new Date().toISOString(), ...extra,
});

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', OWNER.uid), profile(OWNER.uid, OWNER.email, { orgId: ORG, orgRole: 'team_admin' }));
    await setDoc(doc(db, 'users', MEMBER.uid), profile(MEMBER.uid, MEMBER.email, { orgId: ORG, orgRole: 'member' }));
    await setDoc(doc(db, 'users', STRANGER.uid), profile(STRANGER.uid, STRANGER.email));
    await setDoc(doc(db, 'organizations', ORG), {
      ownerUid: OWNER.uid, ownerEmail: OWNER.email,
      planCode: 'team_3', seatLimit: 3, subscriptionStatus: 'active',
      members: [
        { uid: OWNER.uid, email: OWNER.email, name: 'Owner' },
        { uid: MEMBER.uid, email: MEMBER.email, name: 'Member' },
      ],
      memberUids: [OWNER.uid, MEMBER.uid],
      invitedEmails: [INVITED.email],
      invitedAt: { [INVITED.email]: new Date().toISOString() },
      companyName: 'Co', companyType: 'installer',
      createdAt: new Date().toISOString(),
    });
  });
}

const as = u => testEnv.authenticatedContext(u.uid, { email: u.email }).firestore();
const orgRef = db => doc(db, 'organizations', ORG);

console.log('\nProfile + team security rules\n');

/* ── Self-service profile edit ─────────────────────────────────────────── */
await seed();
await check('user may edit their own name + company fields', async () => {
  await assertSucceeds(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), {
    firstName: 'New', companyName: 'New Co', companyType: 'engineering',
    companyTypeOther: '', companyCity: 'Berlin', companyWebsite: 'new.example',
  }));
});
await check('user may set their job role (onboarding sheet + Account page)', async () => {
  // Added to the rules allowlist 2026-08-31 with the onboarding sheet. The
  // client whitelist alone would not be enough — the rules decide.
  await assertSucceeds(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), { jobRole: 'product' }));
});
await check('an unlisted profile field is still refused', async () => {
  // Guards the allowlist itself: widening it must be a deliberate edit, not a
  // side effect of adding jobRole.
  await assertFails(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), { signupRef: 'li' }));
  await assertFails(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), { trialEndsAt: 'later' }));
});
await check('profile edit cannot smuggle in a subscription', async () => {
  await assertFails(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), {
    companyName: 'X',
    subscription: { provider: 'paddle', planCode: 'team_5', status: 'active', seatLimit: 5 },
  }));
});
await check('profile edit cannot escalate role or status', async () => {
  await assertFails(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), { role: 'admin' }));
  await assertFails(updateDoc(doc(as(STRANGER), 'users', STRANGER.uid), { orgRole: 'team_admin' }));
});

/* ── Invited member registration ───────────────────────────────────────── */
await check('invited email may create an ACTIVE member profile for that org', async () => {
  await assertSucceeds(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: ORG, orgRole: 'member' })));
});
await seed();
await check('an uninvited email cannot create an active member profile', async () => {
  await assertFails(setDoc(doc(as(STRANGER), 'users', 'new-uid'),
    profile('new-uid', STRANGER.email, { orgId: ORG, orgRole: 'member' })));
});
await check('invited member cannot self-create as team_admin', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: ORG, orgRole: 'team_admin' })));
});
await check('invited member cannot self-create with a subscription', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, {
      orgId: ORG, orgRole: 'member',
      subscription: { provider: 'paddle', planCode: 'team_5', status: 'active', seatLimit: 5 },
    })));
});

/* ── Seats ─────────────────────────────────────────────────────────────── */
await seed();
await check('owner may invite while seats remain (2 members + 1 invite = 3)', async () => {
  const db = as(OWNER);
  const org = (await getDoc(orgRef(db))).data();
  // seed already has 2 members + 1 invite == seatLimit, so free a seat first
  await assertSucceeds(updateDoc(orgRef(db), { invitedEmails: [] }));
  await assertSucceeds(updateDoc(orgRef(db), { invitedEmails: ['fresh@team.example'] }));
});
await seed();
await check('owner CANNOT exceed the seat limit with invitations', async () => {
  await assertFails(updateDoc(orgRef(as(OWNER)), {
    invitedEmails: [INVITED.email, 'extra1@team.example'],   // 2 members + 2 invites > 3
  }));
});
await check('owner CANNOT raise the seat limit', async () => {
  await assertFails(updateDoc(orgRef(as(OWNER)), { seatLimit: 5 }));
});
await check('owner CANNOT change the plan or subscription status', async () => {
  await assertFails(updateDoc(orgRef(as(OWNER)), { planCode: 'team_5' }));
  await assertFails(updateDoc(orgRef(as(OWNER)), { subscriptionStatus: 'active', seatLimit: 9 }));
});
await check('owner may edit the company profile the team inherits', async () => {
  await assertSucceeds(updateDoc(orgRef(as(OWNER)), {
    companyName: 'Nordwind GmbH', companyType: 'engineering', companyCity: 'Kiel', companyWebsite: 'nordwind.example',
  }));
});

/* ── Membership changes ────────────────────────────────────────────────── */
await seed();
await check('owner may remove a member (seat freed)', async () => {
  await assertSucceeds(updateDoc(orgRef(as(OWNER)), {
    members: [{ uid: OWNER.uid, email: OWNER.email, name: 'Owner' }],
    memberUids: [OWNER.uid],
  }));
});
await seed();
await check('member may LEAVE (removes only themselves)', async () => {
  await assertSucceeds(updateDoc(orgRef(as(MEMBER)), {
    members: [{ uid: OWNER.uid, email: OWNER.email, name: 'Owner' }],
    memberUids: [OWNER.uid],
  }));
});
await seed();
await check('member CANNOT remove another member', async () => {
  await assertFails(updateDoc(orgRef(as(MEMBER)), {
    members: [{ uid: MEMBER.uid, email: MEMBER.email, name: 'Member' }],
    memberUids: [MEMBER.uid],   // owner removed, caller stays → not a self-leave
  }));
});
await check('a stranger CANNOT add themselves to the team', async () => {
  await assertFails(updateDoc(orgRef(as(STRANGER)), {
    members: [
      { uid: OWNER.uid, email: OWNER.email, name: 'Owner' },
      { uid: MEMBER.uid, email: MEMBER.email, name: 'Member' },
      { uid: STRANGER.uid, email: STRANGER.email },
    ],
    memberUids: [OWNER.uid, MEMBER.uid, STRANGER.uid],
  }));
});
await check('invited user claims their OWN seat only', async () => {
  const db = as(INVITED);
  await assertSucceeds(updateDoc(orgRef(db), {
    members: [
      { uid: OWNER.uid, email: OWNER.email, name: 'Owner' },
      { uid: MEMBER.uid, email: MEMBER.email, name: 'Member' },
      { uid: INVITED.uid, email: INVITED.email },
    ],
    memberUids: [OWNER.uid, MEMBER.uid, INVITED.uid],
    invitedEmails: [],
    invitedAt: {},
  }));
});
await seed();
await check('invited user cannot add a DIFFERENT uid to the team', async () => {
  await assertFails(updateDoc(orgRef(as(INVITED)), {
    members: [
      { uid: OWNER.uid, email: OWNER.email, name: 'Owner' },
      { uid: MEMBER.uid, email: MEMBER.email, name: 'Member' },
      { uid: 'someone-else', email: 'someone@else.example' },
    ],
    memberUids: [OWNER.uid, MEMBER.uid, 'someone-else'],
    invitedEmails: [],
  }));
});

/* ── Leaving clears the profile pointer ────────────────────────────────── */
await check('member may clear their own org pointer when leaving (deleteField)', async () => {
  await assertSucceeds(updateDoc(doc(as(MEMBER), 'users', MEMBER.uid), { orgId: deleteField(), orgRole: deleteField() }));
});
await seed();
await check('member may clear their own org pointer when leaving (null)', async () => {
  await assertSucceeds(updateDoc(doc(as(MEMBER), 'users', MEMBER.uid), { orgId: null, orgRole: null }));
});


/* ── §8 Invitation security: URL tampering must never grant access ───────── */
await seed();
await testEnv.withSecurityRulesDisabled(async ctx => {
  // A second organization that has NOT invited anyone we test with.
  await setDoc(doc(ctx.firestore(), 'organizations', 'org-2'), {
    ownerUid: 'other-owner', ownerEmail: 'other@x.example',
    planCode: 'team_5', seatLimit: 5, subscriptionStatus: 'active',
    members: [{ uid: 'other-owner', email: 'other@x.example' }],
    memberUids: ['other-owner'],
    invitedEmails: [], invitedAt: {},
    createdAt: new Date().toISOString(),
  });
});

await check('[invite] modified organization ID is rejected (org did not invite me)', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: 'org-2', orgRole: 'member' })));
});
await check('[invite] non-existent organization ID is rejected', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: 'org-does-not-exist', orgRole: 'member' })));
});
await check('[invite] empty organization ID is rejected', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: '', orgRole: 'member' })));
});
await check('[invite] mismatched email is rejected (signed in as someone not invited)', async () => {
  await assertFails(setDoc(doc(as(STRANGER), 'users', 'fresh-uid'),
    profile('fresh-uid', STRANGER.email, { orgId: ORG, orgRole: 'member' })));
});
await check('[invite] invited user cannot claim a seat in an org that did not invite them', async () => {
  await assertFails(updateDoc(doc(as(INVITED), 'organizations', 'org-2'), {
    members: [{ uid: 'other-owner', email: 'other@x.example' }, { uid: INVITED.uid, email: INVITED.email }],
    memberUids: ['other-owner', INVITED.uid],
  }));
});

// Canceled invitation → the email is no longer in invitedEmails.
await seed();
await testEnv.withSecurityRulesDisabled(async ctx => {
  await updateDoc(doc(ctx.firestore(), 'organizations', ORG), { invitedEmails: [], invitedAt: {} });
});
await check('[invite] CANCELED invitation cannot be used to register', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: ORG, orgRole: 'member' })));
});
await check('[invite] CANCELED invitation cannot be used to claim a seat', async () => {
  await assertFails(updateDoc(orgRef(as(INVITED)), {
    members: [
      { uid: OWNER.uid, email: OWNER.email, name: 'Owner' },
      { uid: MEMBER.uid, email: MEMBER.email, name: 'Member' },
      { uid: INVITED.uid, email: INVITED.email },
    ],
    memberUids: [OWNER.uid, MEMBER.uid, INVITED.uid],
  }));
});

// Accepted invitation → the email is consumed (removed from invitedEmails).
await seed();
await testEnv.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await updateDoc(doc(db, 'organizations', ORG), {
    members: [
      { uid: OWNER.uid, email: OWNER.email, name: 'Owner' },
      { uid: MEMBER.uid, email: MEMBER.email, name: 'Member' },
      { uid: INVITED.uid, email: INVITED.email },
    ],
    memberUids: [OWNER.uid, MEMBER.uid, INVITED.uid],
    invitedEmails: [], invitedAt: {},
  });
});
await check('[invite] an ACCEPTED invitation cannot be reused by another account', async () => {
  const impostor = testEnv.authenticatedContext('impostor-uid', { email: INVITED.email }).firestore();
  await assertFails(setDoc(doc(impostor, 'users', 'impostor-uid'),
    profile('impostor-uid', INVITED.email, { orgId: ORG, orgRole: 'member' })));
});

await seed();
await check('[invite] invited user cannot self-grant OWNER status', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: ORG, orgRole: 'team_admin' })));
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: ORG, orgRole: 'member', role: 'admin' })));
});
await check('[invite] invited user cannot self-grant a subscription', async () => {
  await assertFails(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, {
      orgId: ORG, orgRole: 'member',
      subscription: { provider: 'paddle', planCode: 'team_5', status: 'active', seatLimit: 5 },
    })));
});
await check('[invite] invited user cannot take over ownership of the org', async () => {
  await assertFails(updateDoc(orgRef(as(INVITED)), { ownerUid: INVITED.uid }));
});
await check('[invite] invited user joins ONLY as a normal member', async () => {
  await assertSucceeds(setDoc(doc(as(INVITED), 'users', INVITED.uid),
    profile(INVITED.uid, INVITED.email, { orgId: ORG, orgRole: 'member' })));
  const me = (await getDoc(doc(as(INVITED), 'users', INVITED.uid))).data();
  if (me.orgRole !== 'member' || me.role !== 'user' || me.subscription) throw new Error('joined with more than member rights');
});

/* ── §9 members / memberUids are always written together ─────────────────── */
await seed();
await check('[consistency] members without memberUids is rejected', async () => {
  await assertFails(updateDoc(orgRef(as(OWNER)), {
    members: [{ uid: OWNER.uid, email: OWNER.email, name: 'Owner' }],   // memberUids left stale
  }));
});
await check('[consistency] memberUids without members is rejected', async () => {
  await assertFails(updateDoc(orgRef(as(OWNER)), { memberUids: [OWNER.uid] }));
});
await check('[consistency] a leave that keeps the caller in memberUids is rejected', async () => {
  await assertFails(updateDoc(orgRef(as(MEMBER)), {
    members: [{ uid: OWNER.uid, email: OWNER.email, name: 'Owner' }],
    memberUids: [OWNER.uid, MEMBER.uid],
  }));
});

/* ── Team documents are not readable by other customers ──────────────────── */
// A team doc holds the members' names and emails, the seat count and the
// subscription state. `read` covers list as well as get, so before 2026-08-04
// any signed-in customer could query the collection and take every team's
// contact list. Members still need their own org for the plan name, the
// admin's address and the inherited company profile.
await seed();
await check('[org read] a member reads their own team', async () => {
  await assertSucceeds(getDoc(orgRef(as(MEMBER))));
});
await check('[org read] the team admin reads their own team', async () => {
  await assertSucceeds(getDoc(orgRef(as(OWNER))));
});
await check('[org read] an invited (not yet joined) user reads the inviting team', async () => {
  await assertSucceeds(getDoc(orgRef(as(INVITED))));
});
await check('[org read] an unrelated signed-in customer CANNOT read the team', async () => {
  await assertFails(getDoc(orgRef(as(STRANGER))));
});
await check('[org read] an unrelated customer CANNOT list the organizations collection', async () => {
  await assertFails(getDocs(collection(as(STRANGER), 'organizations')));
});
await check('[org read] "which org invited me" still works for the invited user', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(as(INVITED), 'organizations'),
    where('invitedEmails', 'array-contains', INVITED.email),
  )));
  if (snap.empty) throw new Error('the invitation query returned nothing');
});
await check('[org read] the invitation query cannot be aimed at somebody else', async () => {
  await assertFails(getDocs(query(
    collection(as(STRANGER), 'organizations'),
    where('invitedEmails', 'array-contains', INVITED.email),
  )));
});

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
