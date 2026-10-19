import type { CommandOutcome, CommandSpec } from '../../cli';
import { DIALOG_ROLES, pageView } from '../../page-model';
import { pageStateSite, RESEARCH_STATES } from '../../questions';
import { abstainOutcome, readTyped, SHORT_TYPED, typedWithheld, withheldNote, withoutTyped } from '../shared';
import { parseState } from './parse-state';
import type { StateArgs } from './state.args';
import type { StateResult } from './state.contract';
import { stateNext } from './state-next';
import { stateInput } from './state-page';


/**
 * The same `state` call: the custom states in their order, then `--expect`. The expectation goes inline
 * (`--expect=<text>`): strict `parseArgs` refuses a separate value that starts with `-`, such as "-5% off". A state
 * pair needs no such care, since it starts with its snake_case key.
 */
function askAgain(args: StateArgs): string[] {
  const custom = args.states === null ? [] : Object.entries(args.states).flatMap(([key, when]) => ['--state', `${key}=${when}`]);
  return ['refsure', 'state', ...custom, ...(args.expect === null ? [] : [`--expect=${args.expect}`])];
}

/**
 * The `next` table belongs to the research keys (spec §6.2, §6.3), whichever set offered them: a custom set that
 * names `blocking_modal` still points to dismiss. Any other key means what the caller said: `next` null.
 */
function answered(verdict: string, by: StateResult['by'], args: StateArgs): CommandOutcome<StateResult> {
  const outcome: CommandOutcome<StateResult> = { status: 'ok', acted: false, effect: 'none', result: { verdict, by } };
  const next = stateNext(verdict, askAgain(args));
  if (next) outcome.next = next;
  return outcome;
}

/** Code settles a state only when the offered set has that key: a custom set may name none of the research ones. */
function offers(args: StateArgs, key: string): boolean {
  return args.states === null || Object.hasOwn(args.states, key);
}

/**
 * Which state the page is in (spec §6.2). Code first: a tab that failed to load is `error_page`, an open dialog is
 * `blocking_modal`; neither sends anything. Otherwise one `page-state` Choice over the research state set,
 * unshuffled, with `expected` naming the page the agent meant to reach. `--state` replaces that set with the
 * caller's own (spec §6.3): a new wording, so experimental; only the research keys in it carry a `next`. Reads only.
 */
export const stateCommand: CommandSpec<StateArgs, StateResult> = {
  name: 'state',
  summary: 'Say which state the page is in: expected, login_wall, bot_challenge, error_page, blocking_modal, '
    + 'rate_limited or unexpected_page',
  since: '0.1.0',
  stability: 'stable',
  forms: [
    '--expect "<what the intended page is>"',
    '--state key="<when the page is in it>" --state key2="<…>" … [--expect "<…>"]',
  ],
  options: {
    expect: { type: 'string', summary: 'What the intended page is, in a few words (required without --state)' },
    state: {
      type: 'string', multiple: true,
      summary: 'A custom state, key="<when the page is in it>"; two or more replace the research set (experimental; '
        + 'only research keys get a next)',
    },
  },
  needs: { page: 'required', capabilities: [], sites: ['page-state'], acts: 'never' },
  parse: parseState,
  async run(args, ctx) {
    const page = ctx.page;
    if (page === null) throw new Error('state needs a page, and none was resolved');
    const tab = await ctx.browser.tabInfo(page);
    if ((tab.loadError !== null || tab.certificateFailure !== null) && offers(args, 'error_page')) {
      return answered('error_page', 'code', args);
    }
    const tree = await ctx.browser.snapshot(page);
    if (tree.nodes.some((node) => DIALOG_ROLES.has(node.role)) && offers(args, 'blocking_modal')) {
      return answered('blocking_modal', 'code', args);
    }

    // The editable regions, read as the other verbs read them (spec §7.3): a role="textbox" contenteditable shows in
    // the tree as a plain textbox, so only this read finds its typing in the body text. The tree's cut applies on top.
    const [body, typed] = await Promise.all([ctx.browser.text(page, 'body'), readTyped(ctx.browser, page)]);
    const withheld = typedWithheld(body, typed);
    const shown = pageView(tree, tab, withheld === null ? withoutTyped(body, typed) : '');
    // Withheld, the text is the shared placeholder, whole: the tree's cut would take words out of it.
    const view = withheld === null ? shown : { ...shown, text: withoutTyped(body, typed) };
    const why = withheld ?? (shown.textWithheld ? SHORT_TYPED : null);
    if (why !== null) ctx.trace.notes.push(withheldNote(why));
    const { pageUrl, page: block } = stateInput(view, ctx.config.piiMasks);
    const { verdict } = await ctx.decide(
      pageStateSite,
      { pageUrl, page: block, states: args.states ?? RESEARCH_STATES, ...(args.expect === null ? {} : { expect: args.expect }) },
      { combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal },
    );
    if (verdict.kind === 'answer') return answered(verdict.value, 'decision', args);
    return abstainOutcome<StateResult>(verdict, { verdict: null, by: 'decision', leaned: verdict.leaned });
  },
};
