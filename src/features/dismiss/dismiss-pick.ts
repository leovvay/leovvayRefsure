import type { CommandContext } from '../../cli';
import { NEEDS_HUMAN, type Next, RE_OBSERVE } from '../../output';
import { type Candidate, cutName, describeElement } from '../../page-model';
import type { Decided } from '../../questions';
import { refusesHighRisk, type RiskReading } from '../../risk';
import { type Authority, authorityAllows, authorityFor, ticketPlace } from '../../tickets';
import { highRiskNext } from '../shared';
import { clickPick } from './dismiss-click';
import type { DismissLevelReport } from './dismiss-level-report';
import { closesOrRejects } from './dismiss-reading';
import { dismissRisk } from './dismiss-risk';
import type { DismissScene } from './dismiss-scene';
import { vetoOf } from './dismiss-veto';
import { stop } from './level-stop';
import type { LevelOutcome } from './level-outcome';

/** Why the pick is only proposed, in the order the reasons apply. */
function proposeWhy(scene: DismissScene, authority: Authority, risk: RiskReading, closeWord: boolean): string {
  if (scene.args.propose) return '--propose never clicks';
  if (authority === 'none') return 'a model family refsure has not measured picked it';
  if (risk.class !== 'read') return `it reads ${risk.class} (${risk.reasons.join(', ')}), and dismiss clicks only read`;
  if (!closeWord) return 'its name has no close or reject word, and no second provider agreed';
  return `its authority is ${authority}`;
}

/**
 * The twin rule and the guard on one picked control (spec §8.2 steps 9-10, §8.4): the veto first, never overridable;
 * the twin rule; the risk on the tree (lexicon, confirm dialog, URL, page raisers). A stop, or the risk it read.
 * `lean`: the pick is only Jev's, and the providers disagreed (that detail); every stop's detail says so. A high-risk
 * lean gets no act-high-risk command: one provider's pick is no control to hand on, so the way on is a human.
 */
export async function guardDismissPick(
  ctx: CommandContext, scene: DismissScene, pick: Candidate, lean: string | null = null,
): Promise<{ stop: LevelOutcome } | { risk: RiskReading }> {
  const aside = lean === null ? '' : ` (Jev's pick; the providers disagreed: ${lean})`;
  const name = JSON.stringify(cutName(pick.fp.name));
  const report = reportOf(scene, pick);
  const veto = vetoOf(scene.tree.nodes[pick.node]?.name ?? pick.fp.name);
  if (veto !== null) {
    const detail = `the Decision picked ${name}, and "${veto.term}" is on the never-click list; nothing was clicked${aside}`;
    return { stop: stop({ ...report, verdict: 'vetoed' }, 'refused', 'veto', detail, NEEDS_HUMAN) };
  }
  if (pick.fp.twins > 1) {
    return { stop: stop(report, 'abstained', 'twins',
      `${pick.fp.twins} identical controls are named ${name}; nothing was clicked${aside}`, RE_OBSERVE) };
  }
  const risk = await dismissRisk(ctx, scene.page, scene.tab.url, scene.tree, pick.node);
  if (refusesHighRisk(risk.class)) {
    const reads = `${name} reads ${risk.class} (${risk.reasons.join(', ')}): dismiss never clicks it`;
    const refused: DismissLevelReport = { ...report, verdict: 'refused', risk: risk.class };
    if (lean !== null) {
      return { stop: stop(refused, 'refused', 'high_risk_class',
        `${reads}, and only one provider picked it, so no command is offered for it; a human decides${aside}`,
        NEEDS_HUMAN) };
    }
    // A pick both providers agreed on, or the one provider asked: the fresh ref and the name it shows (page text),
    // in the one command that may take it (spec §6.3).
    ctx.trace.untrusted.add('next.argv');
    const next = highRiskNext({
      class: risk.class, via: { ref: pick.ref, expectName: pick.fp.name }, action: 'click',
      intent: `dismiss the overlay by clicking ${describeElement(pick.fp.role, pick.fp.name)}`,
    });
    return { stop: stop(refused, 'refused', 'high_risk_class',
      `${reads}; only act-high-risk takes it, and only when the human asked for exactly this`, next) };
  }
  return { risk };
}

function reportOf(scene: DismissScene, pick: Candidate): DismissLevelReport {
  return { level: scene.level, verdict: 'abstained', overlay: scene.overlay, control: pick.line, by: 'decision' };
}

/**
 * After the dismiss Decision picked a control: the guard first (`guardDismissPick`). It clicks only when authority
 * is `write` (a close or reject word, a negated accept among them, or `agree`), the risk is `read` and `--propose`
 * is off; else it proposes with a `read` ticket. The click finds the pick again on a fresh snapshot first
 * (`clickPick`).
 */
export async function settleDismissPick(
  ctx: CommandContext, scene: DismissScene, pick: Candidate, decided: Decided<number>,
): Promise<LevelOutcome> {
  const guarded = await guardDismissPick(ctx, scene, pick);
  if ('stop' in guarded) return guarded.stop;
  const { risk } = guarded;
  const name = JSON.stringify(cutName(pick.fp.name));
  const rawName = scene.tree.nodes[pick.node]?.name ?? pick.fp.name;
  const report: DismissLevelReport = { ...reportOf(scene, pick), risk: risk.class };
  const closeWord = closesOrRejects(rawName);
  const agreed = ctx.trace.decisions.at(-1)?.provider === 'agree';
  const authority = authorityFor(decided.maturity, 'dismiss', {
    lexiconCloseMatch: closeWord, agreed, newFamily: decided.newFamily, confidence: decided.verdict.confidence,
  });
  report.authority = authority;

  if (scene.args.propose || authority !== 'write' || risk.class !== 'read') {
    const held: Authority = authority === 'none' ? 'none' : 'read';
    const ticket = await ctx.tickets.issue({
      ...ticketPlace(scene.page, scene.tab), fingerprint: pick.fp, risk: risk.class, authority: held,
      site: 'dismiss', maturity: decided.maturity, confidence: decided.verdict.confidence,
      model: ctx.trace.decisions.at(-1)?.model ?? null,
    });
    const next: Next = authorityAllows(held, risk.class) ? { do: 'act', argv: ['refsure', 'act', '--ticket', ticket.id] } : RE_OBSERVE;
    return stop({ ...report, verdict: 'proposed', authority: held, ticket: ticket.id }, 'abstained', 'proposed_only',
      `proposed ${name}, not clicked: ${proposeWhy(scene, authority, risk, closeWord)}`, next);
  }
  return clickPick(ctx, scene, pick, report);
}
