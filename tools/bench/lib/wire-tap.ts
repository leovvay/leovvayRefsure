import { AsyncLocalStorage } from 'node:async_hooks';

/*
  The bench's only hook into the network (2.1): a wrapper around the global `fetch` refsure's transport calls. Inside
  a `tapped` scope it (a) adds the arm's extra headers (headers only, never the body), (b) keeps the raw `usage` of
  every 2xx response, read from `res.clone()` while refsure reads the original, and (c) measures `T_wire` as 4.2
  defines it: to the end of reading the clone for a 2xx, to the headers for a non-2xx, to the abort for a timeout.
  Outside a scope it passes through untouched.
*/

export interface WireRecord {
  http_status: number | null;
  t_wire: number;
  usage: unknown;
  headers: Record<string, string>;
  timed_out: boolean;
  /** A 429 whose body says the quota or budget is spent (refsure's own reading of such a 429). */
  spent: boolean;
  resp_bytes: number | null;
}

interface Scope {
  extraHeaders: Readonly<Record<string, string>>;
  recordHeaders: readonly string[];
  wires: WireRecord[];
  pending: Promise<void>[];
}

const store = new AsyncLocalStorage<Scope>();
const SPENT = /insufficient_quota|budget_exceeded|exceededbudget|budget has been exceeded|quota exceeded|out of credits/i;
let installed = false;

function timedOut(signal: AbortSignal | null | undefined): boolean {
  const reason = signal?.reason as { name?: unknown } | undefined;
  return signal?.aborted === true && reason?.name === 'TimeoutError';
}

function pick(res: Response, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = res.headers.get(name);
    if (value !== null) out[name] = value.slice(0, 200);
  }
  return out;
}

/** Replaces `globalThis.fetch` once with the tapping wrapper. Idempotent. */
export function installWireTap(): void {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const scope = store.getStore();
    if (!scope) return original(input, init);
    const started = performance.now();
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(scope.extraHeaders)) if (!headers.has(name)) headers.set(name, value);
    const record: WireRecord = { http_status: null, t_wire: 0, usage: null, headers: {}, timed_out: false, spent: false, resp_bytes: null };
    scope.wires.push(record);
    let res: Response;
    try {
      res = await original(input, { ...init, headers });
    } catch (error) {
      record.t_wire = performance.now() - started;
      record.timed_out = timedOut(init?.signal);
      throw error;
    }
    record.http_status = res.status;
    record.headers = pick(res, scope.recordHeaders);
    if (!res.ok) {
      record.t_wire = performance.now() - started;
      if (res.status === 429) {
        const clone = res.clone();
        scope.pending.push(clone.text().then((text) => { record.spent = SPENT.test(text.slice(0, 2048)); }, () => {}));
      }
      return res;
    }
    const clone = res.clone();
    scope.pending.push(clone.text().then((text) => {
      record.t_wire = performance.now() - started;
      record.resp_bytes = Buffer.byteLength(text, 'utf8');
      try {
        const json = JSON.parse(text) as { usage?: unknown };
        record.usage = json?.usage ?? null;
      } catch {
        record.usage = null;
      }
    }, () => {
      record.t_wire = performance.now() - started;
      record.timed_out = timedOut(init?.signal);
    }));
    return res;
  };
}

/**
 * Runs `work` inside a tap scope and returns its result with every wire record of that scope, after the clone
 * reads have settled. `installWireTap()` must have run.
 */
export async function tapped<T>(
  opts: { extraHeaders: Readonly<Record<string, string>>; recordHeaders: readonly string[] },
  work: () => Promise<T>,
): Promise<{ result: T; wires: WireRecord[] }> {
  if (!installed) throw new Error('installWireTap() was not called');
  const scope: Scope = { extraHeaders: opts.extraHeaders, recordHeaders: opts.recordHeaders, wires: [], pending: [] };
  const result = await store.run(scope, work);
  await Promise.all(scope.pending);
  return { result, wires: scope.wires };
}
