import { UNRESOLVED_REF } from '../agent-browser-format';
import { boundDetail } from '../bound-detail';
import { BrowserError } from '../browser-error';
import type { BrowserErrorCode } from '../browser-error-code';

const NO_TAB = new Set(['browser_tab_not_found', 'browser_no_tab', 'browser_tab_closed']);
const TIMEOUT = new Set(['runtime_timeout', 'browser_timeout']);
// The CLI could not reach a live runtime: the app is closed, starting, or restarted mid-call.
const NOT_RUNNING = new Set([
  'runtime_unavailable', 'remote_runtime_unavailable', 'runtime_error',
  'runtime_open_failed', 'runtime_open_timeout', 'runtime_serve_failed',
]);
// Orca refuses these while resolving the target, before anything reaches the page.
const BEFORE_DISPATCH = new Set(['browser_tab_not_found', 'browser_no_tab']);
// `runtime_unavailable` also covers a socket that dropped mid-request; only these messages are certainly pre-send.
const NEVER_SENT = /runtime metadata|no compatible transport|APPDATA is not set/i;

/**
 * The ref resolved to no element, so nothing was dispatched. Orca names an unknown ref `browser_stale_ref`; an
 * element gone from the page reaches it as agent-browser's own message, which it passes on as `browser_error`.
 */
export function staleRefReply(orcaCode: string, message: string): boolean {
  return orcaCode === 'browser_stale_ref' || (orcaCode === 'browser_error' && UNRESOLVED_REF.test(message));
}

function browserCodeFor(orcaCode: string, message: string): BrowserErrorCode {
  if (staleRefReply(orcaCode, message)) return 'stale_ref';
  if (NO_TAB.has(orcaCode)) return 'no_tab';
  if (TIMEOUT.has(orcaCode)) return 'timeout';
  if (NOT_RUNNING.has(orcaCode)) return 'orca_not_running';
  return 'backend_error';
}

export function orcaError(orcaCode: string, message: string): BrowserError {
  return new BrowserError(browserCodeFor(orcaCode, message), boundDetail(`${orcaCode}: ${message}`));
}

/** True only when Orca's answer proves the action never reached the page; anything else may have landed. */
export function refusedBeforeDispatch(orcaCode: string, message: string): boolean {
  return staleRefReply(orcaCode, message) || BEFORE_DISPATCH.has(orcaCode)
    || (orcaCode === 'runtime_unavailable' && NEVER_SENT.test(message));
}
