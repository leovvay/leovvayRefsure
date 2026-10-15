import type { PageRef } from '../../browser';
import type { CommandContext } from '../../cli';
import { type Fingerprint, groupOf } from '../../page-model';
import { sleep } from '../shared';

/** Fresh looks after the click: an overlay may fade out. The composite wait stays far under 5 s (spec §8.6). */
const LOOKS_MS: readonly number[] = [300, 600, 1000];

/**
 * Whether the overlay went away after the click (spec §8.4): its fingerprint group (role, name, path) on a fresh
 * snapshot is smaller than it was. A same-named overlay that took its place counts as not gone.
 */
export async function overlayGone(ctx: CommandContext, page: PageRef, fp: Fingerprint): Promise<boolean> {
  for (const wait of LOOKS_MS) {
    await sleep(wait, ctx.signal);
    const tree = await ctx.browser.snapshot(page);
    if (groupOf(tree, fp.role, fp.name, fp.path).length < fp.twins) return true;
    if (ctx.signal.aborted) return false;
  }
  return false;
}
