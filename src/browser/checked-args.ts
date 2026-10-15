import { isRef } from './agent-browser-format';
import type { Ref } from './ax-tree';
import { BrowserError } from './browser-error';

/** How many console or network rows one call returns at most. */
export const LOG_LIMIT = 200;
// Both backends end in agent-browser's tokenizer (Orca's `exec` re-reads its command), so only plain names pass.
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;

/** A snapshot ref as both backends send it; anything else is a ref that no snapshot gave out. */
export function checkedRef(ref: Ref): Ref {
  if (!isRef(ref)) throw new BrowserError('stale_ref', `not a snapshot ref: ${String(ref).slice(0, 40)}`);
  return ref;
}

export function checkedAttr(name: string): string {
  if (!ATTR_NAME.test(name)) throw new BrowserError('backend_error', `not a plain attribute name: ${name}`);
  return name;
}
