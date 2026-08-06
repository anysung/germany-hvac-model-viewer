/**
 * MarketingPage — the solo operator's marketing surface, kept deliberately LIGHT.
 *
 * Design rule (owner decision 2026-08-06): show automatically what can be read
 * automatically, and ask for hand entry only where a human is the only source.
 * A dashboard of hand-entered numbers is a chore that gets abandoned within a
 * month; this page has exactly two manual fields (channel follower counts) and
 * one manual list (the posting log — LinkedIn has no API access at our size,
 * so what was posted when exists nowhere a machine can read it).
 *
 * Automatic: signups per acquisition channel. Every outbound link we control
 * carries ?ref=<channel> (services/signupRef.ts) and registration stamps it on
 * the profile — so the one number that decides where the owner's time goes
 * next month computes itself.
 *
 * Per-SNS sub-pages are deferred on purpose: they earn their existence when a
 * channel has enough data to fill one, not before.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { getUsers } from '../../services/authService';
import { AdminLang, adminT } from './adminI18n';

/** One shared doc for the manual numbers; a tiny collection for the log. */
const OPS_DOC = 'marketingOps/channels';
const LOG_COLL = 'marketingLog';

const CHANNELS: { key: string; label: string; icon: string }[] = [
  { key: 'li', label: 'LinkedIn', icon: '💼' },
  { key: 'yt', label: 'YouTube', icon: '▶️' },
  { key: 'news', label: 'News/SEO', icon: '📰' },
  { key: 'guide', label: 'Guide/SEO', icon: '📖' },
  { key: 'other', label: 'Other', icon: '🔗' },
];

interface LogEntry { id: string; date: string; channel: string; note: string; }

export const MarketingPage: React.FC<{ al: AdminLang }> = ({ al }) => {
  const A = adminT(al);
  const M = A.mk;

  const [refCounts, setRefCounts] = useState<Record<string, number>>({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [followers, setFollowers] = useState<Record<string, string>>({});
  const [followersSavedAt, setFollowersSavedAt] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [newLog, setNewLog] = useState({ channel: 'li', note: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Signups per channel — the automatic half of the page.
    getUsers().then(users => {
      const real = users.filter(u => (u as any).status !== 'deleted');
      setTotalUsers(real.length);
      const counts: Record<string, number> = {};
      for (const u of real) {
        const ref = (u as any).signupRef || 'none';
        counts[ref] = (counts[ref] ?? 0) + 1;
      }
      setRefCounts(counts);
    }).catch(() => {});

    getDoc(doc(db, OPS_DOC)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data() as any;
      setFollowers(d.followers ?? {});
      setFollowersSavedAt(d.updatedAt ?? '');
    }).catch(() => {});

    getDocs(query(collection(db, LOG_COLL), orderBy('date', 'desc'), limit(60)))
      .then(snap => setLog(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => {});
  }, []);

  const saveFollowers = async () => {
    setBusy(true);
    try {
      const updatedAt = new Date().toISOString();
      await setDoc(doc(db, OPS_DOC), { followers, updatedAt }, { merge: true });
      setFollowersSavedAt(updatedAt);
    } finally { setBusy(false); }
  };

  const addLog = async () => {
    if (!newLog.note.trim() || busy) return;
    setBusy(true);
    try {
      const entry = { date: new Date().toISOString().slice(0, 10), channel: newLog.channel, note: newLog.note.trim() };
      const ref = await addDoc(collection(db, LOG_COLL), entry);
      setLog(l => [{ id: ref.id, ...entry }, ...l]);
      setNewLog(n => ({ ...n, note: '' }));
    } finally { setBusy(false); }
  };

  const removeLog = async (id: string) => {
    await deleteDoc(doc(db, LOG_COLL, id)).catch(() => {});
    setLog(l => l.filter(e => e.id !== id));
  };

  /** The monthly rhythm, in order. Static on purpose — the steps ARE the
   *  documented pipeline (docs/UPDATE_PIPELINE.md §4a); a checklist that can
   *  drift from the docs is worse than none. */
  const steps = useMemo(() => [
    M.step1, M.step2, M.step3, M.step4, M.step5,
  ], [al]);

  const channelLabel = (key: string) =>
    CHANNELS.find(c => c.key === key)?.label ?? (key === 'none' ? M.refNone : key);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{M.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{M.subtitle}</p>
      </div>

      {/* ── Signups per channel (automatic) ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-800 mb-1">{M.refTitle}</h2>
        <p className="text-xs text-gray-400 mb-4">{M.refHint}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-2xl font-bold text-slate-800">{totalUsers}</div>
            <div className="text-xs text-slate-500 mt-0.5">{M.refTotal}</div>
          </div>
          {CHANNELS.map(c => (
            <div key={c.key} className="rounded-lg bg-blue-50/50 border border-blue-100 p-3">
              <div className="text-2xl font-bold text-blue-900">{refCounts[c.key] ?? 0}</div>
              <div className="text-xs text-blue-700/70 mt-0.5">{c.icon} {c.label}</div>
            </div>
          ))}
        </div>
        {(refCounts.none ?? 0) > 0 && (
          <p className="text-xs text-gray-400 mt-3">{M.refNoneNote(refCounts.none)}</p>
        )}
      </section>

      {/* ── Channel followers (the two manual numbers) ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-800 mb-1">{M.followersTitle}</h2>
        <p className="text-xs text-gray-400 mb-4">{M.followersHint}</p>
        <div className="flex flex-wrap items-end gap-4">
          {[{ key: 'li', label: 'LinkedIn' }, { key: 'yt', label: 'YouTube' }].map(c => (
            <label key={c.key} className="text-sm text-gray-600">
              {c.label}
              <input
                type="number" min={0}
                className="block mt-1 w-32 border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={followers[c.key] ?? ''}
                onChange={e => setFollowers(f => ({ ...f, [c.key]: e.target.value }))}
              />
            </label>
          ))}
          <button
            onClick={saveFollowers} disabled={busy}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {M.save}
          </button>
          {followersSavedAt && (
            <span className="text-xs text-gray-400">{M.savedAt} {followersSavedAt.slice(0, 10)}</span>
          )}
        </div>
      </section>

      {/* ── Monthly checklist (static = the documented pipeline) ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-800 mb-1">{M.checklistTitle}</h2>
        <p className="text-xs text-gray-400 mb-3">{M.checklistHint}</p>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-700">
              <span className="flex-none w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold grid place-items-center">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Posting log (manual — no API can read LinkedIn for us) ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-800 mb-1">{M.logTitle}</h2>
        <p className="text-xs text-gray-400 mb-4">{M.logHint}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={newLog.channel}
            onChange={e => setNewLog(n => ({ ...n, channel: e.target.value }))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input
            value={newLog.note}
            onChange={e => setNewLog(n => ({ ...n, note: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addLog(); }}
            placeholder={M.logPlaceholder}
            className="flex-1 min-w-[220px] border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          <button
            onClick={addLog} disabled={busy || !newLog.note.trim()}
            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {M.logAdd}
          </button>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">{M.logEmpty}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {log.map(e => (
              <li key={e.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="flex-none text-gray-400 w-24">{e.date}</span>
                <span className="flex-none w-24 text-gray-600 font-medium">{channelLabel(e.channel)}</span>
                <span className="flex-1 text-gray-700">{e.note}</span>
                <button onClick={() => removeLog(e.id)} className="flex-none text-xs text-red-400 hover:text-red-600">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
