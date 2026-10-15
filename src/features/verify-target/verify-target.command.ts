import { isRef } from '../../browser';
import type { CommandContext, CommandOutcome, CommandSpec } from '../../cli';
import { causeStatus, type Next } from '../../output';
import {
  type Candidate, candidatesOf, fingerprintOf, lineOf, norm, rankCandidates, twinKey,
} from '../../page-model';
import { BOUNDS, findSite } from '../../questions';
import { classify, maxRisk, RISK_ORDER, type RiskClass } from '../../risk';
import { abstainOutcome, nothingDone } from '../shared';
import type { VerifyTargetArgs } from './verify-target.args';
import type { VerifyTargetResult } from './verify-target.contract';

type Out = CommandOutcome<VerifyTargetResult>;
const SNAPSHOT: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };

/** One candidate per twin group, the first in page order, plus `own` wherever it falls. */
function distinctWith(cands: readonly Candidate[], own: Candidate): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = twinKey(c.fp.role, c.fp.name, c.fp.path);
    if (c.node !== own.node && seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function veto(result: VerifyTargetResult, detail: string): Out {
  return nothingDone('refused', 'veto', `${detail}; nothing was done`, { result, next: SNAPSHOT });
}

async function verify(args: VerifyTargetArgs, ctx: CommandContext): Promise<Out> {
  const page = ctx.page;
  if (page === null) throw new Error('verify-target needs a page, and none was resolved');
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const i = tree.nodes.findIndex((node) => node.ref === args.ref);
  if (i === -1) return nothingDone('stale', 'ref_gone', `@${args.ref} is not in the current snapshot`, { next: SNAPSHOT });
  const all = candidatesOf(tree);
  const own = all.find((c) => c.node === i) ?? { ref: args.ref, node: i, line: lineOf(tree, i), fp: fingerprintOf(tree, i) };
  ctx.trace.untrusted.add('result.line');
  ctx.trace.untrusted.add('result.pick');
  const result: VerifyTargetResult = { agrees: false, line: own.line };
  if (own.fp.twins > 1) {
    // Identical lines tell a model nothing apart: agreeing on the group would not be agreeing on this element.
    return nothingDone('abstained', 'twins',
      `@${args.ref} is one of ${own.fp.twins} identical elements; a second look cannot tell them apart; nothing was done`,
      { result, next: SNAPSHOT });
  }
  const cands = all.some((c) => c.node === i) ? all : [...all, own];
  const shortlist = rankCandidates(distinctWith(cands, own), args.intent, { keep: i });
  // Risk only rises: the element's own class lifts a lower --risk row; without --risk, the strictest row.
  const risk: RiskClass | undefined = args.risk === undefined
    ? undefined
    : maxRisk(args.risk, classify(tree, i, { url: tab.url, action: 'click' }).class);
  const { verdict } = await ctx.decide(findSite, { intent: args.intent, lines: shortlist.map((c) => c.line) }, {
    combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal, ...(risk === undefined ? {} : { risk }),
  });
  if (verdict.kind === 'abstain') {
    // Setup, policy, caps or a provider down keep their own status; a model that named nothing is a veto.
    if (causeStatus(verdict.cause) !== 'abstained') return abstainOutcome<VerifyTargetResult>(verdict, result);
    return veto({ ...result, unconfirmed: verdict.cause }, `the second look named no element (${verdict.cause}: ${verdict.detail})`);
  }
  const pick = shortlist[verdict.value];
  if (pick === undefined) return veto(result, `the second look answered option ${verdict.index ?? '?'}, which was not offered`);
  if (pick.node !== i) return veto({ ...result, pick: pick.line }, `the second look named another element`);
  return { status: 'ok', acted: false, effect: 'none', result: { agrees: true, line: own.line, pick: pick.line } };
}

/**
 * A second, independent look (spec §6.3): a `find` Decision over the ranked candidates, the ref's own always kept,
 * must name the very element the ref points at. Veto-only: disagreeing, naming none or abstaining refuses (exit 11),
 * and agreeing adds no authority and issues no ticket. A ref with identical twins cannot be told apart, so it stops.
 */
export const verifyTargetCommand: CommandSpec<VerifyTargetArgs, VerifyTargetResult> = {
  name: 'verify-target',
  summary: 'A second look: an independent find must name the same element as your ref, else it refuses (veto only)',
  since: '0.1.0',
  stability: 'experimental',
  options: {
    ref: { type: 'string', summary: 'Your element, @eN from your latest snapshot (required)' },
    intent: { type: 'string', summary: 'What the element is for, in a few words (required)' },
    risk: { type: 'string', summary: 'The threshold row: read, write, consent, auth, money or irreversible; only raised' },
  },
  forms: ['--ref @eN --intent "<what the element is for>" [--risk r]'],
  needs: { page: 'required', capabilities: [], sites: ['find'], acts: 'never' },
  parse(raw) {
    if (raw.positionals.length > 0) return { usage: `verify-target takes no positional arguments, got ${raw.positionals.length}` };
    if (raw.rest.length > 0) return { usage: 'verify-target takes nothing after --' };
    const given = typeof raw.values.ref === 'string' ? raw.values.ref.trim().replace(/^@/, '') : '';
    if (!isRef(given)) return { usage: 'verify-target needs --ref @eN from your latest snapshot' };
    const intent = typeof raw.values.intent === 'string' ? norm(raw.values.intent) : '';
    if (intent === '') return { usage: 'verify-target needs --intent "<what the element is for>"' };
    if (intent.length > BOUNDS.INTENT_MAX) return { usage: `--intent is ${intent.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
    const risk = raw.values.risk;
    if (risk === undefined) return { ref: given, intent };
    if (typeof risk !== 'string' || !(RISK_ORDER as readonly string[]).includes(risk)) {
      return { usage: `--risk must be one of ${RISK_ORDER.join(', ')}` };
    }
    return { ref: given, intent, risk: risk as RiskClass };
  },
  run: verify,
};
