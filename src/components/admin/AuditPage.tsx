import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { getLogs } from '../../services/authService';
import { ActivityLog, Language } from '../../types';
import { AUDIT_ACTIONS } from '../../config/adminConfig';
import { ActionBadge, PageHeader, EmptyState } from './shared';

interface AuditPageProps {
  language: Language;
}

export const AuditPage: React.FC<AuditPageProps> = ({ language }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadLogs = async (from?: string, to?: string) => {
    setLoading(true);
    const f = (from !== undefined ? from : fromDate) || undefined;
    const t2 = (to !== undefined ? to : toDate) || undefined;
    const data = await getLogs(f, t2);
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => { loadLogs(); }, []);

  // Apply client-side filters
  let filtered = logs;
  if (actionFilter !== 'all') {
    filtered = filtered.filter(l => l.action === actionFilter);
  }
  if (sourceFilter !== 'all') {
    filtered = filtered.filter(l => (l.source || 'system') === sourceFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      (l.userName || '').toLowerCase().includes(q) ||
      (l.userEmail || '').toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q) ||
      l.userId.toLowerCase().includes(q)
    );
  }

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  const handleExport = () => {
    const rows = filtered.map(l => ({
      'Timestamp': new Date(l.timestamp).toLocaleString(),
      'Actor': l.userName || l.userEmail || l.userId,
      'Actor Role': l.actorRole || '-',
      'Action': l.action,
      'Details': l.details,
      'Target Type': l.targetType || '-',
      'Target ID': l.targetId || '-',
      'Source': l.source || 'system',
      'Result': l.result || '-',
      'Before': l.beforeValue || '-',
      'After': l.afterValue || '-',
      'User ID': l.userId,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
    XLSX.writeFile(wb, `audit_logs_${fromDate || 'all'}_to_${toDate || 'now'}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={language === 'de' ? 'Audit-Protokolle' : 'Audit Logs'}
        subtitle={`${filtered.length} ${language === 'de' ? 'Einträge' : 'records'}`}
      />

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-3 items-end">
        <div className="relative flex-grow min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input type="text" placeholder={language === 'de' ? 'Suchen...' : 'Search...'}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{language === 'de' ? 'Von' : 'From'}</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{language === 'de' ? 'Bis' : 'To'}</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Action</label>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">{language === 'de' ? 'Alle Aktionen' : 'All Actions'}</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{language === 'de' ? 'Quelle' : 'Source'}</label>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">{language === 'de' ? 'Alle Quellen' : 'All Sources'}</option>
            <option value="admin_ui">Admin UI</option>
            <option value="system">System</option>
            <option value="webhook">Webhook</option>
            <option value="scheduler">Scheduler</option>
          </select>
        </div>
        <button onClick={() => loadLogs(fromDate, toDate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg">
          🔍 {language === 'de' ? 'Suchen' : 'Search'}
        </button>
        <button onClick={() => { setFromDate(''); setToDate(''); setActionFilter('all'); setSourceFilter('all'); setSearch(''); loadLogs('', ''); }}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg">
          {language === 'de' ? 'Zurücksetzen' : 'Reset'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 flex-grow overflow-hidden flex flex-col min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm animate-pulse">Loading logs...</div>
        ) : (
          <div className="overflow-auto flex-grow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['Timestamp', 'Actor', 'Action', 'Details', 'Source', 'Result'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {log.userName ? (
                        <>
                          <div className="text-xs font-bold text-gray-800">{log.userName}</div>
                          <div className="text-xs text-gray-400">{log.userEmail || log.userId.slice(0, 10)}</div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500 font-mono">{log.userId.slice(0, 12)}</div>
                      )}
                      {log.actorRole && <div className="text-xs text-gray-400 italic">{log.actorRole}</div>}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap"><ActionBadge action={log.action} /></td>
                    <td className="px-4 py-2 text-xs text-gray-600 max-w-[400px] truncate">{log.details}</td>
                    <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{log.source || 'system'}</td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {log.result ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${log.result === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {log.result}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message={language === 'de' ? 'Keine Protokolle gefunden.' : 'No logs found.'} icon="📋" />}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="mt-4 flex items-center justify-between bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
        <div className="text-sm text-gray-600">
          <span className="font-medium">{language === 'de' ? 'Rohdaten exportieren' : 'Export raw log data'}</span>
          {(fromDate || toDate) && (
            <span className="text-gray-400 ml-2">{fromDate || '—'} → {toDate || 'now'}</span>
          )}
        </div>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors">
          📊 Export Excel
        </button>
      </div>
    </div>
  );
};
