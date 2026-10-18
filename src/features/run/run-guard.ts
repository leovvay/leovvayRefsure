import type { ActAction, AxTree, PageRef, Ref, TabInfo } from '../../browser';
import type { CommandContext } from '../../cli';
import { NEEDS_HUMAN, type Next } from '../../output';
import {
  describeElement, findByFingerprint, inFrame, nearestAncestor, rowContains, rowTextOf, subtree, urlNorm,
} from '../../page-model';
import { stepSite, thresholdFor } from '../../questions';
import {
  classify, classifyNames, clickRisk, fieldRaisers, floorAtWrite, mergeReadings, NO_FIELD_ATTRS, noRaiserOnPage,
  refusesHighRisk, type RiskReading,
} from '../../risk';
import { vetoOf } from '../dismiss';
import { highRiskNext } from '../shared';
import { lookOf } from './run-look';
import type { TableHints } from './element-table-shape';
import type { RunLook } from './run-look-shape';
import type { Guarded, RaiserProbe, StepAct } from './step-act-shape';
import type { RunTiming } from './run-timing';

/** What each operation hands the browser, for the high-risk step's argv. */
const ACTIONS: Readonly<Record<StepAct['op'], ActAction>> = {
  CLICK: 'click', TYPE: 'fill', SELECT: 'select', PRESS_ENTER: 'click',
};

/** A form, or a search landmark (`<search>`, `role="search"`): Enter in a field submits through its buttons. */
const FORM_ROLES: ReadonlySet<string> = new Set(['form', 'search']);
/** A search box or a suggestion box: Enter there runs the search or picks the suggestion. */
const ENTER_ROLES: ReadonlySet<string> = new Set(['searchbox', 'combobox']);

/**
 * The buttons of the field's form: Enter in a field submits through them. Outside a form the tree shows (an unnamed
 * `<form>` shows as none), none.
 */
function formButtons(tree: AxTree, field: number): number[] {
  const form = nearestAncestor(tree, field, (node) => FORM_ROLES.has(node.role));
  return form === null ? [] : subtree(tree, form).filter((at) => tree.nodes[at]?.role === 'button');
}

/**
 * Whether what Enter in the field does can be read, so the guard can judge it: the field sits in a form the tree
 * shows, whose buttons the guard reads, or it is a search or suggestion box. Elsewhere Enter may send a message or
 * submit an unnamed form through a control nobody read, so PRESS_ENTER is neither offered nor sent. Never in an
 * editable region.
 */
export function enterReadable(tree: AxTree, field: number): boolean {
  const node = tree.nodes[field];
  if (node === undefined || node.attrs.contenteditable === true) return false;
  return ENTER_ROLES.has(node.role) || nearestAncestor(tree, field, (up) => FORM_ROLES.has(up.role)) !== null;
}

/**
 * The risk of the act on the fresh tree, always at least write (design 2026-10-17 §2.5): a click as `locate` reads
 * it (lexicon, confirm dialog, URL, page raisers); a fill or select as `act` reads it (the field, the option's own
 * words, the field raisers); Enter as a click on the field and on every button of its form. `probed`: what the
 * raiser count taken while the Decision was asked found on this same page (`noRaiserOnPage`), null when none
 * was. No raiser there settles the page raisers, and the field raisers of a field in no frame (a count reads the
 * top document only); a field the page has not been counted for is counted first, one call for the four reads.
 */
async function riskOf(
  ctx: CommandContext, page: PageRef, tab: TabInfo, tree: AxTree, node: number, ref: Ref, act: StepAct,
  probed: boolean | null,
): Promise<RiskReading> {
  const url = tab.url;
  const noRaiser = probed === true;
  if (act.op === 'CLICK') return floorAtWrite(await clickRisk(ctx.browser, page, tree, node, { url, noRaiser }));
  if (act.op === 'PRESS_ENTER') {
    const submits = formButtons(tree, node).map((at) => classify(tree, at, { url, action: 'click' }));
    return floorAtWrite(mergeReadings(await clickRisk(ctx.browser, page, tree, node, { url, noRaiser }), ...submits));
  }
  const action = act.op === 'TYPE' ? 'fill' : 'select';
  const readings = [classify(tree, node, { url, action })];
  if (act.op === 'SELECT' && act.value !== undefined) readings.push(classifyNames([act.value], { url, action }));
  const none = !inFrame(tree, node) && (probed ?? await noRaiserOnPage(ctx.browser, page));
  readings.push(await fieldRaisers(ctx.browser, page, ref, none ? NO_FIELD_ATTRS : undefined));
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

/** The row still holds what it held when the table showed it (an empty row holds nothing else either). */
function sameRow(now: string, then: string): boolean {
  return then === '' ? now === '' : rowContains(now, then);
}

/**
 * The guard every act of `run` passes, right before it (design 2026-10-17 §2.5), the same checks `act` makes on a
 * ticket: the same URL and tab, a fresh snapshot, the element found again by its fingerprint (role, name, path and
 * ordinal in an unchanged twin group; a twin still in the row the table showed it in, as `--within` binds a ticket;
 * Enter still in a field whose effect can be read); the veto on what a click presses; the risk read on the fresh
 * tree, refused at money, irreversible, auth and consent; and the pick held to its own risk row. Nothing else sits
 * between this and the act. A stale element is no stop: nothing was sent, and the caller looks again (`actStep`).
 * `probe` is the raiser count taken while the Decision was asked (`probeRaisers`), used only on the same page.
 */
export async function guardStep(
  ctx: CommandContext, page: PageRef, before: RunLook, act: StepAct, hints: TableHints, probe: RaiserProbe | null,
  timing: RunTiming,
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
  // A twin was told apart by its row: the same ordinal in another row (a list re-sorted) is another element.
  if (act.row !== undefined && !sameRow(rowTextOf(tree, found.node), act.row)) {
    return { kind: 'stale', cause: 'page_changed', detail: `the row of ${name} changed after the Decision`, fresh };
  }
  if (act.op === 'PRESS_ENTER' && !enterReadable(tree, found.node)) {
    return { kind: 'stale', cause: 'page_changed', detail: `${name} left the form Enter would submit`, fresh };
  }
  const veto = vetoed(tree, found.node, act);
  if (veto !== null) {
    return {
      kind: 'stop', status: 'refused', cause: 'veto', next: NEEDS_HUMAN,
      detail: `${JSON.stringify(veto.name)} carries "${veto.term}", which is on the never-click list; nothing was sent`,
    };
  }
  // The count made while the Decision was asked holds for the page it read, when the fresh snapshot shows that page.
  timing.phase('raisers');
  const probed = probe !== null && probe.sig === fresh.sig ? await probe.none : null;
  const risk = await riskOf(ctx, page, tab, tree, found.node, found.ref, act, probed);
  if (refusesHighRisk(risk.class)) return highRiskStop(ctx, tree, found.node, found.ref, act, risk);
  const model = ctx.trace.decisions.at(-1)?.model;
  const row = thresholdFor(stepSite, 'jev', risk.class, model, stepSite.wording.hash);
  if (typeof row === 'number' && act.p < row) {
    return {
      kind: 'stop', status: 'abstained', cause: 'low_confidence', risk: risk.class,
      detail: `${act.op} ${name} was picked at ${act.p}, below the ${risk.class} threshold ${row}; nothing was sent`,
    };
  }
  return { kind: 'clear', ref: found.ref, node: found.node, risk, fresh };
}
