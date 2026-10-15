import type { PageRef, TabInfo } from '../../browser';
import { type CommandContext, type CommandOutcome, type CommandSpec, oneLine, parseRefArg } from '../../cli';
import { NEEDS_HUMAN, type Next, RE_OBSERVE } from '../../output';
import { contentWords, cutName, lineOf, norm } from '../../page-model';
import { BOUNDS, optionMapSite } from '../../questions';
import { abstainOutcome, argText, notOffered, nothingDone } from '../shared';
import type { ChosenOption } from './chosen-option';
import { foldTwins, optionLabel, optionsOf } from './option-nodes';
import type { OptionScene } from './option-scene';
import type { PickOptionArgs } from './pick-option.args';
import type { PickOptionResult } from './pick-option.contract';
import { openField } from './pick-option-open';
import { settleOption } from './pick-option-settle';

type Out = CommandOutcome<PickOptionResult>;

function isOut(value: object): value is Out {
  return 'status' in value;
}

/**
 * `--open`: every check that can refuse runs before the click (spec §6.1). An option no name matches is asked of
 * the option-map Decision after it, so its route (keys, consent, origin, caps) is checked here, not after the list
 * opened; then the live name and the risk (`openField`). `null`: the field was clicked open.
 */
async function openFirst(ctx: CommandContext, page: PageRef, tab: TabInfo, args: PickOptionArgs): Promise<Out | null> {
  const route = await ctx.routeCheck(optionMapSite, { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun });
  if (!route.ok) {
    const detail = `${route.detail}; nothing was clicked. --open checks this first, since the list it opens may `
      + 'match no option by name; open the list yourself, then run pick-option without --open (a name match needs no Decision)';
    return abstainOutcome<PickOptionResult>({ cause: route.cause, detail }, null);
  }
  // Parsing requires --expect-name with --open; an empty one never passes the name check.
  return openField(ctx, page, tab, args.field, { want: args.want, expectName: args.expectName ?? '' });
}

/**
 * A field that lists no options. Without `--open` the way on clicks it open (pick-option --open acts on your ref,
 * so `do` says act), naming the field as the snapshot shows it for `--expect-name`. Free text goes inline
 * (`--opt=<text>`), so a name or a meaning that starts with `-` still parses.
 */
function noOptions(ctx: CommandContext, args: PickOptionArgs, fieldName: string, result: PickOptionResult): Out {
  const name = argText(fieldName, BOUNDS.INTENT_MAX);
  let next: Next = RE_OBSERVE;
  let hint = '';
  if (!args.open && name !== '') {
    // The field's name is page text.
    ctx.trace.untrusted.add('next.argv');
    next = {
      do: 'act',
      argv: ['refsure', 'pick-option', '--field', `@${args.field}`, `--want=${args.want}`, `--expect-name=${name}`, '--open'],
    };
    hint = ': a custom dropdown lists them only once open (--open)';
  } else if (!args.open) {
    hint = ': a custom dropdown lists them only once open, and this field shows no name for --open --expect-name; open it yourself';
  }
  return nothingDone('abstained', 'none_chosen', `the field offers no options${hint}; nothing was done`, { result, next });
}

/** Two options that fold equal: refsure never picks between them (spec §6.3). */
function ambiguous(scene: OptionScene, at: number, count: number, by: ChosenOption['by']): Out {
  const label = JSON.stringify(cutName(norm(optionLabel(scene.tree, at))));
  return nothingDone('refused', 'ambiguous_option',
    `${count} options read ${label} once folded; refsure will not pick between them; nothing was done`,
    { result: { ...scene.result, by }, next: NEEDS_HUMAN });
}

/**
 * The options in the order the Decision is offered them: those sharing the most content words with `want` first,
 * ties in page order. A list too long for one request is cut from its end (`optionMapSite`), so the likeliest stay.
 */
function ranked(scene: OptionScene): number[] {
  const want = new Set(contentWords(scene.want));
  const score = (at: number): number => contentWords(optionLabel(scene.tree, at)).filter((w) => want.has(w)).length;
  return scene.found.options.map((at, k) => ({ at, k, score: score(at) }))
    .sort((a, b) => b.score - a.score || a.k - b.k)
    .map((o) => o.at);
}

/**
 * Code first: the option whose folded label is the wanted meaning (two such refuse). Else the option-map Decision
 * over the option labels, ranked (`ranked`); its pick refuses when another option folds equal to it.
 */
async function chooseOption(ctx: CommandContext, scene: OptionScene): Promise<ChosenOption | Out> {
  const { tree, found, result } = scene;
  const exact = foldTwins(tree, found.options, scene.want);
  if (exact.length > 1) return ambiguous(scene, exact[0]!, exact.length, 'code');
  if (exact.length === 1) return { at: exact[0]!, by: 'code' };
  const offered = ranked(scene);
  const labels = offered.map((at) => cutName(norm(optionLabel(tree, at))));
  const decided = await ctx.decide(optionMapSite, { field: result.field, want: scene.want, options: labels },
    { combo: 'auto', originUrl: scene.tab.url, dryRun: ctx.dryRun, signal: ctx.signal });
  const { verdict } = decided;
  const byDecision: PickOptionResult = { ...result, by: 'decision' };
  if (verdict.kind === 'abstain') return abstainOutcome<PickOptionResult>(verdict, byDecision);
  const at = offered[verdict.value];
  if (at === undefined) return abstainOutcome<PickOptionResult>(notOffered(verdict.index), byDecision);
  const twins = foldTwins(tree, found.options, optionLabel(tree, at));
  if (twins.length > 1) return ambiguous(scene, at, twins.length, 'decision');
  return {
    at, by: 'decision', confidence: verdict.confidence, maturity: decided.maturity, newFamily: decided.newFamily,
    model: ctx.trace.decisions.at(-1)?.model ?? null,
  };
}

/** `--open` first when asked, then one look at the field: its options, the option chosen, and its settling. */
async function pick(args: PickOptionArgs, ctx: CommandContext): Promise<Out> {
  const page = ctx.page;
  if (page === null) throw new Error('pick-option needs a page, and none was resolved');
  let tab = await ctx.browser.tabInfo(page);
  if (args.open) {
    const stopped = await openFirst(ctx, page, tab, args);
    if (stopped !== null) return stopped;
    tab = await ctx.browser.tabInfo(page);
  }
  const tree = await ctx.browser.snapshot(page);
  const field = tree.nodes.findIndex((node) => node.ref === args.field);
  if (field === -1) return nothingDone('stale', 'ref_gone', `@${args.field} is not in the current snapshot`, { next: RE_OBSERVE });
  ctx.trace.untrusted.add('result.field');
  ctx.trace.untrusted.add('result.option');
  ctx.trace.untrusted.add('why.detail');
  const found = optionsOf(tree, field);
  const result: PickOptionResult = { ticket: null, by: 'code', field: lineOf(tree, field), options: found.options.length };
  if (args.open) result.opened = true;
  if (found.options.length === 0) return noOptions(ctx, args, tree.nodes[field]?.name ?? '', result);
  const scene: OptionScene = { page, tab, tree, field, fieldRef: args.field, found, want: args.want, result };
  const chosen = await chooseOption(ctx, scene);
  return isOut(chosen) ? chosen : settleOption(ctx, scene, chosen);
}

/**
 * Maps a meaning to one option of a dropdown (spec §6.3): "Ukraine" to "Україна". Code first, by the folded
 * label; else the `option-map` Decision over the option labels. Two options that fold equal refuse. `--open`
 * clicks the field first on the live-ref path (spec §8.3), so it needs `--expect-name`, the name the field showed:
 * a renumbered ref then never opens another control. It returns a ticket for `act --ticket` and never selects itself.
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
    'expect-name': { type: 'string', summary: 'With --open (required): the name you saw on the field; the live ref must still show it' },
  },
  forms: ['--field @eN --want "<the option you mean>" [--open --expect-name "<the name you saw on the field>"]'],
  needs: { page: 'required', capabilities: [], sites: ['option-map'], acts: 'own-ref' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `pick-option takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.rest.length > 0) return { usage: 'pick-option takes nothing after --' };
    const field = parseRefArg(raw.values.field, '--field');
    if (typeof field === 'object') return field;
    const want = oneLine(raw.values.want) ?? '';
    if (want === '') return { usage: 'pick-option needs --want "<the option you mean>"' };
    if (want.length > BOUNDS.INTENT_MAX) return { usage: `--want is ${want.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
    const open = raw.values.open === true;
    const expectName = oneLine(raw.values['expect-name']);
    if (expectName !== null && !open) return { usage: '--expect-name goes with --open: it names the field --open clicks' };
    if (open && (expectName === null || expectName === '')) {
      return { usage: '--open needs --expect-name "<the name you saw on the field>"' };
    }
    if (expectName !== null && expectName.length > BOUNDS.INTENT_MAX) {
      return { usage: `--expect-name is ${expectName.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
    }
    return { field, want, open, expectName };
  },
  run: pick,
};
