import {
  type CommandContext, type CommandOutcome, type CommandSpec, hintOf, parsePageArg, parseRefArg, parseTicketArg,
} from '../../cli';
import { RE_OBSERVE } from '../../output';
import { fingerprintOf } from '../../page-model';
import { clickRisk } from '../../risk';
import type { GuardArgs } from './guard.args';
import type { GuardResult } from './guard.contract';
import { guardTicket } from './guard-ticket';

/** `--ref`: a snapshot of the resolved page, then classify and the page raisers for a click. */
async function guardRef(args: Extract<GuardArgs, { mode: 'ref' }>, ctx: CommandContext): Promise<CommandOutcome<GuardResult>> {
  const page = await ctx.browser.resolvePage(args.hint);
  ctx.page = page;
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const i = tree.nodes.findIndex((node) => node.ref === args.ref);
  if (i === -1) {
    return {
      status: 'stale',
      acted: false,
      effect: 'none',
      result: null,
      why: { cause: 'ref_gone', detail: `@${args.ref} is not in the current snapshot` },
      next: RE_OBSERVE,
    };
  }
  const risk = await clickRisk(ctx.browser, page, tree, i, { url: tab.url });
  ctx.trace.untrusted.add('result.fingerprint');
  const result: GuardResult = { class: risk.class, reasons: risk.reasons, fingerprint: fingerprintOf(tree, i) };
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
    ticket: { type: 'string', summary: 'A ticket from locate, dismiss or pick-option: rechecked on its page, not spent' },
  },
  needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `guard takes no positional arguments, got ${raw.positionals.length}` };
    const given = raw.values.ref;
    if (given !== undefined && raw.values.ticket !== undefined) return { usage: 'guard takes --ref or --ticket, not both' };
    if (raw.values.ticket !== undefined) {
      const ticket = parseTicketArg(raw.values.ticket);
      if (typeof ticket === 'object') return ticket;
      return { mode: 'ticket', ticket, page: parsePageArg(raw.values.page) };
    }
    if (given === undefined) return { usage: 'guard needs --ref @eN or --ticket T' };
    const ref = parseRefArg(given, '--ref');
    if (typeof ref === 'object') return ref;
    return { mode: 'ref', ref, hint: hintOf(raw) };
  },
  run(args, ctx) {
    return args.mode === 'ticket' ? guardTicket(args, ctx) : guardRef(args, ctx);
  },
};
