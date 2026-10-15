import { type CommandContext, type CommandOutcome, type CommandSpec, oneLine, parseRefArg, parseRisk } from '../../cli';
import { causeStatus, RE_OBSERVE } from '../../output';
import { candidatesOf, distinctByGroup, fingerprintOf, lineOf, rankCandidates } from '../../page-model';
import { BOUNDS, findSite } from '../../questions';
import { classify, maxRisk, type RiskClass } from '../../risk';
import { abstainOutcome, notOffered, nothingDone } from '../shared';
import type { VerifyTargetArgs } from './verify-target.args';
import type { VerifyTargetResult } from './verify-target.contract';

type Out = CommandOutcome<VerifyTargetResult>;

function veto(result: VerifyTargetResult, detail: string): Out {
  return nothingDone('refused', 'veto', `${detail}; nothing was done`, { result, next: RE_OBSERVE });
}

async function verify(args: VerifyTargetArgs, ctx: CommandContext): Promise<Out> {
  const page = ctx.page;
  if (page === null) throw new Error('verify-target needs a page, and none was resolved');
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const i = tree.nodes.findIndex((node) => node.ref === args.ref);
  if (i === -1) return nothingDone('stale', 'ref_gone', `@${args.ref} is not in the current snapshot`, { next: RE_OBSERVE });
  const all = candidatesOf(tree);
  const listed = all.find((c) => c.node === i);
  const own = listed ?? { ref: args.ref, node: i, line: lineOf(tree, i), fp: fingerprintOf(tree, i) };
  ctx.trace.untrusted.add('result.line');
  ctx.trace.untrusted.add('result.pick');
  const result: VerifyTargetResult = { agrees: false, line: own.line };
  if (own.fp.twins > 1) {
    // Identical lines tell a model nothing apart: agreeing on the group would not be agreeing on this element.
    return nothingDone('abstained', 'twins',
      `@${args.ref} is one of ${own.fp.twins} identical elements; a second look cannot tell them apart; nothing was done`,
      { result, next: RE_OBSERVE });
  }
  // `own` has no twin (above), so it is the only one of its group, and it is always kept.
  const cands = listed === undefined ? [...all, own] : all;
  const shortlist = rankCandidates(distinctByGroup(cands), args.intent, { keep: i });
  // Risk only rises: the element's own class lifts a lower --risk row; without --risk, the strictest row.
  const risk: RiskClass | undefined = args.risk === undefined
    ? undefined
    : maxRisk(args.risk, classify(tree, i, { url: tab.url, action: 'click' }).class);
  const { verdict } = await ctx.decide(findSite, { intent: args.intent, lines: shortlist.map((c) => c.line) }, {
    combo: 'auto', originUrl: tab.url, dryRun: ctx.dryRun, signal: ctx.signal, ...(risk === undefined ? {} : { risk }),
  });
  if (verdict.kind === 'abstain') {
    // A low-confidence refusal quotes the line the model leaned to: page text.
    ctx.trace.untrusted.add('why.detail');
    // Setup, policy, caps or a provider down keep their own status; a model that named nothing is a veto.
    if (causeStatus(verdict.cause) !== 'abstained') return abstainOutcome<VerifyTargetResult>(verdict, result);
    return veto({ ...result, unconfirmed: verdict.cause }, `the second look named no element (${verdict.cause}: ${verdict.detail})`);
  }
  const pick = shortlist[verdict.value];
  if (pick === undefined) return veto(result, `the second look ${notOffered(verdict.index).detail}`);
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
    const ref = parseRefArg(raw.values.ref, '--ref');
    if (typeof ref === 'object') return ref;
    const intent = oneLine(raw.values.intent) ?? '';
    if (intent === '') return { usage: 'verify-target needs --intent "<what the element is for>"' };
    if (intent.length > BOUNDS.INTENT_MAX) return { usage: `--intent is ${intent.length} characters; keep it to ${BOUNDS.INTENT_MAX}` };
    const risk = parseRisk(raw.values.risk);
    if (typeof risk === 'object') return risk;
    return { ref, intent, ...(risk === undefined ? {} : { risk }) };
  },
  run: verify,
};
