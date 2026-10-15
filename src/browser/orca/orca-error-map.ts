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
const BEFORE_DISPATCH = new Set(['browser_stale_ref', 'browser_tab_not_found', 'browser_no_tab']);
// `runtime_unavailable` also covers a socket that dropped mid-request; only these messages are certainly pre-send.
const NEVER_SENT = /runtime metadata|no compatible transport|APPDATA is not set/i;

export function browserCodeFor(orcaCode: string): BrowserErrorCode {
  if (orcaCode === 'browser_stale_ref') return 'stale_ref';
  if (NO_TAB.has(orcaCode)) return 'no_tab';
  if (TIMEOUT.has(orcaCode)) return 'timeout';
  if (NOT_RUNNING.has(orcaCode)) return 'orca_not_running';
  return 'backend_error';
}

export function orcaError(orcaCode: string, message: string): BrowserError {
  return new BrowserError(browserCodeFor(orcaCode), boundDetail(`${orcaCode}: ${message}`));
}

/** True only when Orca's answer proves the action never reached the page; anything else may have landed. */
export function refusedBeforeDispatch(orcaCode: string, message: string): boolean {
  return BEFORE_DISPATCH.has(orcaCode) || (orcaCode === 'runtime_unavailable' && NEVER_SENT.test(message));
}

export { boundDetail };
