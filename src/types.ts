
/**
 * BAFA listing status values — Phase 1 only emits 'listed_in_snapshot'.
 * Other values are reserved for Phase 2 delisting/diff tracking.
 */
export type BafaListingStatus =
  | 'listed_in_snapshot'
  | 'not_in_latest_snapshot'
  | 'funding_period_ended'
  | 'relisted'
  | 'unknown';

export interface HeatPump {
  bafa_id: string;

  // ── Source-neutral identity fields ──────────────────────────────────────────
  // These fields allow the same HeatPump shape to represent products from any
  // primary registry without repurposing bafa_id as a universal identifier.
  //
  // source_id:   Stable display-level product identifier. Set by the ingestion
  //              pipeline to the primary registry's key for this market
  //              (bafa_id for DE, mcs_number for GB). Use this as the React
  //              row key and the data-sheet primary field instead of bafa_id.
  // country:     ISO 3166-1 alpha-2 code for the market this record belongs to.
  // primary_source: SourceId string ('BAFA' | 'OFGEM_PEL') identifying which
  //              registry produced this record.
  // mcs_number:  UK MCS Certification Number from the Ofgem PEL (GB only).
  // eprel_registration_number: EPREL EU registration number, set after EPREL
  //              enrichment matching is complete.
  source_id?: string;
  country?: string;
  primary_source?: string;
  mcs_number?: string;
  eprel_registration_number?: string;

  // ── Ofgem PEL provenance (GB only, set by build-app-products-gb.mjs) ────────
  // pel_certification_status: 'listed_no_expiry_date' | 'active_with_expiry' |
  //   'expiry_imminent' | 'expired_confirmed' — cert-body expiry semantics, NOT
  //   a BUS-eligibility claim. PEL listing does not guarantee full BUS eligibility.
  // installation_type_derived: 'name_keyword' when installation_type was derived
  //   from explicit Monobloc/Split keywords in the product name; null otherwise.
  mcs_number_base?: string | null;
  mcs_model_suffix?: string | null;
  product_name?: string | null;
  technology_type?: string | null;      // 'ASHP' | 'WSHP' | 'EAHP'
  technology_type_raw?: string | null;
  pel_certification_status?: string | null;
  mcs_cert_date?: string | null;        // ISO date (YYYY-MM-DD)
  expiry_date?: string | null;          // ISO date (YYYY-MM-DD)
  pel_eligibility_interpretation?: string | null;
  pel_eligibility_caveat?: string | null;
  pel_snapshot?: string | null;
  pel_source_period?: string | null;
  pel_source_last_modified?: string | null;
  pel_source_url?: string | null;
  pel_snapshot_fetched_at?: string | null;
  installation_type_derived?: string | null;

  // ── BAFA_REFERENCE enrichment (GB only, set by match-pel-to-bafa.mjs) ──────
  // performance_source: 'BAFA_REFERENCE' when technical specs were copied from
  //   the same hardware's German BAFA listing — a cross-reference, NOT UK
  //   certification data. Null when performance fields are unenriched.
  performance_source?: string | null;         // 'BAFA_REFERENCE' | 'EPREL' | null
  bafa_reference_id?: string | null;
  bafa_reference_model?: string | null;
  bafa_reference_match_type?: string | null;  // 'exact_model' | 'token_subsequence'

  // ── EPREL enrichment (GB, set by match-pel-to-eprel.mjs) ───────────────────
  // eprel_registration_number (declared above) links the official EU label
  // registration; label values (ηs, design output, sound power) fill
  // performance fields only when there is no BAFA_REFERENCE match.
  eprel_model?: string | null;
  eprel_match_type?: string | null;           // 'exact_model' | 'token_subsequence'

  // ── NF PAC enrichment (FR only, optional overlay) ──────────────────────────
  // French NF PAC (Certita) certification reference. Attached ONLY when a
  // confident match exists — uncertain matches are never shown (user policy).
  nf_pac_reference?: string | null;

  // ── Neutral European-reference identity (PL public schema) ────────────────
  // The PL edition publishes NO German-market field names: the builder renames
  // bafa_id → european_reference_id, bafa_reference_model/_match_type →
  // european_reference_*, and performance_source 'BAFA_REFERENCE' →
  // 'EU_MEASURED_REFERENCE' at output time. Internal artifacts keep the
  // original provenance for traceability.
  european_reference_id?: string | null;
  european_reference_model?: string | null;
  european_reference_match_type?: string | null;

  // ── Lista ZUM listing overlay (PL only, set by build-app-products-pl.mjs) ──
  // Same contract as the PEL overlay: a CONFIRMED match may say "ZUM listed" and
  // carry the ZUM id; anything else is verification-required. The overlay never
  // creates a product, supplies a spec, or removes a product on a failed match.
  // zum_id: the public Lista ZUM device identifier (e.g. 'PC-12345').
  zum_match_status?: string | null;   // 'confirmed' | 'review_required' | 'verification_required'
  zum_id?: string | null;
  zum_product_name?: string | null;
  zum_category?: string | null;       // 'PW' | 'PWX' | 'PU' | 'PG' | 'PP'
  zum_class_55c?: string | null;      // registry-published class — display-only fact
  zum_match_method?: string | null;
  zum_match_confidence?: string | null;
  zum_snapshot?: string | null;
  zum_snapshot_fetched_at?: string | null;
  zum_first_matched_at?: string | null;
  zum_last_confirmed_at?: string | null;

  // ── GSE Conto Termico listing overlay (IT only, build-app-products-it.mjs) ──
  // Same contract as the PEL/ZUM overlays: a CONFIRMED match may say "nel
  // catalogo GSE"; anything else is verification-required. The catalogue
  // publishes NO per-row identifier — gse_entry_key is OUR deterministic
  // internal key (history/integrity only) and is never shown as an official id.
  gse_match_status?: string | null;   // 'confirmed' | 'review_required' | 'verification_required'
  gse_entry_key?: string | null;
  gse_catalogue?: string | null;      // 'III.A'
  gse_brand?: string | null;          // catalogue-published brand (fact)
  gse_model?: string | null;          // catalogue-published model (fact)
  gse_match_method?: string | null;
  gse_match_confidence?: string | null;
  gse_snapshot?: string | null;
  gse_snapshot_fetched_at?: string | null;
  gse_first_matched_at?: string | null;
  gse_last_confirmed_at?: string | null;
  // ── GSE-native records (IT only, gse_match_method='gse_native') ────────────
  // The catalogue's rating rows verbatim (per declared operating point), the
  // basis-unstated declared capacity fallback, and how/whether the rows were
  // provably assigned to the 35/55 °C application fields.
  gse_ratings?: { kw: number | null; etas: number | null; scop: number | null }[] | null;
  declared_capacity_kw?: number | null;
  gse_temp_assignment?: 'declared_pair' | 'model_label' | null;

  // ── BAFA listing provenance (Phase 1) ───────────────────────────────────────
  // bafa_listing_status: 'listed_in_snapshot' means present in the BAFA source
  //   snapshot used to generate this dataset — NOT a claim of current eligibility.
  // bafa_foerderung_von/bis: BAFA funding period dates, preserved from the API
  //   for reference only. Does not confirm current subsidy application status.
  // bafa_snapshot_fetched_at: ISO timestamp of when BAFA API was queried.
  // source_snapshot_generated_at: ISO timestamp of when this pipeline ran.
  bafa_listing_status?: BafaListingStatus;
  bafa_foerderung_von?: string | null;
  bafa_foerderung_bis?: string | null;
  bafa_snapshot_fetched_at?: string | null;
  source_snapshot_generated_at?: string | null;

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

  // Grid readiness
  grid_ready: boolean;
  grid_ready_type: string | null;

  market_segment: string | null;

  // ── Component fields (from IDU/ODU mapping, display-only) ──────────────────
  outdoor_unit_model?: string | null;
  idu_model?: string | null;
  control_box_model?: string | null;
  tank_model?: string | null;
  tower_model?: string | null;
  hydraulic_module_model?: string | null;
  indoor_side_equipment_model?: string | null;

  // ── Outdoor-side display fields (computed by pipeline classification) ────────
  outdoor_side_identified?: boolean;
  outdoor_side_display_model?: string | null;
  outdoor_side_display_kind?:
    | 'exact_model'
    | 'product_is_outdoor_unit'
    | 'rule_inferred'
    | 'model_name_inferred'
    | 'safe_app_fallback'
    | null;
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
  // ── Original HeatPump DB editorial articles (generated monthly) ──
  /** Full article text — paragraphs separated by blank lines. */
  body?: string;
  /** Cited sources listed at the foot of the article. */
  sources?: { title: string; url: string }[];
  /** Byline, e.g. 'HeatPump DB Editorial'. */
  author?: string;
  /** True when the article is HeatPump DB original content (not aggregated). */
  original?: boolean;
  /** Editorial category: FUNDING | MARKET | TECHNOLOGY | INSTALLER INSIGHT. */
  category?: string;
  /** Stored German translations of the article (generated with the article). */
  title_de?: string;
  summary_de?: string;
  body_de?: string;
  /** Stored French translations of the article (FR market edition). */
  title_fr?: string;
  summary_fr?: string;
  body_fr?: string;
  /** Stored Polish translations of the article (PL market edition). */
  title_pl?: string;
  summary_pl?: string;
  body_pl?: string;
  /** Stored Italian translations of the article (IT market edition). */
  title_it?: string;
  summary_it?: string;
  body_it?: string;
}

export interface PolicyItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  sourceUrl: string;
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
  Range_8_11 = '8 kW ~ 11 kW',
  Range_12_14 = '12 kW ~ 14 kW',
  Range_15_20 = '15 kW ~ 20 kW',
}

/** UI filter values for installation type. */
export enum InstallationType {
  Monoblock = 'Monoblock',
  Split = 'Split',
}

export type FetchState = 'idle' | 'loading' | 'success' | 'error';
export type Language = 'en' | 'de' | 'fr' | 'pl' | 'it';

// --- Auth Types ---
/**
 * Company type is stored as a CODE from config/companyTypes.ts ('installer', …).
 * Typed as string because profiles created before Jul 2026 hold an English label
 * ('Installer', 'Private Individual'); normalizeCompanyType() maps those on read.
 */
export type CompanyType = string;
/** @deprecated Job role is no longer collected. Legacy documents may still carry it. */
export type JobRole = string;

/**
 * A Firestore Timestamp as the client sees it after a server (Admin SDK) write:
 * a Timestamp object ({ toMillis() } / { seconds }), or an ISO string from
 * legacy/manual writes. Convert with tsToMillis() (config/entitlement.ts) —
 * never compare these values directly.
 */
export type FirestoreTimestampLike =
  | { toMillis: () => number }
  | { seconds: number; nanoseconds?: number }
  | string
  | number
  | null;

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Company type CODE (config/companyTypes.ts). Legacy docs hold an English label. */
  companyType: CompanyType;
  /** Free text, only when companyType === 'other'. */
  companyTypeOther?: string;
  /** @deprecated No longer collected at signup; kept so legacy documents still load. */
  jobRole?: JobRole;
  companyName?: string;
  companyCity?: string;
  /** Optional; stored normalized as a bare domain/URL without a scheme. */
  companyWebsite?: string;
  /** Registration country — taken from the country edition, never asked for. */
  country?: string;
  /** @deprecated No longer collected at signup; kept so legacy documents still load. */
  referralSource?: string;
  isActive: boolean;
  status?: 'pending' | 'active' | 'suspended' | 'rejected' | 'disabled' | 'deletion_requested' | 'deleted' | 'archived';
  registeredAt: string;
  /** Marketing channel that brought the signup (services/signupRef.ts). */
  signupRef?: string;
  /** ISO timestamp of consent to the Terms of Use + Privacy Policy at signup. */
  termsAcceptedAt?: string;
  /** Versions consented to (config/legal.ts). Minimal consent record — no history log. */
  termsVersion?: string;
  privacyVersion?: string;
  /** Data-use consent (anti-extraction notice) at signup — server-stamped by finalizeSignup. */
  dataUseConsentAt?: string;
  dataUseConsentVersion?: string;
  // ── Trial / access window (server-written ONLY: finalizeSignup / webhook / admin) ──
  /** Firestore Timestamp (or ISO string) — set once, at the account's first activation. */
  trialStartedAt?: FirestoreTimestampLike;
  trialEndsAt?: FirestoreTimestampLike;
  /**
   * The single rules-facing access window: security rules allow product/data
   * reads while request.time < accessUntilTs. Absent = no window enforced
   * (legacy accounts). Covers trial AND paid periods uniformly; extended by the
   * billing webhook on every successful payment. Never written by client code.
   */
  accessUntilTs?: FirestoreTimestampLike;
  /** Optional, opt-in, never bundled with the required Terms acceptance. */
  marketingConsent?: boolean;
  lastActiveAt?: string;
  role?: 'user' | 'owner' | 'admin' | 'support' | 'ops';
  // Plan & entitlement fields
  plan?: 'standard' | 'premium';
  /** 'paddle' is the web-billing channel (no app-store distribution). */
  billingChannel?: 'paddle' | 'admin_grant' | 'trial';
  /** Marketing free access (entitlement layer) — see UserGrant. */
  grant?: UserGrant;
  /** Last applied plan change (upgrade) — one change per 30 days. */
  lastPlanChangeAt?: string;
  industryInsightOverride?: boolean;
  // ── Paddle web billing (written server-side by the billing webhook) ────────
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  /** Hosted customer-portal URL (payment method / invoices / cancel). */
  paddlePortalUrl?: string;
  subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';
  /** ISO timestamp of the next scheduled charge. */
  nextBilledAt?: string;
  // ── Subscription program (Professional / Team 3 / Team 5) ─────────────────
  /** Written by the billing webhook, an admin, or free-grant redemption — never by plain client code. */
  subscription?: UserSubscription;
  /** Organization membership (Team 3 / Team 5). */
  orgId?: string;
  orgRole?: 'team_admin' | 'member';
  // Compliance
  deletionRequestedAt?: string;
  deletionNote?: string;
  // Internal notes
  adminNotes?: string;
}

// --- Subscription program (Professional / Team 3 / Team 5) ---
// Plan/term/price definitions live in src/config/subscriptionPlans.ts.

/**
 * Marketing free-access grant — the ENTITLEMENT layer, deliberately separate
 * from `subscription` (2026-08-03): `subscription` is written only by the
 * Paddle webhook; `grant` only by admin tooling / self-redemption. Access is
 * the later of the two windows, so a paid subscription arriving during a
 * grant auto-converts with no conflict.
 */
export interface UserGrant {
  source: 'free_grant';
  planCode: 'professional' | 'team_3' | 'team_5';
  startsAt: string;
  /** ISO end of the granted window. */
  endsAt: string;
  grantedBy?: string;
  note?: string;
}

export interface UserSubscription {
  /** 'paddle' = paid via Paddle; 'free_grant' = admin promotion (freeAccessGrants). */
  provider: 'paddle' | 'free_grant';
  planCode: 'professional' | 'team_3' | 'team_5';
  billingTerm?: 'monthly' | 'six_months' | 'annual';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  seatLimit: number;
  trialStartedAt?: string;
  trialEndsAt?: string;
  paidPeriodStartsAt?: string | null;
  /** End of the current paid (or granted) period; renewal/expiry anchor. */
  currentPeriodEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** Renewal-time change scheduled via subscriptionChangeRequests. */
  scheduledPlanCode?: 'professional' | 'team_3' | 'team_5' | null;
  scheduledBillingTerm?: 'monthly' | 'six_months' | 'annual' | null;
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  paddlePriceId?: string;
}

/** A Team 3 / Team 5 organization. One Paddle subscription per org (owner pays). */
export interface Organization {
  id: string;
  name?: string;
  ownerUid: string;
  ownerEmail: string;
  planCode: 'team_3' | 'team_5';
  seatLimit: number;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  /** Team trial is anchored to the ADMIN's own signup trial — one date for everyone. */
  trialEndsAt?: FirestoreTimestampLike;
  currentPeriodEndsAt?: string | null;
  /**
   * Rules-facing team access window (mirror of the admin's). Members are
   * entitled while request.time < org.accessUntilTs. Server-written only.
   */
  accessUntilTs?: FirestoreTimestampLike;
  /** Occupied seats (includes the owner). Length must stay <= seatLimit. */
  members: { uid: string; email: string; name?: string }[];
  /**
   * The uids in `members`, kept in step with it. Security rules cannot look
   * inside the member maps, so this flat list is what lets them prove that a
   * join adds the CALLER and a leave removes the CALLER — nobody else.
   */
  memberUids?: string[];
  /** Open invitations (count against seats). Invitee joins on next login. */
  invitedEmails: string[];
  /** email → ISO timestamp of the (re)invitation, for the pending-invite list. */
  invitedAt?: Record<string, string>;
  /** Members to keep on a scheduled downgrade (chosen at scheduling time). */
  keepMemberUids?: string[];
  // ── Company profile — owned by the org, inherited by every member ──────────
  companyName?: string;
  companyType?: CompanyType;
  companyTypeOther?: string;
  companyCity?: string;
  companyWebsite?: string;
  createdAt: string;
}

/** Renewal-time plan/term change request (applied by ops/webhook at renewal, never mid-term). */
export interface SubscriptionChangeRequest {
  id: string;           // == uid of the requesting subscriber
  userId: string;
  userEmail: string;
  currentPlanCode: string;
  currentBillingTerm?: string;
  requestedPlanCode: 'professional' | 'team_3' | 'team_5';
  requestedBillingTerm: 'monthly' | 'six_months' | 'annual';
  /** For team downgrades: the members that keep their seats. */
  keepMemberUids?: string[];
  effectiveAt?: string | null;  // renewal date at scheduling time
  status: 'scheduled' | 'applied' | 'cancelled';
  createdAt: string;
}

/** Admin-issued free access (promotions). Doc id = lowercased email. */
/**
 * A discount campaign, recorded so the console is the one place that answers
 * "what promotions are running, where, and until when".
 *
 * DELIBERATE BOUNDARY — this registry does NOT create, edit or delete anything
 * in Paddle, and does not apply a discount at checkout. Paddle is the merchant
 * of record and its discounts are immutable once used, so they are created in
 * the Paddle dashboard by a human; `paddleDiscountId` / `code` link this record
 * to that entity. Everything here is operational bookkeeping: which markets a
 * campaign targets, which plans, when it runs, and whether it is still live.
 * Nothing on the payment path reads it, so a wrong entry can misinform but
 * can never break a checkout.
 */
export interface Promotion {
  /** Firestore doc id — the customer-facing coupon code, uppercased. */
  code: string;
  /** Paddle discount id (`dsc_…`) this code corresponds to, if created there. */
  paddleDiscountId?: string;
  /** What the customer gets, e.g. "20% off the first year". Free text: the
   *  authoritative amount lives in Paddle, this is the human description. */
  description: string;
  /** Target markets (ISO country codes). Empty = every market. */
  markets: string[];
  /** Target plans. Empty = every plan. */
  planCodes: string[];
  startsAt: string;
  endsAt: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  /** Set when the campaign is retired; the record is kept for reporting. */
  archivedAt?: string;
}

export interface FreeAccessGrant {
  email: string;
  planCode: 'professional' | 'team_3' | 'team_5';
  startsAt: string;
  endsAt: string;
  /**
   * endsAt as a Firestore Timestamp, written by the admin at grant creation.
   * Rules cannot parse ISO strings, so redemption copies THIS value into the
   * user's accessUntilTs (rules verify the equality) — that is how a grant
   * opens the trial/subscription access window.
   */
  endsAtTs?: FirestoreTimestampLike;
  /**
   * Market this promotion belongs to (ISO country of a COUNTRY_PROFILES site),
   * or undefined for "any market". OPERATIONAL LABEL ONLY — it records which
   * country campaign the grant was issued for so the Billing page can be
   * filtered and reported per market. It is deliberately NOT enforced at
   * redemption: the grant is keyed by email and the catalogue is identical in
   * every market, so refusing a recipient who happens to sign in on another
   * country site would break a legitimate promotion for no benefit. Redemption
   * rules (firestore.rules) are unchanged and never read this field.
   */
  country?: string;
  note?: string;
  grantedBy: string;
  createdAt: string;
  /** Set when a registering/logging-in user redeems the grant. */
  redeemedByUid?: string;
  redeemedAt?: string;
  revokedAt?: string;
}

// --- Support Tickets (in-app inquiries, store-required support channel) ---
export type TicketStatus = 'open' | 'answered' | 'closed';
export type TicketCategory = 'general' | 'data' | 'billing' | 'account';

export interface TicketMessage {
  from: 'user' | 'admin';
  authorName: string;
  text: string;
  at: string; // ISO timestamp
}

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  /** ISO 3166-1 alpha-2 market code (set from ACTIVE_COUNTRY at creation). */
  country: string;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
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
