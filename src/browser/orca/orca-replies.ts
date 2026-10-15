import { asResult, str } from '../agent-browser-format';
import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import type { TabInfo } from '../tab-info';

// Orca passes agent-browser's own payloads on, so the shared readers in agent-browser-format read those; only
// `tab show` is Orca's own.

export function readTab(result: unknown, pageId: string): TabInfo {
  const tab = asResult(result, 'orca tab show').tab;
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

// `loadError` may be a string or an object with a description; a page that loaded reports null.
function errorText(value: unknown): string | null {
  if (value === null || value === undefined || value === false || value === '') return null;
  if (typeof value === 'string') return value;
  if (isRecord(value)) return str(value.description) ?? str(value.message) ?? str(value.code) ?? JSON.stringify(value);
  return String(value);
}
