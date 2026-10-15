import type { BrowserErrorCode } from './browser-error-code';

/** What every `BrowserPort` method throws on failure; the registry maps `code` to a status. */
export class BrowserError extends Error {
  readonly code: BrowserErrorCode;
  readonly detail: string;

  constructor(code: BrowserErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'BrowserError';
    this.code = code;
    this.detail = detail;
  }
}

export function isBrowserError(error: unknown): error is BrowserError {
  return error instanceof BrowserError;
}
