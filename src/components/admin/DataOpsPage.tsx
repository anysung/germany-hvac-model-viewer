import React, { useEffect, useState } from 'react';
import { getMetadata, DbMetadata } from '../../services/dbService';
import { Language, AppMode } from '../../types';
import { PageHeader, SectionCard, StatCard, ScaffoldNotice } from './shared';
import { translations } from '../../translations';

interface DataOpsPageProps {
  language: Language;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
}

export const DataOpsPage: React.FC<DataOpsPageProps> = ({ language, appMode, setAppMode }) => {
  const [metadata, setMetadata] = useState<DbMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const t = translations[language];

  useEffect(() => {
    setLoading(true);
    getMetadata().then(m => { setMetadata(m); setLoading(false); });
  }, []);

  const getNextScheduledUpdate = () => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 2, 0, 0));
    return next.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' 03:00 (Europe/Berlin)';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Loading...</div>;
  }

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Datenoperationen' : 'Data Operations'}
        subtitle={language === 'de' ? 'Pipeline-Status und Datenbankverwaltung' : 'Pipeline status and database management'}
      />

      {/* Pipeline Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={language === 'de' ? 'Produkte in DB' : 'Products in DB'} value={metadata?.productCount ?? '-'} color="blue" icon="📦" />
        <StatCard label={language === 'de' ? 'Nachrichten' : 'News Items'} value={metadata?.newsCount ?? '-'} color="green" icon="📰" />
        <StatCard
          label={language === 'de' ? 'Letzte Aktualisierung' : 'Last Updated'}
          value={metadata?.lastUpdated ? new Date(metadata.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
          color="purple" icon="🕐"
        />
        <StatCard label={language === 'de' ? 'Nächste Aktualisierung' : 'Next Update'} value={getNextScheduledUpdate().split(' 03:00')[0]} color="orange" icon="📅"
          subtitle="03:00 Europe/Berlin" />
      </div>

      {/* Pipeline List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          {
            name: language === 'de' ? 'Produkt-Pipeline' : 'Product Pipeline',
            icon: '📦',
            status: 'success' as const,
            desc: 'BAFA → Manufacturer → Retailer',
            schedule: '1st of month, 03:00',
            lastRun: metadata?.lastUpdated || null,
            stats: metadata?.lastUpdateStats ? `+${metadata.lastUpdateStats.productsAdded} added, ~${metadata.lastUpdateStats.productsUpdated} updated` : null,
            cost: metadata?.lastUpdateStats?.budget ? `$${metadata.lastUpdateStats.budget.costUsd.toFixed(2)}` : null,
          },
          {
            name: language === 'de' ? 'News-Pipeline' : 'News Pipeline',
            icon: '📰',
            status: 'success' as const,
            desc: 'Market news aggregation',
            schedule: '1st of month, 03:00',
            lastRun: metadata?.lastUpdated || null,
            stats: `${metadata?.newsCount || 0} items`,
            cost: null,
          },
          {
            name: 'Industry Insight Pipeline',
            icon: '🔮',
            status: 'idle' as const,
            desc: language === 'de' ? 'Zukünftige Feature-Pipeline' : 'Future feature pipeline',
            schedule: 'Not scheduled',
            lastRun: null,
            stats: null,
            cost: null,
          },
        ].map(pipe => (
          <SectionCard key={pipe.name} title={pipe.name} icon={pipe.icon}>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${pipe.status === 'success' ? 'bg-green-500' : pipe.status === 'running' ? 'bg-blue-500 animate-pulse' : pipe.status === 'error' ? 'bg-red-500' : 'bg-gray-300'}`} />
                <span className={`text-xs font-medium capitalize ${pipe.status === 'success' ? 'text-green-700' : pipe.status === 'error' ? 'text-red-700' : 'text-gray-500'}`}>
                  {pipe.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">{pipe.desc}</div>
              <div className="text-xs text-gray-400">Schedule: {pipe.schedule}</div>
              {pipe.lastRun && (
                <div className="text-xs text-gray-400">
                  Last: {new Date(pipe.lastRun).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              )}
              {pipe.stats && <div className="text-xs text-blue-600 font-medium">{pipe.stats}</div>}
              {pipe.cost && <div className="text-xs text-green-700 font-medium">Cost: {pipe.cost}</div>}

              {pipe.status !== 'idle' && (
                <div className="pt-2 flex gap-2">
                  <button className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 opacity-60 cursor-not-allowed" disabled>
                    Manual Run
                  </button>
                  <button className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 opacity-60 cursor-not-allowed" disabled>
                    Dry Run
                  </button>
                </div>
              )}
            </div>
          </SectionCard>
        ))}
      </div>

      {/* Last Run Details */}
      {metadata?.lastUpdateStats && (
        <SectionCard title={language === 'de' ? 'Letzte Ausführungsstatistiken' : 'Last Run Statistics'} icon="📊" className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-xs text-green-600 font-medium uppercase">Products Added</div>
              <div className="text-lg font-bold text-green-800">+{metadata.lastUpdateStats.productsAdded}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-600 font-medium uppercase">Products Updated</div>
              <div className="text-lg font-bold text-blue-800">~{metadata.lastUpdateStats.productsUpdated}</div>
            </div>
            {metadata.lastUpdateStats.budget && (
              <>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-xs text-purple-600 font-medium uppercase">API Cost</div>
                  <div className="text-lg font-bold text-purple-800">${metadata.lastUpdateStats.budget.costUsd.toFixed(2)}</div>
                  <div className="text-xs text-purple-500">/ ${metadata.lastUpdateStats.budget.limitUsd} limit</div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="text-xs text-orange-600 font-medium uppercase">Search Requests</div>
                  <div className="text-lg font-bold text-orange-800">{metadata.lastUpdateStats.budget.groundingRequests}</div>
                </div>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* App Mode Config */}
      <SectionCard title={t.appModeConfig} icon="⚙️">
        <div className="flex gap-6 items-center">
          {(['DATABASE', 'LIVE_API'] as const).map(mode => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="appMode" checked={appMode === mode} onChange={() => setAppMode(mode)} className="form-radio text-blue-600" />
              <span>
                <span className="font-medium text-sm">{mode === 'DATABASE' ? t.modeDatabase : t.modeLive}</span>
                <span className="text-xs text-gray-500 block">{mode === 'DATABASE' ? 'Serve from Firestore (recommended)' : 'Real-time Gemini AI search (uses tokens)'}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Current: <span className={`font-bold ${appMode === 'DATABASE' ? 'text-green-700' : 'text-blue-700'}`}>
            {appMode === 'DATABASE' ? t.dbMode : t.liveMode}
          </span>
        </p>
      </SectionCard>
    </div>
  );
};
