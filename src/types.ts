
export interface HeatPump {
  bafa_id: string;
  manufacturer: string;
  manufacturer_short?: string;
  model: string;
  type: string;                        // "Luft / Wasser"
  refrigerant: string;
  refrigerant_amount_kg: number | null;
  refrigerant_2: string | null;
  refrigerant_2_amount_kg: number | null;
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

  // Pricing (raw engine output — internal, not for direct display)
  equipment_price_low_eur: number | null;
  equipment_price_typical_eur: number | null;
  equipment_price_high_eur: number | null;
  // Pricing (user-facing display: ±15% band around reference, rounded to €50)
  equipment_price_display_eur: number | null;
  equipment_price_display_low_eur: number | null;
  equipment_price_display_high_eur: number | null;
  price_confidence: string | null;
  brand_tier: string | null;
  market_segment: string | null;
  capacity_band: string | null;
  refrigerant_group: string | null;
  package_scope: string | null;
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
  commercialProducts?: HeatPump[];
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

/** UI filter values for installation type. */
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
  country?: string;
  referralSource?: string;
  isActive: boolean;
  status?: 'pending' | 'active' | 'suspended' | 'rejected' | 'deletion_requested' | 'deleted' | 'archived';
  registeredAt: string;
  lastActiveAt?: string;
  role?: 'user' | 'owner' | 'admin' | 'support' | 'ops';
  // Plan & entitlement fields
  plan?: 'standard' | 'premium';
  billingChannel?: 'apple' | 'google' | 'direct' | 'admin_grant' | 'trial';
  extraPrintQuota?: number;
  industryInsightOverride?: boolean;
  // Compliance
  deletionRequestedAt?: string;
  deletionNote?: string;
  // Internal notes
  adminNotes?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  details: string;
  timestamp: string;
  // Enhanced audit fields (optional, new logs will include these)
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  source?: 'admin_ui' | 'system' | 'webhook' | 'scheduler';
  result?: 'success' | 'failure';
  beforeValue?: string;
  afterValue?: string;
  correlationId?: string;
}
