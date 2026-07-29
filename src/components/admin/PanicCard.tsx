/**
 * PanicCard — the owner's hard-fallback control (docs/DATASET_ROLLBACK_AND_PANIC.md).
 * Shows what is live (per-object md5/updated), the available snapshot restore
 * points, and executes a FULL-SET restore behind a typed "ROLLBACK"
 * confirmation. The server (accountBilling /panicRollback) re-verifies owner
 * identity, takes a single-flight lock, restores, re-verifies and audits —
 * this card is a window onto that, not the authority.
 */
import React, { useEffect, useState } from 'react';
import { SectionCard } from './shared';
import { AdminLang, ADMIN_I18N } from './adminI18n';
import { fetchRollbackStatus, executePanicRollback, RollbackStatus } from '../../services/opsService';

export const PanicCard: React.FC<{ al: AdminLang }> = ({ al }) => {
  const A = ADMIN_I18N[al];
  const [status, setStatus] = useState<RollbackStatus | null>(null);
  const [snapshotId, setSnapshotId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = () => {
    fetchRollbackStatus()
      .then(s => {
        setStatus(s);
        if (s.snapshots?.length && !snapshotId) setSnapshotId(s.snapshots[0]);
      })
      .catch(() => setStatus({ ok: false, error: 'unreachable' }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const armed = confirmText === 'ROLLBACK' && !!snapshotId && !busy;

  const run = async () => {
    if (!armed) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await executePanicRollback(snapshotId, confirmText);
      if (r.ok) {
        setResult(A.pbDone(r.restored?.length ?? 0));
        setConfirmText('');
        load();
      } else {
        setResult(`${A.pbFailed}: ${r.error === 'rollback-in-progress' ? A.pbLocked : r.error}`);
      }
    } catch (e: any) {
      setResult(`${A.pbFailed}: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title={A.pbTitle} icon="🆘" className="mb-6">
      <p className="text-xs text-gray-500 mb-4">{A.pbText}</p>

      {/* Live objects */}
      <div className="text-xs font-bold text-gray-500 uppercase mb-2">{A.pbLive}</div>
      <div className="max-h-44 overflow-y-auto mb-4 border border-gray-100 rounded-lg">
        <table className="min-w-full text-xs">
          <tbody className="divide-y divide-gray-100">
            {(status?.live ?? []).map(o => (
              <tr key={o.path}>
                <td className="py-1.5 px-3 font-mono text-gray-700 whitespace-nowrap">{o.path.replace('datasets/', '')}</td>
                <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">{(o.size / 1024).toFixed(0)} kB</td>
                <td className="py-1.5 px-3 text-gray-400 whitespace-nowrap">{A.pbUpdatedAt} {(o.updated || '').slice(0, 16).replace('T', ' ')}</td>
                <td className="py-1.5 px-3 font-mono text-gray-300 whitespace-nowrap">{o.md5.slice(0, 10)}…</td>
              </tr>
            ))}
            {!status && <tr><td className="py-2 px-3 text-gray-400">…</td></tr>}
            {status && !status.ok && <tr><td className="py-2 px-3 text-red-500">{status.error}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Restore point + typed confirmation + button */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">{A.pbSnapshots}</div>
          {status?.snapshots?.length ? (
            <>
              <select value={snapshotId} onChange={e => setSnapshotId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {status.snapshots.map(s => {
                  const m = status.snapshotMeta?.[s];
                  // Label the restore point itself: in a panic there is no time to
                  // look up whether a snapshot was ever checked.
                  const tag = m?.result === 'passed' ? A.pbVerified
                    : m?.result === 'overridden' ? A.pbOverridden
                    : A.pbUnverified;
                  return <option key={s} value={s}>{s} — {tag}</option>;
                })}
              </select>
              {status.snapshotMeta?.[snapshotId]?.result === 'overridden' && (
                <p className="text-xs text-orange-600 mt-1 max-w-xs">
                  {A.pbOverriddenNote} {status.snapshotMeta[snapshotId]?.reason}
                </p>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400">{A.pbNoSnapshots}</div>
          )}
        </div>
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">{A.pbConfirmLabel}</div>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="ROLLBACK"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono w-40"
            data-testid="panic-confirm"
          />
        </div>
        <button
          onClick={run}
          disabled={!armed}
          className={`px-5 py-2 rounded-lg text-sm font-bold text-white ${armed ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'}`}
          data-testid="panic-button"
        >
          {busy ? A.pbRunning : A.pbButton}
        </button>
        <button onClick={load} className="px-3 py-2 rounded-lg text-sm text-blue-600 hover:underline">{A.pbRefresh}</button>
      </div>

      {status?.lock && Date.now() < status.lock.expiresAtMs && (
        <p className="text-xs text-orange-600 mt-3">{A.pbLocked} ({status.lock.snapshotId})</p>
      )}
      {result && <p className="text-sm mt-3 font-medium">{result}</p>}
    </SectionCard>
  );
};
