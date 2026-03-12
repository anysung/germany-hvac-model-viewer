import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  getUsers, getLogs, approveUser, rejectUser, suspendUser,
  reactivateUser, deleteUser, changeAdminPassword
} from '../services/authService';
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

// Status badge
const StatusBadge: React.FC<{ status?: string; isActive?: boolean }> = ({ status, isActive }) => {
  const resolved = status || (isActive ? 'active' : 'suspended');
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
    active:    { label: 'Active',    cls: 'bg-green-100 text-green-800 border border-green-200'   },
    suspended: { label: 'Suspended', cls: 'bg-orange-100 text-orange-800 border border-orange-200' },
    rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-800 border border-red-200'         },
  };
  const { label, cls } = map[resolved] ?? map.suspended;
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
};

// Action badge for logs
const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const map: Record<string, string> = {
    LOGIN: 'bg-blue-100 text-blue-700',
    LOGOUT: 'bg-gray-100 text-gray-600',
    REGISTER_PENDING: 'bg-yellow-100 text-yellow-700',
    APPROVE_USER: 'bg-green-100 text-green-700',
    REJECT_USER: 'bg-red-100 text-red-700',
    SUSPEND_USER: 'bg-orange-100 text-orange-700',
    REACTIVATE_USER: 'bg-teal-100 text-teal-700',
  };
  const cls = map[action] ?? 'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 text-xs font-bold rounded ${cls}`}>{action}</span>;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onLogout, lastUpdated, language, appMode, setAppMode
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'db' | 'logs' | 'stats' | 'settings'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFromDate, setLogFromDate] = useState('');
  const [logToDate, setLogToDate] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('all');

  const [metadata, setMetadata] = useState<DbMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const t = translations[language];

  // ── Data loading ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'stats') {
      getUsers().then(u => { setUsers(u); setFilteredUsers(u); });
    }
    if (activeTab === 'logs') {
      loadLogs();
    }
    if (activeTab === 'db') {
      setMetaLoading(true);
      getMetadata().then(m => { setMetadata(m); setMetaLoading(false); });
    }
  }, [activeTab]);

  const loadLogs = async (from?: string, to?: string) => {
    setLogsLoading(true);
    const f = (from !== undefined ? from : logFromDate) || undefined;
    const t2 = (to !== undefined ? to : logToDate) || undefined;
    const data = await getLogs(f, t2);
    setLogs(data);
    setLogsLoading(false);
  };

  // ── User filter ───────────────────────────────────────────────────
  useEffect(() => {
    let result = users;
    if (statusFilter !== 'all') {
      result = result.filter(u => (u.status || (u.isActive ? 'active' : 'suspended')) === statusFilter);
    }
    if (userSearch) {
      const q = userSearch.toLowerCase();
      result = result.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.companyName?.toLowerCase().includes(q))
      );
    }
    setFilteredUsers(result);
  }, [userSearch, statusFilter, users]);

  const refreshUsers = () => getUsers().then(u => setUsers(u));

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = {
    total:     users.length,
    pending:   users.filter(u => u.status === 'pending').length,
    active:    users.filter(u => u.status === 'active' || (!u.status && u.isActive)).length,
    suspended: users.filter(u => u.status === 'suspended').length,
    manufacturers: users.filter(u => u.companyType === 'Manufacturer').length,
    installers:    users.filter(u => u.companyType === 'Installer').length,
  };

  // ── Exports ───────────────────────────────────────────────────────
  const handleExportUsers = () => {
    const rows = users.map(u => ({
      'First Name': u.firstName, 'Last Name': u.lastName,
      'Email': u.email, 'Company Type': u.companyType, 'Job Role': u.jobRole,
      'Company': u.companyName || '', 'City': u.companyCity || '',
      'Referral': u.referralSource || '',
      'Status': u.status || (u.isActive ? 'active' : 'disabled'),
      'Registered': u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    XLSX.writeFile(wb, `members_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Log export filtered by date range and action
  const filteredLogs = logActionFilter === 'all' ? logs : logs.filter(l => l.action === logActionFilter);

  const handleExportLogs = () => {
    const rows = filteredLogs.map(l => ({
      'Timestamp': new Date(l.timestamp).toLocaleString(),
      'User Name': l.userName || '-',
      'Email': l.userEmail || '-',
      'Action': l.action,
      'Details': l.details,
      'User ID': l.userId,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
    const from = logFromDate || 'all';
    const to   = logToDate   || 'now';
    XLSX.writeFile(wb, `activity_logs_${from}_to_${to}.xlsx`);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { alert(t.passwordLength); return; }
    if (newPassword !== confirmPassword) { alert(t.passwordMismatch); return; }
    changeAdminPassword(newPassword);
    alert(t.passwordUpdated);
    setNewPassword(''); setConfirmPassword('');
  };

  const getNextScheduledUpdate = () => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 2, 0, 0));
    return next.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' 03:00 (Europe/Berlin)';
  };

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans">

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-800 text-white flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold flex items-center gap-2">🛡️ {t.adminPanel}</h2>
        </div>
        <nav className="flex-grow p-4 space-y-2">
          {(['users', 'db', 'logs', 'stats', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-2 rounded capitalize flex items-center justify-between ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-slate-700'}`}
            >
              <span>{t[`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as keyof typeof t]}</span>
              {tab === 'users' && stats.pending > 0 && (
                <span className="bg-yellow-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{stats.pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-white">{t.logoutAdmin}</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-grow p-8 overflow-y-auto mt-16 md:mt-0 h-screen">

        {/* ── USERS TAB ────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="flex flex-col h-full">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {t.userMgmt} <span className="text-sm font-normal text-gray-500">({filteredUsers.length})</span>
              </h2>

              {/* Pending notice */}
              {stats.pending > 0 && (
                <div className="mb-4 flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                  <span className="text-xl">⚠️</span>
                  <span><strong>{stats.pending} pending application{stats.pending > 1 ? 's' : ''}</strong> awaiting approval.</span>
                </div>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="relative flex-grow min-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                  <input
                    type="text" placeholder="Search by name, email, company..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  />
                </div>
                <select
                  value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button
                  onClick={handleExportUsers}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow-sm text-sm font-bold flex items-center gap-2 whitespace-nowrap"
                >
                  📥 Export Excel
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 flex-grow overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {['User', 'Company Type', 'Job Role', 'Company', 'City', 'Registered', 'Status', 'Actions'].map(h => (
                        <th key={h} className={`px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'Actions' ? 'text-right sticky right-0 bg-gray-50' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map(u => {
                      const userStatus = u.status || (u.isActive ? 'active' : 'suspended');
                      return (
                        <tr key={u.id} className={`hover:bg-blue-50 transition-colors ${userStatus === 'pending' ? 'bg-yellow-50/50' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-bold text-gray-900">{u.firstName} {u.lastName}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{u.companyType}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{u.jobRole}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{u.companyName || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{u.companyCity || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={userStatus} />
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3 whitespace-nowrap text-right space-x-1.5 sticky right-0 bg-white">
                            {userStatus === 'pending' && (
                              <>
                                <button
                                  onClick={async () => { await approveUser(u.id); refreshUsers(); }}
                                  className="text-xs px-3 py-1 rounded border border-green-400 text-green-700 hover:bg-green-50 font-bold"
                                >✓ Approve</button>
                                <button
                                  onClick={async () => { if (confirm(`Reject ${u.email}?`)) { await rejectUser(u.id); refreshUsers(); } }}
                                  className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                                >✗ Reject</button>
                              </>
                            )}
                            {userStatus === 'active' && (
                              <button
                                onClick={async () => { if (confirm(`Suspend ${u.email}?`)) { await suspendUser(u.id); refreshUsers(); } }}
                                className="text-xs px-3 py-1 rounded border border-orange-300 text-orange-600 hover:bg-orange-50"
                              >Suspend</button>
                            )}
                            {(userStatus === 'suspended' || userStatus === 'rejected') && (
                              <button
                                onClick={async () => { await reactivateUser(u.id); refreshUsers(); }}
                                className="text-xs px-3 py-1 rounded border border-teal-300 text-teal-600 hover:bg-teal-50"
                              >Reactivate</button>
                            )}
                            <button
                              onClick={async () => { if (confirm(`Permanently delete ${u.email}?`)) { await deleteUser(u.id); refreshUsers(); } }}
                              className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                            >Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">No members found.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── DATABASE TAB ─────────────────────────────────────────── */}
        {activeTab === 'db' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.dbMgmt}</h2>
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><span>🔄</span> Auto-Update Status</h3>
              {metaLoading ? (
                <p className="text-gray-500 text-sm animate-pulse">Loading...</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Products in DB', value: metadata?.productCount ?? '-', color: 'blue' },
                    { label: 'News Items',      value: metadata?.newsCount ?? '-',    color: 'green' },
                    { label: 'Last Updated',    value: metadata?.lastUpdated ? new Date(metadata.lastUpdated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never', color: 'purple' },
                    { label: 'Next Update',     value: getNextScheduledUpdate(), color: 'orange' },
                  ].map(s => (
                    <div key={s.label} className={`p-4 bg-${s.color}-50 rounded-lg border border-${s.color}-100`}>
                      <p className={`text-xs text-${s.color}-600 font-medium uppercase tracking-wide`}>{s.label}</p>
                      <p className={`text-sm font-bold text-${s.color}-800 mt-1`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
              {metadata?.lastUpdateStats && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm mb-4">
                  <p className="font-bold text-gray-700 mb-2">Last Run Statistics</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
                    <span>+{metadata.lastUpdateStats.productsAdded} products added</span>
                    <span>~{metadata.lastUpdateStats.productsUpdated} products updated</span>
                    {metadata.lastUpdateStats.budget && (
                      <>
                        <span className="text-green-700 font-medium">Cost: ${metadata.lastUpdateStats.budget.costUsd} / ${metadata.lastUpdateStats.budget.limitUsd}</span>
                        <span>{metadata.lastUpdateStats.budget.groundingRequests} search requests</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <strong>Schedule:</strong> Runs automatically on the 1st of every month at 03:00 (Europe/Berlin) via Cloud Scheduler. Sources: BAFA → Manufacturer → Retailer.
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
              <h3 className="text-lg font-bold mb-4">{t.appModeConfig}</h3>
              <div className="flex gap-6 items-center">
                {(['DATABASE', 'LIVE_API'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="appMode" checked={appMode === mode} onChange={() => setAppMode(mode)} className="form-radio text-blue-600" />
                    <span>
                      <span className="font-medium">{mode === 'DATABASE' ? t.modeDatabase : t.modeLive}</span>
                      <span className="text-xs text-gray-500 block">{mode === 'DATABASE' ? 'Serve from Firestore (recommended)' : 'Real-time Gemini AI search (uses tokens)'}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">Current: <span className={`font-bold ${appMode === 'DATABASE' ? 'text-green-700' : 'text-blue-700'}`}>{appMode === 'DATABASE' ? t.dbMode : t.liveMode}</span></p>
            </div>
          </div>
        )}

        {/* ── LOGS TAB ─────────────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="flex flex-col h-full">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Activity Logs</h2>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From</label>
                <input
                  type="date" value={logFromDate}
                  onChange={e => setLogFromDate(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">To</label>
                <input
                  type="date" value={logToDate}
                  onChange={e => setLogToDate(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Action</label>
                <select
                  value={logActionFilter} onChange={e => setLogActionFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Actions</option>
                  {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <button
                onClick={() => loadLogs(logFromDate, logToDate)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg"
              >
                🔍 Search
              </button>
              <button
                onClick={() => { setLogFromDate(''); setLogToDate(''); setLogActionFilter('all'); loadLogs('', ''); }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg"
              >
                Reset
              </button>
              <p className="text-xs text-gray-400 self-end ml-auto">{filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow border border-gray-200 flex-grow overflow-hidden flex flex-col min-h-0">
              {logsLoading ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm animate-pulse">Loading logs...</div>
              ) : (
                <div className="overflow-auto flex-grow">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {['Timestamp', 'User', 'Action', 'Details'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {log.userName ? (
                              <>
                                <div className="text-xs font-bold text-gray-800">{log.userName}</div>
                                <div className="text-xs text-gray-400">{log.userEmail || log.userId.slice(0, 10) + '...'}</div>
                              </>
                            ) : (
                              <div className="text-xs text-gray-500 font-mono">{log.userId.slice(0, 12)}...</div>
                            )}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap"><ActionBadge action={log.action} /></td>
                          <td className="px-4 py-2 text-xs text-gray-600">{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredLogs.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">No logs found for the selected filters.</div>
                  )}
                </div>
              )}
            </div>

            {/* Excel Export */}
            <div className="mt-4 flex items-center justify-between bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Export raw log data</span>
                {(logFromDate || logToDate) && (
                  <span className="text-gray-400 ml-2">
                    {logFromDate || '—'} → {logToDate || 'now'}
                  </span>
                )}
              </div>
              <button
                onClick={handleExportLogs}
                disabled={filteredLogs.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors"
              >
                📊 Export to Excel (.xlsx)
              </button>
            </div>
          </div>
        )}

        {/* ── STATS TAB ────────────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.analytics}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {[
                { label: 'Total',     value: stats.total,         color: 'blue'   },
                { label: 'Pending',   value: stats.pending,       color: 'yellow' },
                { label: 'Active',    value: stats.active,        color: 'green'  },
                { label: 'Suspended', value: stats.suspended,     color: 'orange' },
                { label: 'Manufacturers', value: stats.manufacturers, color: 'purple' },
                { label: 'Installers',    value: stats.installers,    color: 'teal'   },
              ].map(s => (
                <div key={s.label} className={`bg-white p-4 rounded-lg shadow border-l-4 border-${s.color}-500`}>
                  <div className="text-gray-500 text-xs uppercase font-medium mb-1">{s.label}</div>
                  <div className="text-3xl font-bold text-gray-800">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ─────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.adminSettings}</h2>
            <div className="bg-white max-w-md p-6 rounded-lg shadow border border-gray-200">
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
