import React, { useState, useEffect } from 'react';
import { getUsers } from '../services/authService';
import { User, Language, AppMode } from '../types';
import { ADMIN_MENU, AdminPage } from '../config/adminConfig';
import { translations } from '../translations';

// Page components
import { OverviewPage } from './admin/OverviewPage';
import { MembersPage } from './admin/MembersPage';
import { PlansPage } from './admin/PlansPage';
import { BillingPage } from './admin/BillingPage';
import { UsagePage } from './admin/UsagePage';
import { CompliancePage } from './admin/CompliancePage';
import { DataOpsPage } from './admin/DataOpsPage';
import { AuditPage } from './admin/AuditPage';
import { AnalyticsPage } from './admin/AnalyticsPage';
import { SettingsPage } from './admin/SettingsPage';

interface AdminDashboardProps {
  onLogout: () => void;
  cachedDatabase: any[] | null;
  lastUpdated: string | null;
  setCachedDatabase: (data: any[]) => void;
  setLastUpdated: (date: string) => void;
  language: Language;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onLogout, language, appMode, setAppMode
}) => {
  const [activePage, setActivePage] = useState<AdminPage>('overview');
  const [pendingUsers, setPendingUsers] = useState(0);
  const [deletionRequests, setDeletionRequests] = useState(0);
  const t = translations[language];

  // Load badge counts
  useEffect(() => {
    getUsers().then(users => {
      setPendingUsers(users.filter(u => u.status === 'pending').length);
      setDeletionRequests(users.filter(u => u.status === 'deletion_requested').length);
    });
  }, [activePage]);

  const badgeCtx = { pendingUsers, deletionRequests };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-800 text-white flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold flex items-center gap-2">🛡️ {t.adminPanel}</h2>
          <div className="text-xs text-slate-400 mt-0.5">Operations Console</div>
        </div>

        <nav className="flex-grow p-3 space-y-0.5 overflow-y-auto">
          {ADMIN_MENU.map(item => {
            const badge = item.getBadge?.(badgeCtx) || 0;
            const isActive = activePage === item.key;
            const label = language === 'de' ? item.labelDe : item.labelEn;

            return (
              <button
                key={item.key}
                onClick={() => setActivePage(item.key)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm">{item.icon}</span>
                  <span>{label}</span>
                </span>
                {badge > 0 && (
                  <span className="bg-yellow-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
            <span>🚪</span> {t.logoutAdmin}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-6 overflow-y-auto mt-16 md:mt-0 h-screen">
        {activePage === 'overview' && <OverviewPage language={language} />}
        {activePage === 'members' && <MembersPage language={language} />}
        {activePage === 'plans' && <PlansPage language={language} />}
        {activePage === 'billing' && <BillingPage language={language} />}
        {activePage === 'usage' && <UsagePage language={language} />}
        {activePage === 'compliance' && <CompliancePage language={language} />}
        {activePage === 'data_ops' && <DataOpsPage language={language} appMode={appMode} setAppMode={setAppMode} />}
        {activePage === 'audit' && <AuditPage language={language} />}
        {activePage === 'analytics' && <AnalyticsPage language={language} />}
        {activePage === 'settings' && <SettingsPage language={language} />}
      </main>
    </div>
  );
};
