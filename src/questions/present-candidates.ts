import { boundText, redactSecrets, stripControl } from '../egress';
import { BOUNDS } from './bounds';
import type { CandidateOrder, PresentedCandidates } from './presented-candidates';

/*
  How a page's candidates become one Choice's criteria, and how the answer
  comes back to the caller's index. Ported from the author's earlier decision
  code.

  The model is asked over the lines in a shuffled order. Kept in page order,
  the order itself leaks the answer (a recorded element usually sits near
  where it was), so shuffling is what makes a measured agreement a claim about
  the lines rather than about the list. The shuffle is a function of the
  request alone: the same request is presented the same way every time, and
  different requests are presented differently.

  Criteria keys are the presented positions, "1".."n", plus the reserved
  `none`; `indexOf` maps a key back to the caller's own index.
*/

/** The key a Choice uses for "no candidate fits". A presented position is never this. */
export const NONE_KEY = 'none';

/** Strip, redact, then cut: the order redaction asks of every bounded sink. */
export function boundedText(text: string, max: number, opts: { inline?: boolean } = {}): string {
  return boundText(redactSecrets(stripControl(text)), { max, ...(opts.inline ? { inline: true } : {}) });
}

/** 32-bit FNV-1a over the string's UTF-16 units: small, pure, and the same everywhere. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: a seeded generator of [0, 1), enough for a deterministic shuffle. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The presentation order for `count` candidates: `order[k]` is the caller's
 * index shown at position k + 1. Fisher–Yates under a generator seeded by
 * `seed`, so it is a permutation and the same seed always gives the same one.
 */
export function shuffledOrder(count: number, seed: string): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const random = seeded(fnv1a(seed));
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

/**
 * Bounds each line, shuffles them under a seed drawn from `seedParts` (the
 * request's own content, so the order is the request's), and keys them.
 */
export function presentCandidates(
  lines: readonly string[],
  noneText: string,
  seedParts: readonly string[],
  order: CandidateOrder = { kind: 'shuffled' },
): PresentedCandidates {
  const bounded = lines.map((line) => boundedText(line, BOUNDS.CANDIDATE_LINE_MAX, { inline: true }));
  const presented = order.kind === 'page'
    ? bounded.map((_, index) => index)
    : shuffledOrder(bounded.length, [order.salt ?? '', ...seedParts, ...bounded].join('\u0000'));
  const criteria: Record<string, string> = {};
  presented.forEach((index, position) => {
    criteria[String(position + 1)] = bounded[index]!;
  });
  criteria[NONE_KEY] = noneText;
  return {
    criteria,
    indexOf(key) {
      if (!/^[1-9]\d*$/.test(key)) return null;
      return presented[Number(key) - 1] ?? null;
    },
  };
}
