import React, { useState, useEffect } from 'react';
import { loginUser, registerUser, logoutUser, verifyAdminPassword, onUserChange } from './services/authService';
import { HeatPumpApp } from './components/HeatPumpApp';
import { AdminDashboard } from './components/AdminDashboard';
import { HeatPumpDatabase, HeatPump, User, AppMode, Language } from './types';
import { translations } from './translations';
// Use Firestore Service
import { getProducts, getCommercialProducts, getNews, getPolicies, getBAFA } from './services/dbService';

type ViewState = 'LANDING' | 'LOGIN' | 'SIGNUP' | 'PENDING_APPROVAL' | 'APP' | 'ADMIN_GATE' | 'ADMIN_LOGIN' | 'ADMIN_DASHBOARD';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>('en');

  const [fullDatabase, setFullDatabase] = useState<HeatPumpDatabase | null>(null);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [signupData, setSignupData] = useState<any>({});
  const [adminPinInput, setAdminPinInput] = useState('');
  
  const t = translations[language];

  useEffect(() => {
    // 1. Auth
    const unsubscribe = onUserChange((user) => {
      setCurrentUser(user);
      if (user) {
        const isAuthView = currentView === 'LANDING' || currentView === 'LOGIN' || currentView === 'SIGNUP';
        if (isAuthView) {
          // Block pending/suspended users even if Firebase session exists
          if (user.status === 'pending') {
            setCurrentView('PENDING_APPROVAL');
          } else if (user.status === 'suspended' || user.status === 'rejected') {
            logoutUser();
          } else {
            setCurrentView('APP');
          }
        }
      } else {
        if (currentView === 'APP') {
          setCurrentView('LANDING');
        }
      }
      setAuthLoading(false);
    });

    // 2. Load Data from Firestore
    const loadData = async () => {
      try {
        const [products, commercialProducts, news, policies, bafa] = await Promise.all([
            getProducts(),
            getCommercialProducts(),
            getNews(),
            getPolicies(),
            getBAFA()
        ]);

        const dbData: HeatPumpDatabase = {
            generatedAt: new Date().toISOString(),
            version: "Firestore-Live",
            appMode: 'DATABASE',
            products: products,
            commercialProducts: commercialProducts,
            newsFeed: news,
            policySummary: policies,
            bafaListLinks: bafa
        };
        setFullDatabase(dbData);
      } catch (err) { 
          console.error("Failed to load Firestore data", err); 
      }
    };
    loadData();

    return () => unsubscribe();
  }, [currentView]); 

  // ... (Keep all Handlers: handleLogin, handleSignup, etc. EXACTLY AS THEY WERE) ...
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await loginUser(loginEmail, loginPass);
      setLoginEmail(''); setLoginPass('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await registerUser(signupData);
      setCurrentView('PENDING_APPROVAL');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    const email = currentUser?.email || '';
    const name = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : '';
    await logoutUser(email, name);
  };

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPassword(adminPinInput)) {
      setCurrentView('ADMIN_DASHBOARD');
    } else {
      alert("Invalid Password");
      setAdminPinInput('');
    }
  };

  // Owner can access Admin Dashboard directly from APP view
  const handleOwnerAdminAccess = () => {
    if (currentUser?.role === 'owner') {
      setCurrentView('ADMIN_DASHBOARD');
    }
  };

  const updateProducts = (newProducts: HeatPump[]) => {
    setFullDatabase(prev => prev ? { ...prev, products: newProducts } : null);
  };

  const updateLastUpdated = (date: string) => {
    setFullDatabase(prev => prev ? { ...prev, generatedAt: date } : null);
  };

  const updateAppMode = (mode: AppMode) => {
    setFullDatabase(prev => prev ? { ...prev, appMode: mode } : null);
  };

  // ... (Language Switcher Component - Keep same) ...
  const LanguageSwitcher = () => (
    <div className="fixed top-6 right-6 z-50 flex gap-6">
      <button onClick={() => setLanguage('en')} className={`text-5xl transition-transform hover:scale-110 drop-shadow-md ${language === 'en' ? 'opacity-100 scale-110' : 'opacity-60'}`}>🇬🇧</button>
      <button onClick={() => setLanguage('de')} className={`text-5xl transition-transform hover:scale-110 drop-shadow-md ${language === 'de' ? 'opacity-100 scale-110' : 'opacity-60'}`}>🇩🇪</button>
    </div>
  );

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Loading App...</div>;

  // ... (Return JSX - Keep exactly the same structure as before) ...
  // I am omitting the full JSX here for brevity as it hasn't changed, just the data loading logic above.
  // Please ensure you keep the full JSX for LANDING, LOGIN, SIGNUP, APP, ADMIN_DASHBOARD.
  
  // ... (Previous JSX code) ...
  if (currentView === 'LANDING') {
      // ... (Same as previous App.tsx)
      return (
      <div className="min-h-screen relative flex items-center justify-center font-sans">
        <LanguageSwitcher />
        <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070')" }}></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/80 via-blue-900/50 to-slate-900/80 z-10"></div>
        <div className="absolute top-0 left-0 w-1/2 h-[10%] z-20 p-6 flex items-center gap-4 text-white">
          <span className="text-4xl md:text-5xl shadow-sm">🇩🇪</span>
          <div><h1 className="text-2xl md:text-3xl font-bold tracking-tight">German Heat Pump Database</h1><p className="text-sm opacity-80">{t.subTitle}</p></div>
        </div>
        <div className="z-20 w-full max-w-md p-8 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl flex flex-col gap-4 animate-fade-in-up">
          <h2 className="text-center text-white text-xl font-medium mb-4">{t.welcomeTitle}</h2>
          <button onClick={() => setCurrentView('SIGNUP')} className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition transform hover:scale-105">{t.signup}</button>
          <button onClick={() => setCurrentView('LOGIN')} className="w-full py-3.5 px-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-lg shadow-lg transition transform hover:scale-105">{t.login}</button>
          <div className="mt-8 text-center"><button onClick={() => setCurrentView('ADMIN_GATE')} className="text-gray-400 text-xs hover:text-white underline">{t.adminAccess}</button></div>
        </div>
      </div>
    );
  }
  if (currentView === 'LOGIN') { 
     // ... (Same as previous App.tsx)
     return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans relative">
        <LanguageSwitcher />
        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">
          <button onClick={() => setCurrentView('LANDING')} className="text-gray-400 mb-4 hover:text-gray-600">← {t.back}</button>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.loginTitle}</h2>
          <p className="text-gray-500 mb-6">{t.loginSub}</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700">{t.email}</label><input type="email" required className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-blue-500 outline-none" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700">{t.password}</label><input type="password" required className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-blue-500 outline-none" value={loginPass} onChange={e => setLoginPass(e.target.value)} /></div>
            <div className="flex justify-end"><button type="button" onClick={() => alert("Reset link sent to email.")} className="text-sm text-blue-600 hover:underline">{t.forgotPass}</button></div>
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors">{isLoading ? t.loggingIn : t.loginTitle}</button>
          </form>
        </div>
      </div>
    );
  }
  if (currentView === 'SIGNUP') { 
    // ... (Same as previous App.tsx)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans relative">
        <LanguageSwitcher />
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-8">
          <button onClick={() => setCurrentView('LANDING')} className="text-gray-400 mb-4 hover:text-gray-600">← {t.back}</button>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t.createAccount}</h2>
          <form onSubmit={handleSignup} className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="col-span-1"><label className="block text-xs font-bold text-gray-700 uppercase mb-1">{t.firstName} *</label><input type="text" required className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none" onChange={e => setSignupData({...signupData, firstName: e.target.value})} /></div>
             <div className="col-span-1"><label className="block text-xs font-bold text-gray-700 uppercase mb-1">{t.lastName} *</label><input type="text" required className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none" onChange={e => setSignupData({...signupData, lastName: e.target.value})} /></div>
             <div className="col-span-2"><label className="block text-xs font-bold text-gray-700 uppercase mb-1">{t.email} *</label><input type="email" required className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none" onChange={e => setSignupData({...signupData, email: e.target.value})} /></div>
             <div className="col-span-2"><label className="block text-xs font-bold text-gray-700 uppercase mb-1">{t.password} *</label><input type="password" required className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none" onChange={e => setSignupData({...signupData, password: e.target.value})} /></div>
             <div className="col-span-1"><label className="block text-xs font-bold text-gray-700 uppercase mb-1">{t.companyType} *</label><select required className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none bg-white" onChange={e => setSignupData({...signupData, companyType: e.target.value})}><option value="">{t.select}</option><option value="Manufacturer">Manufacturer</option><option value="Distributor">Distributor</option><option value="Installer">Installer</option><option value="Private Individual">Private Individual</option></select></div>
             <div className="col-span-1"><label className="block text-xs font-bold text-gray-700 uppercase mb-1">{t.jobRole} *</label><select required className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none bg-white" onChange={e => setSignupData({...signupData, jobRole: e.target.value})}><option value="">{t.select}</option><option value="C-Level">C-Level</option><option value="Director">Director</option><option value="Sales Manager">Sales Manager</option><option value="Technician">Technician</option><option value="Service">Service</option><option value="Product Management">Product Management</option><option value="General Public">General Public</option><option value="Other">Other</option></select></div>
             <div className="col-span-1"><label className="block text-xs font-bold text-gray-400 uppercase mb-1">{t.companyName}</label><input type="text" className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none" onChange={e => setSignupData({...signupData, companyName: e.target.value})} /></div>
             <div className="col-span-1"><label className="block text-xs font-bold text-gray-400 uppercase mb-1">{t.city}</label><input type="text" className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none" onChange={e => setSignupData({...signupData, companyCity: e.target.value})} /></div>
             <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 uppercase mb-1">{t.referralSource}</label><select className="w-full px-3 py-2 border rounded focus:ring-blue-500 outline-none bg-white" onChange={e => setSignupData({...signupData, referralSource: e.target.value})}><option value="">{t.select}</option><option value="Google">Google Search</option><option value="Friend">Friend/Colleague</option><option value="Ad">Online Ad</option><option value="Other">Other</option></select></div>
             <div className="col-span-2 mt-4"><button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg">{isLoading ? t.registering : t.completeSignup}</button></div>
          </form>
        </div>
      </div>
    );
  }
  if (currentView === 'PENDING_APPROVAL') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans relative">
        <LanguageSwitcher />
        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-10 text-center">
          <div className="text-6xl mb-6">⏳</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Registration Submitted</h2>
          <p className="text-gray-600 mb-2">Your application is <span className="font-semibold text-yellow-600">pending approval</span>.</p>
          <p className="text-gray-500 text-sm mb-8">
            An administrator will review your registration and notify you by email once your account is activated. This typically takes 1–2 business days.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700 mb-8 text-left">
            <p className="font-bold mb-1">What happens next?</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-600">
              <li>Admin reviews your profile</li>
              <li>Account is approved &amp; activated</li>
              <li>You can log in with your credentials</li>
            </ol>
          </div>
          <button
            onClick={() => setCurrentView('LANDING')}
            className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (currentView === 'ADMIN_GATE') {
    // ... (Same as previous App.tsx)
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans relative">
        <LanguageSwitcher />
        <div className="w-full max-w-sm text-center">
          <h2 className="text-white text-xl font-mono mb-6">ADMIN ACCESS CONTROL</h2>
          <form onSubmit={handleAdminPinSubmit}>
            <input type="password" className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-600 text-white text-center rounded-lg outline-none focus:border-blue-500 mb-6 text-lg" placeholder="Enter Password" value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} autoFocus />
            <div className="flex gap-4 justify-center"><button type="button" onClick={() => setCurrentView('LANDING')} className="px-6 py-2 text-slate-400 hover:text-white">Cancel</button><button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-500">Enter</button></div>
          </form>
        </div>
      </div>
    );
  }
  if (currentView === 'ADMIN_DASHBOARD') {
    return (
      <div className="relative">
         <LanguageSwitcher />
         <AdminDashboard 
          onLogout={() => { setCurrentView('LANDING'); setAdminPinInput(''); }} 
          cachedDatabase={fullDatabase?.products || null}
          lastUpdated={fullDatabase?.generatedAt || null}
          setCachedDatabase={updateProducts}
          setLastUpdated={updateLastUpdated}
          language={language}
          appMode={fullDatabase?.appMode || 'DATABASE'}
          setAppMode={updateAppMode}
        />
      </div>
    );
  }
  if (currentView === 'APP' && currentUser) {
    return (
      <div className="relative h-full">
        <LanguageSwitcher />
        <HeatPumpApp
          user={currentUser}
          onLogout={handleLogout}
          onAdminAccess={currentUser.role === 'owner' ? handleOwnerAdminAccess : undefined}
          dbData={fullDatabase}
          lastUpdated={fullDatabase?.generatedAt || null}
          language={language}
          appMode={fullDatabase?.appMode || 'DATABASE'}
        />
      </div>
    );
  }

  return <div>Loading View...</div>;
};
export default App;