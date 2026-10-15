import type { CommandContext } from '../../cli';
import { type Candidate, cutName, findByFingerprint, fingerprintOf, urlNorm } from '../../page-model';
import type { DismissLevelReport } from './dismiss-level-report';
import { dismissRisk } from './dismiss-risk';
import type { DismissScene } from './dismiss-scene';
import { vetoOf } from './dismiss-veto';
import { HUMAN, SNAPSHOT, stop } from './level-stop';
import type { LevelOutcome } from './level-outcome';
import { overlayGone } from './overlay-gone';

/**
 * The click (spec §8.1 rule 2, §8.3): the Decision was asked over an earlier snapshot, and any snapshot in between
 * (the agent's own, another verb's) can renumber refs. So the pick is found again on a fresh snapshot by its
 * fingerprint, on the same URL and tab, and the veto and the risk are read again on the fresh node. Any change
 * stops with nothing clicked (`stale`); else the fresh ref is clicked at once. After the click the overlay must
 * be gone, else `effect_unknown`.
 */
export async function clickPick(
  ctx: CommandContext, scene: DismissScene, pick: Candidate, report: DismissLevelReport,
): Promise<LevelOutcome> {
  const name = JSON.stringify(cutName(pick.fp.name));
  const stale = (cause: 'page_changed' | 'ref_gone', detail: string): LevelOutcome => (
    stop({ ...report, verdict: 'stale' }, 'stale', cause, `${detail}; nothing was clicked`, SNAPSHOT));
  const [tab, tree] = await Promise.all([ctx.browser.tabInfo(scene.page), ctx.browser.snapshot(scene.page)]);
  if (urlNorm(tab.url) !== urlNorm(scene.tab.url) || (tab.tabKey ?? undefined) !== (scene.tab.tabKey ?? undefined)) {
    return stale('page_changed', 'the page moved to another URL or tab after the Decision');
  }
  const found = findByFingerprint(tree, pick.fp);
  if (found === 'gone') return stale('ref_gone', `${name} left the page after the Decision`);
  if (found === 'changed') return stale('page_changed', `the controls named ${name} changed after the Decision`);
  const veto = vetoOf(tree.nodes[found.node]?.name ?? pick.fp.name);
  if (veto !== null) {
    return stop({ ...report, verdict: 'vetoed' }, 'refused', 'veto',
      `${name} now carries "${veto.term}", which is on the never-click list; nothing was clicked`, HUMAN);
  }
  const risk = await dismissRisk(ctx, scene.page, tab.url, tree, found.node);
  if (risk.class !== 'read') {
    return stale('page_changed', `${name} now reads ${risk.class} (${risk.reasons.join(', ')})`);
  }

  const sent = await ctx.browser.act(scene.page, found.ref, 'click');
  if (sent.kind === 'stale_ref') return stale('ref_gone', `${name} left the page before the click`);
  const unknown = (detail: string, effect: 'dispatched' | 'unknown'): LevelOutcome => ({
    ...stop({ ...report, verdict: 'unknown' }, 'effect_unknown', 'effect_unknown', detail, SNAPSHOT), clicked: true, effect,
  });
  if (sent.kind === 'unknown') return unknown(sent.detail, 'unknown');
  if (!(await overlayGone(ctx, scene.page, fingerprintOf(scene.tree, scene.container)))) {
    return unknown(`clicked ${name}; the overlay is still there`, 'dispatched');
  }
  return { report: { ...report, verdict: 'dismissed' }, status: 'ok', clicked: true };
}
