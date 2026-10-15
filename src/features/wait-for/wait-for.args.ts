/** `wait-for --expect e [--text t] [--url g] [--timeout 30s] [--interval 2s] [--max-decisions 10] [--agree]`. */
export interface WaitForArgs {
  /** What should appear, described; the presence Decision's `expectation`. */
  expect: string;
  /** A literal that settles `present` by code once it is in the body text (`fold`-matched). */
  text: string | null;
  /** A URL glob (`*` is any run) that settles `present` by code once the tab's URL matches it. */
  url: string | null;
  timeoutMs: number;
  intervalMs: number;
  /** Provider calls the wait may make in all; 0 waits by code only. */
  maxDecisions: number;
  /** Force `agree` (both providers must say present); else the site's default route. */
  agree: boolean;
}
