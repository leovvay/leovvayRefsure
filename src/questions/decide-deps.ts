import type { KeySet, RefsureConfig } from '../config';
import type { RunTrace } from '../output';
import type { DecisionProvider } from '../providers';

/** What the composition root hands a `DecideFn` factory: the stub today, `createDecide` once it lands. */
export interface DecideDeps {
  config: RefsureConfig;
  keys: KeySet;
  providers: { jev?: DecisionProvider; openai?: DecisionProvider };
  trace: RunTrace;
  /** The verb being run, for the egress log. */
  command: string;
  /** The tab's browser profile once known, for the isolated-profile rule. */
  pageProfile(): string | null;
}
