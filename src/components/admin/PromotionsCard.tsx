/**
 * PromotionsCard — the discount-campaign registry on the Billing page.
 *
 * WHAT THIS IS: the one place that answers "what promotions are running, in
 * which markets, on which plans, until when". Campaigns are recorded here with
 * the Paddle discount id they correspond to, so an operator can reconcile a
 * customer's discounted invoice against a known campaign months later.
 *
 * WHAT THIS IS NOT: it does not create, edit or delete anything in Paddle, and
 * it does not apply a discount at checkout. That boundary is deliberate:
 *   • Paddle is the merchant of record and a price/discount is IMMUTABLE once
 *     used, so those entities are created by a human in the Paddle dashboard —
 *     never generated from an admin form where a typo becomes permanent.
 *   • Nothing on the payment path reads these records, so a wrong entry here
 *     can misinform an operator but can never break a customer's checkout.
 * Auto-applying a campaign discount at checkout is the natural next step, but
 * it belongs after there are real subscribers to test it against — it would put
 * this data directly on the payment path.
 */
import React, { useEffect, useState } from 'react';
import { listPromotions, savePromotion, archivePromotion } from '../../services/subscriptionService';
import { Promotion } from '../../types';
import { SUB_PLAN_CODES, SUB_PLAN_NAMES, SubPlanCode } from '../../config/subscriptionPlans';
import { COUNTRY_PROFILES } from '../../config/countryProfiles';
import { SectionCard } from './shared';
import { AdminLang, ADMIN_I18N } from './adminI18n';

const inp = 'px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500';

export const PromotionsCard: React.FC<{ al: AdminLang }> = ({ al }) => {
  const A = ADMIN_I18N[al];
  const today = new Date().toISOString().slice(0, 10);

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [code, setCode] = useState('');
  const [paddleId, setPaddleId] = useState('');
  const [description, setDescription] = useState('');
  const [markets, setMarkets] = useState<string[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => { listPromotions().then(setPromos).catch(() => setPromos([])); };
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  const toggle = (list: string[], v: string, set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const submit = async () => {
    const c = code.trim().toUpperCase();
    // A campaign without a code or a window cannot be reconciled later, which is
    // the whole point of the registry — so both are required.
    if (!c || !description.trim() || !startsAt || !endsAt || endsAt < startsAt) {
      flash(A.pmInvalid);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await savePromotion({
        code: c,
        paddleDiscountId: paddleId.trim() || undefined,
        description: description.trim(),
        markets, planCodes: plans,
        startsAt: new Date(startsAt + 'T00:00:00Z').toISOString(),
        endsAt: new Date(endsAt + 'T23:59:59Z').toISOString(),
      });
      setCode(''); setPaddleId(''); setDescription(''); setMarkets([]); setPlans([]); setEndsAt('');
      flash(A.pmSaved);
      load();
    } catch (e: any) {
      flash(`${A.pmFailed} ${String(e?.message ?? e)}`);
    } finally { setBusy(false); }
  };

  const archive = async (p: Promotion) => {
    if (!confirm(A.pmArchiveConfirm(p.code))) return;
    try { await archivePromotion(p.code); flash(A.pmArchived); load(); }
    catch (e: any) { flash(`${A.pmFailed} ${String(e?.message ?? e)}`); }
  };

  const label = (list: string[], all: string, name: (v: string) => string) =>
    list.length === 0 ? all : list.map(name).join(', ');

  return (
    <SectionCard title={A.pmTitle} icon="🏷️" className="mb-6">
      <p className="text-xs text-gray-500 mb-1">{A.pmText}</p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">{A.pmBoundary}</p>

      {/* Create / update (same code = update, so a typo is fixable) */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
          {A.pmCode}
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="SPRING25" className={`${inp} w-36 font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
          {A.pmPaddleId}
          <input value={paddleId} onChange={e => setPaddleId(e.target.value)} placeholder="dsc_…" className={`${inp} w-44 font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-gray-500 flex-grow min-w-[200px]">
          {A.pmDescription}
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={A.pmDescriptionPh} className={`${inp} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
          {A.pmFrom}
          <input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} className={`${inp} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
          {A.pmUntil}
          <input type="date" value={endsAt} min={startsAt} onChange={e => setEndsAt(e.target.value)} className={`${inp} font-normal`} />
        </label>
      </div>

      {/* Targeting — nothing selected means "everywhere / every plan" */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
        <div>
          <div className="text-xs font-bold text-gray-500 mb-1">{A.pmMarkets}</div>
          <div className="flex flex-wrap gap-2">
            {Object.values(COUNTRY_PROFILES).map(m => (
              <label key={m.code} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={markets.includes(m.code)} onChange={() => toggle(markets, m.code, setMarkets)} />
                {A.marketNames[m.code] ?? m.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold text-gray-500 mb-1">{A.pmPlans}</div>
          <div className="flex flex-wrap gap-2">
            {SUB_PLAN_CODES.map(p => (
              <label key={p} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={plans.includes(p)} onChange={() => toggle(plans, p, setPlans)} />
                {SUB_PLAN_NAMES[p]}
              </label>
            ))}
          </div>
        </div>
        <button onClick={submit} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-lg whitespace-nowrap self-end">
          🏷️ {A.pmSave}
        </button>
      </div>

      {msg && <div className="mt-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2">{msg}</div>}

      {/* Registered campaigns */}
      <div className="mt-5">
        <div className="text-xs font-bold text-gray-500 uppercase mb-2">{A.pmList}</div>
        {promos.length === 0 ? (
          <div className="text-sm text-gray-400">{A.pmNone}</div>
        ) : (
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {promos.map(p => {
                const over = !!p.archivedAt || new Date(p.endsAt) < new Date();
                return (
                  <tr key={p.code} className={over ? 'opacity-50' : ''}>
                    <td className="py-2 pr-4 font-mono font-bold text-gray-800 whitespace-nowrap">{p.code}</td>
                    <td className="py-2 pr-4 text-gray-700">{p.description}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap text-xs">
                      {label(p.markets ?? [], A.pmAllMarkets, m => A.marketNames[m] ?? m)}
                    </td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap text-xs">
                      {label(p.planCodes ?? [], A.pmAllPlans, c => SUB_PLAN_NAMES[c as SubPlanCode] ?? c)}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap text-xs">
                      {p.startsAt.slice(0, 10)} → {p.endsAt.slice(0, 10)}
                    </td>
                    <td className="py-2 pr-4 text-gray-400 font-mono text-xs whitespace-nowrap">{p.paddleDiscountId || '—'}</td>
                    <td className="py-2 pr-4 text-xs whitespace-nowrap">
                      {p.archivedAt ? <span className="text-gray-400">{A.pmArchivedTag}</span>
                        : over ? <span className="text-gray-400">{A.pmEnded}</span>
                        : <span className="text-green-700 font-medium">{A.pmLive}</span>}
                    </td>
                    <td className="py-2 text-right">
                      {!p.archivedAt && (
                        <button onClick={() => archive(p)} className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                          {A.pmArchive}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SectionCard>
  );
};
