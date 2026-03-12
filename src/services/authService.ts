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
  getDocs 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User, ActivityLog } from '../types';

const ADMIN_PASS_KEY = 'ghpd_admin_pass';
const DEFAULT_ADMIN_PASS = '10041004';
const OWNER_EMAIL = 'sungyongsoo1976@gmail.com';

// --- Activity Logging ---
export const logActivity = async (userId: string, action: string, details: string) => {
  try {
    const newLog = {
      userId,
      action,
      details,
      timestamp: new Date().toISOString()
    };
    const logs = JSON.parse(localStorage.getItem('ghpd_logs') || '[]');
    localStorage.setItem('ghpd_logs', JSON.stringify([newLog, ...logs].slice(0, 500)));
  } catch (error) {
    console.error("Log error", error);
  }
};

export const getLogs = (): ActivityLog[] => {
  return JSON.parse(localStorage.getItem('ghpd_logs') || '[]');
};

// --- Admin Auth ---
export const verifyAdminPassword = (inputPass: string): boolean => {
  const storedPass = localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_ADMIN_PASS;
  return inputPass === storedPass;
};

export const changeAdminPassword = (newPass: string) => {
  localStorage.setItem(ADMIN_PASS_KEY, newPass);
  logActivity('ADMIN', 'PASS_CHANGE', 'Admin password updated');
};

// --- Firestore User Management (Modular) ---

export const registerUser = async (userData: any): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password);
    const uid = userCredential.user?.uid;

    if (!uid) throw new Error("User ID missing");

    const newUser: User = {
      id: uid,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      companyType: userData.companyType,
      jobRole: userData.jobRole,
      companyName: userData.companyName,
      companyCity: userData.companyCity,
      referralSource: userData.referralSource,
      isActive: true,
      registeredAt: new Date().toISOString(),
    };

    // Modular: setDoc
    await setDoc(doc(db, 'users', uid), newUser);
    
    logActivity(uid, 'REGISTER', `User registered: ${newUser.email}`);
    return newUser;
  } catch (error: any) {
    console.error("Registration Error", error);
    throw new Error(error.message);
  }
};

export const loginUser = async (email: string, pass: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    const uid = userCredential.user?.uid;
    
    if (!uid) throw new Error("Login failed");

    // Modular: getDoc
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      console.warn(`Profile missing for user ${uid}. Creating default profile.`);
      const fallbackUser: User = {
        id: uid,
        email: email,
        firstName: email === OWNER_EMAIL ? 'Christopher' : 'User',
        lastName: email === OWNER_EMAIL ? 'Sung' : '',
        companyType: 'Private Individual',
        jobRole: 'General Public',
        isActive: true,
        registeredAt: new Date().toISOString(),
        role: email === OWNER_EMAIL ? 'owner' : 'user',
      };
      await setDoc(userDocRef, fallbackUser);
      logActivity(fallbackUser.id, 'LOGIN', 'User logged in (Profile Created)');
      return fallbackUser;
    }

    const userData = { ...userDoc.data() as User, role: email === OWNER_EMAIL ? 'owner' : (userDoc.data() as User).role || 'user' };
    
    if (!userData.isActive) {
      await signOut(auth);
      throw new Error("Account is deactivated by Admin.");
    }

    logActivity(userData.id, 'LOGIN', 'User logged in');
    return userData;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const logoutUser = async () => {
  const user = auth.currentUser;
  if(user) logActivity(user.uid, 'LOGOUT', 'User logged out');
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
          const enriched = { ...userData, role: firebaseUser.email === OWNER_EMAIL ? 'owner' as const : userData.role || 'user' as const };
          callback(enriched);
        } else {
          const fallbackUser: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            firstName: firebaseUser.email === OWNER_EMAIL ? 'Christopher' : 'User',
            lastName: firebaseUser.email === OWNER_EMAIL ? 'Sung' : '',
            companyType: 'Private Individual',
            jobRole: 'General Public',
            isActive: true,
            registeredAt: new Date().toISOString(),
            role: firebaseUser.email === OWNER_EMAIL ? 'owner' : 'user',
          };
          callback(fallbackUser);
        }
      } catch (e) {
        console.error("Auth State Error", e);
        callback(null);
      }
    } else {
      callback(null);
    }
  });
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => doc.data() as User);
  } catch (error) {
    console.error("Fetch Users Error", error);
    return [];
  }
};

export const updateUserStatus = async (userId: string, isActive: boolean) => {
  try {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, { isActive });
  } catch (e) {
    console.error("Update Status Error", e);
    alert("Failed to update status");
  }
};

export const deleteUser = async (userId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (e) {
    console.error("Delete Error", e);
    alert("Failed to delete user profile");
  }
};