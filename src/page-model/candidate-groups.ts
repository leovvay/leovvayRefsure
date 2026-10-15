import type { Candidate } from './candidate';
import { twinKey } from './twins';

/** A candidate's twin group key: equal role, `norm`ed name and path (spec §8.3). */
export function candidateKey(c: Candidate): string {
  return twinKey(c.fp.role, c.fp.name, c.fp.path);
}

/** One candidate per twin group, the first in page order: identical lines tell a model nothing apart. */
export function distinctByGroup(cands: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = candidateKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The first match when every match is of one twin group; `null` when none, or when they differ. */
export function oneGroup(matches: readonly Candidate[]): Candidate | null {
  const first = matches[0];
  if (first === undefined) return null;
  const key = candidateKey(first);
  return matches.every((m) => candidateKey(m) === key) ? first : null;
}
