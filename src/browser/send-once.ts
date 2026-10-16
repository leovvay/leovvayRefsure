import type { RunTrace } from '../output';
import { boundDetail } from './bound-detail';
import { isBrowserError } from './browser-error';
import type { Sent } from './sent';

/** Both backends pass on agent-browser's own answer to `dialog dismiss` with no dialog open. */
export const NO_DIALOG = /no dialog is showing/i;

/**
 * One page-changing call. From the moment the process exists it counts as dispatched; only an answer that proves
 * the page was never touched takes that back (the caller restores `before`). A failure before the spawn rethrows,
 * since nothing was sent; one after it is `lost`: the call may have landed, and it is never retried here.
 */
export async function sendOnce<R>(trace: RunTrace, run: (onSpawn: () => void) => Promise<R>): Promise<Sent<R>> {
  const before = trace.dispatched;
  let spawned = false;
  try {
    const reply = await run(() => {
      spawned = true;
      trace.dispatched = true;
    });
    return { kind: 'reply', reply, before };
  } catch (error) {
    if (!spawned) throw error;
    return { kind: 'lost', error };
  }
}

/** A lost call's detail; `label` names the CLI for a failure that is not a `BrowserError`. */
export function lostDetail(error: unknown, label: string, value: string | undefined): string {
  return actDetail(isBrowserError(error) ? error.message : `the ${label} call failed after it started`, value);
}

/** A backend's text as an act's detail: the value is hidden first, then the text is bounded. */
export function actDetail(text: string, value: string | undefined): string {
  return boundDetail(hideValue(text, value));
}

/**
 * A backend may echo a fill value in its error text, and the value can be a password. Each form an echo can take
 * is hidden, longest first: as typed, JSON-escaped (agent-browser echoes its commands as JSON), and with its
 * whitespace collapsed. Hide before any bound, which would collapse or cut the value out of reach.
 */
export function hideValue(text: string, value: string | undefined): string {
  if (!value) return text;
  const forms = new Set([value, JSON.stringify(value).slice(1, -1), value.replace(/\s+/g, ' ').trim()]);
  const longestFirst = [...forms].filter((form) => form !== '').sort((a, b) => b.length - a.length);
  return longestFirst.reduce((out, form) => out.split(form).join('[value]'), text);
}
