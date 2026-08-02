/**
 * hpiq market config — the single place where the UI reads country-specific
 * registry semantics. Everything derives from ACTIVE_COUNTRY (countryProfiles);
 * do not scatter country checks across pages.
 */
import { ACTIVE_COUNTRY, COUNTRY_PROFILES } from '../config/countryProfiles';
import { PUBLIC_ENV } from '../config/env';
import { Language } from '../types';

export const MARKET = ACTIVE_COUNTRY;
export const IS_GB = ACTIVE_COUNTRY.code === 'GB';
export const IS_FR = ACTIVE_COUNTRY.code === 'FR';
export const IS_PL = ACTIVE_COUNTRY.code === 'PL';
export const IS_IT = ACTIVE_COUNTRY.code === 'IT';

/**
 * Short prefix shown next to the registry product id
 * (e.g. "BAFA 16010266" / "MCS 24.01.020"). The FR and PL editions present the
 * id as a neutral European reference ("Réf. 16010266" / "Ref. 16010266") —
 * non-national sources are labelled as European per market policy; the data
 * sheet fine print still names the source registry for traceability.
 */
export const SOURCE_ID_ABBR = IS_GB ? 'MCS' : IS_FR ? 'Réf.' : IS_PL ? 'Ref.' : IS_IT ? 'Rif.' : 'BAFA';

/** Where "verify eligibility" links point on the products inspector. */
export const REGISTRY_VERIFY_URL = IS_GB
  ? 'https://www.ofgem.gov.uk/publications/boiler-upgrade-scheme-product-eligibility'
  : IS_FR
    ? 'https://france-renov.gouv.fr'
    : IS_PL
      ? 'https://lista-zum.ios.edu.pl'
      : IS_IT
        ? 'https://www.gse.it/servizi-per-te/efficienza-energetica/conto-termico-3-0/apparecchi-prequalificati'
        : 'https://www.bafa.de';

/** Official-source link cards on the funding page (titles/subs come from i18n, zipped by index). */
export const FUNDING_SOURCE_LINKS = IS_GB
  ? [
      { link: 'ofgem.gov.uk ›', href: 'https://www.ofgem.gov.uk/environmental-and-social-schemes/boiler-upgrade-scheme-bus' },
      { link: 'mcscertified.com ›', href: 'https://mcscertified.com' },
      { link: 'gov.uk ›', href: 'https://www.gov.uk/apply-boiler-upgrade-scheme' },
    ]
  : IS_FR
    ? [
        { link: 'france-renov.gouv.fr ›', href: 'https://france-renov.gouv.fr' },
        { link: 'anah.gouv.fr ›', href: 'https://www.anah.gouv.fr' },
        { link: 'ademe.fr ›', href: 'https://www.ademe.fr' },
      ]
    : IS_PL
      ? [
          { link: 'czystepowietrze.gov.pl ›', href: 'https://czystepowietrze.gov.pl' },
          { link: 'lista-zum.ios.edu.pl ›', href: 'https://lista-zum.ios.edu.pl' },
          { link: 'mojecieplo.gov.pl ›', href: 'https://mojecieplo.gov.pl' },
        ]
      : IS_IT
        ? [
            { link: 'gse.it ›', href: 'https://www.gse.it/servizi-per-te/efficienza-energetica/conto-termico-3-0' },
            { link: 'agenziaentrate.gov.it ›', href: 'https://www.agenziaentrate.gov.it' },
            { link: 'enea.it ›', href: 'https://www.efficienzaenergetica.enea.it' },
          ]
        : [
            { link: 'bafa.de ›', href: 'https://www.bafa.de' },
            { link: 'kfw.de ›', href: 'https://www.kfw.de' },
            { link: 'bmwk.de ›', href: 'https://www.bmwk.de' },
          ];

/**
 * Languages offered in the global nav. The GB edition is English-only
 * (the DE dictionary is Germany-market content, not just a translation);
 * DE and FR are bilingual (market language + English).
 */
export const UI_LANGUAGES: Language[] = IS_GB ? ['en'] : IS_FR ? ['fr', 'en'] : IS_PL ? ['pl', 'en'] : IS_IT ? ['it', 'en'] : ['de', 'en'];

/**
 * Language the app starts in for this edition: always the market's OWN language,
 * i.e. the first entry of UI_LANGUAGES. Derived rather than listed again so a new
 * market cannot land in English by forgetting a branch — Germany did exactly that
 * and served German visitors an English first screen until Jul 2026.
 * The admin console is the one exception: its UI is EN | KO only, so its shared
 * auth screen must not turn German (see CLAUDE.md).
 */
export const DEFAULT_LANGUAGE: Language =
  PUBLIC_ENV.APP_MODE === 'admin' ? 'en' : UI_LANGUAGES[0];

/**
 * This edition's round country icon (news bylines etc.). NOTE the GB asset
 * family is named `uk-*` on disk.
 */
export const MARKET_ICON_32 = IS_GB ? '/icons/uk-32.png' : `/icons/${ACTIVE_COUNTRY.code.toLowerCase()}-32.png`;

/**
 * This edition's public web domain (owned: heatpumpdb.de / .uk / .fr / .pl;
 * heatpumpdb.click is the market-neutral hub/short-link domain).
 */
export const MARKET_WEB_DOMAIN = IS_GB ? 'www.heatpumpdb.uk' : IS_FR ? 'www.heatpumpdb.fr' : IS_PL ? 'www.heatpumpdb.pl' : IS_IT ? 'www.heatpumpdb.it' : 'www.heatpumpdb.de';



/**
 * Every market's public site — used by the one-email-one-country redirect
 * message to point a user at the edition their account actually belongs to.
 * Display name comes from the country profile; the URL is the owned domain.
 */
export const COUNTRY_SITES: Record<string, { name: string; url: string }> = {
  DE: { name: COUNTRY_PROFILES.DE.name, url: 'https://www.heatpumpdb.de' },
  GB: { name: COUNTRY_PROFILES.GB.name, url: 'https://www.heatpumpdb.uk' },
  FR: { name: COUNTRY_PROFILES.FR.name, url: 'https://www.heatpumpdb.fr' },
  PL: { name: COUNTRY_PROFILES.PL.name, url: 'https://www.heatpumpdb.pl' },
  IT: { name: COUNTRY_PROFILES.IT.name, url: 'https://www.heatpumpdb.it' },
};

/**
 * Every market publishes the SAME canonical technical products; a market differs
 * only in its local-listing overlay. Both of those live in hpiq/listing.ts
 * (LOCAL_LISTING_SOURCE / LOCAL_LISTING_FILTER) — import them from there, not here,
 * so there is exactly one place that decides what a market may say about listing.
 */
export const TECHNICAL_BASELINE = ACTIVE_COUNTRY.technicalBaseline;

/**
 * Funding-guide explainer video per market — YouTube video ID (the 11-char
 * code from youtube.com/watch?v=XXXXXXXXXXX). null = the "coming soon" slot.
 * Upload per-market videos (Unlisted is fine — embeds still play), paste the
 * IDs here and redeploy; the player is a click-to-load privacy-enhanced
 * embed (youtube-nocookie.com), so no YouTube cookies load before the user
 * presses play.
 */
export const GUIDE_VIDEO_ID: string | null = IS_GB ? '5zkU-KQjzvo' : IS_FR ? 'L8FDkPmjd14' : IS_PL ? '_-2GVNOfQuY' : IS_IT ? 'NV45K9TtuBg' : 'JSkbYarh_iA';
