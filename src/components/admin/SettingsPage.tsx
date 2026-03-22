import React, { useState } from 'react';
import { changeAdminPassword } from '../../services/authService';
import { Language, AppMode } from '../../types';
import { PLANS, USER_ROLES, BILLING_CHANNELS } from '../../config/adminConfig';
import { PageHeader, SectionCard } from './shared';
import { translations } from '../../translations';

interface SettingsPageProps {
  language: Language;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ language }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const t = translations[language];

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { alert(t.passwordLength); return; }
    if (newPassword !== confirmPassword) { alert(t.passwordMismatch); return; }
    changeAdminPassword(newPassword);
    alert(t.passwordUpdated);
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Einstellungen' : 'Settings'}
        subtitle={language === 'de' ? 'Admin-Zugang und Systemkonfiguration' : 'Admin access and system configuration'}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Admin Password */}
        <SectionCard title={language === 'de' ? 'Admin-Passwort ändern' : 'Change Admin Password'} icon="🔒">
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">{t.newPassword}</label>
              <input type="password" className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-blue-500 outline-none text-sm"
                value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">{t.confirmPassword}</label>
              <input type="password" className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-blue-500 outline-none text-sm"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-sm">
              {t.updatePassword}
            </button>
          </form>
        </SectionCard>

        {/* User Roles Reference */}
        <SectionCard title={language === 'de' ? 'Benutzerrollen' : 'User Roles'} icon="👥">
          <div className="space-y-3">
            {USER_ROLES.map(role => (
              <div key={role.value} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                <span className="text-lg">
                  {role.value === 'owner' ? '👑' : role.value === 'admin' ? '🛡️' : role.value === 'support' ? '🎧' : role.value === 'ops' ? '⚙️' : '👤'}
                </span>
                <div>
                  <div className="font-medium text-sm text-gray-800">{role.label}</div>
                  <div className="text-xs text-gray-500 font-mono">{role.value}</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {role.isAdmin && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Admin Access</span>
                  )}
                  {role.value === 'owner' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Enforced</span>
                  )}
                  {role.isAdmin && role.value !== 'owner' && (
                    <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded">Not yet enforced</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {language === 'de'
              ? 'Derzeit wird nur die Owner-Rolle für den Admin-Zugang durchgesetzt. Weitere Admin-Rollen sind definiert, aber noch nicht erzwungen.'
              : 'Currently only the owner role is enforced for admin access. Other admin roles are defined but not yet enforced.'}
          </p>
        </SectionCard>

        {/* Quota Policy */}
        <SectionCard title={language === 'de' ? 'Kontingent-Richtlinien' : 'Quota Policy'} icon="📊">
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="font-bold text-gray-700 mb-2">{language === 'de' ? 'Plan-basierte Kontingente' : 'Plan-Based Quotas'}</div>
              {Object.values(PLANS).map(plan => (
                <div key={plan.code} className="flex justify-between py-1">
                  <span className="text-gray-600">{plan.displayName}</span>
                  <span className="font-bold">{plan.dataSheetMonthlyLimit} {language === 'de' ? 'pro Monat' : '/month'}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p>• {language === 'de' ? 'Vorschau verbraucht kein Kontingent' : 'Preview does not consume quota'}</p>
              <p>• {language === 'de' ? 'Druck verbraucht Kontingent' : 'Print consumes quota'}</p>
              <p>• {language === 'de' ? 'Monatlicher Reset am 1. des Monats' : 'Monthly reset on the 1st'}</p>
              <p>• {language === 'de' ? 'Admin-Bonus wird separat verfolgt' : 'Admin bonus tracked separately from base'}</p>
            </div>
          </div>
        </SectionCard>

        {/* Localization */}
        <SectionCard title={language === 'de' ? 'Lokalisierung' : 'Localization'} icon="🌐">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
              <span className="text-gray-600">{language === 'de' ? 'Unterstützte Sprachen' : 'Supported Languages'}</span>
              <span className="font-medium">English, Deutsch</span>
            </div>
            <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
              <span className="text-gray-600">{language === 'de' ? 'Aktuelle Sprache' : 'Current Language'}</span>
              <span className="font-medium">{language === 'en' ? '🇬🇧 English' : '🇩🇪 Deutsch'}</span>
            </div>
            <div className="flex justify-between p-2 bg-gray-50 rounded-lg">
              <span className="text-gray-600">{language === 'de' ? 'Standardmarkt' : 'Default Market'}</span>
              <span className="font-medium">🇩🇪 Germany (DE)</span>
            </div>
          </div>
        </SectionCard>

        {/* System Integration Status */}
        <SectionCard title={language === 'de' ? 'Systemintegration' : 'System Integration'} icon="🔗" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Firebase Auth', status: 'connected', detail: 'Email/Password' },
              { name: 'Cloud Firestore', status: 'connected', detail: 'Users, Logs, Quotas, Products' },
              { name: 'Cloud Scheduler', status: 'connected', detail: 'Monthly data pipeline' },
              { name: 'Gemini AI', status: 'connected', detail: 'Product data enrichment' },
              { name: 'Apple App Store', status: 'not_configured', detail: 'In-app subscriptions' },
              { name: 'Google Play', status: 'not_configured', detail: 'In-app subscriptions' },
              { name: 'Stripe', status: 'not_configured', detail: 'Direct billing' },
              { name: 'Webhooks', status: 'not_configured', detail: 'Event notifications' },
              { name: 'Industry Insight API', status: 'not_configured', detail: 'Premium feature' },
            ].map(sys => (
              <div key={sys.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sys.status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <div className="font-medium text-sm text-gray-800">{sys.name}</div>
                  <div className="text-xs text-gray-500">{sys.detail}</div>
                </div>
                <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${sys.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {sys.status === 'connected' ? (language === 'de' ? 'Verbunden' : 'Connected') : (language === 'de' ? 'Ausstehend' : 'Pending')}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
