import {
  asResult as resultOf, readAttr as attrOf, readConsole as consoleOf, readCount as countOf,
  readNetwork as networkOf, readText as textOf, str,
} from '../agent-browser-format';
import { BrowserError } from '../browser-error';
import type { ConsoleLine } from '../console-line';
import { isRecord } from '../is-record';
import type { NetworkLine } from '../network-line';
import type { TabInfo } from '../tab-info';

// Readers for Orca's `result` payloads. Orca passes agent-browser's own payloads on, so the shared readers in
// agent-browser-format do the work; only `tab show` is Orca's own.

export function asResult(result: unknown, verb: string): Record<string, unknown> {
  return resultOf(result, `orca ${verb}`);
}

export function readTab(result: unknown, pageId: string): TabInfo {
  const tab = asResult(result, 'tab show').tab;
  if (!isRecord(tab)) throw new BrowserError('no_tab', `browser page ${pageId} was not found`);
  return {
    id: str(tab.browserPageId) ?? pageId,
    url: str(tab.url) ?? '',
    title: str(tab.title) ?? '',
    loadError: errorText(tab.loadError),
    certificateFailure: errorText(tab.certificateFailure),
    profileId: str(tab.profileId),
    profileLabel: str(tab.profileLabel),
  };
}

export function readText(result: unknown, verb: string): string {
  return textOf(result, `orca ${verb}`);
}

export function readAttr(result: unknown): string | null {
  return attrOf(result, 'orca exec get attr');
}

export function readCount(result: unknown, css: string): number {
  return countOf(result, 'orca get count', css);
}

export function readConsole(result: unknown): ConsoleLine[] {
  return consoleOf(result, 'orca console');
}

export function readNetwork(result: unknown): NetworkLine[] {
  return networkOf(result, 'orca network');
}

// `loadError` may be a string or an object with a description; a page that loaded reports null.
function errorText(value: unknown): string | null {
  if (value === null || value === undefined || value === false || value === '') return null;
  if (typeof value === 'string') return value;
  if (isRecord(value)) return str(value.description) ?? str(value.message) ?? str(value.code) ?? JSON.stringify(value);
  return String(value);
}
