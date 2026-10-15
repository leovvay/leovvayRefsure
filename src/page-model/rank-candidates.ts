import type { Candidate } from './candidate';
import type { RankOpts } from './rank-opts';
import { contentWords } from './content-words';
import { fold } from './normalize';
import { rowTextOf } from './row-text';

/** The most candidates one Decision is asked over (top-20 kept every recorded target in the earlier research). */
export const RANK_MAX = 20;

// The first quoted part of an intent: straight, curly, low-9 and guillemet quotes.
const QUOTED = /["“”„«»]([^"“”„«»]+)["“”„«»]/u;

function withinFilter(opts: RankOpts): ((c: Candidate) => boolean) | null {
  const want = fold(opts.within ?? '');
  if (want === '') return null;
  const tree = opts.tree;
  return (c) => fold(tree === undefined ? c.fp.path : rowTextOf(tree, c.node)).includes(want);
}

/**
 * Up to 20 candidates, best first: the score is how many `fold`ed content words the intent shares with the
 * name and path, ties in text order. `within` narrows first; `keep` survives the cut.
 */
export function rankCandidates(cands: readonly Candidate[], intent: string, opts: RankOpts = {}): Candidate[] {
  const want = new Set(contentWords(intent));
  const within = withinFilter(opts);
  const pool = within === null ? [...cands] : cands.filter(within);
  const scored = pool.map((c) => ({
    c,
    score: contentWords(`${c.fp.name} ${c.fp.path}`).filter((w) => want.has(w)).length,
  }));
  scored.sort((a, b) => b.score - a.score || a.c.node - b.c.node);
  const top = Number.isFinite(opts.top) ? Math.max(1, Math.min(RANK_MAX, Math.floor(opts.top!))) : RANK_MAX;
  const kept = scored.slice(0, top).map((s) => s.c);
  if (opts.keep !== undefined && !kept.some((c) => c.node === opts.keep)) {
    const own = cands.find((c) => c.node === opts.keep);
    if (own !== undefined) {
      if (kept.length >= top) kept.pop();
      kept.push(own);
    }
  }
  return kept;
}

/**
 * Candidates whose `fold`ed name equals the `fold`ed intent, or its first quoted part (`click "Save draft"`).
 * A nameless candidate never matches.
 */
export function exactNameMatch(cands: readonly Candidate[], intent: string): Candidate[] {
  const whole = fold(intent);
  const quotedPart = QUOTED.exec(intent)?.[1];
  const quoted = quotedPart === undefined ? null : fold(quotedPart);
  return cands.filter((c) => {
    const name = fold(c.fp.name);
    return name !== '' && (name === whole || name === quoted);
  });
}
