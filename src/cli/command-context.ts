import type { BrowserPort, PageRef } from '../browser';
import type { RefsureConfig } from '../config';
import type { StateStore } from '../local-state';
import type { RunTrace } from '../output';
import type { DecideFn, RouteCheckFn } from '../questions';
import type { TicketBook } from '../tickets';

export interface CommandContext {
  browser: BrowserPort;
  /**
   * The page the command runs on: the registry's resolved page under `needs.page: 'required'`. A command that
   * finds its own page (`act` and `guard --ticket` from the ticket, `guard --ref` by resolving it) sets it here as
   * soon as it knows it, so the envelope and every `refsure` next step name it, a thrown failure's included.
   */
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
