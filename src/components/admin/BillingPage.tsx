import React from 'react';
import { Language } from '../../types';
import { BILLING_CHANNELS } from '../../config/adminConfig';
import { PageHeader, SectionCard, ScaffoldNotice, EmptyState } from './shared';

interface BillingPageProps {
  language: Language;
}

export const BillingPage: React.FC<BillingPageProps> = ({ language }) => {
  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Abrechnung & Store-Sync' : 'Billing & Store Sync'}
        subtitle={language === 'de' ? 'Abonnementverwaltung und Store-Synchronisation' : 'Subscription management and store synchronization'}
      />

      <ScaffoldNotice feature={language === 'de' ? 'Store-Integration' : 'Store Integration'} />

      {/* Billing Channels Reference */}
      <SectionCard title={language === 'de' ? 'Abrechnungskanäle' : 'Billing Channels'} icon="💳" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BILLING_CHANNELS.map(ch => (
            <div key={ch.value} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-lg">
                {ch.value === 'apple' ? '🍎' : ch.value === 'google' ? '🤖' : ch.value === 'direct' ? '💳' : ch.value === 'admin_grant' ? '🛠️' : '🎁'}
              </span>
              <div>
                <div className="font-medium text-sm text-gray-800">{ch.label}</div>
                <div className="text-xs font-mono text-gray-400">{ch.value}</div>
              </div>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                {ch.value === 'admin_grant' ? 'Ready' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Subscription Status Template */}
      <SectionCard title={language === 'de' ? 'Abonnementstatus-Schema' : 'Subscription Status Schema'} icon="📋" className="mb-6">
        <div className="text-sm text-gray-600 space-y-2">
          <p>{language === 'de'
            ? 'Wenn die Store-Integration aktiv ist, werden hier die Abonnementdaten der Benutzer angezeigt:'
            : 'When store integration is active, user subscription data will appear here:'}</p>
          <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs space-y-1">
            <div className="text-gray-400">{'// Subscription record fields:'}</div>
            <div>billingChannel: <span className="text-blue-600">"apple" | "google" | "direct" | "admin_grant" | "trial"</span></div>
            <div>subscriptionStatus: <span className="text-blue-600">"active" | "expired" | "cancelled" | "grace_period"</span></div>
            <div>currentPlan: <span className="text-blue-600">"standard" | "premium"</span></div>
            <div>currentPeriodStart: <span className="text-blue-600">ISO timestamp</span></div>
            <div>currentPeriodEnd: <span className="text-blue-600">ISO timestamp</span></div>
            <div>autoRenew: <span className="text-blue-600">boolean</span></div>
            <div>lastVerification: <span className="text-blue-600">ISO timestamp</span></div>
            <div>lastWebhookEvent: <span className="text-blue-600">string</span></div>
            <div>syncStatus: <span className="text-blue-600">"synced" | "pending" | "error"</span></div>
          </div>
        </div>
      </SectionCard>

      {/* Sync Operations */}
      <SectionCard title={language === 'de' ? 'Sync-Operationen' : 'Sync Operations'} icon="🔄" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: language === 'de' ? 'Erneut synchronisieren' : 'Force Re-sync', desc: language === 'de' ? 'Aktuelle Berechtigung vom Store abrufen' : 'Fetch current entitlement from store', icon: '🔄' },
            { label: language === 'de' ? 'Status überprüfen' : 'Verify Status', desc: language === 'de' ? 'Aktuellen Berechtigungsstatus prüfen' : 'Check latest entitlement status', icon: '✅' },
            { label: language === 'de' ? 'Fehlgeschlagenes Ereignis erneut verarbeiten' : 'Reprocess Failed Event', desc: language === 'de' ? 'Webhook-Ereignis erneut verarbeiten' : 'Reprocess a failed webhook event', icon: '🔁' },
            { label: language === 'de' ? 'Sync-Fehler untersuchen' : 'Inspect Sync Errors', desc: language === 'de' ? 'Fehler bei der Store-Synchronisation anzeigen' : 'View failed billing/store sync items', icon: '🔍' },
          ].map(op => (
            <button key={op.label}
              className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 text-left hover:bg-gray-100 transition-colors opacity-60 cursor-not-allowed"
              disabled
            >
              <span className="text-xl">{op.icon}</span>
              <div>
                <div className="font-medium text-sm text-gray-800">{op.label}</div>
                <div className="text-xs text-gray-500">{op.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Store Events Log (empty placeholder) */}
      <SectionCard title={language === 'de' ? 'Store-Ereignisprotokoll' : 'Store Event Log'} icon="📜">
        <EmptyState
          icon="💳"
          message={language === 'de' ? 'Keine Store-Ereignisse vorhanden' : 'No store events yet'}
          sub={language === 'de' ? 'Store-Integration muss konfiguriert werden' : 'Store integration needs to be configured'}
        />
      </SectionCard>
    </div>
  );
};
