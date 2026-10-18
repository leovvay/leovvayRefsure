import { setTimeout as sleep } from 'node:timers/promises';
import { BOUNDS } from '../questions';
import type { ProviderStatus } from './decision-provider';
import type { PostOptions, TransportResult } from './transport-result';

/*
  The only `fetch` in refsure. Ported from the author's earlier decision code.
  (`preconnect` is the other: an OPTIONS with no key, no header of ours and no body.)

  It never throws. Every failure comes back as a status, and every message that
  leaves has the key replaced by `[key]`. Only a 429 body is read, bounded, to
  tell a spent quota from shedding, then dropped; any other non-2xx body is
  cancelled unread. An upstream error can quote the request, and the request is
  page content.
*/

const { RETRY_BACKOFF_MS, RETRY_MIN_REMAINING_MS } = BOUNDS;
const ERROR_BODY_MAX_BYTES = 2048;
/** A Decision answer is a few hundred bytes; anything far larger is not one. */
const OK_BODY_MAX_BYTES = 1024 * 1024;

/** Worth a second attempt: the request never arrived, or was shed before it was read. */
const RETRYABLE: ReadonlySet<ProviderStatus> = new Set<ProviderStatus>(['transport', 'http_429', 'http_529']);

/** A spent quota or budget can answer 429 too; a second attempt only hits the same wall. */
const SPENT = /insufficient_quota|budget_exceeded|exceededbudget|budget has been exceeded|quota exceeded|out of credits/i;

interface Attempt { status: ProviderStatus; json?: unknown; detail?: string; final?: boolean }

/** How long a warm-up may take; the request that follows it waits for it no longer than this either. */
const WARM_MS = 2_000;
/** Warm-ups by origin, in flight or `done`: one per origin per process. */
const warming = new Map<string, Promise<void> | 'done'>();

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Opens the connection a Decision will take (DNS, TCP, TLS, and fetch's own first load), once per origin per
 * process: an OPTIONS to the endpoint with no key, no header of ours and no body, its answer ignored and its body
 * cancelled unread. Not a HEAD: fetch closes the connection after every HEAD, so the Decision would open its own.
 * The caller does this only once the route is approved (consent, provider, origin policy, caps), never under
 * --dry-run. It never throws.
 */
export function preconnect(url: string): void {
  const origin = originOf(url);
  if (origin === null || warming.has(origin)) return;
  const inFlight = fetch(url, { method: 'OPTIONS', redirect: 'manual', signal: AbortSignal.timeout(WARM_MS) })
    .then((response) => {
      void response.body?.cancel().catch(() => {});
    }, () => {})
    // fetch frees the connection a moment after the answer: a request sent at once would open another.
    .then(() => new Promise<void>((resolve) => setTimeout(resolve, 1)))
    .finally(() => warming.set(origin, 'done'));
  warming.set(origin, inFlight);
}

/**
 * Waits for a warm-up still in flight to `url`'s origin, so the request takes its connection rather than opening a
 * second cold one; at most `WARM_MS`, and never past the caller's deadline or signal.
 */
async function warmedFor(url: string, deadline: number, signal: AbortSignal): Promise<void> {
  const origin = originOf(url);
  const inFlight = origin === null ? undefined : warming.get(origin);
  if (inFlight === undefined || inFlight === 'done') return;
  const wait = Math.min(WARM_MS, deadline - performance.now() - RETRY_MIN_REMAINING_MS);
  if (wait <= 0 || signal.aborted) return;
  let stop = (): void => {};
  await Promise.race([inFlight, new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, wait);
    const abort = (): void => resolve();
    signal.addEventListener('abort', abort, { once: true });
    stop = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve();
    };
  })]);
  stop();
}

/**
 * POST `body` once, and at most once more. The deadline is total: both attempts and the backoff. A retry
 * happens only on `transport`, `http_429` or `http_529`, and only when at least 500 ms would remain for it.
 * A timeout is never retried; it already spent the budget.
 */
export async function postDecision(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: string,
  opts: PostOptions,
  secret: string,
): Promise<TransportResult> {
  const started = performance.now();
  const deadline = started + opts.deadlineMs;
  const finish = (outcome: Attempt): TransportResult => ({
    status: outcome.status,
    ...(outcome.json === undefined ? {} : { json: outcome.json }),
    ms: Math.round(performance.now() - started),
    ...(outcome.detail === undefined ? {} : { detail: scrubKey(outcome.detail, secret) }),
  });
  try {
    await warmedFor(url, deadline, opts.signal);
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await attemptOnce(url, headers, body, deadline - performance.now(), opts.signal);
      const remaining = deadline - performance.now() - RETRY_BACKOFF_MS;
      if (
        attempt >= 2
        || !RETRYABLE.has(outcome.status)
        || outcome.final === true
        || opts.signal.aborted
        || remaining < RETRY_MIN_REMAINING_MS
      ) {
        return finish(outcome);
      }
      try {
        await sleep(RETRY_BACKOFF_MS, undefined, { signal: opts.signal });
      } catch {
        return finish({ status: 'transport', detail: 'aborted by the caller' });
      }
    }
  } catch (error) {
    return finish({ status: 'transport', detail: describe(error) });
  }
}

async function attemptOnce(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: string,
  budgetMs: number,
  outer: AbortSignal,
): Promise<Attempt> {
  if (budgetMs < 1) return { status: 'timeout', detail: 'no time was left for the request' };
  const budget = Math.floor(budgetMs);
  // Kept apart so a thrown fetch can be told apart: this one firing is the deadline.
  const timer = AbortSignal.timeout(budget);
  const signal = AbortSignal.any([outer, timer]);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      // A redirect would carry the bearer token to wherever it points.
      redirect: 'manual',
      signal,
    });
  } catch (error) {
    return thrown(error, timer, outer, budget);
  }
  if (!response.ok) {
    const status: ProviderStatus = `http_${response.status}`;
    const why = response.status === 401 || response.status === 403 ? ' (the provider rejected the key)' : '';
    const detail = `HTTP ${response.status}${why}`;
    // The status is known at the headers; a body that stalls must not hold it until the deadline.
    if (response.status !== 429) {
      void response.body?.cancel().catch(() => {});
      return { status, detail };
    }
    const head = await readBounded(response, ERROR_BODY_MAX_BYTES).catch(() => ({ text: '', over: false }));
    return { status, detail, final: SPENT.test(head.text) };
  }
  let read: { text: string; over: boolean };
  try {
    // The same signal bounds the body, so a stalled stream is still a timeout.
    read = await readBounded(response, OK_BODY_MAX_BYTES);
  } catch (error) {
    return thrown(error, timer, outer, budget);
  }
  if (read.over) return { status: 'invalid', detail: 'the response body is larger than any answer' };
  try {
    return { status: 'ok', json: JSON.parse(read.text) as unknown };
  } catch {
    return { status: 'invalid', detail: 'the response body is not JSON' };
  }
}

function thrown(error: unknown, timer: AbortSignal, outer: AbortSignal, budget: number): Attempt {
  if (timer.aborted) return { status: 'timeout', detail: `no answer within ${budget} ms` };
  // `outer` is the caller's signal, which `postDecision` checks before any retry.
  if (outer.aborted) return { status: 'transport', detail: 'aborted by the caller' };
  return { status: 'transport', detail: describe(error) };
}

/** Up to `max` bytes of the body; the rest is cancelled unread. */
async function readBounded(response: Response, max: number): Promise<{ text: string; over: boolean }> {
  const stream = response.body;
  if (!stream) return { text: '', over: false };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let over = false;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      bytes += next.value.byteLength;
      if (bytes > max) {
        over = true;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { text: Buffer.concat(chunks).toString('utf8'), over };
}

/** A thrown error in one line: its message, plus the system code behind a `fetch failed`. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return 'the request failed';
  const cause = error.cause;
  const code = cause instanceof Error
    ? (cause as Error & { code?: unknown }).code ?? cause.message
    : undefined;
  return typeof code === 'string' && code !== '' ? `${error.message} (${code})` : error.message;
}

/** Every spelling of the key that could reach a message becomes `[key]`. */
export function scrubKey(text: string, secret: string): string {
  if (secret === '') return text;
  let out = text.split(secret).join('[key]');
  const encoded = encodeURIComponent(secret);
  if (encoded !== secret) out = out.split(encoded).join('[key]');
  return out;
}
