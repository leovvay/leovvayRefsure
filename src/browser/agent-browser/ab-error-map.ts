import { UNRESOLVED_REF } from '../agent-browser-format';
import { boundDetail } from '../bound-detail';
import { BrowserError } from '../browser-error';
import type { BrowserErrorCode } from '../browser-error-code';

const TIMEOUT = /\btimed out\b|^Timeout\b/i;

function browserCodeFor(message: string): BrowserErrorCode {
  if (UNRESOLVED_REF.test(message)) return 'stale_ref';
  if (TIMEOUT.test(message)) return 'timeout';
  return 'backend_error';
}

export function abError(message: string): BrowserError {
  const detail = boundDetail(`agent-browser: ${message || 'failed without a message'}`);
  return new BrowserError(browserCodeFor(message), detail);
}

/** True only when agent-browser's answer proves the action never reached the page; anything else may have landed. */
export function refusedBeforeDispatch(message: string): boolean {
  return UNRESOLVED_REF.test(message);
}
