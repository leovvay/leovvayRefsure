import type { TriageConsole } from './triage-console';
import type { TriageRequest } from './triage-request';

/**
 * `refsure triage`: console errors and warnings, failed requests and the tab's load error, at most 50 lines, the
 * latest kept. `console` and `network` are page text. With `--since`, lines from before the mark are left out,
 * except console lines, which carry no time: `untimed` names them.
 */
export interface TriageResult {
  console: TriageConsole[];
  network: TriageRequest[];
  load_error: string | null;
  certificate_failure: string | null;
  since: string | null;
  /** Lines over the 50-line cap, left out (the earliest go first). */
  dropped: number;
  /** With `--since`: the kinds listed whole because their lines carry no time. */
  untimed?: ('console' | 'network')[];
}
