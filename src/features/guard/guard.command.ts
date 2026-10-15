import { isRef } from '../../browser';
import type { CommandContext, CommandOutcome, CommandSpec } from '../../cli';
import { fingerprintOf } from '../../page-model';
import { classify, maxRisk, pageRaisers } from '../../risk';
import { isTicketId } from '../../tickets';
import type { GuardArgs } from './guard.args';
import type { GuardResult } from './guard.contract';
import { guardTicket } from './guard-ticket';

/** `--ref`: a snapshot of the resolved page, then classify and the page raisers for a click. */
async function guardRef(args: Extract<GuardArgs, { mode: 'ref' }>, ctx: CommandContext): Promise<CommandOutcome<GuardResult>> {
  const page = await ctx.browser.resolvePage(args.hint);
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const i = tree.nodes.findIndex((node) => node.ref === args.ref);
  if (i === -1) {
    return {
      status: 'stale',
      acted: false,
      effect: 'none',
      result: null,
      why: { cause: 'ref_gone', detail: `@${args.ref} is not in the current snapshot` },
      next: { do: 'snapshot', argv: ['refsure', 'snap', '--page', page.id] },
    };
  }
  const reading = classify(tree, i, { url: tab.url, action: 'click' });
  const raised = await pageRaisers(ctx.browser, page, 'click');
  ctx.trace.untrusted.add('result.fingerprint');
  const result: GuardResult = {
    class: maxRisk(reading.class, raised.class),
    reasons: [...reading.reasons, ...raised.reasons],
    fingerprint: fingerprintOf(tree, i),
  };
  return { status: 'ok', acted: false, effect: 'none', result };
}

/**
 * The risk class of clicking an element (spec §6.3, §8.5): by `--ref @eN` on the page now, or by `--ticket T`,
 * rechecked on the ticket's page without spending it. Code only: no Decision, nothing sent, nothing clicked.
 * The page is resolved here, not by the registry: a ticket names its own page.
 */
export const guardCommand: CommandSpec<GuardArgs, GuardResult> = {
  name: 'guard',
  summary: 'Classify the risk of clicking an element (by ref or ticket): read, write, consent, auth, money or irreversible',
  since: '0.1.0',
  stability: 'stable',
  forms: ['--ref @eN', '--ticket T'],
  options: {
    ref: { type: 'string', summary: 'The element, as @eN from the latest snapshot' },
    ticket: { type: 'string', summary: 'A ticket from locate or dismiss: rechecked on its page, not spent' },
  },
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `guard takes no positional arguments, got ${raw.positionals.length}` };
    const page = typeof raw.values.page === 'string' ? raw.values.page.trim() : null;
    const given = raw.values.ref;
    const ticket = typeof raw.values.ticket === 'string' ? raw.values.ticket.trim() : null;
    if (given !== undefined && ticket !== null) return { usage: 'guard takes --ref or --ticket, not both' };
    if (ticket !== null) {
      if (!isTicketId(ticket)) return { usage: '--ticket takes the id locate or dismiss printed (t_…)' };
      return { mode: 'ticket', ticket, page };
    }
    if (typeof given !== 'string' || given.trim() === '') return { usage: 'guard needs --ref @eN or --ticket T' };
    const ref = given.trim().replace(/^@/, '');
    if (!isRef(ref)) return { usage: `--ref must look like @e12, got ${JSON.stringify(given.slice(0, 40))}` };
    return { mode: 'ref', ref, hint: page === null ? {} : { page } };
  },
  run(args, ctx) {
    return args.mode === 'ticket' ? guardTicket(args, ctx) : guardRef(args, ctx);
  },
};
