import React, { useEffect, useState } from 'react';
import { getUsers } from '../../services/authService';
import { computeAdminStats } from '../../services/adminService';
import { User, Language } from '../../types';
import { PlanCode } from '../../config/adminConfig';
import { PageHeader, SectionCard, StatCard } from './shared';

interface AnalyticsPageProps {
  language: Language;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ language }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsers().then(u => { setUsers(u); setLoading(false); });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Loading analytics...</div>;
  }

  const stats = computeAdminStats(users);

  // Plan distribution
  const planDist = [
    { plan: 'standard', count: stats.standard, color: 'bg-gray-500' },
    { plan: 'premium', count: stats.premium, color: 'bg-purple-500' },
  ];

  // Company type distribution
  const companyDist = [
    { type: 'Manufacturer', count: stats.manufacturers, color: 'bg-purple-500' },
    { type: 'Installer', count: stats.installers, color: 'bg-teal-500' },
    { type: 'Distributor', count: stats.distributors, color: 'bg-blue-500' },
    { type: 'Private Individual', count: stats.privateIndividuals, color: 'bg-gray-400' },
  ];

  // Job role distribution
  const jobRoleDist = (() => {
    const counts: Record<string, number> = {};
    users.forEach(u => {
      counts[u.jobRole] = (counts[u.jobRole] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count }));
  })();

  // Registration trend (by month)
  const regTrend = (() => {
    const months: Record<string, number> = {};
    users.forEach(u => {
      if (u.registeredAt) {
        const key = u.registeredAt.slice(0, 7); // YYYY-MM
        months[key] = (months[key] || 0) + 1;
      }
    });
    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12); // Last 12 months
  })();

  const maxRegMonth = Math.max(...regTrend.map(([, c]) => c), 1);

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Analytik' : 'Analytics'}
        subtitle={language === 'de' ? 'Mitgliedschaft- und Nutzungsmetriken' : 'Membership and usage metrics'}
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label={language === 'de' ? 'Gesamt' : 'Total'} value={stats.total} color="blue" />
        <StatCard label={language === 'de' ? 'Ausstehend' : 'Pending'} value={stats.pending} color="yellow" />
        <StatCard label={language === 'de' ? 'Aktiv' : 'Active'} value={stats.active} color="green" />
        <StatCard label={language === 'de' ? 'Gesperrt' : 'Suspended'} value={stats.suspended} color="orange" />
        <StatCard label="Standard" value={stats.standard} color="gray" />
        <StatCard label="Premium" value={stats.premium} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Plan Distribution */}
        <SectionCard title={language === 'de' ? 'Planverteilung' : 'Plan Distribution'} icon="💎">
          <div className="space-y-3">
            {planDist.map(p => (
              <div key={p.plan} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${p.color}`} />
                <span className="text-sm text-gray-700 w-24 capitalize">{p.plan}</span>
                <div className="flex-grow h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${p.color} rounded-full transition-all`}
                    style={{ width: `${stats.total > 0 ? (p.count / stats.total) * 100 : 0}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-800 w-12 text-right">{p.count}</span>
                <span className="text-xs text-gray-400 w-12 text-right">
                  {stats.total > 0 ? Math.round((p.count / stats.total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Company Type Distribution */}
        <SectionCard title={language === 'de' ? 'Unternehmenstypen' : 'Company Types'} icon="🏢">
          <div className="space-y-3">
            {companyDist.map(c => (
              <div key={c.type} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${c.color}`} />
                <span className="text-sm text-gray-700 w-36">{c.type}</span>
                <div className="flex-grow h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${c.color} rounded-full transition-all`}
                    style={{ width: `${stats.total > 0 ? (c.count / stats.total) * 100 : 0}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-800 w-8 text-right">{c.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Role Distribution */}
        <SectionCard title={language === 'de' ? 'Berufsrollen' : 'Job Roles'} icon="👤">
          <div className="space-y-2">
            {jobRoleDist.map(j => (
              <div key={j.role} className="flex items-center gap-3 text-sm">
                <span className="text-gray-600 w-40">{j.role}</span>
                <div className="flex-grow h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${stats.total > 0 ? (j.count / stats.total) * 100 : 0}%` }} />
                </div>
                <span className="font-bold text-gray-800 w-8 text-right">{j.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Registration Trend */}
        <SectionCard title={language === 'de' ? 'Registrierungstrend' : 'Registration Trend'} icon="📈">
          {regTrend.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-6">No registration data yet.</div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {regTrend.map(([month, count]) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-gray-700">{count}</span>
                  <div className="w-full bg-blue-400 rounded-t transition-all"
                    style={{ height: `${(count / maxRegMonth) * 100}%`, minHeight: count > 0 ? '4px' : '0px' }} />
                  <span className="text-[9px] text-gray-400 -rotate-45 origin-top-left whitespace-nowrap">
                    {month.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
