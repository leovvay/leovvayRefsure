import type { CommandContext, CommandOutcome } from '../../cli';
import type { Next } from '../../output';
import { fingerprintOf, urlNorm } from '../../page-model';
import { optionMapSite } from '../../questions';
import { classify, classifyNames, fieldRaisers, HIGH_RISK, maxRisk, pageRaisers, type RiskReading } from '../../risk';
import { type Authority, authorityAllows, authorityFor, corroborate } from '../../tickets';
import { highRiskNext, highRiskVia, nothingDone } from '../shared';
import type { ChosenOption } from './chosen-option';
import { optionCandidates, optionLabel } from './option-nodes';
import type { OptionScene } from './option-scene';
import type { PickOptionResult } from './pick-option.contract';

type Out = CommandOutcome<PickOptionResult>;

/**
 * Selecting writes a form value, so the class is at least write. A native select reads the field (lexicon, URL,
 * field raisers) and the option's own words; a listbox option reads as the click it is, with the page raisers.
 */
async function riskOf(ctx: CommandContext, scene: OptionScene, chosen: ChosenOption, action: 'select' | 'click'): Promise<RiskReading> {
  const url = scene.tab.url;
  const readings: RiskReading[] = action === 'select'
    ? [
      classify(scene.tree, scene.field, { url, action }),
      classifyNames([optionLabel(scene.tree, chosen.at)], { url, action }),
      await fieldRaisers(ctx.browser, scene.page, scene.fieldRef),
    ]
    : [classify(scene.tree, chosen.at, { url, action }), await pageRaisers(ctx.browser, scene.page, action)];
  const cls = maxRisk(...readings.map((r) => r.class));
  const reasons = [...new Set(readings.flatMap((r) => r.reasons))];
  return cls === 'read' ? { class: 'write', reasons: [...reasons, 'floor:write'] } : { class: cls, reasons };
}

function authorityOf(scene: OptionScene, chosen: ChosenOption): Authority {
  if (chosen.by === 'code') return authorityFor('measured', 'code');
  const cands = optionCandidates(scene.tree, scene.found.options, scene.fieldRef);
  const cand = cands.find((c) => c.node === chosen.at);
  const corroborated = cand !== undefined && corroborate(scene.want, cand, cands);
  return authorityFor(chosen.maturity, 'option-map', { corroborated, confidence: chosen.confidence, newFamily: chosen.newFamily });
}

/**
 * After an option was picked (spec §6.3): risk, authority and the ticket `act --ticket` takes. High risk refuses
 * here and points to `act-high-risk`; a ticket `act` would refuse is a proposal, never `ok` with nowhere to go.
 */
export async function settleOption(ctx: CommandContext, scene: OptionScene, chosen: ChosenOption): Promise<Out> {
  const { tree } = scene;
  const action = scene.found.within === 'field' ? 'select' : 'click';
  const label = optionLabel(tree, chosen.at);
  const target = action === 'select' ? scene.field : chosen.at;
  const targetRef = tree.nodes[target]?.ref ?? null;
  const result: PickOptionResult = { ...scene.result, by: chosen.by, option: label, action };
  if (targetRef === null) {
    return nothingDone('abstained', 'none_chosen', 'the picked option has no ref to act on; nothing was done', { result });
  }
  const risk = await riskOf(ctx, scene, chosen, action);
  const authority = authorityOf(scene, chosen);
  Object.assign(result, { risk: risk.class, reasons: risk.reasons, authority });
  const source = chosen.by === 'code'
    ? { site: 'code' as const, maturity: optionMapSite.policy.maturity, confidence: null, model: null }
    : { site: 'option-map' as const, maturity: chosen.maturity, confidence: chosen.confidence, model: chosen.model };
  const fingerprint = fingerprintOf(tree, target);
  const ticket = ctx.dryRun ? null : await ctx.tickets.issue({
    pageId: scene.page.id, urlNorm: urlNorm(scene.tab.url), fingerprint, risk: risk.class, authority, ...source,
    action, ...(action === 'select' ? { value: label } : {}),
  });
  if (ticket === null) ctx.trace.notes.push('dry_run: no ticket is issued');
  result.ticket = ticket?.id ?? null;
  const why = `${risk.class} (${risk.reasons.join(', ')})`;

  if (HIGH_RISK.has(risk.class)) {
    ctx.trace.untrusted.add('next.argv');
    const next = highRiskNext({
      class: risk.class, via: highRiskVia(ticket, risk.class, targetRef, fingerprint.name), action,
      intent: `select the option for "${scene.want}"`, ...(action === 'select' ? { value: label } : {}),
    });
    return nothingDone('refused', 'high_risk_class', `picking it reads ${why}: pick-option never acts on it; nothing was done`, { result, next });
  }
  if (authority === 'none') {
    return nothingDone('abstained', 'proposed_only', 'a model family refsure has not measured picked it: propose only', { result });
  }
  if (!authorityAllows(authority, risk.class)) {
    // A fresh look, as `do` says; the detail names the guard check and the outcome step.
    const next: Next = { do: 'snapshot', argv: ['refsure', 'snap'] };
    const check = ticket === null ? 'refsure guard' : `refsure guard --ticket ${ticket.id}`;
    const own = action === 'select' ? `-- select --element @${targetRef} --value "<the option>"` : `-- click --element @${targetRef}`;
    return nothingDone('abstained', 'proposed_only',
      `the pick may act at ${authority} only, and it reads ${why}: proposed, not for act; check the option yourself (${check}), `
        + `then run it through outcome with your own ref (refsure outcome --intent … --expect-name … ${own})`, { result, next });
  }
  const outcome: Out = { status: 'ok', acted: false, effect: 'none', result };
  if (ticket !== null) outcome.next = { do: 'act', argv: ['refsure', 'act', '--ticket', ticket.id] };
  return outcome;
}
