import type { PageRef, Settled } from '../../browser';
import type { CommandContext } from '../../cli';
import { sleep } from '../shared';

/** The fixed wait where the browser cannot settle (no `settle`, Orca's CLI transport, a failed call). */
export const SETTLE_MS = 50;
/** A settle that hits its cap after this many frames saw animations still running. */
const NOISY_FRAMES = 3;
/** That many such settles in a row, and the run waits for a frame only (`framesOnly`). */
const NOISY_MAX = 2;

/** What the settles of one run have seen of the page's frames. */
export interface SettleState {
  /** When a settle last saw a frame (`ctx.now()`), null before any: the tab renders, so it takes input. */
  frameAt: number | null;
  /** Settles in a row that ended at their cap with frames flowing: animations that never stop. */
  capHits: number;
  /**
   * Set after `NOISY_MAX` such settles (a carousel, a count-up): later settles wait for one frame only, so each no
   * longer costs its cap.
   */
  framesOnly: boolean;
}

export function freshSettle(): SettleState {
  return { frameAt: null, capHits: 0, framesOnly: false };
}

/**
 * Waits, at most `capMs`, until the page has rendered a frame and no finite animation runs (`BrowserPort.settle`):
 * a look taken then shows the page an act led to, not one caught mid-way. Animations count unless the run found
 * they never stop, or `frameOnly` asks for a frame alone. Where the browser cannot settle, `SETTLE_MS` and null.
 */
export async function settleFor(
  ctx: CommandContext, page: PageRef, state: SettleState, capMs: number, frameOnly = false,
): Promise<Settled | null> {
  const anim = !frameOnly && !state.framesOnly;
  let seen: Settled;
  try {
    if (ctx.browser.settle === undefined) throw new Error('no settle');
    seen = await ctx.browser.settle(page, capMs, anim);
  } catch {
    await sleep(SETTLE_MS, ctx.signal);
    return null;
  }
  if (seen.frames > 0) state.frameAt = ctx.now();
  if (anim) {
    state.capHits = !seen.quiet && seen.frames >= NOISY_FRAMES ? state.capHits + 1 : 0;
    if (state.capHits >= NOISY_MAX) state.framesOnly = true;
  }
  return seen;
}
