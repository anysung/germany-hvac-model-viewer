import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendEmailVerification,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithPopup,
  unlink,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User, ActivityLog, UserSubscription, UserGrant } from '../types';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';
import { getValidGrant, joinOrg, joinOrgIfInvited, emailKey } from './subscriptionService';
import { SUB_PLANS, TRIAL_DAYS } from '../config/subscriptionPlans';
import { TERMS_VERSION, PRIVACY_VERSION, DATA_USE_VERSION } from '../config/legal';
import { compact } from '../utils/profile';
import { TRIAL_FLOW_ENABLED, finalizeSignupFn } from './billingFnService';

const OWNER_EMAIL = 'sungyongsoo1976@gmail.com';

/** loginUser sentinel: account exists but the verification mail is still
 *  unconfirmed — App routes to the VERIFY_EMAIL screen (session kept). */
export const VERIFY_EMAIL_SENTINEL = 'verify-email-required';

/**
 * Free-access grants (admin promotions): if an admin registered this email in
 * freeAccessGrants with a currently-valid window, self-activate the account
 * with the granted plan — no manual approval step. Rules bind the entitlement
 * to the grant's own plan + end date. Returns the updated user or null.
 */
async function redeemFreeGrantIfAny(user: User): Promise<User | null> {
  try {
    const grant = await getValidGrant(user.email);
    if (!grant) return null;
    // 2026-08-03: grants live in user.grant — the `subscription` slot belongs
    // to the Paddle webhook alone. Rules validate the copy against the grant
    // doc (planCode, endsAt, endsAtTs).
    const g: UserGrant = {
      source: 'free_grant',
      planCode: grant.planCode,
      startsAt: grant.startsAt,
      endsAt: grant.endsAt,
      ...(grant.grantedBy ? { grantedBy: grant.grantedBy } : {}),
    };
    await updateDoc(doc(db, 'users', user.id), {
      status: 'active', isActive: true,
      grant: g,
      // Open the rules-facing window to the grant end. Rules validate this
      // equals the grant's own endsAtTs (older grants without the field simply
      // omit it — those accounts stay un-gated, which is the fail-open default).
      ...(grant.endsAtTs ? { accessUntilTs: grant.endsAtTs } : {}),
    });
    await updateDoc(doc(db, 'freeAccessGrants', emailKey(user.email)), {
      redeemedByUid: user.id, redeemedAt: new Date().toISOString(),
    }).catch(() => {});
    await logActivity(user.id, 'APPROVE_USER', `Free-access grant redeemed (${grant.planCode}, until ${grant.endsAt.slice(0, 10)})`, user.email, `${user.firstName} ${user.lastName}`);
    return { ...user, status: 'active', isActive: true, grant: g };
  } catch {
    return null;
  }
}

// The one-email-one-country policy lives in a Firebase-free module so it is
// unit-testable; re-export the pieces the app already imports from here.
export { isAdminRole, crossCountryBlock } from './accountCountry';
import { isAdminRole, crossCountryBlock as _crossCountryBlock, WRONG_COUNTRY_PREFIX, EMAIL_ELSEWHERE } from './accountCountry';
export { WRONG_COUNTRY_PREFIX, EMAIL_ELSEWHERE };

// --- Activity Logging (Firestore) ---
export const logActivity = async (
  userId: string, action: string, details: string,
  userEmail = '', userName = ''
) => {
  try {
    await addDoc(collection(db, 'activityLogs'), {
      userId, userEmail, userName, action, details,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Log error', error);
  }
};

export const getLogs = async (fromDate?: string, toDate?: string): Promise<ActivityLog[]> => {
  try {
    const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(2000));
    const snapshot = await getDocs(q);
    let logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ActivityLog[];
    if (fromDate) logs = logs.filter(l => l.timestamp.slice(0, 10) >= fromDate);
    if (toDate)   logs = logs.filter(l => l.timestamp.slice(0, 10) <= toDate);
    return logs;
  } catch (error) {
    console.error('Fetch Logs Error', error);
    return [];
  }
};

/** What the Sign Up form collects (config/companyTypes.ts for the type codes). */
export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
  companyType: string;
  companyTypeOther?: string;
  companyCity?: string;
  companyWebsite?: string;
  marketingConsent?: boolean;
}

/** The consent record stamped on every new profile — minimal, no history log.
 *  finalizeSignup re-stamps the authoritative (server-time) copy on activation. */
const consentFields = () => ({
  termsAcceptedAt: new Date().toISOString(),
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  dataUseConsentAt: new Date().toISOString(),
  dataUseConsentVersion: DATA_USE_VERSION,
});

/**
 * Refetch this session's profile after a server-side change (finalizeSignup
 * flips status/trial fields with the Admin SDK — the client copy is stale).
 */
export const refetchSessionUser = async (): Promise<User | null> => {
  const fbUser = auth.currentUser;
  if (!fbUser) return null;
  const snap = await getDoc(doc(db, 'users', fbUser.uid));
  if (!snap.exists()) return null;
  const data = snap.data() as User;
  return { ...data, role: fbUser.email === OWNER_EMAIL ? 'owner' : data.role || 'user' };
};

/**
 * Trial flow: ask the billing function to activate this account. The SERVER
 * decides against the Firebase Auth record (email verified?), the consent
 * payload and the emailRegistry history. Returns the refreshed profile on
 * activation, or the blocking reason.
 */
export const tryFinalizeSignup = async (): Promise<
  { state: 'active'; user: User; trial: boolean } | { state: 'unverified' } | { state: 'error'; message: string }
> => {
  try {
    // Sync the local Auth record first so the "check again" button reflects a
    // verification that happened in another tab (display only — the function
    // decides from the server record either way).
    await auth.currentUser?.reload().catch(() => {});
    const result = await finalizeSignupFn();
    if (result.ok) {
      const user = await refetchSessionUser();
      if (user) return { state: 'active', user, trial: !!result.trial };
      return { state: 'error', message: 'profile-missing' };
    }
    if (result.error === 'email-not-verified') return { state: 'unverified' };
    return { state: 'error', message: result.error || 'unknown' };
  } catch (e: any) {
    return { state: 'error', message: String(e?.message ?? e) };
  }
};

/** Re-send the verification mail for the signed-in, not-yet-verified account. */
export const resendVerificationEmail = async (): Promise<void> => {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('unauthenticated');
  await sendEmailVerification(fbUser);
};

export type RegisterResult =
  /** Free-access grant (or social/trial finalize) — signed in, ready to go. */
  | { state: 'active'; user: User }
  /** Trial flow: signed in, waiting for the verification link. */
  | { state: 'verify-email' }
  /** Legacy flow: profile pending admin approval, signed out. */
  | { state: 'pending' };

// --- Registration ---
// Trial flow (VITE_BILLING_FN_URL set): create the pending profile, send the
// verification mail and STAY SIGNED IN — the VERIFY_EMAIL screen finishes via
// tryFinalizeSignup(). Legacy flow: pending profile + sign-out (admin approval).
export const registerUser = async (data: SignupData): Promise<RegisterResult> => {
  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
  } catch (e: any) {
    // The email already has an account SOMEWHERE (all markets share one Firebase
    // Auth project). One email = one country: never create a second account.
    if (e?.code === 'auth/email-already-in-use') throw new Error(EMAIL_ELSEWHERE);
    throw e;
  }
  const uid = userCredential.user?.uid;
  if (!uid) throw new Error('User ID missing');

  const newUser: User = {
    id: uid,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    companyName: data.companyName,
    companyType: data.companyType,
    // Country comes from the edition the user signed up on — never asked for.
    country: ACTIVE_COUNTRY.code,
    isActive: false,
    status: 'pending',
    registeredAt: new Date().toISOString(),
    ...consentFields(),
    role: 'user',
    plan: 'standard',
    // Optional fields are omitted when empty (Firestore rejects `undefined`).
    ...compact({
      companyTypeOther: data.companyTypeOther,
      companyCity: data.companyCity,
      companyWebsite: data.companyWebsite,
    }),
    ...(data.marketingConsent ? { marketingConsent: true } : {}),
  } as User;

  await setDoc(doc(db, 'users', uid), newUser);

  // Free-access grant (admin promotion): activate immediately, stay signed in.
  const redeemed = await redeemFreeGrantIfAny(newUser);
  if (redeemed) {
    // Record the email history + server consent stamp (no trial is granted on
    // an already-active account — the grant is the entitlement).
    if (TRIAL_FLOW_ENABLED) finalizeSignupFn().catch(() => {});
    return { state: 'active', user: redeemed };
  }

  if (TRIAL_FLOW_ENABLED) {
    // New flow: verification mail, session kept open for the verify screen.
    await sendEmailVerification(userCredential.user).catch(e => console.error('verification mail failed', e));
    await logActivity(uid, 'REGISTER_PENDING', `Registration awaiting email verification: ${data.email}`, data.email, `${data.firstName} ${data.lastName}`);
    return { state: 'verify-email' };
  }

  // Legacy flow: sign out immediately — must wait for admin approval.
  await signOut(auth);
  await logActivity(uid, 'REGISTER_PENDING', `Registration pending: ${data.email}`, data.email, `${data.firstName} ${data.lastName}`);
  return { state: 'pending' };
};

/**
 * Invited team member: the Team Owner already bought the seat, so this is not a
 * public registration. The member supplies only their name, password and
 * consent — company details are inherited from the organization and never
 * duplicated onto the member's profile.
 *
 * The profile is created ACTIVE (no approval queue: the owner vouched for them
 * by inviting them), and the seat is claimed straight away. Security rules only
 * permit this when the org really does list this email under invitedEmails.
 */
export const registerInvitedMember = async (
  orgId: string,
  data: { firstName: string; lastName: string; email: string; password: string; marketingConsent?: boolean },
): Promise<User> => {
  const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
  const uid = cred.user?.uid;
  if (!uid) throw new Error('User ID missing');

  const member: User = {
    id: uid,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    companyName: '',
    companyType: '',
    country: ACTIVE_COUNTRY.code,
    isActive: true,
    status: 'active',
    registeredAt: new Date().toISOString(),
    ...consentFields(),
    role: 'user',
    plan: 'standard',
    orgId,
    orgRole: 'member',
    ...(data.marketingConsent ? { marketingConsent: true } : {}),
  } as User;

  await setDoc(doc(db, 'users', uid), member);
  // Join the org the invitation names — not "whichever org invited this email".
  await joinOrg(orgId, member);
  // Trial flow: record the email history (a former member signing up solo
  // later gets NO fresh trial) + server-stamp the consents. Non-blocking —
  // the seat access itself comes from the org, not from this call.
  if (TRIAL_FLOW_ENABLED) finalizeSignupFn().catch(() => {});
  await logActivity(uid, 'REGISTER_PENDING', `Team member joined org ${orgId}`, data.email, `${data.firstName} ${data.lastName}`);
  return member;
};

/** Self-service profile edit (own document, whitelisted fields only). */
export const updateMyProfile = async (
  uid: string,
  patch: Partial<Pick<User, 'firstName' | 'lastName' | 'companyName' | 'companyType' | 'companyTypeOther' | 'companyCity' | 'companyWebsite'>>,
): Promise<void> => {
  // Send '' rather than dropping cleared optional fields, so the user can empty them.
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  await updateDoc(doc(db, 'users', uid), clean);
};

// --- Login (blocks pending/suspended) ---
export const loginUser = async (email: string, pass: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    const uid = userCredential.user?.uid;
    if (!uid) throw new Error('Login failed');

    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // Only the owner gets an auto-created profile — all other Firebase Auth users without
      // a Firestore doc are rejected. This closes the bypass where any Firebase Auth account
      // without a Firestore record would previously be auto-admitted as 'active'.
      if (email !== OWNER_EMAIL) {
        await signOut(auth);
        throw new Error('No account found for this email. Please register to request access, or contact the administrator.');
      }
      const fallbackUser: User = {
        id: uid, email,
        firstName: 'Christopher',
        lastName: 'Sung',
        companyType: 'individual',
        isActive: true, status: 'active',
        registeredAt: new Date().toISOString(),
        role: 'owner',
        plan: 'standard',
      };
      await setDoc(userDocRef, fallbackUser);
      await logActivity(fallbackUser.id, 'LOGIN', 'Owner logged in (profile created)', email, 'Christopher Sung');
      return fallbackUser;
    }

    let userData = {
      ...userDoc.data() as User,
      role: email === OWNER_EMAIL ? 'owner' as const : (userDoc.data() as User).role || 'user' as const,
    };

    if (userData.status === 'pending') {
      // A valid free-access grant activates the account without manual approval.
      const redeemed = await redeemFreeGrantIfAny(userData);
      if (redeemed) {
        userData = { ...userData, ...redeemed };
      } else if (TRIAL_FLOW_ENABLED) {
        // Verification-based flow: the server activates once the Auth record
        // says the mail was verified (covers "verified in another tab").
        const fin = await tryFinalizeSignup();
        if (fin.state === 'active') {
          userData = { ...userData, ...fin.user };
        } else {
          // Keep the session — the VERIFY_EMAIL screen needs it to re-check
          // and to re-send the mail. App routes there via this sentinel.
          throw new Error(VERIFY_EMAIL_SENTINEL);
        }
      } else {
        await signOut(auth);
        throw new Error('Your registration is pending admin approval. You will be notified once approved.');
      }
    }
    if (userData.status === 'suspended') {
      await signOut(auth);
      throw new Error('Your account has been suspended. Please contact the administrator.');
    }
    if (userData.status === 'rejected') {
      await signOut(auth);
      throw new Error('Your registration was not approved. Please contact the administrator.');
    }
    if (userData.status === 'disabled') {
      await signOut(auth);
      throw new Error('Your account has been disabled. Please contact the administrator.');
    }
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('Account is deactivated.');
    }

    // Legacy migration: users created before the status field was introduced have isActive:true
    // but no status field. Set status:'active' so Firestore security rules can check it.
    if (!userData.status && userData.isActive) {
      try {
        await updateDoc(userDocRef, { status: 'active' });
        userData = { ...userData, status: 'active' };
      } catch { /* non-blocking — will retry on next login */ }
    }

    // One-email-one-country: an approved non-admin user may only sign in on their
    // own market's site. Read-only — the stored country is never changed here.
    const wrongCc = _crossCountryBlock(userData, ACTIVE_COUNTRY.code);
    if (wrongCc) {
      await signOut(auth);
      throw new Error(WRONG_COUNTRY_PREFIX + wrongCc);
    }

    await logActivity(userData.id, 'LOGIN', 'User logged in', email, `${userData.firstName} ${userData.lastName}`);
    return userData;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// --- Sign-in methods (Account page: link/unlink Google & Apple) ---
// Team members register with their COMPANY email (the invitation key) and may
// attach a personal Google/Apple identity to the SAME Firebase account here.
// Membership, billing and entitlements stay keyed to the uid + company email —
// linking only adds a login credential, so it can never touch a subscription.
// Popup only (no redirect fallback): a link redirect would come back through
// completeRedirectSignIn() on boot and be mistaken for a fresh social sign-in.

/** Provider ids currently attached to the signed-in account
 *  ('password' | 'google.com' | 'apple.com'). */
export const currentSignInMethods = (): string[] =>
  auth.currentUser?.providerData.map(p => p.providerId) ?? [];

export const linkSignInProvider = async (providerName: 'google' | 'apple'): Promise<void> => {
  const u = auth.currentUser;
  if (!u) throw new Error('not-signed-in');
  const provider =
    providerName === 'google'
      ? new GoogleAuthProvider()
      : (() => {
          const p = new OAuthProvider('apple.com');
          p.addScope('email');
          p.addScope('name');
          return p;
        })();
  await linkWithPopup(u, provider);
};

/** Detach a login method — always keeping at least one, or the account
 *  would become unreachable. */
export const unlinkSignInProvider = async (providerId: string): Promise<void> => {
  const u = auth.currentUser;
  if (!u) throw new Error('not-signed-in');
  if (u.providerData.length <= 1) throw new Error('last-method');
  await unlink(u, providerId);
};

// --- Social login (Google / Apple via Firebase popup) ---
// First-time social sign-in behaves like registration: a pending profile is
// created and the user is signed out until an admin approves — the same
// approval gate as email/password registration. Returning users pass through
// the same status checks as loginUser.
export const loginWithProvider = async (
  providerName: 'google' | 'apple',
  /** First-time social sign-ins are registrations: the caller shows the
   *  account/data-use terms popup and resolves on consent (rejects on cancel). */
  confirmTerms?: () => Promise<void>,
): Promise<'active' | 'pending-created' | 'redirecting'> => {
  const provider =
    providerName === 'google'
      ? new GoogleAuthProvider()
      : (() => {
          const p = new OAuthProvider('apple.com');
          p.addScope('email');
          p.addScope('name');
          return p;
        })();

  let cred;
  try {
    cred = await signInWithPopup(auth, provider);
  } catch (err: any) {
    // Safari (and strict popup blockers) refuse the OAuth popup — fall back to
    // a full-page redirect. The page navigates away here; on return,
    // completeRedirectSignIn() (App boot) finishes the same flow.
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return 'redirecting';
    }
    throw err;
  }
  return finishProviderSignIn(cred.user, providerName, confirmTerms);
};

/** Redirect-flow completion — call once on app boot. Resolves null when no
 *  redirect sign-in is pending; otherwise runs the exact post-popup flow
 *  (terms gate for first-timers, approval checks, status routing). */
export const completeRedirectSignIn = async (
  confirmTerms?: () => Promise<void>,
): Promise<'active' | 'pending-created' | null> => {
  const cred = await getRedirectResult(auth);
  if (!cred) return null;
  const providerName = cred.providerId === 'apple.com' ? 'apple' : 'google';
  return finishProviderSignIn(cred.user, providerName, confirmTerms);
};

/** Shared post-sign-in flow for both the popup and redirect variants. */
const finishProviderSignIn = async (
  fbUser: FirebaseUser,
  providerName: 'google' | 'apple',
  confirmTerms?: () => Promise<void>,
): Promise<'active' | 'pending-created'> => {
  const uid = fbUser.uid;
  const email = fbUser.email || '';
  const providerLabel = providerName === 'google' ? 'Google' : 'Apple';

  const userDocRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    if (email === OWNER_EMAIL) {
      const fallbackUser: User = {
        id: uid, email,
        firstName: 'Christopher', lastName: 'Sung',
        companyType: 'individual',
        isActive: true, status: 'active',
        registeredAt: new Date().toISOString(),
        role: 'owner', plan: 'standard',
      };
      await setDoc(userDocRef, fallbackUser);
      await logActivity(uid, 'LOGIN', `Owner logged in via ${providerLabel} (profile created)`, email, 'Christopher Sung');
      return 'active';
    }
    // New social user → registration. Consent to the account/data-use terms
    // is required before the profile is created (same gate as the signup form).
    if (confirmTerms) {
      try { await confirmTerms(); }
      catch { await signOut(auth); throw new Error('terms-declined'); }
    }
    const display = fbUser.displayName || email.split('@')[0] || 'New User';
    const [firstName, ...rest] = display.split(' ');
    const newUser: User = {
      id: uid, email,
      firstName: firstName || 'New',
      lastName: rest.join(' ') || '—',
      companyType: 'individual',
      companyName: '',
      country: ACTIVE_COUNTRY.code,
      isActive: false, status: 'pending',
      registeredAt: new Date().toISOString(),
      ...consentFields(),
      role: 'user', plan: 'standard',
    };
    await setDoc(userDocRef, newUser);
    // Free-access grant (admin promotion): activate immediately, stay signed in.
    const redeemedNew = await redeemFreeGrantIfAny(newUser);
    if (redeemedNew) {
      if (TRIAL_FLOW_ENABLED) finalizeSignupFn().catch(() => {});
      return 'active';
    }
    if (TRIAL_FLOW_ENABLED) {
      // Social identities are provider-verified: the consent gate above ran,
      // so the server can activate (and grant the one free trial) right away.
      const fin = await tryFinalizeSignup();
      if (fin.state === 'active') {
        await logActivity(uid, 'LOGIN', `Social registration activated (${providerLabel}): ${email}`, email, display);
        return 'active';
      }
      // Server refused (registry closed account etc.) — treat as not signed up.
      await signOut(auth);
      throw new Error(fin.state === 'error' ? fin.message : 'activation-failed');
    }
    await signOut(auth);
    await logActivity(uid, 'REGISTER_PENDING', `Social registration pending (${providerLabel}): ${email}`, email, display);
    return 'pending-created';
  }

  let userData = {
    ...userDoc.data() as User,
    role: email === OWNER_EMAIL ? 'owner' as const : (userDoc.data() as User).role || 'user' as const,
  };

  if (userData.status === 'pending') {
    // A valid free-access grant activates the account without manual approval.
    const redeemed = await redeemFreeGrantIfAny(userData);
    if (redeemed) {
      userData = { ...userData, ...redeemed };
    } else if (TRIAL_FLOW_ENABLED) {
      // A pending profile reached via social sign-in: the provider verified
      // the email, so the server can activate it now.
      const fin = await tryFinalizeSignup();
      if (fin.state === 'active') {
        userData = { ...userData, ...fin.user };
      } else {
        throw new Error(VERIFY_EMAIL_SENTINEL);
      }
    } else {
      await signOut(auth);
      throw new Error('Your registration is pending admin approval. You will be notified once approved.');
    }
  }
  if (userData.status === 'suspended') {
    await signOut(auth);
    throw new Error('Your account has been suspended. Please contact the administrator.');
  }
  if (userData.status === 'rejected') {
    await signOut(auth);
    throw new Error('Your registration was not approved. Please contact the administrator.');
  }
  if (userData.status === 'disabled') {
    await signOut(auth);
    throw new Error('Your account has been disabled. Please contact the administrator.');
  }
  if (!userData.isActive) {
    await signOut(auth);
    throw new Error('Account is deactivated.');
  }

  // Legacy migration (same as loginUser): backfill status for pre-status accounts.
  if (!userData.status && userData.isActive) {
    try {
      await updateDoc(userDocRef, { status: 'active' });
      userData = { ...userData, status: 'active' };
    } catch { /* non-blocking */ }
  }

  const wrongCcSocial = _crossCountryBlock(userData, ACTIVE_COUNTRY.code);
  if (wrongCcSocial) {
    await signOut(auth);
    throw new Error(WRONG_COUNTRY_PREFIX + wrongCcSocial);
  }

  await logActivity(userData.id, 'LOGIN', `User logged in via ${providerLabel}`, email, `${userData.firstName} ${userData.lastName}`);
  return 'active';
};

/**
 * Operations-console Google sign-in (heatpumpdb-hub). STRICTLY for existing
 * ADMIN accounts: there is deliberately no registration path here — a Google
 * identity without an admin profile is signed straight back out. The owner
 * email passes even before its profile doc exists (onUserChange bootstraps it).
 * No redirect fallback: the console is a desktop tool — a blocked popup gets a
 * clear message instead of a cross-page redirect flow.
 */
export const adminGoogleSignIn = async (): Promise<void> => {
  let cred;
  try {
    cred = await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
      throw new Error('admin-popup-blocked');
    }
    throw err;
  }
  const email = cred.user.email || '';
  if (email === OWNER_EMAIL) return;   // owner: onUserChange bootstraps/loads the profile
  const snap = await getDoc(doc(db, 'users', cred.user.uid));
  const role = snap.exists() ? (snap.data() as User).role : undefined;
  const status = snap.exists() ? (snap.data() as User).status : undefined;
  if (!snap.exists() || !isAdminRole(role) || status !== 'active') {
    await signOut(auth);
    throw new Error('admin-account-required');
  }
  await logActivity(cred.user.uid, 'LOGIN', 'Admin console login via Google', email, '');
};

export const logoutUser = async (userEmail = '', userName = '') => {
  const user = auth.currentUser;
  if (user) await logActivity(user.uid, 'LOGOUT', 'User logged out', userEmail, userName);
  await signOut(auth);
};

export const onUserChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        let userDoc = await getDoc(userDocRef);
        // Registration race: this listener fires the moment the Auth account
        // exists, which can be BEFORE registerUser/loginWithProvider has
        // written the Firestore profile. Signing out on a missing doc here
        // would abort the registration mid-flight (it broke free-grant
        // auto-activation), so give the profile write a moment to land.
        if (!userDoc.exists() && firebaseUser.email !== OWNER_EMAIL) {
          for (let i = 0; i < 6 && !userDoc.exists(); i++) {
            await new Promise(r => setTimeout(r, 800));
            if (!auth.currentUser) { callback(null); return; }  // signed out meanwhile (normal pending flow)
            userDoc = await getDoc(userDocRef);
          }
        }
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          let enriched = {
            ...userData,
            role: firebaseUser.email === OWNER_EMAIL ? 'owner' as const : userData.role || 'user' as const,
          };
          // Backfill: the owner role must exist ON THE DOCUMENT — Firestore
          // security rules read me().role, so an in-memory role alone leaves
          // every admin query (inbox, members, logs) permission-denied.
          if (firebaseUser.email === OWNER_EMAIL && userData.role !== 'owner') {
            updateDoc(userDocRef, { role: 'owner' }).catch(() => {});
          }
          // Team invitation: claim the seat on the first session after the
          // team admin invited this email (covers social login + restores).
          if (enriched.status === 'active' && !enriched.orgId) {
            try {
              const joined = await joinOrgIfInvited(enriched);
              if (joined) enriched = { ...enriched, orgId: joined.id, orgRole: 'member' };
            } catch { /* non-blocking */ }
          }
          // One-email-one-country (persistent-session edge, e.g. a session left
          // on the wrong-origin site): sign out rather than load another market.
          if (_crossCountryBlock(enriched, ACTIVE_COUNTRY.code)) { await signOut(auth); callback(null); return; }
          callback(enriched);
        } else {
          // Only the owner gets an auto-created profile. All other Firebase Auth users without
          // a Firestore doc are treated as unauthorized — sign them out to force re-registration.
          if (firebaseUser.email !== OWNER_EMAIL) {
            await signOut(auth);
            callback(null);
            return;
          }
          const fallback: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            firstName: 'Christopher',
            lastName: 'Sung',
            companyType: 'individual',
            isActive: true, status: 'active',
            registeredAt: new Date().toISOString(),
            role: 'owner',
            plan: 'standard',
          };
          callback(fallback);
        }
      } catch (e) {
        console.error('Auth State Error', e);
        callback(null);
      }
    } else {
      callback(null);
    }
  });
};

// --- User CRUD ---
export const getUsers = async (): Promise<User[]> => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(d => d.data() as User);
  } catch (error) {
    console.error('Fetch Users Error', error);
    return [];
  }
};

export const approveUser = async (userId: string, adminName = 'Admin') => {
  const patch: Record<string, any> = { status: 'active', isActive: true };
  // Trial flow: a manual admin approval must not mint an un-gated (forever
  // free) account — it opens the same 7-day window finalizeSignup would.
  // Backstop path only: the emailRegistry one-trial bookkeeping stays with
  // the server function (2026-07-27 audit item 1). Legacy mode is untouched.
  if (TRIAL_FLOW_ENABLED) {
    const ends = Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 86_400_000);
    patch.trialStartedAt = Timestamp.now();
    patch.trialEndsAt = ends;
    patch.accessUntilTs = ends;
  }
  await updateDoc(doc(db, 'users', userId), patch);
  await logActivity('ADMIN', 'APPROVE_USER', `User approved: ${userId}`, '', adminName);
};

export const rejectUser = async (userId: string, adminName = 'Admin') => {
  await updateDoc(doc(db, 'users', userId), { status: 'rejected', isActive: false });
  await logActivity('ADMIN', 'REJECT_USER', `User rejected: ${userId}`, '', adminName);
};

export const suspendUser = async (userId: string, adminName = 'Admin') => {
  await updateDoc(doc(db, 'users', userId), { status: 'suspended', isActive: false });
  await logActivity('ADMIN', 'SUSPEND_USER', `User suspended: ${userId}`, '', adminName);
};

export const disableUser = async (userId: string, adminName = 'Admin') => {
  await updateDoc(doc(db, 'users', userId), { status: 'disabled', isActive: false });
  await logActivity('ADMIN', 'DISABLE_USER', `User disabled: ${userId}`, '', adminName);
};

export const reactivateUser = async (userId: string, adminName = 'Admin') => {
  await updateDoc(doc(db, 'users', userId), { status: 'active', isActive: true });
  await logActivity('ADMIN', 'REACTIVATE_USER', `User reactivated: ${userId}`, '', adminName);
};

export const updateUserStatus = async (userId: string, isActive: boolean) => {
  try {
    await updateDoc(doc(db, 'users', userId), {
      isActive,
      status: isActive ? 'active' : 'suspended',
    });
  } catch (e) {
    console.error('Update Status Error', e);
  }
};

export const deleteUser = async (userId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (e) {
    console.error('Delete Error', e);
  }
};
