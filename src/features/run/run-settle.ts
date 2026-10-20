import type { PageRef, Settled } from '../../browser';
import type { CommandContext } from '../../cli';
import { sleep } from '../shared';

/** The fixed wait where the browser cannot settle (no `settle`, Orca's CLI transport, a failed call). */
export const SETTLE_MS = 50;
/** That many settles in a row that hit their cap, and the run waits for a frame only (`framesOnly`). */
const NOISY_MAX = 2;
/** A frame seen this recently shows the tab draws, so its page has painted: no paint is asked for before an act. */
const FRAME_FRESH_MS = 2_000;
/**
 * A settle at least this long that saw no frame finds a tab that draws none (`frameless`). A tab Orca draws about
 * once a second (shown, not on screen) answered a frame in 0.26-1 s on Google Flights, so a 1.2 s settle mostly sees
 * one there; one that misses it (over 2 s on Wikipedia) then settles as a browser that cannot settle does, until one
 * of its short settles catches a frame. Orca never throttles a tab's timers, so the in-page cap holds while hidden.
 */
const FRAMELESS_MS = 1_000;

/** What the settles of one run have seen of the page's frames. */
export interface SettleState {
  /**
   * When the page last drew a frame a settle saw (`ctx.now()` less the time since that frame): the tab draws, so its
   * page has painted and takes input. Null before any.
   */
  frameAt: number | null;
  /**
   * Set by a settle of `FRAMELESS_MS` or more that saw no frame: the tab draws none (hidden: in a worktree or pane
   * Orca does not show, where even a painted page draws no frame). A settle there ends only at its cap, having seen
   * neither a frame nor an animation end (an animation's clock moves only with frames), so its whole cap was a fixed
   * wait. Later settles then wait for a frame only, `SETTLE_MS` at most, what a browser that cannot settle waits; the
   * looks after an act still poll the page for its change. A frame one of them sees (the tab shown) clears it.
   */
  frameless: boolean;
  /**
   * Animation settles in a row that ended at their cap, whatever their frames: animations that never stop, or a tab
   * Orca draws about once a second, where an animation's clock moves only with frames, so it still runs at any cap
   * and a settle with no frame at all is as long.
   */
  capHits: number;
  /**
   * Set after `NOISY_MAX` such settles (a carousel, a count-up, a starved tab): later settles wait for one frame only,
   * so each no longer costs its cap, and end quiet, so no second settle follows them.
   */
  framesOnly: boolean;
}

/** A settle for `REFSURE_RUN_TIMING`: frames, how it ended, ms in the page; counts only, never page text. */
export function settleNote(seen: Settled | null): string {
  if (seen === null) return 'settle: fixed';
  return `settle: ${seen.frames}f ${seen.quiet ? 'quiet' : 'cap'} ${seen.ms}ms, last frame at ${seen.last}ms`;
}

export function freshSettle(): SettleState {
  return { frameAt: null, capHits: 0, framesOnly: false, frameless: false };
}

/**
 * Waits, at most `capMs`, until the page has rendered a frame and no finite animation runs (`BrowserPort.settle`):
 * a look taken then shows the page an act led to, not one caught mid-way. Animations count unless the run found
 * they never stop, or `frameOnly` asks for a frame alone. In a tab that draws none (`frameless`), a frame alone, at
 * most `SETTLE_MS`. Where the browser cannot settle, `SETTLE_MS` and null.
 */
export async function settleFor(
  ctx: CommandContext, page: PageRef, state: SettleState, capMs: number, frameOnly = false,
): Promise<Settled | null> {
  const anim = !frameOnly && !state.framesOnly && !state.frameless;
  const cap = state.frameless ? Math.min(capMs, SETTLE_MS) : capMs;
  let seen: Settled;
  try {
    if (ctx.browser.settle === undefined) throw new Error('no settle');
    seen = await ctx.browser.settle(page, cap, anim);
  } catch {
    await sleep(SETTLE_MS, ctx.signal);
    return null;
  }
  // A settle that saw a frame dates the last one. One that saw none leaves the date as it was, to age: a tab Orca
  // draws about once a second often draws nothing in a 600 ms settle. A tab Orca stopped drawing is still caught: its
  // last frame passes `FRAME_FRESH_MS` by the next act, which is then preceded by a paint check.
  if (seen.frames > 0) {
    state.frameAt = ctx.now() - Math.max(0, seen.ms - seen.last);
    state.frameless = false;
  } else if (seen.ms >= FRAMELESS_MS) {
    state.frameless = true;
  }
  if (anim) {
    state.capHits = seen.quiet ? 0 : state.capHits + 1;
    if (state.capHits >= NOISY_MAX) state.framesOnly = true;
  }
  return seen;
}

/**
 * Before an act: a page that never painted (loaded while its Orca tab was hidden) drops clicks and keys, or holds
 * them for seconds, while every call answers success. A frame seen within `FRAME_FRESH_MS` shows the tab draws, so
 * its page has painted. Else the backend paints the page if it never has (`BrowserPort.paint`), never showing or
 * focusing the tab, and the act goes on: a hidden tab draws no frame even once painted, yet takes input then, so no
 * frame is waited for and none stops the run. Best effort, as is the backend's own paint before each such input.
 */
export async function paintBeforeAct(ctx: CommandContext, page: PageRef, state: SettleState): Promise<void> {
  if (state.frameAt !== null && ctx.now() - state.frameAt < FRAME_FRESH_MS) return;
  await ctx.browser.paint?.(page);
}
