import type { CommandSpec } from '../../cli';
import type { ActArgs } from './act.args';
import type { ActCommandResult } from './act.contract';
import { ACT_ACTIONS, parseAct } from './parse-act';
import { runAct } from './run-act';

/**
 * Acts on a ticket from `locate` or `dismiss --propose` (spec §6.2, §8.3). The page comes from the ticket. It
 * claims the ticket (single use), rechecks URL, twin group, ordinal and row on a fresh snapshot, re-reads the risk
 * (it only rises), refuses high risk and anything above the ticket's authority, then runs the typed act at once.
 * A timeout after dispatch is exit 30; it never re-clicks.
 */
export const actCommand: CommandSpec<ActArgs, ActCommandResult> = {
  name: 'act',
  summary: 'Act on a ticket from locate, dismiss --propose or pick-option: claim, recheck, guard, then one typed act',
  since: '0.1.0',
  stability: 'stable',
  options: {
    ticket: { type: 'string', summary: 'The ticket id (t_…) from locate, dismiss or pick-option (required)' },
    action: { type: 'string', summary: `${ACT_ACTIONS.join(', ')}; default: the ticket's own, else click` },
    value: { type: 'string', summary: 'The text to fill or the option to select (fill and select only); never logged' },
    verify: { type: 'string', summary: 'What should happen; after the act the outcome Decision must say landed, else exit 30' },
  },
  forms: [
    '--ticket T [--action click|dblclick|fill|select|check|uncheck] [--value v] [--verify "<what should happen>"]',
  ],
  needs: { page: 'none', capabilities: [], sites: ['outcome'], acts: 'ticket' },
  parse: parseAct,
  run: runAct,
};
