import React, { useState, useEffect } from 'react';
import { getUsers, getLogs, updateUserStatus, deleteUser, changeAdminPassword } from '../services/authService';
import { getMetadata, DbMetadata } from '../services/dbService';
import { User, ActivityLog, Language, AppMode } from '../types';
import { translations } from '../translations';

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
  onLogout, lastUpdated, language, appMode, setAppMode
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'db' | 'logs' | 'stats' | 'settings'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [metadata, setMetadata] = useState<DbMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const t = translations[language];

  useEffect(() => {
    const fetchUsersData = async () => {
      if (activeTab === 'users' || activeTab === 'stats') {
        const fetchedUsers = await getUsers();
        setUsers(fetchedUsers);
        setFilteredUsers(fetchedUsers);
      }
    };
    fetchUsersData();

    if (activeTab === 'logs') {
      setLogs(getLogs());
    }

    if (activeTab === 'db') {
      setMetaLoading(true);
      getMetadata().then(m => { setMetadata(m); setMetaLoading(false); });
    }
  }, [activeTab]);

  useEffect(() => {
    if (!userSearch) {
      setFilteredUsers(users);
    } else {
      const q = userSearch.toLowerCase();
      setFilteredUsers(users.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.companyName && u.companyName.toLowerCase().includes(q))
      ));
    }
  }, [userSearch, users]);

  const handleExportUsers = () => {
    const headers = ["ID", "Email", "First Name", "Last Name", "Company Type", "Job Role", "Company Name", "City", "Referral", "Status", "Registered"];
    const csvContent = [
      headers.join(","),
      ...users.map(u => [
        u.id, u.email, u.firstName, u.lastName, u.companyType, u.jobRole,
        `"${u.companyName || ''}"`, `"${u.companyCity || ''}"`,
        `"${u.referralSource || ''}"`, u.isActive ? "Active" : "Disabled", u.registeredAt
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `members_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { alert(t.passwordLength); return; }
    if (newPassword !== confirmPassword) { alert(t.passwordMismatch); return; }
    changeAdminPassword(newPassword);
    alert(t.passwordUpdated);
    setNewPassword('');
    setConfirmPassword('');
  };

  const getStats = () => {
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.isActive).length;
    const manufacturers = users.filter(u => u.companyType === 'Manufacturer').length;
    const installers = users.filter(u => u.companyType === 'Installer').length;
    return { totalUsers, activeUsers, manufacturers, installers };
  };

  const refreshUsers = async () => {
    const updatedUsers = await getUsers();
    setUsers(updatedUsers);
  };

  const stats = getStats();

  // Next 1st of month at 03:00 Europe/Berlin
  const getNextScheduledUpdate = () => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 2, 0, 0)); // UTC 02:00 = Berlin 03:00
    return next.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' 03:00 (Europe/Berlin)';
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-800 text-white flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            🛡️ {t.adminPanel}
          </h2>
        </div>
        <nav className="flex-grow p-4 space-y-2">
          {(['users', 'db', 'logs', 'stats', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-2 rounded capitalize ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-slate-700'}`}
            >
              {t[`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as keyof typeof t]}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
            {t.logoutAdmin}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-8 overflow-y-auto mt-16 md:mt-0 h-screen">

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="flex flex-col h-full">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {t.userMgmt} <span className="text-sm font-normal text-gray-500">({filteredUsers.length})</span>
              </h2>
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="w-full sm:max-w-md relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by Name, Email, Company..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleExportUsers}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow-sm text-sm font-bold flex items-center gap-2 whitespace-nowrap"
                >
                  <span>📥</span> {t.exportCsv}
                </button>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow border border-gray-200 flex-grow overflow-hidden flex flex-col">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {["User", "Type", "Role", "Company", "City", "Referral", "Registered", "Status", "Actions"].map(h => (
                        <th key={h} className={`px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'Actions' ? 'text-right sticky right-0 bg-gray-50 shadow-l' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-900">{u.firstName} {u.lastName}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          <span className="px-2 py-1 rounded-full bg-gray-100 text-xs">{u.companyType}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{u.jobRole}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{u.companyName || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{u.companyCity || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.referralSource || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {u.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 sticky right-0 bg-white shadow-l">
                          <button
                            onClick={async () => { await updateUserStatus(u.id, !u.isActive); refreshUsers(); }}
                            className={`text-xs px-3 py-1 rounded border ${u.isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                          >
                            {u.isActive ? 'Block' : 'Activate'}
                          </button>
                          <button
                            onClick={async () => { if (confirm('Delete user permanently?')) { await deleteUser(u.id); refreshUsers(); } }}
                            className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DATABASE TAB */}
        {activeTab === 'db' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.dbMgmt}</h2>

            {/* Auto-Update Status */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>🔄</span> Auto-Update Status
              </h3>
              {metaLoading ? (
                <p className="text-gray-500 text-sm animate-pulse">Loading status...</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Products in DB</p>
                    <p className="text-2xl font-bold text-blue-800 mt-1">{metadata?.productCount ?? '-'}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                    <p className="text-xs text-green-600 font-medium uppercase tracking-wide">News Items</p>
                    <p className="text-2xl font-bold text-green-800 mt-1">{metadata?.newsCount ?? '-'}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">Last Updated</p>
                    <p className="text-sm font-bold text-purple-800 mt-1">
                      {metadata?.lastUpdated
                        ? new Date(metadata.lastUpdated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                        : 'Never'}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">Next Update</p>
                    <p className="text-sm font-bold text-orange-800 mt-1">{getNextScheduledUpdate()}</p>
                  </div>
                </div>
              )}

              {/* Last update stats */}
              {metadata?.lastUpdateStats && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                  <p className="font-bold text-gray-700 mb-2">Last Run Statistics</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
                    <span>+{metadata.lastUpdateStats.productsAdded} products added</span>
                    <span>~{metadata.lastUpdateStats.productsUpdated} products updated</span>
                    {metadata.lastUpdateStats.budget && (
                      <>
                        <span className="text-green-700 font-medium">
                          Cost: ${metadata.lastUpdateStats.budget.costUsd} / ${metadata.lastUpdateStats.budget.limitUsd} budget
                        </span>
                        <span>{metadata.lastUpdateStats.budget.groundingRequests} search requests</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <strong>Schedule:</strong> Runs automatically on the 1st of every month at 03:00 (Europe/Berlin) via Cloud Scheduler. Data sources: BAFA → Manufacturer sites → Retailer sites.
              </div>
            </div>

            {/* App Mode */}
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
              <h3 className="text-lg font-bold mb-4">{t.appModeConfig}</h3>
              <div className="flex gap-6 items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="appMode" checked={appMode === 'DATABASE'} onChange={() => setAppMode('DATABASE')} className="form-radio text-blue-600" />
                  <span>
                    <span className="font-medium">{t.modeDatabase}</span>
                    <span className="text-xs text-gray-500 block">Serve from Firestore (recommended)</span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="appMode" checked={appMode === 'LIVE_API'} onChange={() => setAppMode('LIVE_API')} className="form-radio text-blue-600" />
                  <span>
                    <span className="font-medium">{t.modeLive}</span>
                    <span className="text-xs text-gray-500 block">Real-time Gemini AI search (uses tokens)</span>
                  </span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Current mode: <span className={`font-bold ${appMode === 'DATABASE' ? 'text-green-700' : 'text-blue-700'}`}>{appMode === 'DATABASE' ? t.dbMode : t.liveMode}</span>
              </p>
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">System Logs</h2>
            <div className="bg-white rounded shadow overflow-hidden max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["Time", "User ID", "Action", "Details"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="px-6 py-2 text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-2 text-xs text-gray-500 font-mono">{log.userId.slice(0, 8)}...</td>
                      <td className="px-6 py-2 text-xs font-bold text-gray-700">{log.action}</td>
                      <td className="px-6 py-2 text-xs text-gray-600">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.analytics}</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: t.totalUsers, value: stats.totalUsers, color: 'blue' },
                { label: t.activeUsers, value: stats.activeUsers, color: 'green' },
                { label: 'Manufacturers', value: stats.manufacturers, color: 'purple' },
                { label: 'Installers', value: stats.installers, color: 'orange' },
              ].map(s => (
                <div key={s.label} className={`bg-white p-4 rounded shadow border-l-4 border-${s.color}-500`}>
                  <div className="text-gray-500 text-sm">{s.label}</div>
                  <div className="text-2xl font-bold">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.adminSettings}</h2>
            <div className="bg-white max-w-md p-6 rounded shadow border border-gray-200">
              <h3 className="text-lg font-bold mb-4">{t.changePassword}</h3>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.newPassword}</label>
                  <input type="password" className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-blue-500 outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t.confirmPassword}</label>
                  <input type="password" className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-blue-500 outline-none" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">{t.updatePassword}</button>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
