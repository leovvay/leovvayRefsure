import type { Next } from '../output';
import type { BrowserErrorCode } from './browser-error-code';

/** What every `BrowserPort` method throws on failure; the registry maps `code` to a status. */
export class BrowserError extends Error {
  readonly code: BrowserErrorCode;
  readonly detail: string;
  /** The step the agent takes itself, when the backend knows the exact one (open the session it named). */
  readonly next: Next | undefined;

  constructor(code: BrowserErrorCode, detail: string, next?: Next) {
    super(`${code}: ${detail}`);
    this.name = 'BrowserError';
    this.code = code;
    this.detail = detail;
    this.next = next;
  }
}

export function isBrowserError(error: unknown): error is BrowserError {
  return error instanceof BrowserError;
}
