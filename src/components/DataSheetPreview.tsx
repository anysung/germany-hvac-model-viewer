/**
 * DataSheetPreview — Modal overlay that renders a printable Data Sheet
 * and provides Print / Close actions.
 *
 * Print flow:
 * 1. User clicks Print
 * 2. Quota is checked and consumed via quotaService
 * 3. window.print() is invoked (CSS @media print hides app chrome)
 * 4. If quota is exhausted, a message is shown instead
 */

import React, { useState, useRef, useCallback } from 'react';
import { HeatPump, Language } from '../types';
import { DataSheetTemplate } from './DataSheetTemplate';
import { consumePrintQuota, getQuotaStatus } from '../services/quotaService';

interface DataSheetPreviewProps {
  item: HeatPump;
  segment: 'residential' | 'commercial';
  lang: Language;
  userId: string;
  onClose: () => void;
  labels: any;
}

export const DataSheetPreview: React.FC<DataSheetPreviewProps> = ({
  item, segment, lang, userId, onClose, labels,
}) => {
  const [printing, setPrinting] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; limit: number } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Load quota info on mount
  React.useEffect(() => {
    getQuotaStatus(userId).then(s => setQuotaInfo({ used: s.used, limit: s.limit }));
  }, [userId]);

  const handlePrint = useCallback(async () => {
    setPrinting(true);
    setQuotaError(null);

    try {
      const allowed = await consumePrintQuota(userId);
      if (!allowed) {
        setQuotaError(
          lang === 'de'
            ? 'Monatliches Drucklimit erreicht. Bitte kontaktieren Sie den Administrator für zusätzliches Kontingent.'
            : 'Monthly print limit reached. Please contact the administrator for additional quota.'
        );
        setPrinting(false);
        return;
      }

      // Update displayed quota
      const updated = await getQuotaStatus(userId);
      setQuotaInfo({ used: updated.used, limit: updated.limit });

      // Trigger print
      window.print();
    } catch (err) {
      console.error('Print error:', err);
      setQuotaError(
        lang === 'de'
          ? 'Druckfehler. Bitte versuchen Sie es erneut.'
          : 'Print error. Please try again.'
      );
    } finally {
      setPrinting(false);
    }
  }, [userId, lang]);

  const isDE = lang === 'de';

  return (
    <>
      {/* Modal Backdrop */}
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto print:bg-white print:static print:overflow-visible">
        {/* Modal Container */}
        <div className="relative w-full max-w-[850px] my-6 mx-4 print:my-0 print:mx-0 print:max-w-none">

          {/* Toolbar — hidden in print */}
          <div className="bg-white rounded-t-xl border border-b-0 border-gray-200 px-5 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm print:hidden">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span>&#x1F4C4;</span>
                {isDE ? 'Datenblatt-Vorschau' : 'Data Sheet Preview'}
              </h2>
              {quotaInfo && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  {isDE ? 'Drucke' : 'Prints'}: {quotaInfo.used}/{quotaInfo.limit} {isDE ? 'diesen Monat' : 'this month'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                disabled={printing}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {printing ? (isDE ? 'Wird gedruckt...' : 'Printing...') : (isDE ? 'Drucken' : 'Print')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium text-sm rounded-lg hover:bg-gray-100 transition-colors"
              >
                {isDE ? 'Schließen' : 'Close'}
              </button>
            </div>
          </div>

          {/* Quota Error */}
          {quotaError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-5 py-3 print:hidden">
              {quotaError}
            </div>
          )}

          {/* Data Sheet Content */}
          <div
            ref={printRef}
            className="bg-white border border-gray-200 rounded-b-xl shadow-xl p-8 print:shadow-none print:border-0 print:rounded-none print:p-6"
          >
            <DataSheetTemplate item={item} segment={segment} lang={lang} />
          </div>
        </div>
      </div>
    </>
  );
};
