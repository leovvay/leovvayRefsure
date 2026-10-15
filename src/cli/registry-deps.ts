import type { BrowserPort } from '../browser';
import type { RefsureConfig } from '../config';
import type { StateStore } from '../local-state';
import type { RunTrace } from '../output';
import type { DecideFn, RouteCheckFn } from '../questions';
import type { TicketBook } from '../tickets';

/** What the composition root hands the registry; `runCommand` builds each command's context from it. */
export interface RegistryDeps {
  browser: BrowserPort;
  decide: DecideFn;
  routeCheck: RouteCheckFn;
  tickets: TicketBook;
  store: StateStore;
  config: RefsureConfig;
  /** One per invocation (`newTrace()`); decide() and the browser adapter write into the same one. */
  trace: RunTrace;
  env: NodeJS.ProcessEnv;
  now(): number;
  signal: AbortSignal;
}
