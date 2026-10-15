import type { BrowserPort, PageRef } from '../browser';
import type { RefsureConfig } from '../config';
import type { StateStore } from '../local-state';
import type { RunTrace } from '../output';
import type { DecideFn, RouteCheckFn } from '../questions';
import type { TicketBook } from '../tickets';

export interface CommandContext {
  browser: BrowserPort;
  page: PageRef | null;
  decide: DecideFn;
  routeCheck: RouteCheckFn;
  tickets: TicketBook;
  store: StateStore;
  /**
   * Loaded on first read. A config file refsure refuses throws its `ConfigError` here, which the registry maps to
   * `not_set_up` with the error's cause; a command that never reads it runs on a broken file.
   */
  config: RefsureConfig;
  trace: RunTrace;
  signal: AbortSignal;
  now(): number;
  dryRun: boolean;
  env: NodeJS.ProcessEnv;
}
