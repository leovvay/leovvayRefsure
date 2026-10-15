import { type Candidate, candidateKey, fold } from '../../../src/page-model';
import type { GoldRef } from './gold-ref';

type Element = Extract<GoldRef, { kind: 'element' }>;

/**
 * The live candidate a gold element names: the `ordinal`-th, in page order, of the candidates with its role and
 * `fold`ed name (and its path, when the set gives one). `null` when the page has fewer.
 */
export function findGold(cands: readonly Candidate[], ref: Element): Candidate | null {
  const same = cands.filter((c) => c.fp.role === ref.role && fold(c.fp.name) === fold(ref.name)
    && (ref.path === undefined || c.fp.path === ref.path));
  if (ref.of === undefined || same.length === ref.of) return same[ref.ordinal - 1] ?? null;
  const placed = same.filter((c) => placesOf(c.fp.path) === placesOf(ref.hint ?? ''));
  return placed.length === ref.of ? (placed[ref.ordinal - 1] ?? null) : null;
}

/** The kinds of place a v1 path passes through, outer to inner, names and headings left out. */
export function placesOf(path: string): string {
  return path.split(' > ').map((part) => /^(dialog|alertdialog|navigation|main|form|region)\b/.exec(part)?.[1])
    .filter((kind) => kind !== undefined).join('>');
}

/**
 * Where a gold sits among the lines offered: the index of the offered line of its twin group (one line stands for
 * the group, and the twin rule settles the rest), `none`, or `null` when the element is on the page but no offered
 * line is its group (filtered out or cut), so no pick can be right.
 */
export function offeredIndex(offered: readonly Candidate[], cands: readonly Candidate[], ref: GoldRef): string | null | 'unmapped' {
  if (ref.kind === 'none') return 'none';
  if (ref.kind === 'key') return ref.value;
  const gold = findGold(cands, ref);
  if (gold === null) return 'unmapped';
  const at = offered.findIndex((c) => candidateKey(c) === candidateKey(gold));
  return at < 0 ? null : String(at);
}

/** Whether a candidate a code rule picked is the gold element (or an alt). */
export function codeHit(pick: Candidate, cands: readonly Candidate[], truths: readonly GoldRef[]): boolean {
  return truths.some((ref) => {
    if (ref.kind !== 'element') return false;
    const gold = findGold(cands, ref);
    return gold !== null && candidateKey(gold) === candidateKey(pick);
  });
}
