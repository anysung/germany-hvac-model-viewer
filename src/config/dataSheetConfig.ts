/**
 * Data Sheet Configuration — field definitions, technical explanations,
 * and disclaimer text for Residential and Commercial product data sheets.
 *
 * All fields included here are BAFA-origin only.
 * Excluded: pricing, brand_tier, market_segment, capacity_band,
 * refrigerant_group, manufacturer_short, manufacturer_normalized,
 * physical_specs_*, price_*, package_scope.
 */

import { HeatPump } from '../types';
import { Language } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DataSheetField {
  /** Reference number shown on the data sheet */
  num: number;
  /** i18n label keys */
  label: { en: string; de: string };
  /** Extract the display value from a HeatPump record */
  getValue: (item: HeatPump) => string;
  /** Technical explanation */
  explanation: { en: string; de: string };
  /** Section grouping */
  section: 'identification' | 'performance' | 'physical' | 'environmental';
}

// ─── Shared Formatters ───────────────────────────────────────────────────────

const fmt = {
  str: (v: string | null | undefined) => v || '—',
  kw: (v: number | null) => v == null ? '—' : Number.isInteger(v) ? `${v} kW` : `${v.toFixed(1)} kW`,
  pct: (v: number | null) => v == null ? '—' : `${v}%`,
  cop: (v: number | null) => v == null ? '—' : v.toFixed(2),
  db: (v: number | null) => v == null ? '—' : `${v} dB(A)`,
  kg: (v: number | null) => v == null ? '—' : `${v} kg`,
  mm: (v: number | null) => v == null ? '—' : `${v} mm`,
  bool: (v: boolean) => v ? 'Yes' : 'No',
  boolDe: (v: boolean) => v ? 'Ja' : 'Nein',
};

// ─── Residential Fields ──────────────────────────────────────────────────────

export const residentialFields: DataSheetField[] = [
  // Identification
  {
    num: 1,
    label: { en: 'BAFA ID', de: 'BAFA-ID' },
    getValue: (m) => m.bafa_id,
    explanation: {
      en: 'Unique registration number assigned by the German Federal Office for Economic Affairs and Export Control (BAFA).',
      de: 'Eindeutige Registrierungsnummer des Bundesamts für Wirtschaft und Ausfuhrkontrolle (BAFA).',
    },
    section: 'identification',
  },
  {
    num: 2,
    label: { en: 'Manufacturer', de: 'Hersteller' },
    getValue: (m) => m.manufacturer,
    explanation: {
      en: 'Equipment manufacturer as registered with BAFA.',
      de: 'Gerätehersteller gemäß BAFA-Registrierung.',
    },
    section: 'identification',
  },
  {
    num: 3,
    label: { en: 'Model', de: 'Modell' },
    getValue: (m) => m.model,
    explanation: {
      en: 'Specific product model designation as listed in the BAFA registry.',
      de: 'Modellbezeichnung gemäß BAFA-Register.',
    },
    section: 'identification',
  },
  {
    num: 4,
    label: { en: 'Heat Pump Type', de: 'Wärmepumpentyp' },
    getValue: (m) => fmt.str(m.type),
    explanation: {
      en: 'Heat source and heat sink medium combination (e.g. Air/Water, Brine/Water).',
      de: 'Kombination aus Wärmequelle und Wärmesenke (z.B. Luft/Wasser, Sole/Wasser).',
    },
    section: 'identification',
  },
  {
    num: 5,
    label: { en: 'Installation Type', de: 'Bauart' },
    getValue: (m) => fmt.str(m.installation_type),
    explanation: {
      en: 'Monoblock (single outdoor unit) or Split (separate indoor and outdoor units).',
      de: 'Monoblock (ein Außengerät) oder Split (getrennte Innen- und Außeneinheit).',
    },
    section: 'identification',
  },

  // Performance
  {
    num: 6,
    label: { en: 'Heating Capacity (35°C)', de: 'Heizleistung (35°C)' },
    getValue: (m) => fmt.kw(m.power_35C_kw),
    explanation: {
      en: 'Rated heating output at 35°C flow temperature, measured under standard test conditions (EN 14511).',
      de: 'Nennheizleistung bei 35°C Vorlauftemperatur nach Standardprüfbedingungen (EN 14511).',
    },
    section: 'performance',
  },
  {
    num: 7,
    label: { en: 'Heating Capacity (55°C)', de: 'Heizleistung (55°C)' },
    getValue: (m) => fmt.kw(m.power_55C_kw),
    explanation: {
      en: 'Rated heating output at 55°C flow temperature for higher-temperature applications.',
      de: 'Nennheizleistung bei 55°C Vorlauftemperatur für Hochtemperaturanwendungen.',
    },
    section: 'performance',
  },
  {
    num: 8,
    label: { en: 'COP (A7/W35)', de: 'COP (A7/W35)' },
    getValue: (m) => fmt.cop(m.cop_A7W35),
    explanation: {
      en: 'Coefficient of Performance at air 7°C / water 35°C. Ratio of heat output to electrical input.',
      de: 'Leistungszahl bei Luft 7°C / Wasser 35°C. Verhältnis von Heizleistung zu elektrischer Aufnahme.',
    },
    section: 'performance',
  },
  {
    num: 9,
    label: { en: 'COP (A2/W35)', de: 'COP (A2/W35)' },
    getValue: (m) => fmt.cop(m.cop_A2W35),
    explanation: {
      en: 'Coefficient of Performance at air 2°C / water 35°C. Reflects performance in cooler conditions.',
      de: 'Leistungszahl bei Luft 2°C / Wasser 35°C. Zeigt die Leistung bei kühleren Bedingungen.',
    },
    section: 'performance',
  },
  {
    num: 10,
    label: { en: 'COP (A-7/W35)', de: 'COP (A-7/W35)' },
    getValue: (m) => fmt.cop(m.cop_AMinus7W35),
    explanation: {
      en: 'Coefficient of Performance at air -7°C / water 35°C. Cold-weather performance indicator.',
      de: 'Leistungszahl bei Luft -7°C / Wasser 35°C. Leistungsindikator bei kaltem Wetter.',
    },
    section: 'performance',
  },
  {
    num: 11,
    label: { en: 'SCOP', de: 'SCOP' },
    getValue: (m) => fmt.cop(m.scop),
    explanation: {
      en: 'Seasonal Coefficient of Performance. Weighted annual average efficiency under EU climate conditions.',
      de: 'Saisonale Leistungszahl. Gewichtete Jahres-Durchschnittseffizienz unter EU-Klimabedingungen.',
    },
    section: 'performance',
  },

  // Environmental
  {
    num: 12,
    label: { en: 'Refrigerant', de: 'Kältemittel' },
    getValue: (m) => fmt.str(m.refrigerant),
    explanation: {
      en: 'Primary refrigerant type used in the heat pump circuit.',
      de: 'Primäres Kältemittel im Wärmepumpenkreislauf.',
    },
    section: 'environmental',
  },
  {
    num: 13,
    label: { en: 'Refrigerant Amount', de: 'Kältemittelmenge' },
    getValue: (m) => fmt.kg(m.refrigerant_amount_kg),
    explanation: {
      en: 'Total charge of primary refrigerant in the system.',
      de: 'Gesamtfüllmenge des primären Kältemittels im System.',
    },
    section: 'environmental',
  },
  {
    num: 14,
    label: { en: 'Sound Power Level', de: 'Schallleistungspegel' },
    getValue: (m) => fmt.db(m.noise_outdoor_dB),
    explanation: {
      en: 'Outdoor unit sound power level measured per EN 12102. Lower values indicate quieter operation.',
      de: 'Schallleistungspegel des Außengeräts nach EN 12102. Niedrigere Werte bedeuten leiseren Betrieb.',
    },
    section: 'environmental',
  },
  {
    num: 15,
    label: { en: 'Grid Ready (SG Ready)', de: 'Grid Ready (SG Ready)' },
    getValue: (m) => m.grid_ready ? 'Yes / Ja' : 'No / Nein',
    explanation: {
      en: 'SG Ready certification indicates the unit can respond to smart grid signals for demand-side management.',
      de: 'SG-Ready-Zertifizierung zeigt, dass das Gerät auf Smart-Grid-Signale zur Laststeuerung reagieren kann.',
    },
    section: 'environmental',
  },

  // Physical
  {
    num: 16,
    label: { en: 'Dimensions (W x H x D)', de: 'Abmessungen (B x H x T)' },
    getValue: (m) => {
      if (m.width_mm == null && m.height_mm == null && m.depth_mm == null) return '—';
      return `${m.width_mm ?? '—'} x ${m.height_mm ?? '—'} x ${m.depth_mm ?? '—'} mm`;
    },
    explanation: {
      en: 'External dimensions of the outdoor unit: Width x Height x Depth in millimeters.',
      de: 'Außenabmessungen des Außengeräts: Breite x Höhe x Tiefe in Millimetern.',
    },
    section: 'physical',
  },
  {
    num: 17,
    label: { en: 'Weight', de: 'Gewicht' },
    getValue: (m) => fmt.kg(m.weight_kg),
    explanation: {
      en: 'Net weight of the outdoor unit.',
      de: 'Nettogewicht des Außengeräts.',
    },
    section: 'physical',
  },
];

// ─── Commercial Fields ───────────────────────────────────────────────────────
// Same BAFA-origin fields, with additional commercial-relevant entries

export const commercialFields: DataSheetField[] = [
  ...residentialFields.slice(0, 5), // identification fields 1-5

  // Performance (same + efficiency percentages)
  residentialFields[5], // Heating Capacity 35°C
  {
    num: 7,
    label: { en: 'Efficiency (35°C)', de: 'Effizienz (35°C)' },
    getValue: (m) => fmt.pct((m as any).efficiency_35C_percent),
    explanation: {
      en: 'Energy efficiency ratio at 35°C flow temperature as percentage.',
      de: 'Energieeffizienz bei 35°C Vorlauftemperatur in Prozent.',
    },
    section: 'performance',
  },
  residentialFields[6], // Heating Capacity 55°C — renumbered
  {
    num: 9,
    label: { en: 'Efficiency (55°C)', de: 'Effizienz (55°C)' },
    getValue: (m) => fmt.pct((m as any).efficiency_55C_percent),
    explanation: {
      en: 'Energy efficiency ratio at 55°C flow temperature as percentage.',
      de: 'Energieeffizienz bei 55°C Vorlauftemperatur in Prozent.',
    },
    section: 'performance',
  },
  ...residentialFields.slice(7, 11), // COP fields — renumbered below

  // Environmental + Physical (same as residential)
  ...residentialFields.slice(11),
];

// Renumber commercial fields sequentially
commercialFields.forEach((f, i) => { f.num = i + 1; });

// ─── Section Titles ──────────────────────────────────────────────────────────

export const sectionTitles: Record<string, { en: string; de: string }> = {
  identification: { en: 'Product Identification', de: 'Produktidentifikation' },
  performance: { en: 'Performance Data', de: 'Leistungsdaten' },
  environmental: { en: 'Environmental & Grid', de: 'Umwelt & Netz' },
  physical: { en: 'Physical Specifications', de: 'Physische Spezifikationen' },
};

// ─── Disclaimer ──────────────────────────────────────────────────────────────

export const disclaimer = {
  en: `DISCLAIMER — This product data sheet is generated using information compiled from publicly available sources, including but not limited to the German Federal Office for Economic Affairs and Export Control (BAFA) heat pump registry and manufacturer-published specifications. While every effort has been made to ensure accuracy, the Germany Heat Pump Database ("the Service") does not warrant or guarantee the completeness, correctness, or currentness of the information presented herein. This document is provided for informational purposes only and does not constitute professional engineering, procurement, or regulatory advice. Users must independently verify all specifications with the equipment manufacturer and relevant authorities before making purchasing, installation, or compliance decisions. The Service, its operators, and affiliates shall not be liable for any direct, indirect, incidental, or consequential damages or losses arising from the use of or reliance on the information contained in this data sheet. Data sources include BAFA product registrations and manufacturer technical documentation as available at the time of data collection.`,
  de: `HAFTUNGSAUSSCHLUSS — Dieses Produktdatenblatt wird auf Grundlage von Informationen erstellt, die aus öffentlich zugänglichen Quellen zusammengestellt wurden, darunter das Wärmepumpenregister des Bundesamts für Wirtschaft und Ausfuhrkontrolle (BAFA) sowie herstellerseitig veröffentlichte Spezifikationen. Obwohl größte Sorgfalt auf die Richtigkeit verwendet wurde, übernimmt die Germany Heat Pump Database („der Dienst") keine Gewährleistung oder Garantie für die Vollständigkeit, Korrektheit oder Aktualität der hierin dargestellten Informationen. Dieses Dokument dient ausschließlich Informationszwecken und stellt keine professionelle Ingenieur-, Beschaffungs- oder Regulierungsberatung dar. Nutzer müssen alle Spezifikationen vor Kauf-, Installations- oder Compliance-Entscheidungen eigenständig beim Gerätehersteller und den zuständigen Behörden überprüfen. Der Dienst, seine Betreiber und verbundenen Unternehmen haften nicht für direkte, indirekte, beiläufige oder Folgeschäden, die aus der Nutzung oder dem Vertrauen auf die in diesem Datenblatt enthaltenen Informationen entstehen. Datenquellen umfassen BAFA-Produktregistrierungen und technische Herstellerdokumentation zum Zeitpunkt der Datenerhebung.`,
};
