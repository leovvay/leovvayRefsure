import { performance } from 'node:perf_hooks';
import type { BrowserPort } from '../../browser';
import { warmUps } from '../../providers';

/**
 * Where one step's time goes, for measuring `run` (design 2026-10-17 §5): the time by phase and each page call with
 * its phase and ms, one JSON line per step on stderr. The first line also has the warm-up (`warm`, see `warmOf`).
 * Only with `REFSURE_RUN_TIMING=1`; otherwise every call is a no-op and the port is the one given. The line names
 * methods and phases only, never a ref, a value, a host or page text.
 */
export interface RunTiming {
  /** Ends the phase in progress and starts `name`. */
  phase(name: string): void;
  /** What the step's Decision led with (operations and probabilities only), for the step's line. */
  note(ops: string): void;
  /** Writes the step's line, then starts the next step. */
  flush(n: number, op: string): void;
  /** The port with its page calls timed under the phase in progress. */
  wrap(browser: BrowserPort): BrowserPort;
}

/** The port's page calls: what a step spends its time on besides the Decision and its own sleeps. */
const CALLS: ReadonlySet<string> = new Set([
  'tabInfo', 'snapshot', 'text', 'attr', 'count', 'selectorText', 'selectorAttr', 'act', 'pressEnter', 'scrollDown',
  'dialogDismiss', 'fillInput', 'settle', 'paint',
]);

const OFF: RunTiming = { phase() {}, note() {}, flush() {}, wrap: (browser) => browser };

export function runTiming(env: NodeJS.ProcessEnv): RunTiming {
  if (env.REFSURE_RUN_TIMING !== '1') return OFF;
  let current = 'start';
  let since = performance.now();
  let started = since;
  const origin = since;
  let phases: Record<string, number> = {};
  let calls: [string, string, number][] = [];
  let ops: string[] = [];
  let first = true;
  const close = (): void => {
    const now = performance.now();
    phases[current] = Math.round((phases[current] ?? 0) + now - since);
    since = now;
  };
  return {
    phase(name) {
      close();
      current = name;
    },
    note(text) {
      ops.push(text);
    },
    flush(n, op) {
      close();
      const now = performance.now();
      const total = Math.round(now - started);
      const at = Math.round(now - origin);
      const warm = first ? { warm: warmOf(origin) } : {};
      first = false;
      process.stderr.write(`refsure-timing ${JSON.stringify({ n, op, at, total, phases, calls, ops, ...warm })}\n`);
      phases = {};
      calls = [];
      ops = [];
      started = performance.now();
      since = started;
    },
    wrap(browser) {
      return new Proxy(browser, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver);
          if (typeof key !== 'string' || typeof value !== 'function' || !CALLS.has(key)) return value;
          return async (...args: unknown[]) => {
            const at = performance.now();
            const phase = current;
            try {
              return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            } finally {
              calls.push([key, phase, Math.round(performance.now() - at)]);
            }
          };
        },
      });
    },
  };
}

/**
 * Each provider connection opened at route approval: `at` when it started (ms into the run), `tls` when TLS was up
 * and `taken` when the first Decision took it (both ms after its start), `waited` how long that Decision waited for
 * TLS, and `failed` why it closed unused or was never opened. Empty when none was (an `http:` gateway).
 */
function warmOf(origin: number): Record<string, number | string | null>[] {
  const ms = (from: number, to: number | null): number | null => (to === null ? null : Math.round(to - from));
  return warmUps().map(({ startedAt, readyAt, takenAt, failed }) => ({
    at: Math.round(startedAt - origin),
    tls: ms(startedAt, readyAt),
    taken: ms(startedAt, takenAt),
    waited: takenAt === null || readyAt === null ? null : Math.max(0, Math.round(readyAt - takenAt)),
    ...(failed === null ? {} : { failed }),
  }));
}
