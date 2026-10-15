import type { CommandOutcome, CommandSpec } from '../../cli';
import { pageView } from '../../page-model';
import { BOUNDS, pageStateSite, RESEARCH_STATES } from '../../questions';
import { abstainOutcome } from '../shared';
import type { StateArgs } from './state.args';
import type { StateResult } from './state.contract';
import { stateNext } from './state-next';
import { statePage } from './state-page';

const BLOCKING_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);

function answered(verdict: string, by: StateResult['by'], expect: string): CommandOutcome<StateResult> {
  const outcome: CommandOutcome<StateResult> = { status: 'ok', acted: false, effect: 'none', result: { verdict, by } };
  const next = stateNext(verdict, expect);
  if (next) outcome.next = next;
  return outcome;
}

/**
 * Which state the page is in (spec §6.2). Code first: a tab that failed to load is `error_page`, an open dialog is
 * `blocking_modal`; neither sends anything. Otherwise one `page-state` Choice over the research state set,
 * unshuffled, with `expected` naming the page the agent meant to reach. Reads only.
 */
export const stateCommand: CommandSpec<StateArgs, StateResult> = {
  name: 'state',
  summary: 'Say which state the page is in: expected, login_wall, bot_challenge, error_page, blocking_modal, '
    + 'rate_limited or unexpected_page',
  since: '0.1.0',
  stability: 'stable',
  options: {
    expect: { type: 'string', summary: 'What the intended page is, in a few words (required)' },
  },
  needs: { page: 'required', capabilities: [], sites: ['page-state'], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `state takes no positional arguments, got ${raw.positionals.length}` };
    const expect = typeof raw.values.expect === 'string' ? raw.values.expect.replace(/\s+/g, ' ').trim() : '';
    if (expect === '') return { usage: 'state needs --expect "<what the intended page is>"' };
    if (expect.length > BOUNDS.INTENT_MAX) {
      return { usage: `--expect is ${expect.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
    }
    return { expect };
  },
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('state needs a page, and none was resolved');
    const tab = await ctx.browser.tabInfo(page);
    if (tab.loadError !== null || tab.certificateFailure !== null) return answered('error_page', 'code', args.expect);
    const tree = await ctx.browser.snapshot(page);
    if (tree.nodes.some((node) => BLOCKING_ROLES.has(node.role))) return answered('blocking_modal', 'code', args.expect);

    const body = await ctx.browser.text(page, 'body');
    const view = pageView(tree, tab, body);
    const { verdict } = await ctx.decide(
      pageStateSite,
      { pageUrl: view.url, page: statePage(view, ctx.config.piiMasks), states: RESEARCH_STATES, expect: args.expect },
      { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal },
    );
    if (verdict.kind === 'answer') return answered(verdict.value, 'decision', args.expect);
    return abstainOutcome<StateResult>(verdict, { verdict: null, by: 'decision', leaned: verdict.leaned });
  },
};
