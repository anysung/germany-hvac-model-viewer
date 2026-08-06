import React, { useState, useEffect } from 'react';
import { getUsers } from '../services/authService';
import { getAllTickets } from '../services/supportService';
import { listChangeRequests } from '../services/subscriptionService';
import { ADMIN_MENU, AdminPage } from '../config/adminConfig';
import { COUNTRY_PROFILES } from '../config/countryProfiles';
import { AdminLang, ADMIN_I18N, loadAdminLang, saveAdminLang } from './admin/adminI18n';

// Page components — essentials-only console
import { OverviewPage } from './admin/OverviewPage';
import { InboxPage } from './admin/InboxPage';
import { MembersPage } from './admin/MembersPage';
import { BillingPage } from './admin/BillingPage';
import { MarketingPage } from './admin/MarketingPage';
import { DataPage } from './admin/DataPage';
import { AuditPage } from './admin/AuditPage';

interface AdminDashboardProps {
  onLogout: () => void;
  /** Combined residential + commercial dataset loaded by the app shell. */
  cachedDatabase: any[] | null;
  lastUpdated: string | null;
  /** Ignored — the admin console has its own EN/KO language state. */
  language?: string;
}

const flagEmoji = (code: string) =>
  code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onLogout, cachedDatabase, lastUpdated,
}) => {
  const [activePage, setActivePage] = useState<AdminPage>('overview');
  const [al, setAl] = useState<AdminLang>(loadAdminLang());
  const [pendingUsers, setPendingUsers] = useState(0);
  const [deletionRequests, setDeletionRequests] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [billingAlerts, setBillingAlerts] = useState(0);
  const [pendingByCountry, setPendingByCountry] = useState<Record<string, number>>({});
  const [ticketsByCountry, setTicketsByCountry] = useState<Record<string, number>>({});
  const A = ADMIN_I18N[al];

  const setLang = (lang: AdminLang) => { setAl(lang); saveAdminLang(lang); };

  // Load badge counts
  useEffect(() => {
    getUsers().then(users => {
      setPendingUsers(users.filter(u => u.status === 'pending').length);
      setDeletionRequests(users.filter(u => u.status === 'deletion_requested').length);
      const perCc: Record<string, number> = {};
      users.filter(u => u.status === 'pending').forEach(u => {
        const cc = u.country || 'DE';
        perCc[cc] = (perCc[cc] ?? 0) + 1;
      });
      setPendingByCountry(perCc);
    });
    getAllTickets().then(tickets => {
      const open = tickets.filter(tk => tk.status === 'open');
      setOpenTickets(open.length);
      const perCc: Record<string, number> = {};
      open.forEach(tk => {
        const cc = (tk as any).country || 'DE';
        perCc[cc] = (perCc[cc] ?? 0) + 1;
      });
      setTicketsByCountry(perCc);
    });
    listChangeRequests().then(reqs => setBillingAlerts(reqs.length)).catch(() => {});
  }, [activePage]);

  const badgeCtx = { pendingUsers, deletionRequests, openTickets, billingAlerts };
  const markets = Object.values(COUNTRY_PROFILES);
  const activeMarket = activePage.startsWith('market:') ? activePage.slice(7) : null;

  const navBtn = (isActive: boolean) =>
    `w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-800 text-white flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold flex items-center gap-2">🛡️ HeatPump DB</h2>
          <div className="text-xs text-slate-400 mt-0.5">{A.console}</div>
        </div>

        <nav className="flex-grow p-3 space-y-0.5 overflow-y-auto">
          {/* Unified dashboard */}
          <button onClick={() => setActivePage('overview')} className={navBtn(activePage === 'overview')}>
            <span className="flex items-center gap-2"><span className="text-sm">📊</span><span>{A.menuOverview}</span></span>
          </button>

          {/* Per-market workspaces — the actual work surfaces */}
          <div className="pt-3 pb-1 px-3 text-[10px] font-bold tracking-widest text-slate-500">{A.menuMarkets}</div>
          {markets.map(m => {
            const badge = (pendingByCountry[m.code] ?? 0) + (ticketsByCountry[m.code] ?? 0);
            return (
              <button key={m.code} onClick={() => setActivePage(`market:${m.code}` as AdminPage)} className={navBtn(activeMarket === m.code)}>
                <span className="flex items-center gap-2">
                  <span className="text-sm">{flagEmoji(m.code)}</span>
                  <span>{A.marketNames[m.code] ?? m.name}</span>
                </span>
                {badge > 0 && (
                  <span className="bg-yellow-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{badge}</span>
                )}
              </button>
            );
          })}

          {/* Global pages */}
          <div className="pt-3 pb-1 px-3 text-[10px] font-bold tracking-widest text-slate-500">GLOBAL</div>
          {ADMIN_MENU.filter(i => i.key !== 'overview').map(item => {
            const badge = item.getBadge?.(badgeCtx) || 0;
            return (
              <button key={item.key} onClick={() => setActivePage(item.key)} className={navBtn(activePage === item.key)}>
                <span className="flex items-center gap-2">
                  <span className="text-sm">{item.icon}</span>
                  <span>{A[item.labelKey]}</span>
                </span>
                {badge > 0 && (
                  <span className="bg-yellow-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Language (EN | KO — plain buttons, admin-only) + logout */}
        <div className="p-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-white flex items-center gap-2">
            <span>🚪</span> {A.logout}
          </button>
          <div className="flex rounded overflow-hidden border border-slate-600 text-xs font-bold">
            {(['en', 'ko'] as AdminLang[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 ${al === l ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                {l === 'en' ? 'EN' : '한국어'}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-6 overflow-y-auto mt-16 md:mt-0 h-screen">
        {activePage === 'overview' && (
          <OverviewPage
            al={al}
            productCount={cachedDatabase?.length ?? 0}
            lastUpdated={lastUpdated}
            openMarket={cc => setActivePage(`market:${cc}` as AdminPage)}
            openPage={p => setActivePage(p)}
          />
        )}
        {activeMarket && <MarketWorkspace al={al} country={activeMarket} />}
        {activePage === 'billing' && <BillingPage al={al} />}
        {activePage === 'inbox' && <InboxPage al={al} />}
        {activePage === 'members' && <MembersPage al={al} />}
        {activePage === 'data' && <DataPage al={al} products={cachedDatabase} lastUpdated={lastUpdated} />}
        {activePage === 'marketing' && <MarketingPage al={al} />}
        {activePage === 'audit' && <AuditPage al={al} />}
      </main>
    </div>
  );
};

/** Per-market workspace: the actual member management + support work surface. */
const MarketWorkspace: React.FC<{ al: AdminLang; country: string }> = ({ al, country }) => {
  const A = ADMIN_I18N[al];
  const [tab, setTab] = useState<'members' | 'support'>('members');
  useEffect(() => setTab('members'), [country]);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            {flagEmoji(country)} {A.mkTitle(A.marketNames[country] ?? country)}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{A.mkSubtitle}</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-gray-300 bg-white text-sm font-medium">
          {([['members', A.mkTabMembers], ['support', A.mkTabSupport]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 ${tab === id ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'members' && <MembersPage al={al} country={country} embedded />}
      {tab === 'support' && <InboxPage al={al} country={country} embedded />}
    </div>
  );
};
