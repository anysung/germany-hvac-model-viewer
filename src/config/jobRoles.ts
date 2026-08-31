/**
 * Job function — asked once at onboarding, always skippable.
 *
 * WHY IT CAME BACK
 * The field existed, was dropped, and is deliberately reinstated (owner,
 * 2026-08-31). It earns its place only if it changes what we send: a Product
 * Manager and a field installer want different things from the same article,
 * and without this the newsletter and the market cards have to address
 * everyone at once. If that segmentation never gets built, this question
 * should be removed again rather than left collecting answers nobody reads.
 *
 * Stored as a stable CODE, never a translated label — same rule as
 * companyTypes.ts, so an answer given in French still reads in German.
 */
export type JobRoleCode =
  | 'sales'
  | 'marketing'
  | 'product'
  | 'engineering'
  | 'operations'
  | 'management'
  | 'other';

/** Display order in the onboarding sheet and the Account page. */
export const JOB_ROLES: JobRoleCode[] = [
  'sales',
  'marketing',
  'product',
  'engineering',
  'operations',
  'management',
  'other',
];

/**
 * Labels per UI language. The admin console is EN|KO only, so the console
 * reads the code through JOB_ROLE_LABELS.en — these are for the member-facing
 * surfaces.
 */
export const JOB_ROLE_LABELS: Record<string, Record<JobRoleCode, string>> = {
  en: {
    sales: 'Sales',
    marketing: 'Marketing',
    product: 'Product management',
    engineering: 'Engineering / Technical',
    operations: 'Operations / Administration',
    management: 'Management / Executive',
    other: 'Other',
  },
  de: {
    sales: 'Vertrieb',
    marketing: 'Marketing',
    product: 'Produktmanagement',
    engineering: 'Technik / Engineering',
    operations: 'Betrieb / Verwaltung',
    management: 'Geschäftsleitung',
    other: 'Sonstiges',
  },
  fr: {
    sales: 'Commercial',
    marketing: 'Marketing',
    product: 'Gestion de produit',
    engineering: 'Technique / Ingénierie',
    operations: 'Exploitation / Administration',
    management: 'Direction',
    other: 'Autre',
  },
  pl: {
    sales: 'Sprzedaż',
    marketing: 'Marketing',
    product: 'Zarządzanie produktem',
    engineering: 'Technika / Inżynieria',
    operations: 'Operacje / Administracja',
    management: 'Zarząd',
    other: 'Inne',
  },
  it: {
    sales: 'Vendite',
    marketing: 'Marketing',
    product: 'Product management',
    engineering: 'Tecnico / Ingegneria',
    operations: 'Operazioni / Amministrazione',
    management: 'Direzione',
    other: 'Altro',
  },
};

/** Label for a code in the given UI language, falling back to English. */
export const jobRoleLabel = (code: string, lang: string): string =>
  (JOB_ROLE_LABELS[lang] ?? JOB_ROLE_LABELS.en)[code as JobRoleCode]
  ?? JOB_ROLE_LABELS.en[code as JobRoleCode]
  ?? code;
