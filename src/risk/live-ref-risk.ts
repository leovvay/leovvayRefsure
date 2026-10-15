import { type ActAction, type BrowserPort, CLICK_ACTIONS, type PageRef, type Ref } from '../browser';
import { norm } from '../page-model';
import { classifyNames } from './classify-name';
import { readLiveName } from './live-ref-check';
import type { LiveTarget } from './live-target';
import { mergeReadings } from './merge-readings';
import { confirmDialogRaiser } from './confirm-dialog-raiser';
import { fieldRaisers, pageRaisers } from './raisers';
import type { RiskClass } from './risk-class';
import type { RiskReading } from './risk-reading';

/** The element's role when it says one, `link` when it has an href; else null (the action's role is used). */
async function pageRole(port: BrowserPort, page: PageRef, ref: Ref): Promise<string | null> {
  if (port.attr === undefined || !port.features().has('attr')) return null;
  const [role, href] = await Promise.all([port.attr(page, ref, 'role'), port.attr(page, ref, 'href')]);
  const given = role === null ? '' : norm(role).toLowerCase().split(' ')[0] ?? '';
  if (/^[a-z]{2,30}$/.test(given)) return given;
  return href !== null && href.trim() !== '' ? 'link' : null;
}

/**
 * Everything the live-ref path reads about a ref before it judges it, at once and without a snapshot (so the
 * agent's refs survive): its names, its explicit role, and the page's body text. Browser errors propagate; a stale
 * ref is `stale` for the registry.
 */
export async function readLiveTarget(port: BrowserPort, page: PageRef, ref: Ref, action: ActAction): Promise<LiveTarget> {
  const [live, role, bodyText] = await Promise.all([
    readLiveName(port, page, ref, action),
    pageRole(port, page, ref),
    port.text(page, 'body'),
  ]);
  return { live, role, bodyText };
}

/**
 * The risk of acting on a live ref (spec §8.3, §8.5), read without a snapshot: every name it shows through the
 * lexicon, URL and `--risk` rules at path `""`; then, for a click, the page raisers and the confirm-dialog raiser;
 * for a field action, the field raisers. Risk only rises.
 */
export async function liveRefRisk(
  port: BrowserPort, page: PageRef, ref: Ref, action: ActAction, target: LiveTarget,
  opts: { url: string; userRisk?: RiskClass },
): Promise<RiskReading> {
  const lexical = classifyNames(target.live.sources, {
    url: opts.url, action, role: target.role, ...(opts.userRisk ? { userRisk: opts.userRisk } : {}),
  });
  const raisers = await Promise.all(CLICK_ACTIONS.has(action)
    ? [
      pageRaisers(port, page, action),
      confirmDialogRaiser(port, page, action, {
        names: target.live.sources, role: target.role, text: target.live.text, bodyText: target.bodyText,
      }),
    ]
    : [fieldRaisers(port, page, ref, target.live.fieldAttrs)]);
  return mergeReadings(lexical, ...raisers);
}
