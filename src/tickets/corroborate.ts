import { contentWords, exactNameMatch, fold } from '../page-model';
import type { Candidate } from '../page-model';

/**
 * Code's own support for a model's pick (spec §8.3): the pick's name shares a `fold` content word with the intent,
 * or it is the only exact-name match. Only the name counts: a shared heading in the path says little about the
 * element itself.
 */
export function corroborate(intent: string, cand: Candidate, cands: readonly Candidate[]): boolean {
  const wanted = new Set(contentWords(intent).map(fold));
  if (contentWords(cand.fp.name).some((word: string) => wanted.has(fold(word)))) return true;
  const exact = exactNameMatch(cands, intent);
  return exact.length === 1 && exact[0]?.node === cand.node;
}
