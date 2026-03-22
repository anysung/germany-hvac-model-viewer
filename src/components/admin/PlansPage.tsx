import React from 'react';
import { PLANS, PlanCode } from '../../config/adminConfig';
import { Language } from '../../types';
import { PageHeader, SectionCard } from './shared';

interface PlansPageProps {
  language: Language;
}

export const PlansPage: React.FC<PlansPageProps> = ({ language }) => {
  const planEntries = Object.values(PLANS).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Pläne & Berechtigungen' : 'Plans & Entitlements'}
        subtitle={language === 'de' ? 'Plandefinitionen und Feature-Zugangsregeln' : 'Plan definitions and feature access rules'}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {planEntries.map(plan => (
          <div key={plan.code} className={`bg-white rounded-xl shadow-sm border-2 ${plan.code === 'premium' ? 'border-purple-300' : 'border-gray-200'} overflow-hidden`}>
            <div className={`px-6 py-4 ${plan.code === 'premium' ? 'bg-gradient-to-r from-purple-50 to-purple-100' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{plan.code === 'premium' ? '💎 ' : ''}{plan.displayName}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${plan.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {plan.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Plan Code</div>
                  <div className="text-sm font-mono text-gray-700">{plan.code}</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{language === 'de' ? 'Monatliches Datenblatt-Kontingent' : 'Data Sheet Monthly Limit'}</span>
                <span className="font-bold text-blue-700 text-lg">{plan.dataSheetMonthlyLimit}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{language === 'de' ? 'Industry Insight Zugang' : 'Industry Insight Access'}</span>
                <span className={`font-bold ${plan.industryInsightAccess ? 'text-green-600' : 'text-gray-400'}`}>
                  {plan.industryInsightAccess ? '✅ Included' : '❌ Not Included'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Entitlement Reference Table */}
      <SectionCard title={language === 'de' ? 'Berechtigungsmatrix' : 'Entitlement Matrix'} icon="📋">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-xs font-bold text-gray-500 uppercase">Feature</th>
                {planEntries.map(p => (
                  <th key={p.code} className="text-center py-2 px-3 text-xs font-bold text-gray-500 uppercase">{p.displayName}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <EntitlementRow feature="Data Sheet Access" values={planEntries.map(() => true)} />
              <EntitlementRow feature="Data Sheet Monthly Quota" values={planEntries.map(p => `${p.dataSheetMonthlyLimit}`)} />
              <EntitlementRow feature="Admin Bonus Quota" values={planEntries.map(() => '+ configurable')} />
              <EntitlementRow feature="Industry Insight" values={planEntries.map(p => p.industryInsightAccess)} />
              <EntitlementRow feature="Product Search" values={planEntries.map(() => true)} />
              <EntitlementRow feature="Comparison View" values={planEntries.map(() => true)} />
              <EntitlementRow feature="Market News" values={planEntries.map(() => true)} />
              <EntitlementRow feature="Policy Summaries" values={planEntries.map(() => true)} />
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Entitlement Sources */}
      <SectionCard title={language === 'de' ? 'Berechtigungsquellen' : 'Entitlement Sources'} icon="🔑" className="mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {[
            { source: 'plan', desc: language === 'de' ? 'Automatisch vom Abonnement-Plan' : 'Automatically from subscription plan', icon: '📦' },
            { source: 'admin_override', desc: language === 'de' ? 'Manuell durch Admin gewährt' : 'Manually granted by admin', icon: '🛠️' },
            { source: 'promo', desc: language === 'de' ? 'Werbeaktion oder Sonderangebot' : 'Promotional offer or campaign', icon: '🎁' },
            { source: 'system', desc: language === 'de' ? 'Systemgeneriert (z.B. Testversion)' : 'System-generated (e.g. trial)', icon: '⚙️' },
          ].map(s => (
            <div key={s.source} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-lg">{s.icon}</span>
              <div>
                <div className="font-mono text-xs text-gray-600">{s.source}</div>
                <div className="text-gray-700">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
};

const EntitlementRow: React.FC<{ feature: string; values: (boolean | string)[] }> = ({ feature, values }) => (
  <tr>
    <td className="py-2 px-3 text-gray-700">{feature}</td>
    {values.map((v, i) => (
      <td key={i} className="py-2 px-3 text-center">
        {typeof v === 'boolean' ? (
          <span className={v ? 'text-green-600' : 'text-gray-300'}>{v ? '✅' : '—'}</span>
        ) : (
          <span className="text-gray-700 font-medium">{v}</span>
        )}
      </td>
    ))}
  </tr>
);
