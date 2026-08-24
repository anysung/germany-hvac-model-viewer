import { Language } from '../types';

/**
 * Company-type labels, per UI language.
 *
 * Shared, because the same list is now asked for in two places: it left the
 * signup form (2026-08-24) and is collected at the point of subscribing
 * instead, and the two must never drift into different wording for the same
 * stored code.
 */
export const COMPANY_TYPE_LABELS_I18N: Record<Language, Record<string, string>> = {
  en: {
    manufacturer: 'Manufacturer',
    wholesaler: 'Wholesaler / Distributor',
    installer: 'Installer / HVAC Contractor',
    engineering: 'Engineering / Design / Consultancy',
    construction: 'Construction / Property Developer',
    esco_utility: 'Energy Service Company / Utility',
    housing: 'Housing Association / Property Management',
    public_research: 'Public Sector / Research / Industry Association',
    individual: 'Individual / Sole Trader',
    other: 'Other',
  },
  de: {
    manufacturer: 'Hersteller',
    wholesaler: 'Großhandel / Distribution',
    installer: 'Installateur / SHK-Fachbetrieb',
    engineering: 'Planung / Ingenieurbüro / Beratung',
    construction: 'Bau / Projektentwicklung',
    esco_utility: 'Energiedienstleister / Versorger',
    housing: 'Wohnungswirtschaft / Hausverwaltung',
    public_research: 'Öffentliche Hand / Forschung / Verband',
    individual: 'Einzelperson / Einzelunternehmer',
    other: 'Sonstige',
  },
  fr: {
    manufacturer: 'Fabricant',
    wholesaler: 'Grossiste / Distributeur',
    installer: 'Installateur / Entreprise CVC',
    engineering: 'Ingénierie / Bureau d’études / Conseil',
    construction: 'Construction / Promotion immobilière',
    esco_utility: 'Société de services énergétiques / Fournisseur',
    housing: 'Bailleur social / Gestion immobilière',
    public_research: 'Secteur public / Recherche / Fédération',
    individual: 'Particulier / Indépendant',
    other: 'Autre',
  },
  pl: {
    manufacturer: 'Producent',
    wholesaler: 'Hurtownia / Dystrybutor',
    installer: 'Instalator / firma instalacyjna',
    engineering: 'Inżynieria / Biuro projektowe / Doradztwo',
    construction: 'Budownictwo / Deweloper',
    esco_utility: 'Przedsiębiorstwo usług energetycznych / Dostawca energii',
    housing: 'Spółdzielnia mieszkaniowa / Zarządzanie nieruchomościami',
    public_research: 'Sektor publiczny / Badania / Stowarzyszenie branżowe',
    individual: 'Osoba prywatna / Działalność jednoosobowa',
    other: 'Inne',
  },
  it: {
    manufacturer: 'Produttore',
    wholesaler: 'Grossista / Distributore',
    installer: 'Installatore / Impresa termoidraulica',
    engineering: 'Ingegneria / Studio di progettazione / Consulenza',
    construction: 'Costruzioni / Sviluppo immobiliare',
    esco_utility: 'ESCo / Utility energetica',
    housing: 'Edilizia residenziale pubblica / Amministrazione immobiliare',
    public_research: 'Settore pubblico / Ricerca / Associazione di categoria',
    individual: 'Privato / Ditta individuale',
    other: 'Altro',
  },
};
