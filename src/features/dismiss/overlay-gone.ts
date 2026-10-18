import type { AxTree, PageRef } from '../../browser';
import type { CommandContext } from '../../cli';
import { type Fingerprint, groupOf } from '../../page-model';
import { sleep } from '../shared';

/**
 * Fresh looks after the click: an overlay may fade out. The first comes once the page has drawn a frame and its
 * animations (the fade) stopped, up to `SETTLE_CAP_MS`, or after `LOOKS_MS[0]` where the browser cannot settle; the
 * others after `LOOKS_MS[1..]`. The composite wait stays far under 5 s (spec §8.6).
 */
const LOOKS_MS: readonly number[] = [300, 600, 1000];
const SETTLE_CAP_MS = 1_200;

/** The wait before the first look: a settle when the browser has one, else the fixed first wait. */
async function firstWait(ctx: CommandContext, page: PageRef): Promise<void> {
  try {
    if (ctx.browser.settle === undefined) throw new Error('no settle');
    await ctx.browser.settle(page, SETTLE_CAP_MS, true);
  } catch {
    await sleep(LOOKS_MS[0]!, ctx.signal);
  }
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
