import { BrowserError } from '../browser-error';
import type { ConsoleLine } from '../console-line';
import { isRecord } from '../is-record';
import type { NetworkLine } from '../network-line';

// Readers for agent-browser's reply payloads: its own `data`, which Orca passes on as its `result`. Each tolerates
// missing fields, because the shapes can grow; a payload that is not an object at all is a backend error. `label`
// names the call in that error (`orca get text`, `agent-browser get text`).

export function asResult(result: unknown, label: string): Record<string, unknown> {
  if (!isRecord(result)) throw new BrowserError('backend_error', `${label} answered without a result object`);
  return result;
}

export function readText(result: unknown, label: string): string {
  const text = asResult(result, label).text;
  return typeof text === 'string' ? text : '';
}

export function readAttr(result: unknown, label: string): string | null {
  const value = asResult(result, label).value;
  return typeof value === 'string' ? value : null;
}

export function readCount(result: unknown, label: string, css: string): number {
  const count = asResult(result, label).count;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new BrowserError('backend_error', `${label} gave no number for ${css}`);
  }
  return count;
}

/*
  Console and network rows, as agent-browser 0.27 answers them, standalone or through Orca 1.4 (probed live on
  fixture pages):
  - `console`: `{messages: [{type, text, args: [{type, value}]}]}`. `type` is `error | warning | log | info | debug`.
    A row carries no time at all, so `at` is null. Uncaught page errors do not appear.
  - `network`: `{requests: [{method, url, status, timestamp, resourceType, mimeType, requestId, headers,
    responseHeaders}]}`. `timestamp` is epoch milliseconds. A request that never got a response (refused,
    aborted) has no `status`: it reads as 0. Headers are never read here.
  Capture starts when the browser is first driven: what a page logged or fetched before that is not listed.
  `level`/`message`/`time` are read only as fallbacks, should a later release rename the fields.
*/

/** The joined string values of `args`, for a row whose `text` is missing. */
function argsText(value: unknown): string | null {
  const parts = rows(value).map((arg) => str(arg.value)).filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function readConsole(result: unknown, label: string): ConsoleLine[] {
  const body = asResult(result, label);
  return rows(body.messages).map((row) => ({
    level: str(row.type) ?? str(row.level) ?? 'log',
    text: str(row.text) ?? argsText(row.args) ?? str(row.message) ?? '',
    at: time(row.timestamp ?? row.time),
  }));
}

export function readNetwork(result: unknown, label: string): NetworkLine[] {
  const body = asResult(result, label);
  return rows(body.requests).map((row) => ({
    method: str(row.method) ?? 'GET',
    url: str(row.url) ?? '',
    status: num(row.status) ?? 0,
    at: time(row.timestamp ?? row.time),
  }));
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function str(value: unknown): string | null {
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
