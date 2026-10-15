import { isRef } from '../../browser';
import type { CommandContext, CommandOutcome, CommandSpec } from '../../cli';
import type { Next } from '../../output';
import { cutName, lineOf, norm } from '../../page-model';
import { BOUNDS, optionMapSite } from '../../questions';
import { abstainOutcome, nothingDone } from '../shared';
import { foldTwins, optionLabel, optionsOf } from './option-nodes';
import type { PickOptionArgs } from './pick-option.args';
import type { PickOptionResult } from './pick-option.contract';
import { openField } from './pick-option-open';
import type { ChosenOption } from './chosen-option';
import type { OptionScene } from './option-scene';
import { settleOption } from './pick-option-settle';

type Out = CommandOutcome<PickOptionResult>;
const SNAPSHOT: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };

async function pick(args: PickOptionArgs, ctx: CommandContext): Promise<Out> {
  const page = ctx.page;
  if (page === null) throw new Error('pick-option needs a page, and none was resolved');
  let tab = await ctx.browser.tabInfo(page);
  if (args.open) {
    // Every check that can refuse runs before the click (spec §6.1): an option no name matches is asked of the
    // option-map Decision after it, so its route (keys, consent, origin, caps) is checked here, not after the list opened.
    const route = await ctx.routeCheck(optionMapSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
    if (!route.ok) {
      const detail = `${route.detail}; nothing was clicked. --open checks this first, since the list it opens may `
        + 'match no option by name; open the list yourself, then run pick-option without --open (a name match needs no Decision)';
      const verdict = { kind: 'abstain' as const, cause: route.cause, detail, leaned: null, confidence: null, threshold: null };
      return abstainOutcome<PickOptionResult>(verdict, null);
    }
    const stopped = await openField(ctx, page, tab, args.field, args.want);
    if (stopped !== null) return stopped;
    tab = await ctx.browser.tabInfo(page);
  }
  const tree = await ctx.browser.snapshot(page);
  const field = tree.nodes.findIndex((node) => node.ref === args.field);
  if (field === -1) return nothingDone('stale', 'ref_gone', `@${args.field} is not in the current snapshot`, { next: SNAPSHOT });
  ctx.trace.untrusted.add('result.field');
  ctx.trace.untrusted.add('result.option');
  ctx.trace.untrusted.add('why.detail');
  const found = optionsOf(tree, field);
  const result: PickOptionResult = { ticket: null, by: 'code', field: lineOf(tree, field), options: found.options.length };
  if (args.open) result.opened = true;
  if (found.options.length === 0) {
    // Without --open, the way on clicks the field (pick-option --open acts on your ref), so `do` says act.
    const next: Next = args.open
      ? SNAPSHOT
      : { do: 'act', argv: ['refsure', 'pick-option', '--field', `@${args.field}`, '--want', args.want, '--open'] };
    const hint = args.open ? '' : ': a custom dropdown lists them only once open (--open)';
    return nothingDone('abstained', 'none_chosen', `the field offers no options${hint}; nothing was done`, { result, next });
  }
  const scene: OptionScene = { page, tab, tree, field, fieldRef: args.field, found, want: args.want, result };

  // Code first: an option whose folded label is the wanted meaning.
  let chosen: ChosenOption;
  const exact = foldTwins(tree, found.options, args.want);
  if (exact.length > 0) chosen = { at: exact[0]!, by: 'code' };
  else {
    const labels = found.options.map((at) => cutName(norm(optionLabel(tree, at))));
    const decided = await ctx.decide(optionMapSite, { field: result.field, want: args.want, options: labels },
      { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal });
    const { verdict } = decided;
    if (verdict.kind === 'abstain') return abstainOutcome<PickOptionResult>(verdict, { ...result, by: 'decision' });
    const at = found.options[verdict.value];
    if (at === undefined) {
      return nothingDone('unavailable', 'provider_error', `answered option ${verdict.index ?? '?'}, which was not offered`,
        { result: { ...result, by: 'decision' } });
    }
    chosen = {
      at, by: 'decision', confidence: verdict.confidence, maturity: decided.maturity, newFamily: decided.newFamily,
      model: ctx.trace.decisions.at(-1)?.model ?? null,
    };
  }
  const twins = foldTwins(tree, found.options, optionLabel(tree, chosen.at));
  if (twins.length > 1) {
    const label = JSON.stringify(cutName(norm(optionLabel(tree, chosen.at))));
    return nothingDone('refused', 'ambiguous_option',
      `${twins.length} options read ${label} once folded; refsure will not pick between them; nothing was done`,
      { result: { ...result, by: chosen.by }, next: { do: 'needs_human' } });
  }
  return settleOption(ctx, scene, chosen);
}

/**
 * Maps a meaning to one option of a dropdown (spec §6.3): "Ukraine" to "Україна". Code first, by the folded
 * label; else the `option-map` Decision over the option labels. Two options that fold equal refuse. `--open`
 * clicks the field first on the live-ref path. It returns a ticket for `act --ticket` and never selects itself.
 */
export const pickOptionCommand: CommandSpec<PickOptionArgs, PickOptionResult> = {
  name: 'pick-option',
  summary: 'Find the dropdown option that means what you want ("Ukraine" → "Україна"); returns a ticket for act',
  since: '0.1.0',
  stability: 'experimental',
  options: {
    field: { type: 'string', summary: 'The dropdown, @eN from your latest snapshot (required)' },
    want: { type: 'string', summary: 'The option you mean, in any wording or language (required)' },
    open: { type: 'boolean', summary: 'Click the field first, for a dropdown that lists its options only once open' },
  },
  forms: ['--field @eN --want "<the option you mean>" [--open]'],
  needs: { page: 'required', capabilities: [], sites: ['option-map'], acts: 'own-ref' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `pick-option takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.rest.length > 0) return { usage: 'pick-option takes nothing after --' };
    const field = typeof raw.values.field === 'string' ? raw.values.field.trim().replace(/^@/, '') : '';
    if (!isRef(field)) return { usage: 'pick-option needs --field @eN from your latest snapshot' };
    const want = typeof raw.values.want === 'string' ? norm(raw.values.want) : '';
    if (want === '') return { usage: 'pick-option needs --want "<the option you mean>"' };
    if (want.length > BOUNDS.INTENT_MAX) return { usage: `--want is ${want.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
    return { field, want, open: raw.values.open === true };
  },
  run: pick,
};
