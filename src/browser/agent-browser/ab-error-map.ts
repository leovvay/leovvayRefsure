import { boundDetail } from '../bound-detail';
import { BrowserError } from '../browser-error';
import type { BrowserErrorCode } from '../browser-error-code';

// agent-browser 0.27 answers with a message, not a code (probed live). It resolves a ref before it touches the
// page: `Unknown ref: eN` when the last snapshot had no such ref, `Could not locate element with role=… name=…`
// when that element is gone. Both are refused before dispatch.
const STALE_REF = /^Unknown ref\b|^Could not locate element\b/i;
const TIMEOUT = /\btimed out\b|^Timeout\b/i;

export function browserCodeFor(message: string): BrowserErrorCode {
  if (STALE_REF.test(message)) return 'stale_ref';
  if (TIMEOUT.test(message)) return 'timeout';
  return 'backend_error';
}

export function abError(message: string): BrowserError {
  const detail = boundDetail(`agent-browser: ${message || 'failed without a message'}`);
  return new BrowserError(browserCodeFor(message), detail);
}

/** True only when agent-browser's answer proves the action never reached the page; anything else may have landed. */
export function refusedBeforeDispatch(message: string): boolean {
  return STALE_REF.test(message);
}
