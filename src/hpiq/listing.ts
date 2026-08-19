/**
 * Local listing status — an OVERLAY on a canonical technical product.
 *
 * Every market publishes the same canonical products. The local registry answers
 * one question only: has this country listed this product? It never creates a
 * product, never supplies a spec, and never removes one when a match fails.
 * (docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md)
 *
 *   DE → BAFA registry   the German catalogue IS the registry, so a product's
 *                        absence from the current snapshot is verified fact.
 *                        Germany is the only market that may say "no longer listed".
 *   GB → Ofgem PEL       an overlay. A confirmed match says "PEL Listed". Anything
 *                        else says "verification required" — a failed automated
 *                        match is a fact about OUR MATCHING, not about the PEL.
 *                        Absence of a match is not evidence of absence.
 *   FR → ADEME agrément  the register of models approved for the heat pump bonus.
 *                        From 2026-09-01 its number must appear on the devis and
 *                        the facture, so it is the one identifier a French quote
 *                        cannot go out without. PEL rules: a confirmed entry says
 *                        "agréé" and shows the number; anything else says
 *                        verification required. Never "not approved" — our
 *                        catalogue does not originate from the register, so a
 *                        failed match is a fact about OUR matching.
 *   PL → Lista ZUM       an overlay, PEL rules: a confirmed match says
 *                        "ZUM listed" (na liście ZUM); anything else says
 *                        verification required. Never "not on ZUM".
 *   IT → GSE Conto Termico catalogue (III.A) — an overlay, PEL rules: a
 *                        confirmed match says "nel catalogo GSE"; anything
 *                        else says verification required. Never "not in the
 *                        catalogue". The catalogue publishes no per-row id,
 *                        so no identifier is ever shown — status only.
 */
import { HeatPump } from '../types';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';

/**
 * 'listed'                — the local registry lists this product (verified).
 * 'verification_required' — no reliable match. NOT a claim of absence.
 * 'not_listed'            — verified absence. Only a market that owns its registry
 *                           (Germany) can ever produce this.
 */
export type LocalListingStatus = 'listed' | 'verification_required' | 'not_listed';

/** The national list this market may talk about, or null when it has none. */
export const LOCAL_LISTING_SOURCE = ACTIVE_COUNTRY.localListingOverlay.source;

/** Offer a "listed only" search filter here? */
export const LOCAL_LISTING_FILTER = ACTIVE_COUNTRY.localListingOverlay.filterEnabled;

/** Should the offered filter start switched ON? (Germany only — see profile.) */
export const LOCAL_LISTING_FILTER_DEFAULT_ON =
  LOCAL_LISTING_FILTER && (ACTIVE_COUNTRY.localListingOverlay.filterDefaultOn ?? false);

/** The listing status to show, or null when this market has no national list. */
export function localListingStatus(p: HeatPump): LocalListingStatus | null {
  if (!LOCAL_LISTING_SOURCE) return null;             // France — nothing may be claimed

  const raw = p as unknown as Record<string, unknown>;

  if (LOCAL_LISTING_SOURCE === 'PEL') {
    // Only a CONFIRMED overlay match may say "listed". 'review_required' — a
    // previously confirmed mapping that stopped matching — is deliberately shown as
    // verification-required too: a matcher or parser regression is far likelier than
    // Ofgem delisting a product, and we will not assert a removal we cannot prove.
    return raw.pel_match_status === 'confirmed' ? 'listed' : 'verification_required';
  }

  if (LOCAL_LISTING_SOURCE === 'ZUM') {
    // Lista ZUM follows the PEL rules exactly: our catalogue does not originate
    // from the registry, so a failed match may never be presented as absence.
    return raw.zum_match_status === 'confirmed' ? 'listed' : 'verification_required';
  }

  if (LOCAL_LISTING_SOURCE === 'AGREMENT') {
    // Records built FROM the register are confirmed by construction; every
    // German-derived product carries a null status and reads as verification
    // required, which is what it is.
    return raw.agrement_match_status === 'confirmed' ? 'listed' : 'verification_required';
  }

  if (LOCAL_LISTING_SOURCE === 'GSE') {
    // GSE Conto Termico catalogue follows the PEL rules exactly: a failed
    // match may never be presented as absence from the catalogue.
    return raw.gse_match_status === 'confirmed' ? 'listed' : 'verification_required';
  }

  // DE — the registry snapshot IS this market's own list, so absence is evidence.
  return (raw.bafa_listing_status ?? 'listed_in_snapshot') === 'listed_in_snapshot'
    ? 'listed'
    : 'not_listed';
}

/** The local registry's identifier, shown only where the listing is confirmed. */
export function localListingId(p: HeatPump): string | null {
  const raw = p as unknown as Record<string, unknown>;
  if (LOCAL_LISTING_SOURCE === 'PEL') {
    if (raw.pel_match_status !== 'confirmed') return null;
    return typeof raw.mcs_number === 'string' && raw.mcs_number ? raw.mcs_number : null;
  }
  if (LOCAL_LISTING_SOURCE === 'ZUM') {
    if (raw.zum_match_status !== 'confirmed') return null;
    return typeof raw.zum_id === 'string' && raw.zum_id ? raw.zum_id : null;
  }
  if (LOCAL_LISTING_SOURCE === 'AGREMENT') {
    // Unlike the GSE catalogue, this register DOES publish a per-entry number —
    // and it is the number the installer has to copy onto the paperwork.
    if (raw.agrement_match_status !== 'confirmed') return null;
    return typeof raw.agrement_number === 'string' && raw.agrement_number ? raw.agrement_number : null;
  }
  // GSE: the Conto Termico catalogue publishes NO per-row identifier, and our
  // internal gse_entry_key must never be presented as an official id.
  return null;
}
