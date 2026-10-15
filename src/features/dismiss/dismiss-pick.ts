import type { AxTree, PageRef, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import type { Next } from '../../output';
import { type Candidate, cutName, fingerprintOf, urlNorm } from '../../page-model';
import type { Decided } from '../../questions';
import { actionPolicy, classify, findTermEveryReading, maxRisk, pageRaisers, type RiskReading } from '../../risk';
import { type Authority, authorityAllows, authorityFor } from '../../tickets';
import type { DismissArgs } from './dismiss.args';
import type { DismissLevelReport } from './dismiss-level-report';
import { vetoOf } from './dismiss-veto';
import type { LevelOutcome } from './level-outcome';
import { overlayGone } from './overlay-gone';

type Scene = {
  page: PageRef; tab: TabInfo; tree: AxTree; container: number; overlay: string; level: number; args: DismissArgs;
};

const SNAPSHOT: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
const HUMAN: Next = { do: 'needs_human' };

function stop(report: DismissLevelReport, status: LevelOutcome['status'], cause: string, detail: string, next: Next): LevelOutcome {
  return { report: { ...report, cause }, status, why: { cause, detail }, next, clicked: false };
}

async function riskOf(ctx: CommandContext, scene: Scene, pick: Candidate): Promise<RiskReading> {
  const lexical = classify(scene.tree, pick.node, { url: scene.tab.url, action: 'click' });
  const raised = await pageRaisers(ctx.browser, scene.page, 'click');
  return { class: maxRisk(lexical.class, raised.class), reasons: [...lexical.reasons, ...raised.reasons] };
}

/** Why the pick is only proposed, in the order the reasons apply. */
function proposeWhy(scene: Scene, authority: Authority, risk: RiskReading, closeWord: boolean): string {
  if (scene.args.propose) return '--propose never clicks';
  if (authority === 'none') return 'a model family refsure has not measured picked it';
  if (risk.class !== 'read') return `it reads ${risk.class} (${risk.reasons.join(', ')}), and dismiss clicks only read`;
  if (!closeWord) return 'its name has no close or reject word, and no second provider agreed';
  return `its authority is ${authority}`;
}

/**
 * After the dismiss Decision picked a control (spec §8.4): the veto first, never overridable; the twin rule; the
 * risk on the tree (lexicon, confirm dialog, URL, page raisers). It clicks only when authority is `write` (a close
 * or reject word, or `agree`), the risk is `read` and `--propose` is off; else it proposes with a `read` ticket.
 * After a click the overlay must be gone, else `effect_unknown`.
 */
export async function settleDismissPick(
  ctx: CommandContext, scene: Scene, pick: Candidate, decided: Decided<number>,
): Promise<LevelOutcome> {
  const name = JSON.stringify(cutName(pick.fp.name));
  const report: DismissLevelReport = {
    level: scene.level, verdict: 'abstained', overlay: scene.overlay, control: pick.line, by: 'decision',
  };
  const rawName = scene.tree.nodes[pick.node]?.name ?? pick.fp.name;
  const veto = vetoOf(rawName);
  if (veto !== null) {
    return stop({ ...report, verdict: 'vetoed' }, 'refused', 'veto',
      `the Decision picked ${name}, and "${veto.term}" is on the never-click list; nothing was clicked`, HUMAN);
  }
  if (pick.fp.twins > 1) {
    return stop(report, 'abstained', 'twins', `${pick.fp.twins} identical controls are named ${name}; nothing was clicked`, SNAPSHOT);
  }
  const risk = await riskOf(ctx, scene, pick);
  report.risk = risk.class;
  if (actionPolicy('click', risk.class, 'dismiss') !== 'allow') {
    return stop({ ...report, verdict: 'refused' }, 'refused', 'high_risk_class',
      `${name} reads ${risk.class} (${risk.reasons.join(', ')}): dismiss never clicks it`, HUMAN);
  }
  const closeWord = findTermEveryReading('dismissClose', rawName) !== null;
  const agreed = ctx.trace.decisions.at(-1)?.provider === 'agree';
  const authority = authorityFor(decided.maturity, 'dismiss', {
    lexiconCloseMatch: closeWord, agreed, newFamily: decided.newFamily, confidence: decided.verdict.confidence,
  });
  report.authority = authority;

  if (scene.args.propose || authority !== 'write' || risk.class !== 'read') {
    const held: Authority = authority === 'none' ? 'none' : 'read';
    const ticket = await ctx.tickets.issue({
      pageId: scene.page.id, urlNorm: urlNorm(scene.tab.url), fingerprint: pick.fp, risk: risk.class, authority: held,
      site: 'dismiss', maturity: decided.maturity, confidence: decided.verdict.confidence,
      model: ctx.trace.decisions.at(-1)?.model ?? null,
    });
    const next: Next = authorityAllows(held, risk.class) ? { do: 'act', argv: ['refsure', 'act', '--ticket', ticket.id] } : SNAPSHOT;
    return stop({ ...report, verdict: 'proposed', authority: held, ticket: ticket.id }, 'abstained', 'proposed_only',
      `proposed ${name}, not clicked: ${proposeWhy(scene, authority, risk, closeWord)}`, next);
  }

  const sent = await ctx.browser.act(scene.page, pick.ref, 'click');
  if (sent.kind === 'stale_ref') {
    const detail = `${name} left the page before the click; nothing was clicked`;
    return stop({ ...report, verdict: 'stale' }, 'stale', 'ref_gone', detail, SNAPSHOT);
  }
  const unknown = (detail: string, effect: 'dispatched' | 'unknown'): LevelOutcome => ({
    ...stop({ ...report, verdict: 'unknown' }, 'effect_unknown', 'effect_unknown', detail, SNAPSHOT), clicked: true, effect,
  });
  if (sent.kind === 'unknown') return unknown(sent.detail, 'unknown');
  if (!(await overlayGone(ctx, scene.page, fingerprintOf(scene.tree, scene.container)))) {
    return unknown(`clicked ${name}; the overlay is still there`, 'dispatched');
  }
  return { report: { ...report, verdict: 'dismissed' }, status: 'ok', clicked: true };
}
