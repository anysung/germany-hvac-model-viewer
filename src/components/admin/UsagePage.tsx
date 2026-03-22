import React, { useEffect, useState } from 'react';
import { getUsers } from '../../services/authService';
import { getAdminQuotaInfo } from '../../services/quotaService';
import { grantBonusQuota, getEffectiveEntitlements } from '../../services/adminService';
import { User, Language } from '../../types';
import { PlanCode, PLANS, getBaseQuotaForPlan } from '../../config/adminConfig';
import { PlanBadge, PageHeader, SectionCard, StatCard, EmptyState } from './shared';
import { translations } from '../../translations';

interface UsagePageProps {
  language: Language;
}

interface UserQuotaRow {
  user: User;
  plan: PlanCode;
  baseLimit: number;
  extraQuota: number;
  totalLimit: number;
  used: number;
  remaining: number;
  month: string;
}

export const UsagePage: React.FC<UsagePageProps> = ({ language }) => {
  const [rows, setRows] = useState<UserQuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterExhausted, setFilterExhausted] = useState(false);
  const [selectedRow, setSelectedRow] = useState<UserQuotaRow | null>(null);
  const [extraInput, setExtraInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const users = await getUsers();
    const activeUsers = users.filter(u => u.status === 'active' || (!u.status && u.isActive));

    const quotaRows: UserQuotaRow[] = await Promise.all(
      activeUsers.map(async (u) => {
        try {
          const qi = await getAdminQuotaInfo(u.id);
          return {
            user: u,
            plan: qi.plan,
            baseLimit: qi.defaultLimit,
            extraQuota: qi.extraQuota,
            totalLimit: qi.totalLimit,
            used: qi.used,
            remaining: qi.remaining,
            month: qi.month,
          };
        } catch {
          const plan: PlanCode = (u.plan as PlanCode) || 'standard';
          const base = getBaseQuotaForPlan(plan);
          const extra = u.extraPrintQuota || 0;
          return {
            user: u, plan, baseLimit: base, extraQuota: extra,
            totalLimit: base + extra, used: 0, remaining: base + extra,
            month: new Date().toISOString().slice(0, 7),
          };
        }
      })
    );

    setRows(quotaRows);
    setLoading(false);
  };

  const filtered = rows.filter(r => {
    if (filterExhausted && r.remaining > 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.user.email.toLowerCase().includes(q) ||
        r.user.firstName.toLowerCase().includes(q) ||
        r.user.lastName.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPrints = rows.reduce((sum, r) => sum + r.used, 0);
  const exhaustedCount = rows.filter(r => r.remaining <= 0).length;
  const highUsageCount = rows.filter(r => r.totalLimit > 0 && r.used / r.totalLimit > 0.8).length;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Loading quota data...</div>;
  }

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Nutzung & Kontingente' : 'Usage & Quotas'}
        subtitle={language === 'de' ? 'Monatliche Data-Sheet-Nutzung und Kontingente' : 'Monthly Data Sheet usage and quota management'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={language === 'de' ? 'Drucke diesen Monat' : 'Prints This Month'} value={totalPrints} color="blue" icon="🖨️" />
        <StatCard label={language === 'de' ? 'Aktive Nutzer' : 'Active Users'} value={rows.length} color="green" icon="👥" />
        <StatCard label={language === 'de' ? 'Kontingent erschöpft' : 'Quota Exhausted'} value={exhaustedCount} color="red" icon="🚫" />
        <StatCard label={language === 'de' ? 'Hohe Nutzung (>80%)' : 'High Usage (>80%)'} value={highUsageCount} color="orange" icon="⚠️" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="relative flex-grow min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input type="text" placeholder={language === 'de' ? 'Benutzer suchen...' : 'Search users...'}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterExhausted} onChange={e => setFilterExhausted(e.target.checked)} className="form-checkbox text-red-600 rounded" />
          {language === 'de' ? 'Nur erschöpfte' : 'Exhausted only'}
        </label>
        <button onClick={loadAll} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg">
          🔄 {language === 'de' ? 'Aktualisieren' : 'Refresh'}
        </button>
      </div>

      <div className="flex gap-4">
        {/* Main Table */}
        <div className={`bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col ${selectedRow ? 'flex-grow' : 'w-full'}`}>
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['User', 'Plan', 'Base', 'Extra', 'Total', 'Used', 'Remaining', 'Usage'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const pct = r.totalLimit > 0 ? Math.round((r.used / r.totalLimit) * 100) : 0;
                  const isExhausted = r.remaining <= 0;
                  const isHigh = pct >= 80 && !isExhausted;
                  return (
                    <tr key={r.user.id}
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${isExhausted ? 'bg-red-50/50' : isHigh ? 'bg-orange-50/30' : ''} ${selectedRow?.user.id === r.user.id ? 'bg-blue-50' : ''}`}
                      onClick={() => { setSelectedRow(r); setExtraInput(String(r.extraQuota)); setSaved(false); }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{r.user.firstName} {r.user.lastName}</div>
                        <div className="text-xs text-gray-400">{r.user.email}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap"><PlanBadge plan={r.plan} /></td>
                      <td className="px-3 py-2 text-sm text-gray-600">{r.baseLimit}</td>
                      <td className="px-3 py-2 text-sm text-blue-600 font-medium">{r.extraQuota > 0 ? `+${r.extraQuota}` : '-'}</td>
                      <td className="px-3 py-2 text-sm font-bold text-gray-800">{r.totalLimit}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{r.used}</td>
                      <td className="px-3 py-2">
                        <span className={`text-sm font-bold ${isExhausted ? 'text-red-600' : isHigh ? 'text-orange-600' : 'text-green-600'}`}>
                          {r.remaining}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isExhausted ? 'bg-red-500' : isHigh ? 'bg-orange-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message="No matching users." icon="📈" />}
          </div>
        </div>

        {/* Quota Detail Panel */}
        {selectedRow && (
          <div className="w-[320px] flex-shrink-0 bg-white rounded-lg shadow border border-gray-200 overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-800 text-sm">{selectedRow.user.firstName} {selectedRow.user.lastName}</div>
                <div className="text-xs text-gray-500">{selectedRow.user.email}</div>
              </div>
              <button onClick={() => setSelectedRow(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Month</span><span className="font-medium">{selectedRow.month}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Plan</span><PlanBadge plan={selectedRow.plan} /></div>
              <div className="flex justify-between"><span className="text-gray-500">Base Limit</span><span className="font-medium">{selectedRow.baseLimit}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Extra Quota</span><span className="font-medium text-blue-600">{selectedRow.extraQuota}</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-500 font-medium">Total Limit</span><span className="font-bold">{selectedRow.totalLimit}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Used</span><span className="font-medium">{selectedRow.used}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining</span><span className={`font-bold ${selectedRow.remaining > 0 ? 'text-green-600' : 'text-red-600'}`}>{selectedRow.remaining}</span></div>

              <div className="pt-3 border-t border-gray-100">
                <div className="text-xs font-bold text-gray-500 uppercase mb-2">{language === 'de' ? 'Bonus-Kontingent anpassen' : 'Adjust Bonus Quota'}</div>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={extraInput} onChange={e => { setExtraInput(e.target.value); setSaved(false); }}
                    className="flex-grow px-3 py-1.5 border rounded-lg text-sm focus:ring-blue-500 outline-none" />
                  <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg"
                    onClick={async () => {
                      await grantBonusQuota(selectedRow.user.id, Math.max(0, parseInt(extraInput) || 0));
                      setSaved(true);
                      setTimeout(() => setSaved(false), 2000);
                      loadAll();
                    }}>
                    {saved ? '✓' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
