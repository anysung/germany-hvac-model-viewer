import React, { useEffect, useState } from 'react';
import { getUsers, suspendUser, reactivateUser } from '../../services/authService';
import { requestDeletion, completeDeletion, cancelDeletion } from '../../services/adminService';
import { User, Language } from '../../types';
import { StatusBadge, PageHeader, SectionCard, StatCard, EmptyState } from './shared';

interface CompliancePageProps {
  language: Language;
}

export const CompliancePage: React.FC<CompliancePageProps> = ({ language }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all = await getUsers();
    setUsers(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deletionRequests = users.filter(u => u.status === 'deletion_requested');
  const suspendedUsers = users.filter(u => u.status === 'suspended');
  const deletedUsers = users.filter(u => u.status === 'deleted');
  const archivedUsers = users.filter(u => u.status === 'archived');

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 animate-pulse">Loading...</div>;
  }

  return (
    <div>
      <PageHeader
        title={language === 'de' ? 'Zugang & Compliance' : 'Access & Compliance'}
        subtitle={language === 'de' ? 'Kontostatus und Compliance-Operationen' : 'Account status and compliance operations'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={language === 'de' ? 'Löschanfragen' : 'Deletion Requests'} value={deletionRequests.length} color="red" icon="🗑️" />
        <StatCard label={language === 'de' ? 'Gesperrt' : 'Suspended'} value={suspendedUsers.length} color="orange" icon="⏸️" />
        <StatCard label={language === 'de' ? 'Gelöscht' : 'Deleted'} value={deletedUsers.length} color="gray" icon="🚫" />
        <StatCard label={language === 'de' ? 'Archiviert' : 'Archived'} value={archivedUsers.length} color="slate" icon="📦" />
      </div>

      {/* Deletion Requests Queue */}
      <SectionCard title={language === 'de' ? 'Löschanfragen-Warteschlange' : 'Deletion Request Queue'} icon="🗑️" className="mb-6">
        {deletionRequests.length === 0 ? (
          <EmptyState message={language === 'de' ? 'Keine offenen Löschanfragen' : 'No pending deletion requests'} icon="✅" />
        ) : (
          <div className="space-y-3">
            {deletionRequests.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                <div>
                  <div className="text-sm font-bold text-gray-800">{u.firstName} {u.lastName}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                  {u.deletionRequestedAt && (
                    <div className="text-xs text-red-500 mt-0.5">
                      Requested: {new Date(u.deletionRequestedAt).toLocaleDateString()}
                    </div>
                  )}
                  {u.deletionNote && (
                    <div className="text-xs text-gray-500 mt-0.5 italic">Note: {u.deletionNote}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { if (confirm(`Complete deletion for ${u.email}? This marks the account as deleted.`)) { await completeDeletion(u.id); load(); } }}
                    className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-100 font-medium"
                  >Complete Deletion</button>
                  <button
                    onClick={async () => { await cancelDeletion(u.id); load(); }}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                  >Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Suspended Accounts */}
      <SectionCard title={language === 'de' ? 'Gesperrte Konten' : 'Suspended Accounts'} icon="⏸️" className="mb-6">
        {suspendedUsers.length === 0 ? (
          <EmptyState message={language === 'de' ? 'Keine gesperrten Konten' : 'No suspended accounts'} icon="✅" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-bold text-gray-500 uppercase">User</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-gray-500 uppercase">Company</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-gray-500 uppercase">Registered</th>
                  <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suspendedUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <div className="font-medium text-gray-800">{u.firstName} {u.lastName}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="py-2 px-3 text-gray-600">{u.companyName || '-'}</td>
                    <td className="py-2 px-3 text-gray-500">{u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}</td>
                    <td className="py-2 px-3 text-right space-x-2">
                      <button onClick={async () => { await reactivateUser(u.id); load(); }}
                        className="text-xs px-3 py-1 rounded border border-teal-300 text-teal-600 hover:bg-teal-50">Reactivate</button>
                      <button onClick={async () => { if (confirm(`Request deletion for ${u.email}?`)) { await requestDeletion(u.id, 'Compliance review'); load(); } }}
                        className="text-xs px-3 py-1 rounded border border-red-300 text-red-500 hover:bg-red-50">Request Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Status Lifecycle Reference */}
      <SectionCard title={language === 'de' ? 'Statuslebenszyklus' : 'Status Lifecycle'} icon="🔄">
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {[
            { status: 'pending', next: '→' },
            { status: 'active', next: '→' },
            { status: 'suspended', next: '→' },
            { status: 'deletion_requested', next: '→' },
            { status: 'deleted', next: '→' },
            { status: 'archived', next: '' },
          ].map(s => (
            <React.Fragment key={s.status}>
              <StatusBadge status={s.status} />
              {s.next && <span className="text-gray-300">{s.next}</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          <span>{language === 'de' ? 'Abzweigung von Ausstehend:' : 'Branch from Pending:'}</span>
          <StatusBadge status="pending" />
          <span className="text-gray-300">→</span>
          <StatusBadge status="rejected" />
          <span className="text-gray-400">({language === 'de' ? 'kann reaktiviert werden' : 'can be reactivated'})</span>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          {language === 'de'
            ? 'Benutzer können an verschiedenen Punkten im Lebenszyklus gesperrt, abgelehnt oder reaktiviert werden.'
            : 'Users can be suspended, rejected, or reactivated at various points in the lifecycle.'}
        </p>
      </SectionCard>
    </div>
  );
};
