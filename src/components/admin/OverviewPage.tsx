/**
 * OverviewPage — the UNIFIED dashboard: live per-market status plus an
 * "action needed" alert list. This page is for seeing, not doing — every
 * alert links into the market workspace / billing page where the actual
 * work (approvals, replies, plan ops) happens.
 */
import React, { useEffect, useState } from 'react';
import { getUsers, getLogs } from '../../services/authService';
import { getMetadata, DbMetadata, getNewsFor } from '../../services/dbService';
import { getAllTickets } from '../../services/supportService';
import { listChangeRequests, listGrants } from '../../services/subscriptionService';
import { User, ActivityLog, SupportTicket } from '../../types';
import { COUNTRY_PROFILES } from '../../config/countryProfiles';
import { AdminPage } from '../../config/adminConfig';
import { SectionCard, ActionBadge, PageHeader } from './shared';
import { AdminLang, ADMIN_I18N } from './adminI18n';
import { PanicCard } from './PanicCard';

interface OverviewPageProps {
  al: AdminLang;
  /** Product count from the loaded static dataset (this build's market). */
  productCount?: number;
  /** Dataset load timestamp from the app shell. */
  lastUpdated?: string | null;
  openMarket: (cc: string) => void;
  openPage: (p: AdminPage) => void;
}

const flagEmoji = (code: string) =>
  code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));

interface Alert {
  icon: string;
  text: string;
  tone: 'yellow' | 'red' | 'orange' | 'blue';
  go: () => void;
}

const TONE: Record<Alert['tone'], string> = {
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
};

export const OverviewPage: React.FC<OverviewPageProps> = ({ al, productCount, lastUpdated, openMarket, openPage }) => {
  const A = ADMIN_I18N[al];
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [changeCount, setChangeCount] = useState(0);
  const [grantExpiring, setGrantExpiring] = useState(0);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [metadata, setMetadata] = useState<DbMetadata | null>(null);
  const [newsByCode, setNewsByCode] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [u, tk, logs, meta, changes, grants] = await Promise.all([
        getUsers(),
        getAllTickets().catch(() => []),
        getLogs(),
        getMetadata(),
        listChangeRequests().catch(() => []),
        listGrants().catch(() => []),
      ]);
      setUsers(u);
      setTickets(tk);
      setRecentLogs(logs.slice(0, 10));
      setMetadata(meta);
      setChangeCount(changes.length);
      const in7d = Date.now() + 7 * 86400_000;
      setGrantExpiring(grants.filter(g => !g.revokedAt && !!g.redeemedByUid &&
        new Date(g.endsAt).getTime() > Date.now() && new Date(g.endsAt).getTime() < in7d).length);
      setLoading(false);
    };
    load();
    Object.keys(COUNTRY_PROFILES).forEach(code => {
      getNewsFor(code).then(n => setNewsByCode(prev => ({ ...prev, [code]: n.length }))).catch(() => {});
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">{ADMIN_I18N[al].cLoading}</div>;
  }

  const markets = Object.values(COUNTRY_PROFILES);
  const byCc = (cc: string) => users.filter(u => (u.country || 'DE') === cc);
  const openTicketsByCc = (cc: string) => tickets.filter(t => (t.status === 'open') && ((t as any).country || 'DE') === cc);

  // ── Action alerts — each one deep-links to the page where the work happens ──
  const alerts: Alert[] = [];
  markets.forEach(m => {
    const name = A.marketNames[m.code] ?? m.name;
    const pending = byCc(m.code).filter(u => u.status === 'pending').length;
    if (pending > 0) alerts.push({ icon: '⚠️', tone: 'yellow', text: A.ovAlertPending(pending, name), go: () => openMarket(m.code) });
    const open = openTicketsByCc(m.code).length;
    if (open > 0) alerts.push({ icon: '📬', tone: 'blue', text: A.ovAlertTickets(open, name), go: () => openMarket(m.code) });
  });
  const deletions = users.filter(u => u.status === 'deletion_requested').length;
  if (deletions > 0) alerts.push({ icon: '🗑️', tone: 'red', text: A.ovAlertDeletion(deletions), go: () => openPage('members') });
  const pastDue = users.filter(u => u.subscription?.status === 'past_due').length;
  if (pastDue > 0) alerts.push({ icon: '💳', tone: 'orange', text: A.ovAlertPastDue(pastDue), go: () => openPage('billing') });
  if (changeCount > 0) alerts.push({ icon: '🔁', tone: 'blue', text: A.ovAlertChanges(changeCount), go: () => openPage('billing') });
  if (grantExpiring > 0) alerts.push({ icon: '🎁', tone: 'orange', text: A.ovAlertGrants(grantExpiring), go: () => openPage('billing') });

  // Approved, non-admin users with no country assigned (one-email-one-country policy).
  const missingCountry = users.filter(u => (u.status === 'active' || (u.isActive && !u.status)) && !u.country && !['owner', 'admin', 'support', 'ops'].includes(u.role || 'user'));
  if (missingCountry.length > 0) alerts.push({ icon: '🌍', tone: 'yellow', text: A.ovAlertNoCountry(missingCountry.length), go: () => {} });

  return (
    <div>
      <PageHeader title={A.ovTitle} subtitle={A.ovSubtitle} />

      {/* Action needed */}
      {/* Owner hard-fallback: full-set dataset restore (server enforces owner-only). */}
      <PanicCard al={al} />

      <SectionCard title={A.ovAlerts} icon="🔔" className="mb-6">
        {alerts.length === 0 ? (
          <div className="text-sm text-gray-400">{A.ovNoAlerts}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((a, i) => (
              <button
                key={i}
                onClick={a.go}
                className={`flex items-center gap-3 border rounded-lg p-3 text-sm text-left transition-transform hover:scale-[1.01] ${TONE[a.tone]}`}
              >
                <span className="text-xl">{a.icon}</span>
                <span className="flex-grow font-medium">{a.text}</span>
                <span className="text-xs font-bold whitespace-nowrap opacity-70">{A.ovReview}</span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Approved users missing a country (one-email-one-country policy) — display only */}
      {missingCountry.length > 0 && (
        <SectionCard title={A.ovNoCountryHeading} icon="🌍" className="mb-6">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-gray-400 font-medium border-b border-gray-100">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">UID</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {missingCountry.map(u => (
                  <tr key={u.id} className="text-gray-700">
                    <td className="py-2 pr-4 whitespace-nowrap font-medium">{u.email}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-400 font-mono">{u.id}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{u.status ?? 'active'}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">
                      {u.registeredAt ? new Date(u.registeredAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">
                      {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Live per-market status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {markets.map(m => {
          const mu = byCc(m.code);
          const stats = __ALL_MARKET_STATS__[m.code] ?? { res: 0, com: 0, mfr: 0 };
          const cells: [string, React.ReactNode][] = [
            [A.ovMembersCol, mu.length],
            [A.ovActiveCol, mu.filter(u => u.status === 'active' || (!u.status && u.isActive)).length],
            [A.ovPendingCol, <span className={mu.some(u => u.status === 'pending') ? 'text-yellow-600 font-bold' : ''}>{mu.filter(u => u.status === 'pending').length}</span>],
            [A.ovTicketsCol, <span className={openTicketsByCc(m.code).length ? 'text-blue-600 font-bold' : ''}>{openTicketsByCc(m.code).length}</span>],
            [A.ovProductsCol, (stats.res + stats.com).toLocaleString()],
            [A.ovNewsCol, newsByCode[m.code] ?? '…'],
          ];
          return (
            <div key={m.code} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{flagEmoji(m.code)}</span>
                <span className="font-bold text-gray-800">{A.marketNames[m.code] ?? m.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-y-2 text-sm">
                {cells.map(([label, v]) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase text-gray-400 font-medium">{label}</div>
                    <div className="font-bold text-gray-800">{v}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => openMarket(m.code)} className="text-xs text-blue-600 hover:underline text-left font-medium">
                {A.ovOpen}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Pipeline Status */}
        <SectionCard title={A.ovPipeline} icon="🔧">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{A.ovProductsInDb}</span>
              <span className="font-bold text-blue-700">{(productCount || metadata?.productCount || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{A.ovNewsItems}</span>
              <span className="font-bold text-green-700">{Object.values(newsByCode).reduce((a, b) => a + b, 0) || '-'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{A.ovLastUpdated}</span>
              <span className="font-medium text-gray-700">
                {(lastUpdated || metadata?.lastUpdated)
                  ? new Date((lastUpdated || metadata?.lastUpdated)!).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : A.cNever}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* Recent Activity */}
        <SectionCard title={A.ovRecent} icon="📋">
          {recentLogs.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">—</div>
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
                      <td className="py-2 text-gray-500 text-xs truncate max-w-[240px]">{log.userName || log.userEmail || log.userId.slice(0, 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
