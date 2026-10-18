import { isBrowserError, type PageRef, type Settled } from '../../browser';
import type { CommandContext } from '../../cli';
import { sleep } from '../shared';
import type { RunStop } from './run-stop';

/** The fixed wait where the browser cannot settle (no `settle`, Orca's CLI transport, a failed call). */
export const SETTLE_MS = 50;
/** A settle that hits its cap after this many frames saw animations still running. */
const NOISY_FRAMES = 3;
/** That many such settles in a row, and the run waits for a frame only (`framesOnly`). */
const NOISY_MAX = 2;
/** A frame seen this recently shows the tab renders; older, the frame check waits up to `FRAME_WAIT_MS` for one. */
const FRAME_FRESH_MS = 2_000;
/**
 * Not 300 ms: a tab Orca renders at about 1 Hz (not on screen, but shown) answered a frame in 0.26-1 s on Google
 * Flights and in over 2 s on Wikipedia, and both took clicks.
 */
const FRAME_WAIT_MS = 3_000;

/** What the settles of one run have seen of the page's frames. */
export interface SettleState {
  /**
   * When the page last drew a frame a settle saw (`ctx.now()` less the time since that frame), null before any and
   * after a settle that saw none: the tab renders, so it takes input.
   */
  frameAt: number | null;
  /** Settles in a row that ended at their cap with frames flowing: animations that never stop. */
  capHits: number;
  /**
   * Set after `NOISY_MAX` such settles (a carousel, a count-up): later settles wait for one frame only, so each no
   * longer costs its cap.
   */
  framesOnly: boolean;
}

/** A settle for `REFSURE_RUN_TIMING`: frames, how it ended, ms in the page; counts only, never page text. */
export function settleNote(seen: Settled | null): string {
  if (seen === null) return 'settle: fixed';
  return `settle: ${seen.frames}f ${seen.quiet ? 'quiet' : 'cap'} ${seen.ms}ms, last frame at ${seen.last}ms`;
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
  // A settle whose frames stopped, or that saw none, is the first sign of a tab Orca stopped drawing.
  state.frameAt = seen.frames > 0 ? ctx.now() - Math.max(0, seen.ms - seen.last) : null;
  if (anim) {
    state.capHits = !seen.quiet && seen.frames >= NOISY_FRAMES ? state.capHits + 1 : 0;
    if (state.capHits >= NOISY_MAX) state.framesOnly = true;
  }
  return seen;
}

/**
 * Before an act: whether the tab renders at all. Orca delivers clicks and keys only to a tab that renders frames;
 * in one that renders none (not on screen in a worktree Orca does not show), every click, key and fill reports
 * success while nothing reaches the page, or input is held and lands later on a page that has moved on. A frame
 * seen within `FRAME_FRESH_MS` (the settle after the last act) is enough; else one frame is waited for, up to
 * `FRAME_WAIT_MS`. None, or a wait the browser did not end in time: the stop, with nothing sent. Where the browser
 * cannot settle, no check.
 */
export async function offScreenStop(ctx: CommandContext, page: PageRef, state: SettleState): Promise<RunStop | null> {
  if (state.frameAt !== null && ctx.now() - state.frameAt < FRAME_FRESH_MS) return null;
  if (ctx.browser.settle === undefined) return null;
  let frames: number;
  try {
    frames = (await ctx.browser.settle(page, FRAME_WAIT_MS, false)).frames;
  } catch (error) {
    if (!isBrowserError(error) || error.code !== 'timeout') return null;
    frames = 0;
  }
  if (frames > 0) {
    state.frameAt = ctx.now();
    return null;
  }
  state.frameAt = null;
  const seconds = Math.round(FRAME_WAIT_MS / 1000);
  return {
    verdict: 'stopped', cause: 'off_screen',
    detail: `the tab rendered no frame in ${seconds} s: Orca delivers clicks and keys only to a tab on screen; nothing `
      + `was sent. Bring it to the front (orca tab switch --page ${page.id} --focus) and run again`,
  };
}
