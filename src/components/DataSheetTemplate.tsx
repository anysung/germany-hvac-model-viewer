/**
 * DataSheetTemplate — Professional printable product data sheet.
 *
 * Unified template for Residential and Commercial products.
 * Content restricted to BAFA-origin fields only.
 * Includes numbered spec references with technical explanations.
 */

import React from 'react';
import { HeatPump, Language } from '../types';
import {
  DataSheetField,
  residentialFields,
  commercialFields,
  sectionTitles,
  disclaimer,
} from '../config/dataSheetConfig';

interface DataSheetTemplateProps {
  item: HeatPump;
  segment: 'residential' | 'commercial';
  lang: Language;
}

export const DataSheetTemplate: React.FC<DataSheetTemplateProps> = ({ item, segment, lang }) => {
  const fields: DataSheetField[] = segment === 'commercial' ? commercialFields : residentialFields;
  const isDE = lang === 'de';

  // Group fields by section
  const sections: { key: string; title: string; fields: DataSheetField[] }[] = [];
  const sectionOrder = ['identification', 'performance', 'environmental', 'physical'];
  for (const key of sectionOrder) {
    const sectionFields = fields.filter(f => f.section === key);
    if (sectionFields.length > 0) {
      sections.push({
        key,
        title: sectionTitles[key]?.[lang] || key,
        fields: sectionFields,
      });
    }
  }

  const segmentLabel = isDE
    ? (segment === 'commercial' ? 'Gewerbe' : 'Wohngebäude')
    : (segment === 'commercial' ? 'Commercial' : 'Residential');

  const generatedDate = new Date().toLocaleDateString(isDE ? 'de-DE' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="datasheet-template bg-white text-gray-900" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Header / Branding ─────────────────────────────────── */}
      <div className="border-b-4 border-blue-700 pb-4 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-blue-800 tracking-tight flex items-center gap-2">
              <span className="text-3xl">&#x1F1E9;&#x1F1EA;</span>
              Germany Heat Pump Database
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 font-medium tracking-wide uppercase">
              {isDE ? 'Technisches Produktdatenblatt' : 'Technical Product Data Sheet'}
              {' '}&mdash;{' '}{segmentLabel}
            </p>
          </div>
          <div className="text-right text-xs text-gray-400 mt-1">
            <div>{isDE ? 'Erstellt am' : 'Generated'}: {generatedDate}</div>
            <div>BAFA ID: {item.bafa_id}</div>
          </div>
        </div>

        {/* Product title bar */}
        <div className="mt-4 bg-gradient-to-r from-blue-700 to-blue-600 text-white rounded-lg px-5 py-3">
          <div className="text-lg font-bold tracking-wide">{item.model}</div>
          <div className="text-sm opacity-90">{item.manufacturer}</div>
        </div>
      </div>

      {/* ── Spec Sections ─────────────────────────────────────── */}
      {sections.map((section) => (
        <div key={section.key} className="mb-5">
          <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest border-b border-blue-200 pb-1 mb-2">
            {section.title}
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {section.fields.map((field) => {
                const value = field.getValue(item);
                return (
                  <tr key={field.num} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2 text-gray-400 text-xs font-mono w-8 align-top">
                      [{field.num}]
                    </td>
                    <td className="py-1.5 pr-4 text-gray-600 font-medium w-48 align-top">
                      {field.label[lang]}
                    </td>
                    <td className="py-1.5 text-gray-900 font-semibold">
                      {value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* ── Technical Explanations ────────────────────────────── */}
      <div className="mt-8 border-t-2 border-gray-200 pt-4">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          {isDE ? 'Technische Erläuterungen' : 'Technical Explanations'}
        </h2>
        <div className="grid grid-cols-1 gap-1 text-xs text-gray-500 leading-relaxed">
          {fields.map((field) => (
            <div key={field.num} className="flex gap-2">
              <span className="font-mono text-gray-400 shrink-0">[{field.num}]</span>
              <span>{field.explanation[lang]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Disclaimer ────────────────────────────────────────── */}
      <div className="mt-6 border-t border-gray-200 pt-3">
        <p className="text-[9px] text-gray-400 leading-relaxed">
          {disclaimer[lang]}
        </p>
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="mt-4 pt-2 border-t border-gray-100 flex justify-between text-[9px] text-gray-300">
        <span>&copy; {new Date().getFullYear()} Germany Heat Pump Database &mdash; SYS Corporation</span>
        <span>{isDE ? 'Seite' : 'Page'} 1/1</span>
      </div>
    </div>
  );
};
