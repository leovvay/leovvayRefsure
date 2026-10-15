import { BrowserError } from '../browser-error';
import type { ConsoleLine } from '../console-line';
import { isRecord } from '../is-record';
import type { NetworkLine } from '../network-line';
import type { TabInfo } from '../tab-info';

// Readers for Orca's `result` payloads. Each tolerates missing fields, because the shapes come from agent-browser
// and can grow; a payload that is not an object at all is a backend error.

export function asResult(result: unknown, verb: string): Record<string, unknown> {
  if (!isRecord(result)) throw new BrowserError('backend_error', `orca ${verb} answered without a result object`);
  return result;
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
  const text = asResult(result, verb).text;
  return typeof text === 'string' ? text : '';
}

export function readAttr(result: unknown): string | null {
  const value = asResult(result, 'exec get attr').value;
  return typeof value === 'string' ? value : null;
}

export function readCount(result: unknown, css: string): number {
  const count = asResult(result, 'get count').count;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new BrowserError('backend_error', `orca get count gave no number for ${css}`);
  }
  return count;
}

export function readConsole(result: unknown): ConsoleLine[] {
  const body = asResult(result, 'console');
  return rows(body.messages ?? body.entries).map((row) => ({
    level: str(row.level) ?? str(row.type) ?? 'log',
    text: str(row.text) ?? str(row.message) ?? '',
    at: time(row.timestamp ?? row.time),
  }));
}

export function readNetwork(result: unknown): NetworkLine[] {
  const body = asResult(result, 'network');
  return rows(body.requests ?? body.entries).map((row) => {
    const response = isRecord(row.response) ? row.response : {};
    return {
      method: str(row.method) ?? 'GET',
      url: str(row.url) ?? '',
      status: num(row.status) ?? num(response.status) ?? 0,
      at: time(row.timestamp ?? row.time),
    };
  });
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function time(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// `loadError` may be a string or an object with a description; a page that loaded reports null.
function errorText(value: unknown): string | null {
  if (value === null || value === undefined || value === false || value === '') return null;
  if (typeof value === 'string') return value;
  if (isRecord(value)) return str(value.description) ?? str(value.message) ?? str(value.code) ?? JSON.stringify(value);
  return String(value);
}
