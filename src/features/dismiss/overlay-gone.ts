import type { AxTree, PageRef } from '../../browser';
import type { CommandContext } from '../../cli';
import { type Fingerprint, groupOf } from '../../page-model';
import { sleep } from '../shared';

/**
 * Fresh looks after the click: an overlay may fade out. The first comes once the page has drawn a frame and its
 * animations (the fade) stopped, up to `SETTLE_CAP_MS`, and never before `LOOKS_MS[0]`: the page under an overlay is
 * often redrawn by script after it closes, with no animation to wait for (Ryanair's form showed 1 line at 145 ms, its
 * fields unnamed at 210 ms and whole at 288 ms), and the look that shows the overlay gone is the next one a caller
 * reads. The others come after `LOOKS_MS[1..]`. The composite wait stays far under 5 s (spec §8.6).
 */
const LOOKS_MS: readonly number[] = [300, 600, 1000];
const SETTLE_CAP_MS = 1_200;

/** The wait before the first look: a settle when the browser has one, and at least the fixed first wait. */
async function firstWait(ctx: CommandContext, page: PageRef): Promise<void> {
  const started = ctx.now();
  try {
    if (ctx.browser.settle !== undefined) await ctx.browser.settle(page, SETTLE_CAP_MS, true);
  } catch {
    // No settle: the fixed wait alone.
  }
  await sleep(LOOKS_MS[0]! - (ctx.now() - started), ctx.signal);
}

/**
 * Whether the overlay went away after the click (spec §8.4): its fingerprint group (role, name, path) on a fresh
 * snapshot is smaller than it was. A same-named overlay that took its place counts as not gone. Returns the
 * snapshot that showed it gone, or null.
 */
export async function overlayGone(ctx: CommandContext, page: PageRef, fp: Fingerprint): Promise<AxTree | null> {
  for (const [at, wait] of LOOKS_MS.entries()) {
    if (at === 0) await firstWait(ctx, page);
    else await sleep(wait, ctx.signal);
    const tree = await ctx.browser.snapshot(page);
    if (groupOf(tree, fp.role, fp.name, fp.path).length < fp.twins) return tree;
    if (ctx.signal.aborted) return null;
  }
  return null;
}
