import type { Maturity, SiteId } from '../questions';
import type { AuthorityFacts } from './authority-facts';
import type { Authority } from './ticket';

/** An experimental pick needs this confidence, and corroboration, before `act` may write (spec §8.3). */
export const EXPERIMENTAL_WRITE_CONFIDENCE = 0.85;

/** The §8.3 authority table: maturity and corroboration cap what `act` may later do with the ticket. */
export function authorityFor(maturity: Maturity, site: SiteId | 'code', facts: AuthorityFacts = {}): Authority {
  // Code settled the pick (a unique exact-name match): no model answered, so no model family can be new.
  if (site === 'code') return 'write';
  if (facts.newFamily) return 'none';
  if (maturity === 'measured') return 'write';
  if (maturity === 'inherited') {
    if (site === 'locate') return 'write';
    if (site === 'dismiss') return facts.lexiconCloseMatch || facts.agreed ? 'write' : 'read';
  }
  // Experimental, and any inherited site the table does not name, take the strict row.
  const confident = typeof facts.confidence === 'number' && facts.confidence >= EXPERIMENTAL_WRITE_CONFIDENCE;
  return confident && facts.corroborated === true ? 'write' : 'read';
}
