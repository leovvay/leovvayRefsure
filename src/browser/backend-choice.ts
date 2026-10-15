/** Which browser backend this invocation drives, and why; doctor prints `why`. */
export interface BackendChoice {
  /** null when `REFSURE_BACKEND` names no backend: every page call then fails with `why`. */
  backend: 'orca' | 'agent-browser' | null;
  why: string;
}
