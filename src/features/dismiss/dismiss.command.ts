import type { CommandOutcome, CommandSpec } from '../../cli';
import type { DismissArgs } from './dismiss.args';
import type { DismissResult } from './dismiss.contract';
import { dismissLevel } from './dismiss-level';
import type { LevelOutcome } from './level-outcome';

const DEPTH_MAX = 3;

/** One level alone is the command's outcome; after a dismissal, a later level that stops still exits 0. */
function combine(outcomes: readonly LevelOutcome[]): CommandOutcome<DismissResult> {
  const levels = outcomes.map((o) => o.report);
  const last = outcomes.at(-1)!;
  const first = outcomes[0]!;
  const withWhy = (o: CommandOutcome<DismissResult>, from: LevelOutcome): CommandOutcome<DismissResult> => {
    if (from.why) o.why = from.why;
    if (from.next) o.next = from.next;
    return o;
  };
  if (last.status === 'effect_unknown') {
    return withWhy({
      status: 'effect_unknown', acted: true, effect: last.effect ?? 'dispatched', result: { verdict: 'unknown', levels },
    }, last);
  }
  if (outcomes.some((o) => o.clicked)) {
    return { status: 'ok', acted: true, effect: 'dispatched', result: { verdict: 'dismissed', levels } };
  }
  return withWhy({ status: first.status, acted: false, effect: 'none', result: { verdict: first.report.verdict, levels } }, first);
}

/**
 * Closes the overlay in the way, guarded (spec §6.2, §8.4). Code finds it (the topmost dialog, or a consent
 * region with two or more buttons; never the banner); a Decision picks the control that only dismisses it
 * (`agree` when both providers are set up). The never-click list wins over everything. It clicks only a `read`
 * control with write authority, then checks the overlay went away; otherwise it proposes with a ticket.
 */
export const dismissCommand: CommandSpec<DismissArgs, DismissResult> = {
  name: 'dismiss',
  summary: 'Close a cookie wall or pop-up by its reject or close control, guarded; or propose one with a ticket',
  since: '0.1.0',
  stability: 'stable',
  options: {
    propose: { type: 'boolean', summary: 'Never click: propose the control with a ticket for act' },
    agree: { type: 'boolean', summary: 'Both providers must pick the same control (needs both set up)' },
    depth: { type: 'string', summary: `Nested overlays to dismiss in turn, 1 to ${DEPTH_MAX}`, default: '1' },
  },
  needs: { page: 'required', capabilities: [], sites: ['dismiss'], acts: 'ticket' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `dismiss takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.rest.length > 0) return { usage: 'dismiss takes nothing after --' };
    const text = typeof raw.values.depth === 'string' ? raw.values.depth.trim() : '1';
    const depth = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(depth) || depth < 1 || depth > DEPTH_MAX) return { usage: `--depth must be 1, 2 or ${DEPTH_MAX}` };
    return { propose: raw.values.propose === true, agree: raw.values.agree === true, depth };
  },
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('dismiss needs a page, and none was resolved');
    ctx.trace.untrusted.add('result.levels');
    // Refusals and proposals quote the control's name.
    ctx.trace.untrusted.add('why.detail');
    const outcomes: LevelOutcome[] = [];
    for (let level = 1; level <= args.depth; level += 1) {
      const out = await dismissLevel(ctx, page, args, level);
      outcomes.push(out);
      if (!(out.clicked && out.status === 'ok')) break;
    }
    return combine(outcomes);
  },
};
