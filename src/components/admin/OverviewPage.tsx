import React, { useEffect, useState } from 'react';
import { getUsers, getLogs } from '../../services/authService';
import { getMetadata, DbMetadata } from '../../services/dbService';
import { AdminStats, computeAdminStats } from '../../services/adminService';
import { User, ActivityLog, Language } from '../../types';
import { StatCard, SectionCard, ActionBadge, StatusBadge, PageHeader } from './shared';
import { translations } from '../../translations';

interface OverviewPageProps {
  language: Language;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ language }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [metadata, setMetadata] = useState<DbMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const t = translations[language];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [users, logs, meta] = await Promise.all([
        getUsers(),
        getLogs(),
        getMetadata(),
      ]);
      setStats(computeAdminStats(users));
      setRecentLogs(logs.slice(0, 10));
      setMetadata(meta);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Loading dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Übersicht' : 'Overview'}
        subtitle={language === 'de' ? 'Betriebsstatus auf einen Blick' : 'Operational status at a glance'}
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label={language === 'de' ? 'Gesamt Mitglieder' : 'Total Members'} value={stats.total} color="blue" icon="👥" />
        <StatCard label={language === 'de' ? 'Aktiv' : 'Active'} value={stats.active} color="green" icon="✅" />
        <StatCard label="Premium" value={stats.premium} color="purple" icon="💎" />
        <StatCard label="Standard" value={stats.standard} color="gray" icon="📋" />
        <StatCard label={language === 'de' ? 'Ausstehend' : 'Pending'} value={stats.pending} color="yellow" icon="⏳" />
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.pending > 0 && (
          <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <span className="text-xl">⚠️</span>
            <span><strong>{stats.pending}</strong> {language === 'de' ? 'ausstehende Genehmigungen' : 'pending approvals'}</span>
          </div>
        )}
        {stats.deletionRequested > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <span className="text-xl">🗑️</span>
            <span><strong>{stats.deletionRequested}</strong> {language === 'de' ? 'Löschanfragen offen' : 'deletion requests open'}</span>
          </div>
        )}
        {stats.suspended > 0 && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
            <span className="text-xl">⏸️</span>
            <span><strong>{stats.suspended}</strong> {language === 'de' ? 'gesperrte Konten' : 'suspended accounts'}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Pipeline Status */}
        <SectionCard title={language === 'de' ? 'Datenpipeline' : 'Data Pipeline'} icon="🔧">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{language === 'de' ? 'Produkte in DB' : 'Products in DB'}</span>
              <span className="font-bold text-blue-700">{metadata?.productCount ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{language === 'de' ? 'Nachrichten' : 'News Items'}</span>
              <span className="font-bold text-green-700">{metadata?.newsCount ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{language === 'de' ? 'Letzte Aktualisierung' : 'Last Updated'}</span>
              <span className="font-medium text-gray-700">
                {metadata?.lastUpdated
                  ? new Date(metadata.lastUpdated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : 'Never'}
              </span>
            </div>
            {metadata?.lastUpdateStats && (
              <div className="pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                <div>+{metadata.lastUpdateStats.productsAdded} added, ~{metadata.lastUpdateStats.productsUpdated} updated</div>
                {metadata.lastUpdateStats.budget && (
                  <div className="text-green-700 font-medium">
                    Cost: ${metadata.lastUpdateStats.budget.costUsd.toFixed(2)} / ${metadata.lastUpdateStats.budget.limitUsd}
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Membership Breakdown */}
        <SectionCard title={language === 'de' ? 'Mitgliederverteilung' : 'Member Breakdown'} icon="📊">
          <div className="space-y-2">
            {[
              { label: language === 'de' ? 'Hersteller' : 'Manufacturers', value: stats.manufacturers, color: 'bg-purple-500' },
              { label: language === 'de' ? 'Installateure' : 'Installers', value: stats.installers, color: 'bg-teal-500' },
              { label: language === 'de' ? 'Distributoren' : 'Distributors', value: stats.distributors, color: 'bg-blue-500' },
              { label: language === 'de' ? 'Privatpersonen' : 'Private Individuals', value: stats.privateIndividuals, color: 'bg-gray-400' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-gray-600 flex-grow">{item.label}</span>
                <span className="font-bold text-gray-800">{item.value}</span>
                <span className="text-gray-400 text-xs w-12 text-right">
                  {stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Recent Activity */}
      <SectionCard title={language === 'de' ? 'Letzte Aktivitäten' : 'Recent Activity'} icon="📋" className="mt-6">
        {recentLogs.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No recent activity.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <tbody className="divide-y divide-gray-100">
                {recentLogs.map(log => (
                  <tr key={log.id} className="text-sm">
                    <td className="py-2 pr-4 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap text-xs">
                      {log.userName || log.userEmail || log.userId.slice(0, 12)}
                    </td>
                    <td className="py-2 text-gray-500 text-xs truncate max-w-[300px]">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
