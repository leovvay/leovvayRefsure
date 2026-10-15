import type { CommandSpec } from '../../cli';
import type { OutcomeArgs } from './outcome.args';
import type { OutcomeResult } from './outcome.contract';
import { runMark } from './outcome-mark';
import { runWrap } from './outcome-wrap';
import { parseOutcome } from './parse-outcome';

/**
 * Did the intent land (spec §6.2)? Two modes. Wrapped: refsure runs the agent's own typed act on a live ref after
 * every check that can refuse (route, origin, the live name, risk), then reads the page again: code settles
 * `landed` by `--expect-url` / `--expect-text`, else the outcome Noul does; anything short of `landed` is exit 30.
 * `--mark M`: the same check against a mark taken before the agent acted itself; reads only.
 */
export const outcomeCommand: CommandSpec<OutcomeArgs, OutcomeResult> = {
  name: 'outcome',
  summary: 'Run your own act on a live ref, guarded, and say whether its intent landed (or check since a mark)',
  since: '0.1.0',
  stability: 'stable',
  forms: [
    '--intent "<what should happen>" --expect-name "<name you saw>" [--expect-url g] [--expect-text t] [--risk r] '
      + '-- <click|dblclick|fill|select|check|uncheck> --element @eN [--value v]',
    '--intent "<what should happen>" --mark M [--expect-url g] [--expect-text t]',
  ],
  options: {
    intent: { type: 'string', summary: 'What should happen, in a few words (required)' },
    'expect-name': { type: 'string', summary: 'The name you saw on the element; the live ref must still show it (wrapped act)' },
    'expect-url': { type: 'string', summary: 'Landed by code when the URL newly matches this glob (* = any run); with --mark, without the query' },
    'expect-text': { type: 'string', summary: 'Landed by code when this text was absent before and is present after' },
    risk: { type: 'string', summary: 'Raise the risk class: read, write, consent, auth, money or irreversible' },
    mark: { type: 'string', summary: 'Check against a mark from `refsure mark` instead of wrapping an act' },
  },
  needs: { page: 'required', capabilities: [], sites: ['outcome'], acts: 'own-ref' },
  parse: parseOutcome,
  run(args, ctx) {
    return args.mode === 'mark' ? runMark(args, ctx) : runWrap(args, ctx);
  },
};
