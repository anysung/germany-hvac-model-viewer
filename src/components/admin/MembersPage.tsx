import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { getUsers, approveUser, rejectUser, suspendUser, reactivateUser, deleteUser } from '../../services/authService';
import { changeUserPlan, grantBonusQuota, requestDeletion, updateAdminNotes, getEffectiveEntitlements } from '../../services/adminService';
import { getAdminQuotaInfo } from '../../services/quotaService';
import { User, Language } from '../../types';
import { PlanCode, PLANS } from '../../config/adminConfig';
import { StatusBadge, PlanBadge, PageHeader, EmptyState } from './shared';
import { translations } from '../../translations';

interface MembersPageProps {
  language: Language;
}

export const MembersPage: React.FC<MembersPageProps> = ({ language }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [companyTypeFilter, setCompanyTypeFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailTab, setDetailTab] = useState<'profile' | 'subscription' | 'usage' | 'notes'>('profile');
  const [quotaInfo, setQuotaInfo] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const t = translations[language];

  const load = () => getUsers().then(u => setUsers(u));
  useEffect(() => { load(); }, []);

  // Filtering
  useEffect(() => {
    let result = users;
    if (statusFilter !== 'all') {
      result = result.filter(u => (u.status || (u.isActive ? 'active' : 'suspended')) === statusFilter);
    }
    if (planFilter !== 'all') {
      result = result.filter(u => (u.plan || 'standard') === planFilter);
    }
    if (companyTypeFilter !== 'all') {
      result = result.filter(u => u.companyType === companyTypeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.companyName?.toLowerCase().includes(q))
      );
    }
    setFiltered(result);
  }, [search, statusFilter, planFilter, companyTypeFilter, users]);

  const pendingCount = users.filter(u => u.status === 'pending').length;

  const openDetail = async (user: User) => {
    setSelectedUser(user);
    setDetailTab('profile');
    setAdminNotes(user.adminNotes || '');
    setNotesSaved(false);
    try {
      const qi = await getAdminQuotaInfo(user.id);
      setQuotaInfo(qi);
    } catch { setQuotaInfo(null); }
  };

  const handleExport = () => {
    const rows = users.map(u => {
      const ent = getEffectiveEntitlements(u);
      return {
        'First Name': u.firstName, 'Last Name': u.lastName,
        'Email': u.email, 'Company Type': u.companyType, 'Job Role': u.jobRole,
        'Company': u.companyName || '', 'City': u.companyCity || '',
        'Plan': ent.plan, 'Quota': `${ent.effectiveQuota}`,
        'Industry Insight': ent.industryInsightAccess ? 'Yes' : 'No',
        'Status': u.status || (u.isActive ? 'active' : 'disabled'),
        'Registered': u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    XLSX.writeFile(wb, `members_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleAction = async (action: string, user: User) => {
    switch (action) {
      case 'approve': await approveUser(user.id); break;
      case 'reject': if (confirm(`Reject ${user.email}?`)) await rejectUser(user.id); else return; break;
      case 'suspend': if (confirm(`Suspend ${user.email}?`)) await suspendUser(user.id); else return; break;
      case 'reactivate': await reactivateUser(user.id); break;
      case 'delete': if (confirm(`Permanently delete ${user.email}? This cannot be undone.`)) await deleteUser(user.id); else return; break;
      case 'request_deletion': if (confirm(`Request deletion for ${user.email}?`)) await requestDeletion(user.id, 'Admin initiated'); else return; break;
    }
    load();
    if (selectedUser?.id === user.id) setSelectedUser(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={language === 'de' ? 'Mitglieder' : 'Members'}
        subtitle={`${filtered.length} ${language === 'de' ? 'von' : 'of'} ${users.length}`}
        action={
          <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow-sm text-sm font-bold flex items-center gap-2">
            📥 Export Excel
          </button>
        }
      />

      {/* Pending notice */}
      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          <span className="text-xl">⚠️</span>
          <span><strong>{pendingCount} pending application{pendingCount > 1 ? 's' : ''}</strong> awaiting approval.</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="relative flex-grow min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text" placeholder={language === 'de' ? 'Name, E-Mail, Firma...' : 'Name, email, company...'}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{language === 'de' ? 'Alle Status' : 'All Status'}</option>
          <option value="pending">{language === 'de' ? 'Ausstehend' : 'Pending'}</option>
          <option value="active">{language === 'de' ? 'Aktiv' : 'Active'}</option>
          <option value="suspended">{language === 'de' ? 'Gesperrt' : 'Suspended'}</option>
          <option value="rejected">{language === 'de' ? 'Abgelehnt' : 'Rejected'}</option>
          <option value="deletion_requested">{language === 'de' ? 'Löschung angefragt' : 'Deletion Requested'}</option>
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{language === 'de' ? 'Alle Pläne' : 'All Plans'}</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
        <select value={companyTypeFilter} onChange={e => setCompanyTypeFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{language === 'de' ? 'Alle Typen' : 'All Types'}</option>
          <option value="Manufacturer">{language === 'de' ? 'Hersteller' : 'Manufacturer'}</option>
          <option value="Distributor">{language === 'de' ? 'Distributor' : 'Distributor'}</option>
          <option value="Installer">{language === 'de' ? 'Installateur' : 'Installer'}</option>
          <option value="Private Individual">{language === 'de' ? 'Privatperson' : 'Private Individual'}</option>
        </select>
      </div>

      <div className="flex gap-4 flex-grow min-h-0">
        {/* Member table */}
        <div className={`bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col ${selectedUser ? 'flex-grow' : 'w-full'}`}>
          <div className="overflow-auto flex-grow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['User', 'Company', 'Plan', 'Status', 'Registered', 'Actions'].map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map(u => {
                  const userStatus = u.status || (u.isActive ? 'active' : 'suspended');
                  return (
                    <tr key={u.id}
                      className={`hover:bg-blue-50 transition-colors cursor-pointer ${userStatus === 'pending' ? 'bg-yellow-50/50' : ''} ${selectedUser?.id === u.id ? 'bg-blue-50' : ''}`}
                      onClick={() => openDetail(u)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">{u.firstName} {u.lastName}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-700">{u.companyName || '-'}</div>
                        <div className="text-xs text-gray-400">{u.companyType}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PlanBadge plan={(u.plan as PlanCode) || 'standard'} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={userStatus} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-1.5" onClick={e => e.stopPropagation()}>
                        {userStatus === 'pending' && (
                          <>
                            <button onClick={() => handleAction('approve', u)} className="text-xs px-3 py-1 rounded border border-green-400 text-green-700 hover:bg-green-50 font-bold">✓ Approve</button>
                            <button onClick={() => handleAction('reject', u)} className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">✗ Reject</button>
                          </>
                        )}
                        {userStatus === 'active' && (
                          <button onClick={() => handleAction('suspend', u)} className="text-xs px-3 py-1 rounded border border-orange-300 text-orange-600 hover:bg-orange-50">Suspend</button>
                        )}
                        {(userStatus === 'suspended' || userStatus === 'rejected') && (
                          <button onClick={() => handleAction('reactivate', u)} className="text-xs px-3 py-1 rounded border border-teal-300 text-teal-600 hover:bg-teal-50">Reactivate</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message="No members found." icon="👥" />}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedUser && (
          <div className="w-[400px] flex-shrink-0 bg-white rounded-lg shadow border border-gray-200 overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-800">{selectedUser.firstName} {selectedUser.lastName}</div>
                <div className="text-xs text-gray-500">{selectedUser.email}</div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {/* Detail Tabs */}
            <div className="flex border-b border-gray-100">
              {(['profile', 'subscription', 'usage', 'notes'] as const).map(tab => (
                <button key={tab} onClick={() => setDetailTab(tab)}
                  className={`flex-1 text-xs font-medium py-2.5 capitalize ${detailTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Profile Tab */}
              {detailTab === 'profile' && (
                <div className="space-y-3 text-sm">
                  <DetailRow label="Company" value={selectedUser.companyName || '-'} />
                  <DetailRow label="Company Type" value={selectedUser.companyType} />
                  <DetailRow label="Job Role" value={selectedUser.jobRole} />
                  <DetailRow label="City" value={selectedUser.companyCity || '-'} />
                  <DetailRow label="Country" value={selectedUser.country || '-'} />
                  <DetailRow label="Referral" value={selectedUser.referralSource || '-'} />
                  <DetailRow label="Status" value={<StatusBadge status={selectedUser.status} isActive={selectedUser.isActive} />} />
                  <DetailRow label="Role" value={selectedUser.role || 'user'} />
                  <DetailRow label="Registered" value={selectedUser.registeredAt ? new Date(selectedUser.registeredAt).toLocaleDateString() : '-'} />

                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase">Actions</div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedUser.status === 'active') && (
                        <button onClick={() => handleAction('suspend', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-orange-300 text-orange-600 hover:bg-orange-50">Suspend</button>
                      )}
                      {(selectedUser.status === 'suspended' || selectedUser.status === 'rejected') && (
                        <button onClick={() => handleAction('reactivate', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-teal-300 text-teal-600 hover:bg-teal-50">Reactivate</button>
                      )}
                      {selectedUser.status !== 'deletion_requested' && selectedUser.status !== 'deleted' && (
                        <button onClick={() => handleAction('request_deletion', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">Request Deletion</button>
                      )}
                      <button onClick={() => handleAction('delete', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-red-600">Delete Permanently</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription Tab */}
              {detailTab === 'subscription' && (() => {
                const ent = getEffectiveEntitlements(selectedUser);
                return (
                  <div className="space-y-3 text-sm">
                    <DetailRow label="Plan" value={<PlanBadge plan={ent.plan} />} />
                    <DetailRow label="Base Quota" value={`${ent.dataSheetMonthlyLimit}/mo`} />
                    <DetailRow label="Extra Quota" value={`+${ent.extraQuota}`} />
                    <DetailRow label="Effective Quota" value={`${ent.effectiveQuota}/mo`} />
                    <DetailRow label="Industry Insight" value={ent.industryInsightAccess ? '✅ Yes' : '❌ No'} />
                    <DetailRow label="Source" value={ent.entitlementSource} />
                    <DetailRow label="Billing Channel" value={selectedUser.billingChannel || '-'} />

                    <div className="pt-3 border-t border-gray-100 space-y-2">
                      <div className="text-xs font-bold text-gray-500 uppercase">Change Plan</div>
                      <div className="flex gap-2">
                        {(['standard', 'premium'] as PlanCode[]).map(p => (
                          <button key={p} onClick={async () => {
                            await changeUserPlan(selectedUser.id, p);
                            load();
                            const updated = { ...selectedUser, plan: p };
                            setSelectedUser(updated);
                          }}
                            className={`text-xs px-3 py-1.5 rounded border font-medium ${
                              ent.plan === p
                                ? 'bg-blue-100 border-blue-300 text-blue-700 cursor-default'
                                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                            disabled={ent.plan === p}
                          >
                            {p === 'premium' ? '💎 ' : ''}{PLANS[p].displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Usage Tab */}
              {detailTab === 'usage' && quotaInfo && (
                <div className="space-y-3 text-sm">
                  <DetailRow label="Month" value={quotaInfo.month} />
                  <DetailRow label="Plan" value={quotaInfo.plan} />
                  <DetailRow label="Base Limit" value={quotaInfo.defaultLimit} />
                  <DetailRow label="Extra Quota" value={quotaInfo.extraQuota} />
                  <DetailRow label="Total Limit" value={quotaInfo.totalLimit} />
                  <DetailRow label="Used" value={quotaInfo.used} />
                  <DetailRow label="Remaining" value={
                    <span className={quotaInfo.remaining > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {quotaInfo.remaining}
                    </span>
                  } />

                  {/* Quick quota grant */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase">Grant Bonus Quota</div>
                    <QuickQuotaGrant
                      userId={selectedUser.id}
                      currentExtra={quotaInfo.extraQuota}
                      onSaved={async () => {
                        const qi = await getAdminQuotaInfo(selectedUser.id);
                        setQuotaInfo(qi);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Notes Tab */}
              {detailTab === 'notes' && (
                <div className="space-y-3">
                  <textarea
                    className="w-full h-32 px-3 py-2 border rounded-lg text-sm focus:ring-blue-500 outline-none resize-none"
                    placeholder="Internal admin notes..."
                    value={adminNotes}
                    onChange={e => { setAdminNotes(e.target.value); setNotesSaved(false); }}
                  />
                  <button
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg"
                    onClick={async () => {
                      await updateAdminNotes(selectedUser.id, adminNotes);
                      setNotesSaved(true);
                      setTimeout(() => setNotesSaved(false), 2000);
                    }}
                  >
                    {notesSaved ? 'Saved!' : 'Save Notes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Helper Components ─────────────────────────────────────────────────

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-800 text-right">{value}</span>
  </div>
);

const QuickQuotaGrant: React.FC<{ userId: string; currentExtra: number; onSaved: () => void }> = ({ userId, currentExtra, onSaved }) => {
  const [val, setVal] = useState(String(currentExtra));
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input type="number" min="0" value={val} onChange={e => { setVal(e.target.value); setSaved(false); }}
        className="flex-grow px-3 py-1.5 border rounded-lg text-sm focus:ring-blue-500 outline-none" />
      <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg"
        onClick={async () => {
          await grantBonusQuota(userId, Math.max(0, parseInt(val) || 0));
          setSaved(true);
          onSaved();
          setTimeout(() => setSaved(false), 2000);
        }}
      >
        {saved ? '✓' : 'Save'}
      </button>
    </div>
  );
};
