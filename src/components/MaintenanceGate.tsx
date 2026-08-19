/**
 * MaintenanceGate — the screen the whole service shows during the monthly
 * database window.
 *
 * WHY A FIRESTORE DOC AND NOT A BUILD FLAG
 * The window exists precisely because the sites are being rebuilt and
 * redeployed inside it. A flag baked into the bundle would be replaced by the
 * very deploy it is supposed to cover, and a static file in the build output
 * would be overwritten the same way. `config/maintenance` lives outside both,
 * so the notice survives every deploy the pipeline performs and can be lifted
 * the instant the run finishes — or left up if the run stops for a person.
 *
 * It is read WITHOUT authentication: a visitor who cannot sign in during the
 * window is exactly who needs to be told why.
 *
 * Fail-open by design. If the document is missing, unreadable or malformed the
 * app renders normally. A maintenance banner that appears because a read failed
 * would take the service down for a reason that is not a reason.
 */
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Language } from '../types';

interface Maintenance {
  active: boolean;
  until?: string | null;   // ISO — shown as a local time, never as a promise
  runId?: string | null;
}

const COPY: Record<string, { title: string; body: string; back: string; note: string }> = {
  en: {
    title: 'Scheduled database update',
    body: 'The monthly source refresh is running: new registry snapshots are being read, checked and published.',
    back: 'Expected back by',
    note: 'Nothing you saved is affected. Please try again shortly.',
  },
  de: {
    title: 'Geplante Datenbank-Aktualisierung',
    body: 'Die monatliche Aktualisierung läuft: neue Quellstände werden eingelesen, geprüft und veröffentlicht.',
    back: 'Voraussichtlich wieder erreichbar',
    note: 'Ihre gespeicherten Daten sind nicht betroffen. Bitte versuchen Sie es in Kürze erneut.',
  },
  fr: {
    title: 'Mise à jour programmée de la base de données',
    body: 'La mise à jour mensuelle est en cours : les nouveaux instantanés des registres sont lus, vérifiés et publiés.',
    back: 'Retour prévu vers',
    note: 'Vos données enregistrées ne sont pas affectées. Merci de réessayer dans quelques instants.',
  },
  pl: {
    title: 'Zaplanowana aktualizacja bazy danych',
    body: 'Trwa comiesięczna aktualizacja: nowe migawki rejestrów są wczytywane, sprawdzane i publikowane.',
    back: 'Przewidywany powrót do',
    note: 'Zapisane dane nie są naruszone. Prosimy spróbować za chwilę.',
  },
  it: {
    title: 'Aggiornamento programmato del database',
    body: "L'aggiornamento mensile è in corso: le nuove istantanee dei registri vengono lette, verificate e pubblicate.",
    back: 'Ritorno previsto entro',
    note: 'I dati salvati non sono interessati. Riprovare tra poco.',
  },
};

export const MaintenanceGate: React.FC<{ language: Language; children: React.ReactNode }> = ({ language, children }) => {
  const [state, setState] = useState<Maintenance | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsub = onSnapshot(
      doc(db, 'config', 'maintenance'),
      (snap) => { if (!cancelled) setState((snap.data() as Maintenance) ?? { active: false }); },
      () => { if (!cancelled) setState({ active: false }); },   // unreadable → carry on
    );
    return () => { cancelled = true; unsub(); };
  }, []);

  if (!state?.active) return <>{children}</>;

  const c = COPY[String(language).slice(0, 2).toLowerCase()] ?? COPY.en;
  const until = state.until ? new Date(state.until) : null;
  const untilText = until && !Number.isNaN(until.getTime())
    ? until.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      data-testid="maintenance-gate"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(1100px 700px at 50% 0%, #143050, #0a1524 70%)', padding: 24,
        font: '16px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#fff', textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#4ade80' }}>
          HeatPump DB
        </div>
        <h1 style={{ fontSize: 30, letterSpacing: '-.6px', margin: '14px 0 12px' }}>{c.title}</h1>
        <p style={{ color: '#b9c8dc', margin: '0 0 18px' }}>{c.body}</p>
        {untilText && (
          <p style={{ color: '#8fb6e6', fontWeight: 600, margin: '0 0 18px' }}>{c.back} {untilText}</p>
        )}
        <p style={{ color: '#8ea3bd', fontSize: 14, margin: 0 }}>{c.note}</p>
      </div>
    </div>
  );
};
