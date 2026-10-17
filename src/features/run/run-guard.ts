import type { ActAction, AxTree, PageRef, Ref, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { NEEDS_HUMAN, type Next } from '../../output';
import { describeElement, findByFingerprint, nearestAncestor, subtree, urlNorm } from '../../page-model';
import { stepSite, thresholdFor } from '../../questions';
import {
  classify, classifyNames, clickRisk, fieldRaisers, floorAtWrite, mergeReadings, refusesHighRisk, type RiskReading,
} from '../../risk';
import { vetoOf } from '../dismiss';
import { highRiskNext } from '../shared';
import { lookOf } from './run-look';
import type { TableHints } from './element-table-shape';
import type { RunLook } from './run-look-shape';
import type { Guarded, StepAct } from './step-act-shape';

/** What each operation hands the browser, for the high-risk step's argv. */
const ACTIONS: Readonly<Record<StepAct['op'], ActAction>> = {
  CLICK: 'click', TYPE: 'fill', SELECT: 'select', PRESS_ENTER: 'click',
};

/** The buttons of the field's form: Enter in a field submits through them. Outside a named form, none. */
function formButtons(tree: AxTree, field: number): number[] {
  const form = nearestAncestor(tree, field, (node) => node.role === 'form');
  return form === null ? [] : subtree(tree, form).filter((at) => tree.nodes[at]?.role === 'button');
}

/**
 * The risk of the act on the fresh tree, always at least write (design 2026-10-17 §2.5): a click as `locate` reads
 * it (lexicon, confirm dialog, URL, page raisers); a fill or select as `act` reads it (the field, the option's own
 * words, the field raisers); Enter as a click on the field and on every button of its form.
 */
async function riskOf(
  ctx: CommandContext, page: PageRef, tab: TabInfo, tree: AxTree, node: number, ref: Ref, act: StepAct,
): Promise<RiskReading> {
  const url = tab.url;
  if (act.op === 'CLICK') return floorAtWrite(await clickRisk(ctx.browser, page, tree, node, { url }));
  if (act.op === 'PRESS_ENTER') {
    const submits = formButtons(tree, node).map((at) => classify(tree, at, { url, action: 'click' }));
    return floorAtWrite(mergeReadings(await clickRisk(ctx.browser, page, tree, node, { url }), ...submits));
  }
  const action = act.op === 'TYPE' ? 'fill' : 'select';
  const readings = [classify(tree, node, { url, action })];
  if (act.op === 'SELECT' && act.value !== undefined) readings.push(classifyNames([act.value], { url, action }));
  readings.push(await fieldRaisers(ctx.browser, page, ref));
  return floorAtWrite(mergeReadings(...readings));
}

/** The never-click list on what the act would press: the element clicked, or the buttons Enter submits through. */
function vetoed(tree: AxTree, node: number, act: StepAct): { name: string; term: string } | null {
  const pressed = act.op === 'CLICK' ? [node] : act.op === 'PRESS_ENTER' ? formButtons(tree, node) : [];
  for (const at of pressed) {
    const name = tree.nodes[at]?.name ?? '';
    const hit = vetoOf(name);
    if (hit !== null) return { name, term: hit.term };
  }
  return null;
}

/** Money, irreversible, auth or consent: only act-high-risk, by the fresh ref and the name it shows. */
function highRiskStop(ctx: CommandContext, tree: AxTree, node: number, ref: Ref, act: StepAct, risk: RiskReading): Guarded {
  const { role, name } = tree.nodes[node]!;
  const element = describeElement(role, name);
  const why = `${element} reads ${risk.class} (${risk.reasons.join(', ')}): run never acts on money, irreversible, auth or `
    + 'consent; nothing was sent. Only act-high-risk takes it, and only when the human asked for exactly this';
  let next: Next = NEEDS_HUMAN;
  if (act.op !== 'PRESS_ENTER') {
    // The step names the element: page text, as every place that quotes it. A typed value is never echoed.
    ctx.trace.untrusted.add('next.argv');
    next = highRiskNext({
      class: risk.class, via: { ref, expectName: name }, action: ACTIONS[act.op],
      intent: `${ACTIONS[act.op]} ${element}`, ...(act.op === 'SELECT' && act.value !== undefined ? { value: act.value } : {}),
    });
  }
  return { kind: 'stop', status: 'refused', cause: 'high_risk_class', detail: why, next, risk: risk.class };
}

/**
 * The guard every act of `run` passes, right before it (design 2026-10-17 §2.5), the same checks `act` makes on a
 * ticket: the same URL and tab, a fresh snapshot, the element found again by its fingerprint (role, name, path and
 * ordinal in an unchanged twin group); the veto on what a click presses; the risk read on the fresh tree, refused
 * at money, irreversible, auth and consent; and the pick held to its own risk row. Nothing else sits between this
 * and the act. A stale element is no stop: nothing was sent, and the caller looks again (`actStep`).
 */
export async function guardStep(
  ctx: CommandContext, page: PageRef, before: RunLook, act: StepAct, hints: TableHints,
): Promise<Guarded> {
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(page), ctx.browser.snapshot(page)]);
  const fresh = lookOf(tab, tree, hints);
  const name = JSON.stringify(act.cand.fp.name);
  if (urlNorm(tab.url) !== urlNorm(before.tab.url) || (tab.tabKey ?? undefined) !== (before.tab.tabKey ?? undefined)) {
    return { kind: 'stale', cause: 'page_changed', detail: 'the page moved to another URL or tab after the Decision', fresh };
  }
  const found = findByFingerprint(tree, act.cand.fp);
  if (found === 'gone') return { kind: 'stale', cause: 'ref_gone', detail: `${name} left the page after the Decision`, fresh };
  if (found === 'changed') {
    return { kind: 'stale', cause: 'page_changed', detail: `the elements named ${name} changed after the Decision`, fresh };
  }
  const veto = vetoed(tree, found.node, act);
  if (veto !== null) {
    return {
      kind: 'stop', status: 'refused', cause: 'veto', next: NEEDS_HUMAN,
      detail: `${JSON.stringify(veto.name)} carries "${veto.term}", which is on the never-click list; nothing was sent`,
    };
  }
  const risk = await riskOf(ctx, page, tab, tree, found.node, found.ref, act);
  if (refusesHighRisk(risk.class)) return highRiskStop(ctx, tree, found.node, found.ref, act, risk);
  const model = ctx.trace.decisions.at(-1)?.model;
  const row = thresholdFor(stepSite, 'jev', risk.class, model, stepSite.wording.hash);
  if (typeof row === 'number' && act.p < row) {
    return {
      kind: 'stop', status: 'abstained', cause: 'low_confidence', risk: risk.class,
      detail: `${act.op} ${name} was picked at ${act.p}, below the ${risk.class} threshold ${row}; nothing was sent`,
    };
  }
  return { kind: 'clear', ref: found.ref, risk, fresh };
}
