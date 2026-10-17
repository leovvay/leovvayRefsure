import type { CommandContext, CommandOutcome } from '../../cli';
import { abstainOutcome } from '../shared';
import type { LocateArgs } from './locate.args';
import type { LocateResult } from './locate.contract';
import { codePick, decidePick } from './locate-pick';
import type { LocateScene } from './locate-scene';
import { settlePick } from './locate-settle';

/**
 * The pick on one given look (spec §6.2): code first, else one Decision, then the twin rule, the risk read and the
 * ticket (`settlePick`). `locate` runs it on its own snapshot; `do` runs one per step, in parallel, on one shared
 * snapshot. `scene.cands` is never empty here.
 */
export async function locateOn(
  args: LocateArgs, ctx: CommandContext, scene: LocateScene,
): Promise<CommandOutcome<LocateResult>> {
  const picked = codePick(args, scene.cands) ?? await decidePick(args, ctx, scene.tab, scene.cands);
  if (picked.kind === 'abstain') {
    // A low-confidence or twins refusal quotes the line the model leaned to: page text.
    ctx.trace.untrusted.add('why.detail');
    const result: LocateResult = { ticket: null, by: 'decision' };
    if (picked.top !== null) {
      result.top = picked.top;
      result.note = 'top is a ranking, not probabilities';
    }
    return abstainOutcome<LocateResult>(picked.why, result);
  }
  return settlePick(ctx, scene, picked, args);
}
