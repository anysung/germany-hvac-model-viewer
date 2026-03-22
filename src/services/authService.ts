import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User, ActivityLog } from '../types';

const OWNER_EMAIL = 'sungyongsoo1976@gmail.com';

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

// --- Admin Auth (local password) ---
const ADMIN_PASS_KEY = 'ghpd_admin_pass';
const DEFAULT_ADMIN_PASS = '10041004';

export const verifyAdminPassword = (inputPass: string): boolean => {
  const storedPass = localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_ADMIN_PASS;
  return inputPass === storedPass;
};

export const changeAdminPassword = (newPass: string) => {
  localStorage.setItem(ADMIN_PASS_KEY, newPass);
  logActivity('ADMIN', 'PASS_CHANGE', 'Admin password updated');
};

// --- Registration (status: pending, auto sign-out) ---
export const registerUser = async (userData: any): Promise<void> => {
  const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password);
  const uid = userCredential.user?.uid;
  if (!uid) throw new Error('User ID missing');

  const newUser: User = {
    id: uid,
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    companyType: userData.companyType,
    jobRole: userData.jobRole,
    companyName: userData.companyName || '',
    companyCity: userData.companyCity || '',
    referralSource: userData.referralSource || '',
    isActive: false,
    status: 'pending',
    registeredAt: new Date().toISOString(),
    role: 'user',
    plan: 'standard',
  };

  await setDoc(doc(db, 'users', uid), newUser);
  // Sign out immediately — must wait for admin approval
  await signOut(auth);
  await logActivity(uid, 'REGISTER_PENDING', `Registration pending: ${userData.email}`, userData.email, `${userData.firstName} ${userData.lastName}`);
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
      // Owner fallback
      const fallbackUser: User = {
        id: uid, email,
        firstName: email === OWNER_EMAIL ? 'Christopher' : 'User',
        lastName: email === OWNER_EMAIL ? 'Sung' : '',
        companyType: 'Private Individual', jobRole: 'General Public',
        isActive: true, status: 'active',
        registeredAt: new Date().toISOString(),
        role: email === OWNER_EMAIL ? 'owner' : 'user',
        plan: 'standard',
      };
      await setDoc(userDocRef, fallbackUser);
      await logActivity(fallbackUser.id, 'LOGIN', 'User logged in (profile created)', email, `${fallbackUser.firstName} ${fallbackUser.lastName}`);
      return fallbackUser;
    }

    const userData = {
      ...userDoc.data() as User,
      role: email === OWNER_EMAIL ? 'owner' as const : (userDoc.data() as User).role || 'user' as const,
    };

    if (userData.status === 'pending') {
      await signOut(auth);
      throw new Error('Your registration is pending admin approval. You will be notified once approved.');
    }
    if (userData.status === 'suspended') {
      await signOut(auth);
      throw new Error('Your account has been suspended. Please contact the administrator.');
    }
    if (userData.status === 'rejected') {
      await signOut(auth);
      throw new Error('Your registration was not approved. Please contact the administrator.');
    }
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error('Account is deactivated.');
    }

    await logActivity(userData.id, 'LOGIN', 'User logged in', email, `${userData.firstName} ${userData.lastName}`);
    return userData;
  } catch (error: any) {
    throw new Error(error.message);
  }
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
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          const enriched = {
            ...userData,
            role: firebaseUser.email === OWNER_EMAIL ? 'owner' as const : userData.role || 'user' as const,
          };
          callback(enriched);
        } else {
          const fallback: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            firstName: firebaseUser.email === OWNER_EMAIL ? 'Christopher' : 'User',
            lastName: firebaseUser.email === OWNER_EMAIL ? 'Sung' : '',
            companyType: 'Private Individual', jobRole: 'General Public',
            isActive: true, status: 'active',
            registeredAt: new Date().toISOString(),
            role: firebaseUser.email === OWNER_EMAIL ? 'owner' : 'user',
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
  await updateDoc(doc(db, 'users', userId), { status: 'active', isActive: true });
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
