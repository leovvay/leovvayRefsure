export interface OrcaRunOptions {
  /** The child's environment, already stripped of `REFSURE_*`. */
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  /** Called once the process exists: from here on a page action may have reached the browser. */
  onSpawn?: () => void;
}
