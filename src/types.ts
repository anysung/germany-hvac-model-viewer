
export interface HeatPump {
  bafa_id: string;
  manufacturer: string;
  model: string;
  type: string;                        // "Luft / Wasser"
  refrigerant: string;
  refrigerant_2: string | null;
  installation_type: string | null;    // "Monoblock" or "Split"

  // Performance (numeric)
  power_35C_kw: number | null;
  power_55C_kw: number | null;
  cop_A7W35: number | null;
  cop_A2W35: number | null;
  cop_AMinus7W35: number | null;
  scop: number | null;
  noise_outdoor_dB: number | null;
  noise_indoor_dB: number | null;

  // Physical specs
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  weight_kg: number | null;

  // Grid readiness
  grid_ready: boolean;
  grid_ready_type: string | null;

  // Pricing
  equipment_price_low_eur: number | null;
  equipment_price_typical_eur: number | null;
  equipment_price_high_eur: number | null;
  price_confidence: string | null;
  brand_tier: string | null;
  market_segment: string | null;
  capacity_band: string | null;
  refrigerant_group: string | null;
}

export type AppMode = 'DATABASE' | 'LIVE_API';

// --- Expansion Models ---
export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  date: string;
  imageUrl?: string;
}

export interface PolicyItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  sourceUrl: string;
}

export interface BAFAItem {
  id: string;
  title: string;
  lastUpdated: string;
  downloadUrl: string;
}

export interface HeatPumpDatabase {
  generatedAt: string;
  version: string;
  appMode: AppMode;
  products: HeatPump[];
  // New Arrays
  newsFeed?: NewsItem[];
  policySummary?: PolicyItem[];
  bafaListLinks?: BAFAItem[];
}

/** Top manufacturer filter badges — display label → substring match against manufacturer field */
export enum Manufacturer {
  Mitsubishi = 'Mitsubishi',
  Viessmann = 'Viessmann',
  Buderus = 'Buderus',
  Daikin = 'Daikin',
  Panasonic = 'Panasonic',
  Samsung = 'Samsung',
  Bosch = 'Bosch',
  LG = 'LG',
}

export enum CapacityRange {
  Range_4_7 = '4 kW ~ 7 kW',
  Range_8_10 = '8 kW ~ 10 kW',
  Range_11_12 = '11 kW ~ 12 kW',
  Range_13_17 = '13 kW ~ 17 kW',
}

export enum InstallationType {
  Monoblock = 'Monoblock',
  Split = 'Split',
}

export type FetchState = 'idle' | 'loading' | 'success' | 'error';
export type Language = 'en' | 'de';

// --- Auth Types ---
export type CompanyType = 'Manufacturer' | 'Distributor' | 'Installer' | 'Private Individual';
export type JobRole = 'C-Level' | 'Director' | 'Sales Manager' | 'Technician' | 'Service' | 'Product Management' | 'General Public' | 'Other';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyType: CompanyType;
  jobRole: JobRole;
  companyName?: string;
  companyCity?: string;
  referralSource?: string;
  isActive: boolean;
  status?: 'pending' | 'active' | 'suspended' | 'rejected';
  registeredAt: string;
  role?: 'owner' | 'user';
}

export interface ActivityLog {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  details: string;
  timestamp: string;
}
