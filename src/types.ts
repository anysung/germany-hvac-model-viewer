
export interface HeatPump {
  manufacturer: string;
  unitType: string; // 'IDU' or 'ODU'
  model: string;
  capacityRange: string;
  dimensions: string; // H x W x D
  refrigerant: string; // e.g., R290, R32
  cop: string;
  scop: string;
  noiseLevel: string; // dB(A)
  description: string;
  others: string; // Additional specs
  marketPrice: string;
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

export enum Manufacturer {
  Buderus = 'Buderus',
  Bosch = 'Bosch',
  Viessmann = 'Viessmann',
  Vaillant = 'Vaillant',
  LG_Electronics = 'LG Electronics',
  Daikin = 'Daikin',
  Panasonic = 'Panasonic',
  Stiebel_Eltron = 'Stiebel Eltron',
}

export enum CapacityRange {
  Range_4_7 = '4 kW ~ 7 kW',
  Range_8_10 = '8 kW ~ 10 kW',
  Range_11_12 = '11 kW ~ 12 kW',
  Range_13_17 = '13 kW ~ 17 kW',
}

export enum UnitType {
  IDU = 'Indoor Unit (IDU)',
  ODU = 'Outdoor Unit (ODU)',
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
