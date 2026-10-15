import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { CommandContext, CommandOutcome } from '../../cli';
import type { Next } from '../../output';
import { type Candidate, cutName, fold, rowTextOf, twinsOf, urlNorm } from '../../page-model';
import { findSite, locateSite, thresholdFor } from '../../questions';
import { classify, HIGH_RISK, maxRisk, pageRaisers, type RiskReading } from '../../risk';
import { type Authority, authorityAllows, authorityFor, corroborate, type Ticket } from '../../tickets';
import { nothingDone } from '../shared';
import type { LocateArgs } from './locate.args';
import type { LocateResult } from './locate.contract';
import { keyOf } from './locate-pick';
import type { Picked } from './picked';

type Chosen = Exclude<Picked, { kind: 'abstain' }>;
type Scene = { page: PageRef; tab: TabInfo; tree: AxTree; cands: readonly Candidate[] };

const ROW_SHOWN = 120;
const ROWS_SHOWN = 10;

function base(picked: Chosen, cand: Candidate, args: LocateArgs): LocateResult {
  const result: LocateResult = {
    ticket: null, by: picked.kind, line: cand.line, ordinal: cand.fp.ordinal, twins: cand.fp.twins,
  };
  if (args.top !== null) {
    if (picked.kind === 'decision' && picked.top !== null) result.top = picked.top;
    result.note = picked.kind === 'decision' ? 'top is a ranking, not probabilities' : 'settled by code: no ranking';
  }
  return result;
}

/**
 * The lexicon, confirm-dialog and URL rules, the page raisers for a click, and `--risk`. With no `--risk` the class
 * has a floor of write (spec §6.1): a read row is claimed only by `--risk read`, never assumed.
 */
async function riskOf(ctx: CommandContext, scene: Scene, cand: Candidate, args: LocateArgs): Promise<RiskReading> {
  const lexical = classify(scene.tree, cand.node, {
    url: scene.tab.url, action: 'click', ...(args.risk === undefined ? {} : { userRisk: args.risk }),
  });
  const raised = await pageRaisers(ctx.browser, scene.page, 'click');
  const risk = maxRisk(lexical.class, raised.class);
  const reasons = [...lexical.reasons, ...raised.reasons];
  if (args.risk === undefined && risk === 'read') return { class: 'write', reasons: [...reasons, 'floor:write'] };
  return { class: risk, reasons };
}

/** Why a ticket below its pick's risk only proposes, and the two ways on from it. */
function proposalWhy(authority: Authority, risk: RiskReading, ticket: string | null): string {
  const ask = ticket === null ? 'refsure guard --ticket' : `refsure guard --ticket ${ticket}`;
  const floor = risk.reasons.includes('floor:write')
    ? 'if it only reads (a link, a tab), locate again with --risk read; otherwise ' : '';
  return `the pick may act at ${authority} only, and it reads ${risk.class} (${risk.reasons.join(', ')}): `
    + `proposed, not for act; ${floor}confirm it yourself (${ask}), then act through outcome with your own ref`;
}

/** A pick under the threshold of its own risk row: only possible when `--risk` named a lower row than it has. */
function underRow(picked: Chosen, risk: RiskReading): string | null {
  if (picked.kind !== 'decision' || picked.confidence === null) return null;
  const site = picked.site === 'locate' ? locateSite : findSite;
  const row = thresholdFor(site, 'jev', risk.class, picked.model ?? undefined, site.wording.hash);
  if (typeof row !== 'number' || picked.confidence >= row) return null;
  return `picked at ${picked.confidence}, below the ${risk.class} threshold ${row}`;
}

function authorityOf(picked: Chosen, cand: Candidate, args: LocateArgs, cands: readonly Candidate[]): Authority {
  if (picked.kind === 'code') return authorityFor('measured', 'code');
  return authorityFor(picked.maturity, picked.site, {
    corroborated: corroborate(args.intent ?? '', cand, [...cands]),
    confidence: picked.confidence,
    newFamily: picked.newFamily,
  });
}

/** Who picked: code (at its site's declared maturity, no model), or the Decision with its model. */
function ticketSource(picked: Chosen): Pick<Ticket, 'site' | 'maturity' | 'confidence' | 'model'> {
  if (picked.kind === 'decision') {
    return { site: picked.site, maturity: picked.maturity, confidence: picked.confidence, model: picked.model };
  }
  const maturity = (picked.site === 'locate' ? locateSite : findSite).policy.maturity;
  return { site: 'code', maturity, confidence: null, model: null };
}

/**
 * The twin rule, the risk read and the ticket (spec §6.2, §8.3). A pick with twins stops unless `--within` left
 * one of its group or `--first` takes the first; `--first` never takes money or irreversible. Risk is the lexicon,
 * confirm-dialog and URL rules, the page raisers for a click and `--risk`, at least write without it. Authority
 * comes from maturity and corroboration; a new model family, or authority below the pick's risk, proposes only.
 */
export async function settlePick(
  ctx: CommandContext, scene: Scene, picked: Chosen, args: LocateArgs,
): Promise<CommandOutcome<LocateResult>> {
  const group = scene.cands.filter((c) => keyOf(c) === keyOf(picked.cand));
  const cand = group[0] ?? picked.cand;
  const twinned = cand.fp.twins > 1 && group.length > 1;
  if (twinned && !args.first) {
    const rows = twinsOf(scene.tree, cand.node).slice(0, ROWS_SHOWN).map((i) => cutName(rowTextOf(scene.tree, i), ROW_SHOWN));
    ctx.trace.untrusted.add('result.rows');
    return nothingDone('abstained', 'twins',
      `${group.length} identical ${cand.fp.role}s match; narrow it with --within "<text from its row>", or --first`,
      { next: { do: 'retry_within' }, result: { ...base(picked, cand, args), rows } });
  }
  const risk = await riskOf(ctx, scene, cand, args);
  const result: LocateResult = { ...base(picked, cand, args), risk: risk.class, reasons: risk.reasons };
  if (twinned && (risk.class === 'money' || risk.class === 'irreversible')) {
    return nothingDone('refused', 'high_risk_class',
      `--first never takes the first of ${group.length} twins when it reads ${risk.class}; use --within`, { result });
  }
  const under = underRow(picked, risk);
  if (under !== null) {
    return nothingDone('abstained', 'low_confidence', under, { next: { do: 'snapshot', argv: ['refsure', 'snap'] }, result });
  }

  const authority = authorityOf(picked, cand, args, scene.cands);
  result.authority = authority;
  if (!ctx.dryRun) {
    const ticket = await ctx.tickets.issue({
      pageId: scene.page.id, urlNorm: urlNorm(scene.tab.url), fingerprint: cand.fp, risk: risk.class, authority,
      ...ticketSource(picked),
      ...(args.within === null ? {} : { within: fold(args.within) }),
    });
    result.ticket = ticket.id;
  } else {
    ctx.trace.notes.push('dry_run: no ticket is issued');
  }
  if (authority === 'none') {
    return nothingDone('abstained', 'proposed_only', 'a model family refsure has not measured picked it: propose only', { result });
  }
  // A ticket `act` would refuse is a proposal (as dismiss reports one), never `ok` with nowhere to go. High risk
  // stays `ok` below: the pick is right, and only act-high-risk may take it.
  if (!HIGH_RISK.has(risk.class) && !authorityAllows(authority, risk.class)) {
    const next: Next = result.ticket === null
      ? { do: 'snapshot', argv: ['refsure', 'snap'] }
      : { do: 'snapshot', argv: ['refsure', 'guard', '--ticket', result.ticket] };
    return nothingDone('abstained', 'proposed_only', proposalWhy(authority, risk, result.ticket), { result, next });
  }
  const outcome: CommandOutcome<LocateResult> = { status: 'ok', acted: false, effect: 'none', result };
  if (result.ticket !== null && authorityAllows(authority, risk.class)) {
    outcome.next = { do: 'act', argv: ['refsure', 'act', '--ticket', result.ticket] } satisfies Next;
  } else if (HIGH_RISK.has(risk.class)) {
    outcome.next = { do: 'needs_human' };
  }
  return outcome;
}
