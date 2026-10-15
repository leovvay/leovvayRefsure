import type { AxTree } from '../../browser';
import type { CommandSpec } from '../../cli';
import { RE_OBSERVE } from '../../output';
import { type Candidate, candidatesOf, RANK_MAX, rowContains, rowTextOf } from '../../page-model';
import { abstainOutcome, nothingDone } from '../shared';
import type { LocateArgs } from './locate.args';
import type { LocateResult } from './locate.contract';
import { codePick, decidePick } from './locate-pick';
import { settlePick } from './locate-settle';
import { parseLocate } from './parse-locate';

/**
 * `--within`: the candidates whose row text contains `within`. Every candidate of a row shares its text, so each
 * text is matched once, not once per candidate: a group of thousands of buttons stays linear.
 */
function inRows(tree: AxTree, cands: readonly Candidate[], within: string): Candidate[] {
  const verdicts = new Map<string, boolean>();
  return cands.filter((c) => {
    const text = rowTextOf(tree, c.node);
    let holds = verdicts.get(text);
    if (holds === undefined) {
      holds = rowContains(text, within);
      verdicts.set(text, holds);
    }
    return holds;
  });
}

/**
 * Finds the one element an intent or a recorded line means, and returns a single-use ticket for `act` (spec §6.2).
 * Code first: `--within` narrows to rows, and a unique exact name settles it with no Decision. Otherwise one Jev
 * Decision over at most 20 v1 lines. Twins stop unless `--within` or `--first` resolves them. Reads only.
 */
export const locateCommand: CommandSpec<LocateArgs, LocateResult> = {
  name: 'locate',
  summary: 'Find the element an intent (or a recorded line) means; returns a single-use ticket for act',
  since: '0.1.0',
  stability: 'stable',
  forms: [
    '--intent "<what the element is for>" [--risk r] [--within "<row text>"] [--first] [--top N]',
    '--recorded \'<role> "<name>" in="<path>"\' [--intent "<step intent>"] [--risk r] [--within "<row text>"] [--first]',
  ],
  options: {
    intent: { type: 'string', summary: 'What the element is for, in a few words' },
    recorded: { type: 'string', summary: 'A v1 line recorded earlier (from snap), matched verbatim first' },
    risk: {
      type: 'string',
      summary: 'The risk row: read, write, consent, auth, money or irreversible; the page can only raise it. '
        + 'Without it: at least write, at the strictest threshold',
    },
    within: { type: 'string', summary: 'Only elements whose row contains this text (e.g. "Invoice 1042")' },
    first: { type: 'boolean', summary: 'Take the first of identical twins (never at money or irreversible)' },
    top: { type: 'string', summary: `Also list up to N presented candidates by the model's ranking (1-${RANK_MAX})` },
  },
  needs: { page: 'required', capabilities: [], sites: ['locate', 'find'], acts: 'never' },
  parse: parseLocate,
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('locate needs a page, and none was resolved');
    const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
    const all = candidatesOf(tree);
    const within = args.within;
    const cands = within === null ? all : inRows(tree, all, within);
    if (cands.length === 0) {
      const detail = within === null
        ? 'the page offers no interactive element with a ref'
        : `no interactive element sits in a row containing ${JSON.stringify(args.within)}`;
      ctx.trace.untrusted.add('why.detail');
      return nothingDone('abstained', 'none_chosen', detail, { next: RE_OBSERVE });
    }
    ctx.trace.untrusted.add('result.line');
    ctx.trace.untrusted.add('result.top');
    const picked = codePick(args, cands) ?? await decidePick(args, ctx, tab, cands);
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
    return settlePick(ctx, { page, tab, tree, cands }, picked, args);
  },
};
