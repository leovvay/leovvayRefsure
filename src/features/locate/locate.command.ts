import type { CommandSpec } from '../../cli';
import { candidatesOf, fold, RANK_MAX, rowTextOf } from '../../page-model';
import { abstainOutcome, nothingDone } from '../shared';
import type { LocateArgs } from './locate.args';
import type { LocateResult } from './locate.contract';
import { codePick, decidePick } from './locate-pick';
import { settlePick } from './locate-settle';
import { parseLocate } from './parse-locate';

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
    risk: { type: 'string', summary: 'Raise the risk class and its threshold row: read, write, consent, auth, money or irreversible' },
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
    const want = args.within === null ? '' : fold(args.within);
    const cands = want === '' ? all : all.filter((c) => fold(rowTextOf(tree, c.node)).includes(want));
    if (cands.length === 0) {
      const detail = want === ''
        ? 'the page offers no interactive element with a ref'
        : `no interactive element sits in a row containing ${JSON.stringify(args.within)}`;
      ctx.trace.untrusted.add('why.detail');
      return nothingDone('abstained', 'none_chosen', detail, { next: { do: 'snapshot', argv: ['refsure', 'snap'] } });
    }
    ctx.trace.untrusted.add('result.line');
    ctx.trace.untrusted.add('result.top');
    const picked = codePick(args, cands) ?? await decidePick(args, ctx, tab, cands);
    if (picked.kind === 'abstain') {
      const result: LocateResult = { ticket: null, by: 'decision' };
      if (picked.top !== null) {
        result.top = picked.top;
        result.note = 'top is a ranking, not probabilities';
      }
      return abstainOutcome<LocateResult>(picked.verdict, result);
    }
    return settlePick(ctx, { page, tab, tree, cands }, picked, args);
  },
};
