import type { BrowserPort } from './browser-port';

/** Whether the port can count CSS selectors and read the text of their first match. */
export function readsSelectors(port: BrowserPort): boolean {
  const has = port.features();
  return port.count !== undefined && port.selectorText !== undefined && has.has('count') && has.has('selector-text');
}
